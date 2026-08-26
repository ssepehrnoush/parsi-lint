<!--
  This README deliberately contains broken Persian as examples: the Arabic/Persian
  lookalike table, a missing ZWNJ, and mojibake. Those four rules are turned off
  for this file only; every other rule still runs over it in CI.
  parsi-lint-disable-file type/arabic-letters type/zwnj-prefix enc/mojibake type/latin-digits
-->
<h1 align="center">parsi-lint</h1>

<p align="center">
  Catch the Persian text bugs that make content look machine-written, break search, or ship broken. Before they ship, not after.
</p>

<p align="center">
  <img alt="license MIT" src="https://img.shields.io/badge/license-MIT-blue.svg">
  <img alt="node >= 18" src="https://img.shields.io/badge/node-%3E%3D18-brightgreen">
  <img alt="dependencies 0" src="https://img.shields.io/badge/dependencies-0-brightgreen">
  <img alt="rules 23" src="https://img.shields.io/badge/rules-23-8b5cf6">
</p>

<p align="center">
  <img alt="parsi-lint finding four errors in a Persian article, then fixing three of them" src="assets/demo.svg" width="880">
</p>

<p align="center"><a href="README.fa.md">فارسی</a></p>

## The bugs you cannot see

Three of these are invisible on screen. That is what makes them expensive.

**An Arabic letter wearing a Persian face.** Persian and Arabic share a script but not a keyboard, and several letters exist twice in Unicode:

| Character | Codepoint | Name | Correct in Persian |
| --- | --- | --- | --- |
| `ك` | `U+0643` | Arabic kaf | no |
| `ک` | `U+06A9` | Persian keheh | yes |
| `ي` | `U+064A` | Arabic yeh | no |
| `ی` | `U+06CC` | Farsi yeh | yes |

If those four look like two characters to you, that is the whole problem. A title with the Arabic `ك` never matches a search for the Persian one. Nothing looks wrong. The page just does not rank.

**A missing ZWNJ.** «می شود» and «می‌شود» render almost identically and tokenize differently.

**Mojibake.** UTF-8 read as cp1252 and saved back turns every Persian character into `Ø´` or `â€`. One bad save wrecks a whole content directory in a single commit, and nobody notices until a reader opens the page.

**And the newer one: text that reads as machine-written.** A long dash is ordinary punctuation in English. In Persian prose almost nobody types one by hand, so it is a strong tell. Same for a handful of filler phrases that Persian LLM output leans on. Detectors for English AI text are everywhere. For Persian there was nothing you could drop into a build.

## Install

```bash
npm install -D github:ssepehrnoush/parsi-lint
```

Then:

```bash
npx parsi-lint content/
```

Node 18 or newer. No dependencies, at runtime or otherwise.

Not on the npm registry yet, so the command above installs straight from this repository.

## Why a linter and not a normalizer

The existing Persian tools are normalizers: give them text, get cleaned text back. That is the wrong shape for a content pipeline. You do not want a script silently rewriting a medical article on its way to production. You want to know what is wrong, in a diff, before it ships, and to decide yourself.

- **Exit code 1 on errors**, so CI blocks a bad merge.
- **Every finding has a file, line and column**, so it lands on the right line of the diff.
- **`--fix` is opt-in**, and only touches rewrites that cannot change meaning.
- **Nothing runs inside code.** A comma is punctuation in prose and syntax in JavaScript.

## What it catches

Verbatim from `parsi-lint --list-rules`:

```
ai
  ai/long-dash             error  Long dashes (— – ― ‒) are not typed by hand in Persian prose.
  ai/smart-quotes          warn   Curly quotes instead of Persian «».
  ai/cliche                warn   Filler phrases typical of Persian LLM output.

typography
  type/arabic-letters      error  Arabic ي ك ة instead of Persian ی ک ه.
  type/tatweel             warn   Tatweel (ـ) used to stretch letters.
  type/zwnj-prefix         error  Missing ZWNJ after می/نمی.
  type/zwnj-plural         error  Missing ZWNJ before the plural ها.
  type/zwnj-comparative    warn   Missing ZWNJ before تر / ترین.
  type/latin-punctuation   error  Latin , ? ; touching Persian text instead of ، ؟ ؛.
  type/space-before-punct  error  Space before ، . ؛ ؟ !
  type/space-after-punct   warn   Missing space after ، ؛ ؟
  type/latin-digits        warn   Latin digits (123) standing alone in Persian prose instead of ۱۲۳.
  type/multiple-spaces     warn   Runs of spaces inside a sentence.
  type/ezafe-kasra         off    Written ezafe kasra (ِ). Off by default.
  type/hamza-before-verb   error  Ezafe hamza (هٔ) directly before a verb.

encoding
  enc/mojibake             error  UTF-8 text double-encoded through cp1252/latin-1.
  enc/replacement-char     error  U+FFFD replacement character.

text
  text/repeated-number     error  A number repeated in a «تا» range, e.g. «۶ تا ۶ تا ۸».
  text/repeated-word       error  The same Persian word twice in a row.
  text/unresolved-marker   error  TODO / FIXME / [[...]] markers left in content.

seo
  seo/title-length         warn   Front-matter title longer than the Google result budget.
  seo/h1-length            warn   Front-matter h1 long enough to wrap to four lines.
  seo/description-length   warn   Meta description outside the display budget.

presets: recommended, strict, seo-only
```

Two of those deserve a note.

**`type/ezafe-kasra` is off by default** because some projects genuinely want diacritics: poetry, teaching material, children's books. Turn it on if your site is diacritic-free. A user never types a kasra into a search box, so a kasra in a title or an FAQ question quietly breaks keyword matching.

**`seo/title-length` defaults to 66 characters.** Google cuts titles by pixel width, not character count. Measured on Persian titles rendered in Tahoma 20px, which is the widest a Windows user sees in a result: about 8.9px per character against a ~600px desktop budget, so roughly 67 characters. 66 leaves a margin. Set `titleMax` if you measured your own.

## What it reads, and what it will not touch

| Region | Read | Why |
| --- | --- | --- |
| Prose in `.md`, `.mdx`, `.txt`, `.html`, `.astro`, `.vue`, `.svelte` | yes | this is the content |
| Front matter | SEO rules only | `title`, `h1`, `description` are fields, not prose |
| Fenced code blocks | no | a comma there is syntax |
| `<style>` and `<script>` | no | same |
| HTML and line comments | no | notes to developers, not readers |
| `.js`, `.ts`, `.css`, `.json` files | no | never scanned at all |

## Use

```bash
parsi-lint content/                  # lint a directory
parsi-lint --fix content/            # apply the safe automatic fixes
parsi-lint --lang fa                 # Persian messages
parsi-lint -f github                 # annotations for GitHub Actions
parsi-lint -f json                   # machine-readable
parsi-lint --rule ai/long-dash       # one rule only
parsi-lint --max-warnings 0          # treat warnings as failures
parsi-lint --init                    # write a starter config
```

Exit codes: `0` clean or warnings only, `1` at least one error, `2` bad usage.

## Configure

`parsilint.config.json` in your project root, or a `parsiLint` key in `package.json`:

```json
{
  "extends": "recommended",
  "include": ["content/**/*.md", "src/**/*.astro"],
  "exclude": ["**/node_modules/**"],
  "rules": {
    "type/ezafe-kasra": "error",
    "ai/cliche": "off"
  },
  "cliches": ["عبارت ممنوع من"],
  "markers": ["\\[\\[.*?\\]\\]", "TODO"],
  "titleMax": 60
}
```

Presets: **`recommended`** (default, everything unambiguous), **`strict`** (adds the judgement calls), **`seo-only`** (just the front-matter budgets).

Silence a finding inline:

```html
<!-- parsi-lint-disable-next-line ai/long-dash -->
یک خط با خط تیرهٔ عمدی که باید بماند.

متن دیگر. <!-- parsi-lint-disable-line -->
<!-- parsi-lint-disable-file type/latin-digits -->
```

With no rule names it silences everything on that line. With names, only those.

## GitHub Actions

```yaml
name: content
on: [pull_request]

jobs:
  parsi-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npx github:ssepehrnoush/parsi-lint content/ --format github
```

The `github` format emits annotations, so each finding shows up on its own line in the pull request diff.

## API

```js
import { lint, fix } from 'parsi-lint';

const { findings } = lint('این کار انجام می شود.', { ext: '.md' });
findings[0].rule;       // 'type/zwnj-prefix'
findings[0].line;       // 1
findings[0].col;        // 18
findings[0].message;    // English
findings[0].messageFa;  // Persian

fix('انجام می شود').text;  // 'انجام می‌شود'
```

Every message ships in both languages. `--lang fa` in the CLI, `messageFa` in the API.

## What it deliberately does not do

Worth knowing before you adopt it.

- **It is not an AI detector.** It flags surface tells, and a careful writer can produce all of them by hand while a careful model produces none. Treat `ai/cliche` as a smell, never as proof about a person.
- **It does not spell-check.** No dictionary, no grammar model. Every rule is a pattern with a known failure mode.
- **It does not parse HTML or Astro properly.** Skip regions are tracked line by line, which is enough for fenced blocks, `<style>`, `<script>` and comments, but a `<style>` attribute spanning several lines inside an odd template can slip through. If you need real structural extraction, this is not that tool yet.
- **`--fix` will not touch «ای» or «اش».** Both are ambiguous often enough that an automatic rewrite would corrupt real sentences. They are reported by no rule rather than fixed by a guessing one.
- **It does not enforce a house style.** No word bans, no tone rules, beyond the cliche list you can replace entirely.
- **Reduplication is not analysed.** «کم‌کم کم می‌شود» is left alone by boundary rules, not by understanding it.

## Design notes

**A linter people mute is a linter that does nothing.** Every rule prefers a narrow regex that misses a case over a broad one that cries wolf. The false-positive cases in the test suite are not hypothetical, they came from running this over a live Persian medical site:

- `GLP-1`, `SURMOUNT-1`, `REDEFINE 1`, `SPF 30`, `50 mg`, `v1.2`, `2026-08-26` are not Latin-digit errors.
- `۲۳,۸۰۰,۰۰۰` is a thousands separator, not a misplaced comma.
- «کم‌کم کم می‌شود» is correct Persian, not a repeated word. A ZWNJ joins two halves of one word, so the half after it is not a word of its own.
- «دربارهٔ مناسب‌ترین» and «تعرفهٔ به‌روز» are correct ezafes. Only an ezafe directly before a copular or auxiliary verb is wrong.
- «در دنیای امروز» reports once, not twice, even though «دنیای امروز» nests inside it.

On 100 published Persian articles that had already passed a hand-written content guard, this reports 2 findings, and both are real.

## Contributing

A rule is an object in `src/rules.mjs` with an `id`, a `category`, a `severity` and a `check(line, ctx)`. Add a `fix(line)` only when the rewrite cannot change meaning.

Please bring a test for both directions: what the rule catches, and a real sentence it must leave alone. The second one matters more.

```bash
npm test
```

## License

MIT
