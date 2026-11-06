// Section G: motion. Thresholds credited in CREDITS.md.
import { declsMatching, durationsMs } from '../lib/css.mjs';

const STYLE_FILES = ['.css', '.scss', '.html', '.vue', '.svelte'];
const MARKUP_FILES = ['.html', '.jsx', '.tsx', '.vue', '.svelte'];
const CODE_FILES = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte'];
const ALL_FILES = [...STYLE_FILES, ...MARKUP_FILES, '.js', '.ts'];

const MOTION_LIB_RE = /(framer-motion|motion\/react|motion\/dom|gsap|animejs|@react-spring|popmotion)/;
const LAYOUT_PROPS_RE =
  /\b(width|height|top|left|right|bottom|margin|margin-[a-z]+|padding|padding-[a-z]+|font-size|line-height|inset)\b/;
const OVERLAY_SELECTOR_RE = /(dropdown|menu|popover|tooltip|modal|dialog|toast|sheet|flyout|combobox|select)/i;
// G-5: a transition answers a state change whatever its selector, so every transition counts. An `animation` counts
// on a control, an overlay or a state selector. Elsewhere it is skipped only as a one-off narrative entrance (KR-15):
// it plays once, declares a fill mode (both, forwards or backwards), uses a keyframe no other block uses, names no
// reveal or repeated element, and in markup its class sits on one element. Anything else stays a hit: a scroll-reveal,
// a staggered or repeated entrance, a finite loop, or an item a script inserts and animates on its base selector.
// Known miss, left to judgement: a subject with no class (`.hero h1 .line > span`) on several elements, staggered by
// blocks that set only animation-delay.
const RESPONSE_SELECTOR_RE =
  /(dropdown|menu|popover|tooltip|modal|dialog|toast|sheet|flyout|combobox|select|drawer|accordion|disclosure|collapse|tab|toggle|switch|button|btn|input|field|checkbox|radio|nav|notification|snackbar|alert|popup|overlay|backdrop|lightbox)/i;
const STATE_SELECTOR_RE =
  /:(?:hover|focus|focus-visible|focus-within|active|checked|target|open|popover-open|disabled|invalid)\b|\[(?:open|aria-(?:expanded|selected|pressed|checked|current)|data-state)\b|\.(?:is-[\w-]+|open|opened|active|expanded|selected|show|showing|closing|entering|leaving)(?![\w-])/i;
const REPEATED_SELECTOR_RE =
  /(reveal|in-?view|visible|aos|animate|fade|slide|stagger|section|card|feature|item|tile|row|grid|list|block)|:nth-(?:last-)?(?:child|of-type)|(?:^|[\s>+~,])(?:li|article|section)(?=$|[\s>+~,.:#[])/i;
const ANIMATION_KEYWORDS = new Set([
  'none', 'forwards', 'backwards', 'both', 'normal', 'reverse', 'alternate', 'alternate-reverse', 'running', 'paused',
  'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end', 'infinite', 'initial', 'inherit', 'unset',
]);

/** Split an `animation` value into its comma-separated items, each as tokens with functions kept whole. */
function animationItems(value) {
  const items = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      items.push(current);
      current = '';
    } else current += ch;
  }
  items.push(current);
  return items.map((item) => item.replace(/\([^)]*\)/g, '()').trim().split(/\s+/).filter(Boolean));
}

function parseAnimation(tokens) {
  const out = { name: null, fill: null, count: 1 };
  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (/^-?[\d.]+m?s$/i.test(t) || t.endsWith('()')) continue;
    if (/^[\d.]+$/.test(t)) out.count = Number(t);
    else if (lower === 'both' || lower === 'forwards' || lower === 'backwards' || lower === 'none') out.fill = out.fill ?? lower;
    else if (!ANIMATION_KEYWORDS.has(lower) && out.name === null) out.name = t;
  }
  return out;
}

/** The animations a block declares: name, fill mode and iteration count, from the shorthand or the longhands. */
function blockAnimations(block) {
  const shorthand = declsMatching(block, /^animation$/).flatMap((d) => animationItems(d.value).map(parseAnimation));
  const names = declsMatching(block, /^animation-name$/).flatMap((d) => d.value.split(',').map((v) => v.trim()));
  const fills = declsMatching(block, /^animation-fill-mode$/).flatMap((d) => d.value.split(',').map((v) => v.trim().toLowerCase()));
  const counts = declsMatching(block, /^animation-iteration-count$/).flatMap((d) => d.value.split(',').map((v) => v.trim()));
  const longhand = names.map((name, i) => ({
    name,
    fill: fills[i] ?? fills[0] ?? null,
    count: /^[\d.]+$/.test(counts[i] ?? counts[0] ?? '1') ? Number(counts[i] ?? counts[0] ?? '1') : Infinity,
  }));
  return [...shorthand, ...longhand].filter((a) => a.name && a.name.toLowerCase() !== 'none');
}

function markupClassCounts(content) {
  const counts = new Map();
  const text = content.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  for (const m of text.matchAll(/<[A-Za-z][^>]*?\s(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    for (const c of new Set((m[1] ?? m[2]).split(/\s+/).filter(Boolean))) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return counts;
}

/** A one-off narrative entrance: the only kind of `animation` G-5 leaves to judgement under KR-15. */
function isOneOffEntrance(block, keyframeUse, classCounts) {
  if (RESPONSE_SELECTOR_RE.test(block.selector) || STATE_SELECTOR_RE.test(block.selector)) return false;
  if (REPEATED_SELECTOR_RE.test(block.selector)) return false;
  const animations = blockAnimations(block);
  if (animations.length === 0) return false;
  const oneShot = animations.every(
    (a) => a.count <= 1 && (a.fill === 'both' || a.fill === 'forwards' || a.fill === 'backwards') && (keyframeUse.get(a.name) ?? 0) <= 1,
  );
  if (!oneShot) return false;
  if (classCounts) {
    const subject = block.selector.split(',').map((sel) => sel.trim().split(/\s*[\s>+~]\s*/).pop());
    for (const part of subject) {
      for (const m of part.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) if ((classCounts.get(m[1]) ?? 0) > 1) return false;
    }
  }
  return true;
}

export default [
  {
    id: 'G-1',
    severity: 'red',
    title: '`ease-in` on UI motion',
    why: 'ease-in starts slowly, so the visible part of the motion feels sluggish. Prefer an ease-out curve.',
    fileTypes: ALL_FILES,
    test(line, ctx) {
      if (/^\s*(\/\/|\/\*|\*)/.test(line)) return null; // comment
      // cubic-bezier(.42, 0, 1, 1) is the literal definition of ease-in
      if (/cubic-bezier\(\s*0?\.\d+\s*,\s*0\s*,\s*1\s*,\s*1\s*\)/.test(line)) return { excerpt: line };
      if (ctx.isStyleFile) return /\bease-in\b(?!-out)/.test(line) ? { excerpt: line } : null;
      const classes = ctx.classText(line);
      if (classes && /\bease-in\b(?!-out)/.test(classes)) return { excerpt: line };
      if (/\beaseIn\b(?!Out)/.test(line) && MOTION_LIB_RE.test(ctx.content)) return { excerpt: line };
      return null;
    },
  },
  {
    id: 'G-2',
    severity: 'red',
    title: '`scale(0)` — appearing out of nothing',
    why: 'Nothing in the physical world grows from zero. Start at 0.9–0.97 with opacity.',
    fileTypes: ALL_FILES,
    test(line) {
      if (/\bscale3?d?\(\s*0\s*(?:[,)]|\s*,\s*0\s*\))/.test(line)) return { excerpt: line };
      if (/\bscale\s*:\s*0\s*(?:[,}\]]|$)/.test(line)) return { excerpt: line };
      return null;
    },
  },
  {
    id: 'G-4',
    severity: 'red',
    title: 'Transition applied to every property',
    why: 'Transitioning everything animates properties you never meant to, including layout. List them.',
    fileTypes: ALL_FILES,
    test(line, ctx) {
      if (/transition(?:-property)?\s*:\s*(?:[^;{}]*\s)?all\b/.test(line)) return { excerpt: line };
      const classes = ctx.classText(line);
      if (classes && /\btransition-all\b/.test(classes)) return { excerpt: line };
      return null;
    },
  },
  {
    id: 'G-5',
    severity: 'orange',
    title: 'UI duration longer than 300ms',
    why: 'Buttons 100–160ms, dropdowns 150–250ms, modals 200–500ms. Past that the UI feels sluggish. Every transition counts, and so does every animation except a one-off entrance that plays once, declares a fill mode, uses its own keyframe and, in markup, has a class that sits on one element; that one is judged under KR-15. An item a script inserts and animates on its base selector still counts.',
    fileTypes: ALL_FILES,
    testFile(content, ctx) {
      const out = [];

      const blocks = [...ctx.blocks()];
      const keyframeUse = new Map();
      for (const block of blocks) {
        for (const name of new Set(blockAnimations(block).map((a) => a.name))) keyframeUse.set(name, (keyframeUse.get(name) ?? 0) + 1);
      }
      const classCounts = ctx.isMarkupFile || ctx.ext === '.html' ? markupClassCounts(content) : null;
      for (const block of blocks) {
        const oneOff = isOneOffEntrance(block, keyframeUse, classCounts);
        for (const d of declsMatching(block, /^(transition|transition-duration|animation|animation-duration)$/)) {
          if (/infinite/i.test(d.value)) continue; // loaders/ambient loops are not UI response
          if (d.prop.startsWith('animation') && oneOff) continue; // a one-off narrative entrance, judged under KR-15
          const worst = Math.max(0, ...durationsMs(d.value));
          if (worst > 300) {
            out.push({ line: d.line, excerpt: `${block.selector} { ${d.prop}: ${d.value} }` });
          }
        }
      }

      if (ctx.isMarkupFile || ctx.ext === '.html') {
        ctx.lines.forEach((line, i) => {
          const classes = ctx.classText(line);
          if (!classes) return;
          const m = classes.match(/\bduration-(\d{3,4})\b/);
          if (m && Number(m[1]) > 300) out.push({ line: i + 1, excerpt: line });
        });
      }

      if (MOTION_LIB_RE.test(content)) {
        ctx.lines.forEach((line, i) => {
          const m = line.match(/\bduration\s*:\s*(\d*\.?\d+)/);
          if (!m) return;
          const value = Number(m[1]);
          const ms = value <= 10 ? value * 1000 : value; // motion libs count in seconds
          if (ms > 300 && !/repeat\s*:\s*Infinity/.test(line)) out.push({ line: i + 1, excerpt: line });
        });
      }
      return out;
    },
  },
  {
    id: 'G-6',
    severity: 'orange',
    title: 'Motion that animates width, height or position',
    why: 'width/height/padding animations run on the main thread and cause layout thrash. Use transform/opacity.',
    fileTypes: ALL_FILES,
    testFile(content, ctx) {
      const out = [];

      for (const block of ctx.blocks()) {
        for (const d of declsMatching(block, /^(transition|transition-property)$/)) {
          const props = d.value.split(',').map((p) => p.trim().split(/\s+/)[0]);
          const bad = props.filter((p) => LAYOUT_PROPS_RE.test(p));
          if (bad.length) {
            out.push({
              line: d.line,
              excerpt: `${block.selector} { ${d.prop}: ${d.value} }`,
              note: `layout properties: ${bad.join(', ')}`,
            });
          }
        }
      }

      if (ctx.isMarkupFile) {
        ctx.lines.forEach((line, i) => {
          const classes = ctx.classText(line);
          if (!classes) return;
          const m = classes.match(/\btransition-\[([^\]]+)\]/);
          if (m && LAYOUT_PROPS_RE.test(m[1])) out.push({ line: i + 1, excerpt: line });
        });
      }
      return out;
    },
  },
  {
    id: 'G-9',
    severity: 'orange',
    title: 'No `prefers-reduced-motion` anywhere in the project',
    why: 'Motion sensitivity is not optional. Every animating project needs one reduced-motion block.',
    fileTypes: ALL_FILES,
    testProject(contexts) {
      const animating = contexts.filter(
        (c) =>
          /@keyframes\b/.test(c.content) ||
          /\btransition\s*:/.test(c.content) ||
          /\banimation\s*:/.test(c.content) ||
          MOTION_LIB_RE.test(c.content),
      );
      if (animating.length === 0) return null;
      const honoured = contexts.some((c) => /prefers-reduced-motion/.test(c.content));
      if (honoured) return null;
      const first = animating[0];
      return {
        file: first.rel,
        absPath: first.file,
        line: 1,
        excerpt: `${animating.length} animating file(s), no prefers-reduced-motion query in the scanned tree`,
      };
    },
  },
  {
    id: 'G-10',
    severity: 'white',
    title: 'Scaling overlay without `transform-origin`',
    why: 'A menu that scales from its centre detaches from its trigger. Anchor the origin to the point of appearance.',
    fileTypes: STYLE_FILES,
    testFile(content, ctx) {
      const out = [];
      for (const block of ctx.blocks()) {
        if (!OVERLAY_SELECTOR_RE.test(block.selector)) continue;
        const transforms = declsMatching(block, /^(transform|scale|animation|transition)$/);
        const scales = transforms.filter((d) => /scale\b/.test(d.value));
        if (scales.length === 0) continue;
        if (block.decls.some((d) => d.prop === 'transform-origin')) continue;
        out.push({ line: scales[0].line, excerpt: `${block.selector} { ${scales[0].prop}: ${scales[0].value} }` });
      }
      return out;
    },
  },
];
