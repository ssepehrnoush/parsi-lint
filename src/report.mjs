/**
 * Output formats.
 *
 *   pretty   human-readable, grouped by file, colored when the terminal supports it
 *   compact  one line per finding: file:line:col  severity  rule  message
 *   json     machine-readable, for editors and dashboards
 *   github   GitHub Actions annotations, so findings land on the diff in a PR
 *
 * Messages carry both English and Persian; `lang` picks which one is shown.
 * Persian output is printed as-is — terminals handle the bidi reordering, and
 * inserting explicit direction marks tends to make copy-paste worse, not better.
 */

const useColor =
  process.env.FORCE_COLOR === '1' ||
  (process.stdout.isTTY && process.env.NO_COLOR === undefined && process.env.TERM !== 'dumb');

const c = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const red = c('31');
const yellow = c('33');
const green = c('32');
const dim = c('2');
const bold = c('1');
const cyan = c('36');

function textOf(f, lang) {
  if (lang === 'fa') return f.messageFa ?? f.message;
  if (lang === 'en') return f.message;
  return `${f.message}\n      ${dim(f.messageFa ?? '')}`;
}

export function formatPretty(results, { lang = 'en', showRule = true } = {}) {
  const out = [];
  let errors = 0;
  let warnings = 0;

  for (const { file, findings } of results) {
    if (!findings.length) continue;
    out.push('');
    out.push(bold(file));
    for (const f of findings) {
      if (f.severity === 'error') errors++;
      else warnings++;
      const badge = f.severity === 'error' ? red('error') : yellow('warn ');
      const loc = dim(`${String(f.line).padStart(4)}:${String(f.col).padEnd(3)}`);
      const rule = showRule ? dim(`  ${f.rule}`) : '';
      out.push(`  ${loc} ${badge}  ${textOf(f, lang)}${rule}`);
      if (f.excerpt) out.push(`       ${dim('›')} ${cyan(f.excerpt)}`);
    }
  }

  const files = results.filter((r) => r.findings.length).length;
  out.push('');
  if (errors === 0 && warnings === 0) {
    out.push(green('✓ no issues found'));
  } else {
    const parts = [];
    if (errors) parts.push(red(`${errors} error${errors === 1 ? '' : 's'}`));
    if (warnings) parts.push(yellow(`${warnings} warning${warnings === 1 ? '' : 's'}`));
    out.push(`${parts.join(', ')} in ${files} file${files === 1 ? '' : 's'}`);
  }
  return out.join('\n');
}

export function formatCompact(results, { lang = 'en' } = {}) {
  const lines = [];
  for (const { findings } of results) {
    for (const f of findings) {
      const msg = lang === 'fa' ? (f.messageFa ?? f.message) : f.message;
      lines.push(`${f.file}:${f.line}:${f.col}  ${f.severity}  ${f.rule}  ${msg}`);
    }
  }
  return lines.join('\n');
}

export function formatJson(results) {
  const findings = results.flatMap((r) => r.findings);
  return JSON.stringify(
    {
      errorCount: findings.filter((f) => f.severity === 'error').length,
      warningCount: findings.filter((f) => f.severity === 'warn').length,
      fileCount: results.length,
      results: results.map(({ file, findings }) => ({ file, findings })),
    },
    null,
    2,
  );
}

/** GitHub Actions annotation syntax, so findings show up inline on a pull request. */
export function formatGithub(results, { lang = 'en' } = {}) {
  const lines = [];
  for (const { findings } of results) {
    for (const f of findings) {
      const level = f.severity === 'error' ? 'error' : 'warning';
      const msg = (lang === 'fa' ? (f.messageFa ?? f.message) : f.message).replace(/\n/g, ' ');
      // Commas and colons inside the message would break the annotation format.
      const safe = msg.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
      lines.push(`::${level} file=${f.file},line=${f.line},col=${f.col},title=${f.rule}::${safe}`);
    }
  }
  return lines.join('\n');
}

export const FORMATTERS = {
  pretty: formatPretty,
  compact: formatCompact,
  json: formatJson,
  github: formatGithub,
};
