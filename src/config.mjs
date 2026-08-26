/**
 * Config resolution.
 *
 * Looked up in this order, first hit wins:
 *   1. --config <path>
 *   2. parsilint.config.json  in the working directory
 *   3. .parsilintrc.json      in the working directory
 *   4. "parsiLint" key        in package.json
 *   5. the "recommended" preset
 *
 * A config is:
 * {
 *   "extends": "recommended" | "strict" | "seo-only",
 *   "include": ["src/**\/*.md"],
 *   "exclude": ["**\/node_modules/**"],
 *   "rules": { "type/ezafe-kasra": "error", "ai/cliche": "off" },
 *   "cliches": ["..."],        // replaces the built-in phrase list
 *   "markers": ["\\[\\[.*?\\]\\]"],
 *   "kasraAllow": ["کِرم"],
 *   "titleMax": 66, "h1Max": 85, "descriptionMax": 170, "descriptionMin": 120
 * }
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

export const PRESETS = {
  /** Everything that is unambiguously a defect. The default. */
  recommended: {
    rules: {},
  },

  /** Adds the judgement-call rules: diacritics, digit style, filler phrases as errors. */
  strict: {
    rules: {
      'type/ezafe-kasra': 'error',
      'type/latin-digits': 'error',
      'type/zwnj-comparative': 'error',
      'ai/cliche': 'error',
      'ai/smart-quotes': 'error',
      'type/multiple-spaces': 'error',
    },
  },

  /** Only the front-matter budgets, for a docs or content pipeline that has its own prose rules. */
  'seo-only': {
    rules: Object.fromEntries(
      [
        'ai/long-dash', 'ai/smart-quotes', 'ai/cliche',
        'type/arabic-letters', 'type/tatweel', 'type/zwnj-prefix', 'type/zwnj-plural',
        'type/zwnj-comparative', 'type/latin-punctuation', 'type/space-before-punct',
        'type/space-after-punct', 'type/latin-digits', 'type/multiple-spaces',
        'type/ezafe-kasra', 'type/hamza-before-verb',
        'enc/mojibake', 'enc/replacement-char',
        'text/repeated-number', 'text/repeated-word', 'text/unresolved-marker',
      ].map((id) => [id, 'off']),
    ),
  },
};

const DEFAULTS = {
  include: ['**/*.md', '**/*.mdx', '**/*.txt', '**/*.html', '**/*.astro', '**/*.vue', '**/*.svelte'],
  exclude: [
    '**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**',
    '**/.next/**', '**/.astro/**', '**/vendor/**', '**/coverage/**',
  ],
  rules: {},
};

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Cannot parse ${path}: ${err.message}`);
  }
}

export function loadConfig(cwd = process.cwd(), explicitPath = null) {
  let raw = null;
  let source = 'defaults';

  if (explicitPath) {
    const p = resolve(cwd, explicitPath);
    if (!existsSync(p)) throw new Error(`Config not found: ${p}`);
    raw = readJson(p);
    source = p;
  } else {
    for (const name of ['parsilint.config.json', '.parsilintrc.json']) {
      const p = join(cwd, name);
      if (existsSync(p)) { raw = readJson(p); source = p; break; }
    }
    if (!raw) {
      const pkgPath = join(cwd, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = readJson(pkgPath);
        if (pkg.parsiLint) { raw = pkg.parsiLint; source = `${pkgPath} (parsiLint)`; }
      }
    }
  }

  raw ??= {};
  const presetName = raw.extends ?? 'recommended';
  const preset = PRESETS[presetName];
  if (!preset) {
    throw new Error(`Unknown preset "${presetName}". Available: ${Object.keys(PRESETS).join(', ')}`);
  }

  return {
    ...DEFAULTS,
    ...raw,
    rules: { ...preset.rules, ...(raw.rules ?? {}) },
    _source: source,
    _preset: presetName,
  };
}
