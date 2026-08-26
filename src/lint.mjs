/**
 * The lint engine: turn a file into findings.
 *
 * Two things here are worth understanding before you change them.
 *
 * 1. Skip regions. Persian typography rules must not fire inside code. A long
 *    dash is an AI tell in prose and ordinary punctuation in a CSS comment, and
 *    `,` is a syntax error to "fix" inside a JS object. So the engine tracks
 *    fenced code blocks, <style>/<script> elements, HTML comments and
 *    line comments, and marks those lines as code.
 *
 * 2. Front matter. SEO rules need parsed fields, not lines. A tiny YAML reader
 *    handles the flat `key: value` shape front matter actually uses; anything
 *    nested is ignored rather than guessed at.
 */

import { readFileSync } from 'node:fs';
import { RULES, RULES_BY_ID } from './rules.mjs';

// The trailing capture takes the rest of the line rather than a character class,
// because a comment closer (`-->`, `*/`) sits right after the directive and any
// class permissive enough to hold a rule id also swallows those delimiters.
// parseRuleList does the real filtering, by shape.
const DISABLE_FILE = /parsi-lint-disable-file(.*)$/;
const DISABLE_NEXT = /parsi-lint-disable-next-line(.*)$/;
const DISABLE_LINE = /parsi-lint-disable-line(.*)$/;

const CODE_EXTS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.css', '.scss', '.json']);

/** Rule ids look like `category/name`; anything else on the line is comment syntax. */
const RULE_ID_SHAPE = /^[a-z]+\/[a-z-]+$/;

/**
 * Parse the tail of a disable comment into a rule-id set, or null for "all rules".
 * Tokens that are not shaped like a rule id are ignored, so an HTML or block
 * comment closer sitting after the directive is not mistaken for a rule name.
 */
function parseRuleList(raw) {
  if (!raw) return null;
  const ids = raw.split(/[,\s]+/).map((s) => s.trim()).filter((s) => RULE_ID_SHAPE.test(s));
  return ids.length ? new Set(ids) : null;
}

/**
 * Minimal flat-YAML front matter reader.
 * Handles `key: value`, quoted values, and values continued on the next line —
 * the shape real front matter uses. Nested maps and lists are skipped.
 */
export function parseFrontMatter(raw) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!m) return { data: {}, endLine: 0 };
  const body = m[1];
  const data = {};
  const lines = body.split('\n');
  let key = null;
  let buf = [];

  const flush = () => {
    if (!key) return;
    let v = buf.join(' ').trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    data[key] = v;
    key = null;
    buf = [];
  };

  for (const ln of lines) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(ln);
    if (kv) {
      flush();
      // Skip nested structures rather than misreading them.
      if (kv[2] === '' || kv[2] === '|' || kv[2] === '>') continue;
      key = kv[1];
      buf = [kv[2]];
    } else if (key && ln.trim() && !ln.trimStart().startsWith('-')) {
      buf.push(ln.trim());
    } else {
      flush();
    }
  }
  flush();
  return { data, endLine: raw.slice(0, m[0].length).split('\n').length };
}

/**
 * Mark which lines are code rather than prose.
 * Returns a boolean array parallel to `lines`.
 */
export function markCodeLines(lines, ext) {
  const isCodeFile = CODE_EXTS.has(ext);
  const out = new Array(lines.length).fill(false);
  let inFence = false;
  let inStyle = false;
  let inHtmlComment = false;

  lines.forEach((ln, i) => {
    const fence = /^\s*(```|~~~)/.test(ln);
    if (fence) { inFence = !inFence; out[i] = true; return; }

    // Opening tag and closing tag can share a line; count both.
    const opens = (ln.match(/<(style|script)\b/g) || []).length;
    const closes = (ln.match(/<\/(style|script)>/g) || []).length;
    const startedComment = /<!--/.test(ln) && !/-->/.test(ln);
    const endedComment = /-->/.test(ln);

    const lineComment = /^\s*(\/\/|\/\*|\*\s|\*\/|#\s)/.test(ln);

    out[i] =
      isCodeFile ||
      inFence ||
      inStyle ||
      inHtmlComment ||
      lineComment ||
      opens > closes ||
      (opens > 0 && closes > 0);

    if (opens > closes) inStyle = true;
    else if (closes > 0) inStyle = false;
    if (startedComment) inHtmlComment = true;
    else if (endedComment) inHtmlComment = false;
  });

  return out;
}

/** Resolve a rule's effective severity from config. */
function severityOf(rule, config) {
  const override = config.rules?.[rule.id];
  if (override === undefined) return rule.severity;
  if (override === false || override === 'off') return 'off';
  if (override === true) return rule.severity === 'off' ? 'error' : rule.severity;
  return override;
}

/**
 * Lint one file.
 *
 * @param {string} file      path, used only for reporting
 * @param {string} raw       file contents
 * @param {object} config    resolved config
 * @param {string} ext       file extension including the dot
 * @returns {{file: string, findings: Array}}
 */
export function lintText(file, raw, config, ext) {
  const lines = raw.split(/\r?\n/);
  const isCode = markCodeLines(lines, ext);
  const { data: frontMatter, endLine } = parseFrontMatter(raw);
  const findings = [];

  // A file-level disable comment anywhere in the first 20 lines turns rules off.
  let fileDisabled = null;
  let fileFullyDisabled = false;
  for (const ln of lines.slice(0, 20)) {
    const m = DISABLE_FILE.exec(ln);
    if (m) {
      fileDisabled = parseRuleList(m[1]);
      if (!fileDisabled) fileFullyDisabled = true;
      break;
    }
  }
  if (fileFullyDisabled) return { file, findings: [] };

  const ctx = { file, config, frontMatter, ext };
  const lineRules = RULES.filter((r) => typeof r.check === 'function');
  const metaRules = RULES.filter((r) => typeof r.meta === 'function');

  // Front-matter rules run once per file.
  for (const rule of metaRules) {
    const sev = severityOf(rule, config);
    if (sev === 'off' || fileDisabled?.has(rule.id)) continue;
    for (const f of rule.meta(frontMatter, ctx)) {
      findings.push({
        file,
        line: findFieldLine(lines, f.field, endLine),
        col: 1,
        rule: rule.id,
        category: rule.category,
        severity: sev,
        message: f.message,
        messageFa: f.messageFa,
        excerpt: String(frontMatter[f.field] ?? '').slice(0, 60),
      });
    }
  }

  // Line rules.
  let pendingDisable = null;
  let pendingAll = false;

  lines.forEach((ln, idx) => {
    const lineNo = idx + 1;

    const thisLineDisable = DISABLE_LINE.exec(ln);
    const inlineSet = thisLineDisable ? parseRuleList(thisLineDisable[1]) : null;
    const inlineAll = Boolean(thisLineDisable) && !inlineSet;

    const carriedSet = pendingDisable;
    const carriedAll = pendingAll;
    pendingDisable = null;
    pendingAll = false;

    const nextDisable = DISABLE_NEXT.exec(ln);
    if (nextDisable) {
      pendingDisable = parseRuleList(nextDisable[1]);
      pendingAll = !pendingDisable;
    }

    if (inlineAll || carriedAll) return;
    if (isCode[idx]) return;
    if (idx < endLine) return; // front matter is handled by meta rules

    for (const rule of lineRules) {
      const sev = severityOf(rule, config);
      if (sev === 'off') continue;
      if (fileDisabled?.has(rule.id)) continue;
      if (inlineSet?.has(rule.id) || carriedSet?.has(rule.id)) continue;

      for (const f of rule.check(ln, ctx)) {
        findings.push({
          file,
          line: lineNo,
          col: f.col,
          rule: rule.id,
          category: rule.category,
          severity: sev,
          message: f.message,
          messageFa: f.messageFa,
          excerpt: (f.excerpt ?? ln.trim()).slice(0, 60),
        });
      }
    }
  });

  findings.sort((a, b) => a.line - b.line || a.col - b.col);
  return { file, findings };
}

/** Best-effort line number of a front-matter field, for the report. */
function findFieldLine(lines, field, endLine) {
  for (let i = 0; i < Math.min(endLine, lines.length); i++) {
    if (new RegExp(`^${field}:`).test(lines[i])) return i + 1;
  }
  return 1;
}

export function lintFile(file, config, ext) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (err) {
    return {
      file,
      findings: [{
        file, line: 1, col: 1, rule: 'io/unreadable', category: 'io', severity: 'error',
        message: `Cannot read file: ${err.message}`,
        messageFa: `فایل خوانده نشد: ${err.message}`,
        excerpt: '',
      }],
    };
  }
  return lintText(file, raw, config, ext);
}

/**
 * Apply every fixable rule to a file's text.
 * Fixers run only on prose lines, never inside code, and only for rules that
 * are enabled. Returns the new text and how many lines changed.
 */
export function fixText(raw, config, ext) {
  const lines = raw.split(/\r?\n/);
  const isCode = markCodeLines(lines, ext);
  const { endLine } = parseFrontMatter(raw);
  const fixers = RULES.filter(
    (r) => typeof r.fix === 'function' && severityOf(r, config) !== 'off',
  );
  let changed = 0;

  const out = lines.map((ln, idx) => {
    if (isCode[idx] || idx < endLine) return ln;
    if (DISABLE_LINE.test(ln)) return ln;
    let next = ln;
    for (const rule of fixers) next = rule.fix(next);
    if (next !== ln) changed++;
    return next;
  });

  // Preserve the original line ending style.
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  return { text: out.join(eol), changed };
}

export { RULES, RULES_BY_ID };
