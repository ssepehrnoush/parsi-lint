#!/usr/bin/env node
/**
 * parsi-lint CLI.
 *
 * Zero dependencies on purpose: a linter that content people run in CI should
 * not drag a tree of packages behind it, and the glob subset needed here is
 * about thirty lines.
 */

import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lintFile, lintText, fixText } from '../src/lint.mjs';
import { loadConfig, PRESETS } from '../src/config.mjs';
import { FORMATTERS } from '../src/report.mjs';
import { RULES } from '../src/rules.mjs';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
);

/* ───────────────────────── argument parsing ───────────────────────── */

function parseArgs(argv) {
  const opts = {
    paths: [],
    fix: false,
    format: 'pretty',
    lang: 'en',
    config: null,
    maxWarnings: -1,
    only: null,
    quiet: false,
    help: false,
    version: false,
    listRules: false,
    init: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--fix': opts.fix = true; break;
      case '--format': case '-f': opts.format = argv[++i]; break;
      case '--lang': case '-l': opts.lang = argv[++i]; break;
      case '--config': case '-c': opts.config = argv[++i]; break;
      case '--max-warnings': opts.maxWarnings = Number(argv[++i]); break;
      case '--rule': opts.only = (opts.only ?? []).concat(argv[++i].split(',')); break;
      case '--quiet': case '-q': opts.quiet = true; break;
      case '--list-rules': opts.listRules = true; break;
      case '--init': opts.init = true; break;
      case '--no-color': process.env.NO_COLOR = '1'; break;
      case '--help': case '-h': opts.help = true; break;
      case '--version': case '-v': opts.version = true; break;
      default:
        if (a.startsWith('-')) throw new Error(`Unknown option: ${a}`);
        opts.paths.push(a);
    }
  }
  return opts;
}

const HELP = `
${pkg.name} v${pkg.version} — ${pkg.description}

USAGE
  parsi-lint [paths...] [options]

  With no paths, lints the include patterns from your config
  (default: markdown, mdx, txt, html, astro, vue and svelte files).

OPTIONS
  --fix                 rewrite files, applying every safe automatic fix
  -f, --format <name>   pretty (default) | compact | json | github
  -l, --lang <code>     en (default) | fa | both
  -c, --config <path>   config file to use
  --rule <id,id>        run only these rules
  --max-warnings <n>    exit 1 if warnings exceed n
  -q, --quiet           report errors only
  --list-rules          print every rule with its default severity
  --init                write a starter parsilint.config.json
  --no-color            disable color
  -h, --help            this text
  -v, --version         version

EXAMPLES
  parsi-lint content/                     lint a directory
  parsi-lint --fix content/               fix what can be fixed safely
  parsi-lint --lang fa                    Persian messages
  parsi-lint -f github                    annotations for GitHub Actions
  parsi-lint --rule ai/long-dash,enc/mojibake

EXIT CODES
  0  clean (or warnings only)
  1  at least one error, or --max-warnings exceeded
  2  bad usage or config

DOCS  https://github.com/ssepehrnoush/parsi-lint
`;

/* ───────────────────────── file discovery ───────────────────────── */

/** Translate a glob into a regex. Supports **, *, ?, and {a,b}. */
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        // `**/` matches any number of directories, including none.
        if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; }
        else { re += '.*'; i += 1; }
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') re += '[^/]';
    else if (ch === '{') {
      const close = glob.indexOf('}', i);
      if (close === -1) { re += '\\{'; continue; }
      re += `(?:${glob.slice(i + 1, close).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`;
      i = close;
    } else if ('.+^$()|[]\\'.includes(ch)) re += `\\${ch}`;
    else re += ch;
  }
  return new RegExp(`^${re}$`);
}

function matchesAny(relPath, patterns) {
  const p = relPath.split(sep).join('/');
  return patterns.some((g) => globToRegExp(g).test(p));
}

/** Walk a directory, returning files that match include and miss exclude. */
function collect(root, config, cwd) {
  const found = [];
  const includeRes = config.include;
  const excludeRes = config.exclude;

  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      const rel = relative(cwd, full);
      if (matchesAny(rel, excludeRes)) continue;
      if (e.isDirectory()) walk(full);
      else if (matchesAny(rel, includeRes)) found.push(full);
    }
  };

  const st = statSync(root, { throwIfNoEntry: false });
  if (!st) return found;
  if (st.isDirectory()) walk(root);
  else if (!matchesAny(relative(cwd, root), excludeRes)) found.push(root);
  return found;
}

/* ───────────────────────── side commands ───────────────────────── */

function listRules() {
  const width = Math.max(...RULES.map((r) => r.id.length));
  const byCat = new Map();
  for (const r of RULES) {
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category).push(r);
  }
  const out = [];
  for (const [cat, rules] of byCat) {
    out.push(`\n${cat}`);
    for (const r of rules) {
      out.push(`  ${r.id.padEnd(width)}  ${r.severity.padEnd(5)}  ${r.docs ?? ''}`);
    }
  }
  out.push(`\npresets: ${Object.keys(PRESETS).join(', ')}`);
  return out.join('\n');
}

const STARTER_CONFIG = `{
  "extends": "recommended",
  "include": ["**/*.md", "**/*.mdx", "**/*.html"],
  "exclude": ["**/node_modules/**", "**/dist/**"],
  "rules": {
    "type/ezafe-kasra": "off",
    "type/latin-digits": "warn"
  },
  "titleMax": 66,
  "h1Max": 85,
  "descriptionMax": 170,
  "descriptionMin": 120
}
`;

/* ───────────────────────── main ───────────────────────── */

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error('Run parsi-lint --help');
    process.exit(2);
  }

  if (opts.help) { console.log(HELP.trim()); return; }
  if (opts.version) { console.log(pkg.version); return; }
  if (opts.listRules) { console.log(listRules().trim()); return; }

  const cwd = process.cwd();

  if (opts.init) {
    const target = join(cwd, 'parsilint.config.json');
    if (existsSync(target)) {
      console.error(`parsilint.config.json already exists at ${target}`);
      process.exit(2);
    }
    writeFileSync(target, STARTER_CONFIG, 'utf8');
    console.log(`Wrote ${relative(cwd, target)}`);
    return;
  }

  let config;
  try {
    config = loadConfig(cwd, opts.config);
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }

  // --rule narrows to an explicit set by turning everything else off.
  if (opts.only) {
    const keep = new Set(opts.only.map((s) => s.trim()));
    const unknown = [...keep].filter((id) => !RULES.some((r) => r.id === id));
    if (unknown.length) {
      console.error(`Unknown rule(s): ${unknown.join(', ')}`);
      console.error('Run parsi-lint --list-rules');
      process.exit(2);
    }
    for (const r of RULES) {
      config.rules[r.id] = keep.has(r.id) ? (r.severity === 'off' ? 'error' : r.severity) : 'off';
    }
  }

  const roots = opts.paths.length ? opts.paths.map((p) => resolve(cwd, p)) : [cwd];
  const files = [...new Set(roots.flatMap((r) => collect(r, config, cwd)))];

  if (!files.length) {
    console.error('No files matched. Check your paths, or the "include" patterns in your config.');
    process.exit(2);
  }

  const formatter = FORMATTERS[opts.format];
  if (!formatter) {
    console.error(`Unknown format "${opts.format}". Use: ${Object.keys(FORMATTERS).join(', ')}`);
    process.exit(2);
  }

  let fixedFiles = 0;
  const results = [];

  for (const file of files) {
    const ext = extname(file);
    const rel = relative(cwd, file).split(sep).join('/');

    if (opts.fix) {
      const raw = readFileSync(file, 'utf8');
      const { text, changed } = fixText(raw, config, ext);
      if (changed && text !== raw) {
        writeFileSync(file, text, 'utf8');
        fixedFiles++;
      }
      results.push(lintText(rel, text, config, ext));
    } else {
      const r = lintFile(file, config, ext);
      results.push({ file: rel, findings: r.findings.map((f) => ({ ...f, file: rel })) });
    }
  }

  const shown = opts.quiet
    ? results.map((r) => ({ ...r, findings: r.findings.filter((f) => f.severity === 'error') }))
    : results;

  const output = formatter(shown, { lang: opts.lang });
  if (output.trim()) console.log(output);

  const all = results.flatMap((r) => r.findings);
  const errors = all.filter((f) => f.severity === 'error').length;
  const warnings = all.filter((f) => f.severity === 'warn').length;

  if (opts.fix && fixedFiles) {
    console.log(`\nFixed ${fixedFiles} file${fixedFiles === 1 ? '' : 's'}.`);
  }

  if (errors > 0) process.exit(1);
  if (opts.maxWarnings >= 0 && warnings > opts.maxWarnings) {
    console.error(`\n${warnings} warnings exceeds --max-warnings ${opts.maxWarnings}`);
    process.exit(1);
  }
}

main();
