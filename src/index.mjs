/**
 * Programmatic API.
 *
 *   import { lint, lintFile, fix, RULES } from 'parsi-lint';
 *
 *   const { findings } = lint('متن فارسی — با خط تیره', { ext: '.md' });
 *   findings[0].rule       // 'ai/long-dash'
 *   findings[0].messageFa  // Persian message
 */

import { lintText, lintFile as lintFileImpl, fixText, parseFrontMatter, markCodeLines } from './lint.mjs';
import { loadConfig, PRESETS } from './config.mjs';
import { RULES, RULES_BY_ID, CLICHES, KASRA_KEEP, cpLength } from './rules.mjs';
import { FORMATTERS } from './report.mjs';

/**
 * Lint a string.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {string} [options.ext='.md']   file extension, decides code-skipping
 * @param {string} [options.file='<text>'] label used in findings
 * @param {object} [options.config]      a config object, or omit for "recommended"
 */
export function lint(text, options = {}) {
  const { ext = '.md', file = '<text>', config } = options;
  const resolved = config ?? { rules: { ...PRESETS.recommended.rules } };
  return lintText(file, text, resolved, ext);
}

/**
 * Apply automatic fixes to a string and return the new text.
 *
 * @returns {{text: string, changed: number}} changed is the number of lines rewritten
 */
export function fix(text, options = {}) {
  const { ext = '.md', config } = options;
  const resolved = config ?? { rules: { ...PRESETS.recommended.rules } };
  return fixText(text, resolved, ext);
}

export const lintFile = lintFileImpl;

export {
  loadConfig,
  PRESETS,
  RULES,
  RULES_BY_ID,
  CLICHES,
  KASRA_KEEP,
  FORMATTERS,
  parseFrontMatter,
  markCodeLines,
  cpLength,
};
