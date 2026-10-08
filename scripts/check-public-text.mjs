#!/usr/bin/env node
// Public text guard. Fails when text that is published from this repository carries internal process wording.
// Usage:
//   node scripts/check-public-text.mjs                 scan every text file tracked by git (run at the repository root)
//   node scripts/check-public-text.mjs <dir>           scan the text files under a directory
//   node scripts/check-public-text.mjs --stdin <name>  scan text from standard input, reported under <name>
//                                                     (pull request title and description, commit messages)
//   --patterns <file>                                  use another pattern list
// Exit codes: 0 no unallowed hits, 1 unallowed hits, 2 usage or configuration error.
// Patterns and allowlist live in scripts/public-text-patterns.json. An allowlist entry is bound to one pattern id, one
// file glob (relative to the scanned root, or the --stdin name) and the exact matched text (or a regex over it). A hit
// is never allowed by a broader rule. Every file is scanned except known binary types and .map files, files with a NUL
// byte and files that are not valid UTF-8; the summary line counts what was skipped. Text is normalized (NFKC, format
// characters and combining marks removed) before matching, so zero-width characters do not hide a phrase.
// A pattern may carry `knownFrom`: a repository path or a list of them (a `*` is allowed in the last path segment).
// The matched text is not a hit when the same token appears in a .json or .mjs file there: the rule identifiers that
// this repository itself defines are public by design, so only identifiers outside it are flagged.
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BINARY_EXTENSIONS = new Set(['.map', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.icns', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.pdf', '.zip', '.gz', '.tgz', '.mp3', '.mp4', '.webm', '.mov', '.wasm']);
const MAX_FRAGMENT = 100;
const BINARY_PROBE = 8192;
const PATTERN_KEYS = new Set(['id', 're', 'flags', 'why', 'knownFrom']);
const repoRoot = resolve(here, '..');
const ALLOW_KEYS = new Set(['id', 'file', 'text', 're', 'reason']);

function fail(message, code = 2) {
  process.stderr.write(`check-public-text: ${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const options = { dir: null, stdin: null, patterns: join(here, 'public-text-patterns.json') };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--patterns') {
      if (argv[i + 1] === undefined) fail('--patterns needs a file path');
      options.patterns = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--stdin') {
      if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) fail('--stdin needs a name to report the text under');
      options.stdin = argv[i + 1];
      i += 1;
    } else if (argv[i].startsWith('--')) {
      fail(`unknown option ${argv[i]}`);
    } else {
      positional.push(argv[i]);
    }
  }
  if (positional.length > 1) fail('expected at most one directory');
  if (positional.length === 1) options.dir = positional[0];
  if (options.stdin !== null && options.dir !== null) fail('--stdin and a directory cannot be combined');
  return options;
}

function globToRegExp(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '*' && glob[i + 1] === '*') {
      i += 1;
      if (glob[i + 1] === '/') {
        i += 1;
        source += '(?:.*/)?';
      } else {
        source += '.*';
      }
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

function sourceFilesUnder(target) {
  const info = statSync(target);
  if (info.isFile()) return /\.(?:json|mjs)$/.test(target) ? [target] : [];
  return readdirSync(target)
    .sort()
    .flatMap((name) => sourceFilesUnder(join(target, name)));
}

// Tokens matched by the pattern in the .json and .mjs files at each repository path in `specs` (a `*` is allowed in the
// last segment of a path).
function collectKnown(specs, source, flags, patternId) {
  const known = new Set();
  for (const spec of specs) {
    const slash = spec.lastIndexOf('/');
    const parent = resolve(repoRoot, slash === -1 ? '.' : spec.slice(0, slash));
    const leaf = globToRegExp(slash === -1 ? spec : spec.slice(slash + 1));
    let names;
    try {
      names = readdirSync(parent).filter((name) => leaf.test(name));
    } catch {
      names = [];
    }
    if (names.length === 0) fail(`pattern ${patternId}: knownFrom ${spec} matches nothing`);
    for (const name of names) {
      for (const file of sourceFilesUnder(join(parent, name))) {
        for (const match of readFileSync(file, 'utf8').matchAll(new RegExp(source, `${flags}g`))) {
          known.add(match[0]);
          // A rule defined as J-3a also makes the family name J-3 known.
          if (/\d[a-z]$/.test(match[0])) known.add(match[0].slice(0, -1));
        }
      }
    }
  }
  if (known.size === 0) fail(`pattern ${patternId}: knownFrom holds no token matching the pattern`);
  return known;
}

function loadConfig(file) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`cannot read patterns ${file}: ${error.message}`);
  }
  if (!Array.isArray(raw.patterns) || raw.patterns.length === 0) fail('patterns must be a non-empty array');
  const ids = new Set();
  const patterns = raw.patterns.map((pattern, index) => {
    for (const key of Object.keys(pattern)) if (!PATTERN_KEYS.has(key)) fail(`patterns[${index}] has unknown key ${key}`);
    for (const key of ['id', 're', 'why']) {
      if (typeof pattern[key] !== 'string' || pattern[key] === '') fail(`patterns[${index}].${key} must be a non-empty string`);
    }
    if (typeof pattern.flags !== 'string' || !/^[ium]*$/.test(pattern.flags)) {
      fail(`patterns[${index}] (${pattern.id}) flags may only be i, m, u`);
    }
    if (ids.has(pattern.id)) fail(`duplicate pattern id ${pattern.id}`);
    ids.add(pattern.id);
    let regexp;
    try {
      regexp = new RegExp(pattern.re, `${pattern.flags}g`);
    } catch (error) {
      fail(`patterns[${index}] (${pattern.id}) does not compile: ${error.message}`);
    }
    const specs = pattern.knownFrom === undefined ? null : [].concat(pattern.knownFrom);
    if (specs && (specs.length === 0 || specs.some((spec) => typeof spec !== 'string' || spec === ''))) {
      fail(`patterns[${index}] (${pattern.id}) knownFrom must be a non-empty path or a list of paths`);
    }
    const known = specs ? collectKnown(specs, pattern.re, pattern.flags, pattern.id) : null;
    return { id: pattern.id, regexp, known };
  });
  const allowlist = (raw.allowlist ?? []).map((entry, index) => {
    for (const key of Object.keys(entry)) if (!ALLOW_KEYS.has(key)) fail(`allowlist[${index}] has unknown key ${key}`);
    if (!ids.has(entry.id)) fail(`allowlist[${index}] names unknown pattern id ${entry.id}`);
    if (typeof entry.file !== 'string' || entry.file === '') fail(`allowlist[${index}].file must be a glob`);
    if (typeof entry.reason !== 'string' || entry.reason.trim() === '') fail(`allowlist[${index}].reason is required`);
    const hasText = typeof entry.text === 'string' && entry.text !== '';
    const hasRe = typeof entry.re === 'string' && entry.re !== '';
    if (hasText === hasRe) fail(`allowlist[${index}] needs exactly one non-empty text or re`);
    let allowedRe = null;
    if (hasRe) {
      try {
        allowedRe = new RegExp(`^(?:${entry.re})$`, 'u');
      } catch (error) {
        fail(`allowlist[${index}].re does not compile: ${error.message}`);
      }
    }
    const matchesText = hasText ? (matched) => matched === entry.text : (matched) => allowedRe.test(matched);
    return { index, id: entry.id, file: globToRegExp(entry.file), matchesText, used: 0, entry };
  });
  return { patterns, allowlist };
}

function listFiles(root) {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const info = lstatSync(full);
      if (info.isDirectory()) walk(full);
      else if (info.isFile()) found.push(full);
    }
  };
  walk(root);
  return found;
}

// Every file is scanned unless it is a known binary type, contains a NUL byte, or is not valid UTF-8.
function isTextFile(file, buffer) {
  const dot = file.lastIndexOf('.');
  const slash = Math.max(file.lastIndexOf('/'), file.lastIndexOf(sep));
  const extension = dot > slash ? file.slice(dot).toLowerCase() : '';
  if (BINARY_EXTENSIONS.has(extension)) return false;
  if (buffer.subarray(0, BINARY_PROBE).includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

function lineStartsOf(text) {
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

function lineIndexFor(starts, index) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= index) low = mid;
    else high = mid - 1;
  }
  return low;
}

// Returns at most MAX_FRAGMENT characters of the line, centred on the match, with ellipses where the line is cut.
function fragmentAround(text, lineStart, lineEnd, matchIndex, matchLength) {
  const room = MAX_FRAGMENT - 2;
  let start = Math.max(lineStart, matchIndex - Math.floor((room - matchLength) / 2));
  const end = Math.min(lineEnd, start + room);
  start = Math.max(lineStart, end - room);
  const prefix = start > lineStart ? '…' : '';
  const suffix = end < lineEnd ? '…' : '';
  return `${prefix}${text.slice(start, end).replace(/\s+/g, ' ')}${suffix}`.slice(0, MAX_FRAGMENT);
}

function scanFile(relPath, rawText, config, counters) {
  const text = rawText.normalize('NFKC').replace(/[\p{Cf}\p{M}]/gu, '');
  const hits = [];
  let starts = null;
  for (const pattern of config.patterns) {
    pattern.regexp.lastIndex = 0;
    let match;
    while ((match = pattern.regexp.exec(text)) !== null) {
      if (match[0] === '') {
        pattern.regexp.lastIndex += 1;
        continue;
      }
      if (pattern.known?.has(match[0])) {
        counters.known += 1;
        continue;
      }
      starts ??= lineStartsOf(text);
      const lineIndex = lineIndexFor(starts, match.index);
      const lineStart = starts[lineIndex];
      const lineEnd = lineIndex + 1 < starts.length ? starts[lineIndex + 1] - 1 : text.length;
      const hit = {
        file: relPath,
        line: lineIndex + 1,
        column: match.index - lineStart + 1,
        id: pattern.id,
        fragment: fragmentAround(text, lineStart, lineEnd, match.index, match[0].length),
        allowed: undefined,
      };
      const allowed = config.allowlist.find(
        (entry) => entry.id === pattern.id && entry.file.test(relPath) && entry.matchesText(match[0]),
      );
      if (allowed) {
        allowed.used += 1;
        hit.allowed = allowed.index;
      }
      hits.push(hit);
    }
  }
  return hits;
}

const options = parseArgs(process.argv.slice(2));
const config = loadConfig(resolve(options.patterns));
const counters = { known: 0, skipped: 0 };
const all = [];
let scanned = 0;
let where;

if (options.stdin !== null) {
  const text = readFileSync(0, 'utf8');
  if (text.trim() === '') fail(`no text on standard input for ${options.stdin}`);
  scanned = 1;
  where = options.stdin;
  all.push(...scanFile(options.stdin, text, config, counters));
} else {
  let files;
  let root;
  if (options.dir === null) {
    root = repoRoot;
    const listed = spawnSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (listed.error || listed.status !== 0) fail(`git ls-files failed: ${(listed.error?.message ?? listed.stderr ?? '').trim()}`);
    files = listed.stdout.split('\0').filter(Boolean).sort().map((name) => join(repoRoot, name));
    where = 'tracked files';
  } else {
    root = resolve(options.dir);
    let rootInfo;
    try {
      rootInfo = statSync(root);
    } catch {
      fail(`directory not found: ${options.dir}`);
    }
    if (!rootInfo.isDirectory()) fail(`not a directory: ${options.dir}`);
    files = listFiles(root);
    where = options.dir;
  }
  for (const file of files) {
    let info;
    try {
      info = statSync(file);
    } catch {
      continue;
    }
    if (!info.isFile()) continue;
    const buffer = readFileSync(file);
    if (!isTextFile(file, buffer)) {
      counters.skipped += 1;
      continue;
    }
    scanned += 1;
    const relPath = relative(root, file).split(sep).join('/');
    all.push(...scanFile(relPath, buffer.toString('utf8'), config, counters));
  }
  if (scanned === 0) fail(`no text files found in ${where}; an empty scan is not a pass`);
}

const unallowed = all.filter((hit) => hit.allowed === undefined);
for (const hit of unallowed) {
  process.stdout.write(`${hit.file}:${hit.line}:${hit.column}  ${hit.id}  "${hit.fragment}"\n`);
}
for (const entry of config.allowlist) {
  if (entry.used === 0 && options.stdin === null) {
    process.stdout.write(`warning: allowlist[${entry.index}] (${entry.id}, ${entry.entry.file}) matched no hit; remove it\n`);
  }
}
const knownNote = (counters.known > 0 ? `, ${counters.known} mention(s) of rule ids defined here` : '') + (counters.skipped > 0 ? `, ${counters.skipped} skipped (binary or .map)` : '');
process.stdout.write(
  `public text guard (${where}): scanned ${scanned} text file(s), ${unallowed.length} hit(s), ${all.length - unallowed.length} allowlisted${knownNote}\n`,
);
process.exit(unallowed.length > 0 ? 1 : 0);
