// heuristics.mjs — shared context guards used by more than one rule module.

/** CSS properties whose value carries a colour. */
const COLOR_PROP_RE =
  /\b(color|background|background-color|background-image|border|border-[a-z]+|outline|outline-color|box-shadow|text-shadow|fill|stroke|caret-color|text-decoration-color|accent-color|stop-color)\s*:/i;

/** Style-carrying contexts inside a JS/markup file. */
const STYLE_HOST_RE =
  /(style\s*=|styled[.(`]|css`|createGlobalStyle|makeStyles|sx\s*=|StyleSheet\.create|:root|@media|keyframes)/i;

const CUSTOM_PROP_DEF_RE = /^\s*(--[\w-]+|\$[\w-]+|@[\w-]+)\s*:/;

export const HEX_RE = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

const PAINT_ATTR_RE = /\b(?:fill|stroke)\s*=\s*(?:\{\s*)?["']([^"']*)["']/g;

/** Hex values written as fill/stroke attributes, including JSX `fill={"#…"}`. */
function paintAttributeHexes(line) {
  const out = [];
  PAINT_ATTR_RE.lastIndex = 0;
  let match;
  while ((match = PAINT_ATTR_RE.exec(line)) !== null) {
    HEX_RE.lastIndex = 0;
    const hits = match[1].match(HEX_RE);
    if (hits) out.push(...hits);
  }
  return out;
}

/**
 * Raw hex colours on this line that sit in a style context.
 * A custom-property definition is silent only in a token file, and only
 * that declaration: `--a: #123; color: #123` still reports the usage.
 * Outside a token file, `--card-accent: #ff3b00` is a B-1 hit.
 * An inline SVG does not go quiet: a hit inside `<svg>` is tagged
 * `svgExceptionCandidate` for B-1.
 */
export function rawHexOnLine(line, ctx) {
  const hexes = [];
  for (const chunk of line.split(';')) {
    if (ctx.isTokenFile && CUSTOM_PROP_DEF_RE.test(chunk)) continue;
    const isStyleChunk =
      ctx.isStyleFile || COLOR_PROP_RE.test(chunk) || STYLE_HOST_RE.test(chunk) || CUSTOM_PROP_DEF_RE.test(chunk);
    const found = isStyleChunk ? (chunk.match(HEX_RE) ?? []) : paintAttributeHexes(chunk);
    hexes.push(...found);
  }
  if (hexes.length === 0) return hexes;
  if (ctx.svgLines?.has(ctx.lineNo)) hexes.svgExceptionCandidate = true;
  return hexes;
}

/** 1-based line number of a character offset inside content. */
export function lineOfIndex(content, index) {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) if (content[i] === '\n') line++;
  return line;
}

/** Heading levels in document order, as {level, line}. */
export function headingLevels(ctx) {
  const out = [];
  if (ctx.ext === '.md') {
    let inFence = false;
    ctx.lines.forEach((line, i) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence) return;
      const m = line.match(/^(#{1,6})\s+\S/);
      if (m) out.push({ level: m[1].length, line: i + 1 });
    });
    return out;
  }
  ctx.lines.forEach((line, i) => {
    const re = /<h([1-6])\b/gi;
    let m;
    while ((m = re.exec(line)) !== null) out.push({ level: Number(m[1]), line: i + 1 });
  });
  return out;
}

/** Selector looks like display type, where tight tracking / small line-height is intentional. */
export function isDisplaySelector(selector = '') {
  return /(^|[\s.,#:>])(h[1-4]\b|\.?(display|hero|headline|heading|title|kicker|eyebrow|overline)[\w-]*)/i.test(
    selector,
  );
}

/** Selector looks like small-print UI, where <14px / tight padding is intentional. */
export function isSmallPrintSelector(selector = '') {
  return /(caption|label|badge|chip|tag|pill|meta|footnote|small|tooltip|legend|kbd|code|sup|sub|breadcrumb|counter|helper|hint|overline|eyebrow|kicker)/i.test(
    selector,
  );
}

/** Selector looks like a container or control — the place J-3 padding matters. */
export function isContainerSelector(selector = '') {
  return /(button|btn|card|panel|modal|dialog|sheet|popover|dropdown|menu|input|field|select|textarea|nav|header|footer|section|container|wrapper|toolbar|tab|row|cell|list-item|item)/i.test(
    selector,
  );
}

/** Strip tags and code so copy rules see prose, not markup. */
export function textOnly(line) {
  return line
    .replace(/<[^>]*>/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ');
}

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const TAG_RE = /<(\/?)([A-Za-z][\w:.-]*)((?:[^>"'{]|"[^"]*"|'[^']*'|\{[^}]*\})*?)(\/?)>/g;
const HIDDEN_ATTR_RE = /(?:^|\s)aria-hidden\s*=\s*(?:"true"|'true'|\{\s*true\s*\})/i;
const IMG_ROLE_ATTR_RE = /(?:^|\s)role\s*=\s*(?:"img"|'img')/i;
const CLASS_ATTR_RE = /(?:^|\s)(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)')/;

// Elements that carry readable copy or controls. A role="img" or aria-hidden="true" frame holding one of them, or a
// text run of 40 characters or more, is not treated as an illustration: real copy stays body text for J-5. A frame
// that is itself a list item, a table part or one of these elements is visible content hidden from assistive
// technology, such as a header row, not an illustration.
const COPY_ELEMENTS = new Set(['h1', 'h2', 'h3', 'p', 'a', 'button', 'input', 'textarea', 'select']);
const CONTENT_FRAMES = new Set([...COPY_ELEMENTS, 'li', 'tr', 'td', 'th', 'thead', 'tbody', 'table', 'label']);
const MAX_ILLUSTRATION_RUN = 40;

function markupTree(content) {
  const text = content
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  const root = { name: '#root', attrs: '', children: [], runs: [], parent: null };
  let current = root;
  let last = 0;
  for (const m of text.matchAll(TAG_RE)) {
    const run = text.slice(last, m.index).replace(/\s+/g, ' ').trim();
    if (run) current.runs.push(run);
    last = m.index + m[0].length;
    const [, closing, rawName, attrs, selfClosing] = m;
    const name = rawName.toLowerCase();
    if (closing) {
      let open = current;
      while (open !== root && open.name !== name) open = open.parent;
      if (open !== root) current = open.parent;
      continue;
    }
    const node = { name, attrs, children: [], runs: [], parent: current };
    current.children.push(node);
    if (!selfClosing && !VOID_ELEMENTS.has(name)) current = node;
  }
  return root;
}

function summarize(node) {
  node.hasCopy = false;
  node.longestRun = Math.max(0, ...node.runs.map((run) => run.length));
  for (const child of node.children) {
    summarize(child);
    node.hasCopy ||= child.hasCopy || COPY_ELEMENTS.has(child.name);
    node.longestRun = Math.max(node.longestRun, child.longestRun);
  }
}

/**
 * Classes that occur in this markup only inside an illustration: an <svg>, or an element with aria-hidden="true" or
 * role="img" that is not itself a list item, table part or copy element and holds no headings, paragraphs, links or
 * controls and no text run of 40 characters or more, and their descendants. A class that also occurs outside one is not returned, so real body text stays visible.
 */
export function illustrationOnlyClasses(content = '') {
  const root = markupTree(content);
  summarize(root);
  const inside = new Set();
  const outside = new Set();
  const walk = (node, inIllustration) => {
    for (const child of node.children) {
      const framed = HIDDEN_ATTR_RE.test(child.attrs) || IMG_ROLE_ATTR_RE.test(child.attrs);
      const illustration =
        inIllustration ||
        child.name === 'svg' ||
        (framed && !CONTENT_FRAMES.has(child.name) && !child.hasCopy && child.longestRun < MAX_ILLUSTRATION_RUN);
      const cls = child.attrs.match(CLASS_ATTR_RE);
      if (cls) for (const c of (cls[1] ?? cls[2]).split(/\s+/).filter(Boolean)) (illustration ? inside : outside).add(c);
      walk(child, illustration);
    }
  };
  walk(root, false);
  return new Set([...inside].filter((c) => !outside.has(c)));
}

const SVG_TEXT_TYPE_RE = /(?:^|[\s>])(?:svg|text|tspan|textPath)(?=$|[\s>.:#[])/i;
const HIDDEN_SELECTOR_RE = /\[\s*(?:aria-hidden\s*=\s*["']?true|role\s*=\s*["']?img)["']?\s*\]/i;

/**
 * True when every selector in the list can only match text inside an illustration:
 * it names svg text, a class from illustrationOnlyClasses, or, in a stylesheet without
 * markup, an [aria-hidden="true"] or [role="img"] ancestor. Where the markup is known
 * (`markup: true`), such a frame counts only through its classes, because the markup
 * shows whether it holds real copy. A sibling combinator (+, ~) leaves the subject
 * outside the illustration, so only the part after the last one is read.
 */
export function isIllustrationSelector(selector = '', illustrationClasses = new Set(), { markup = false } = {}) {
  return selector.split(',').every((sel) => {
    const chain = sel.replace(/:(?:not|is|where|has)\([^)]*\)/g, '').split(/\s*[+~]\s*/).pop();
    if (SVG_TEXT_TYPE_RE.test(chain) || (!markup && HIDDEN_SELECTOR_RE.test(chain))) return true;
    return [...chain.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].some((m) => illustrationClasses.has(m[1]));
  });
}
