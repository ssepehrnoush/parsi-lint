# parsi-lint

**A linter for Persian (Farsi) content.** It catches the things that make Persian text look machine-written or broken: AI tells, missing ZWNJ (نیم‌فاصله), Arabic letters posing as Persian, mojibake, and titles that Google will cut off.

Zero dependencies. Runs in CI. Fixes what it can safely fix.

[فارسی](README.fa.md)

```bash
npx parsi-lint content/
```

```
content/blog/laser.md
    12:34 error  Long dash in Persian content, a strong AI tell. Use a comma, «» or restructure.  ai/long-dash
           › —
    18:7  error  "کتاب ها" needs a ZWNJ: "کتاب‌ها".                                                type/zwnj-plural
           › کتاب ها
    24:1  error  Arabic "ي" should be Persian "ی". Different code points break search.             type/arabic-letters
           › ي
    31:52 warn   Filler phrase "در دنیای امروز", common in machine-written Persian.                ai/cliche
           › در دنیای امروز

3 errors, 1 warning in 1 file
```

---

## Why this exists

Persian text processing tools are normalizers: give them text, get cleaned text back. That is the wrong shape for a content pipeline. You do not want a script silently rewriting a medical article on its way to production. You want to **know what is wrong, in a diff, before it ships**, and to decide.

So this is a linter, not a normalizer:

- **Exit code 1 on errors**, so CI can block a bad merge.
- **Every finding has a file, line, and column**, so it lands on the right line of the diff.
- **`--fix` is opt-in** and only touches rewrites that cannot change meaning.
- **Nothing runs inside code.** Fenced blocks, `<style>`, `<script>`, HTML comments, and code files are skipped, because a comma is punctuation in prose and syntax in JavaScript.

The AI-tell rules are the part that did not exist anywhere. Detectors for English AI text are everywhere; for Persian there was nothing you could drop into a build.

## Install

```bash
npm install -D parsi-lint
```

Or run it without installing:

```bash
npx parsi-lint content/
```

Node 18 or newer. No dependencies.

## Use

```bash
parsi-lint content/                  # lint a directory
parsi-lint --fix content/            # apply the safe automatic fixes
parsi-lint --lang fa                 # Persian messages
parsi-lint -f github                 # annotations for GitHub Actions
parsi-lint -f json                   # machine-readable
parsi-lint --rule ai/long-dash       # one rule only
parsi-lint --list-rules              # every rule and its default severity
parsi-lint --init                    # write a starter config
```

Exit codes: `0` clean or warnings only, `1` at least one error, `2` bad usage.

## What it catches

### AI tells

| Rule | Default | Catches |
|---|---|---|
| `ai/long-dash` | error | `—` `–` `―` `‒` in Persian prose. In English an em-dash is ordinary punctuation. In Persian nobody types one by hand, so it is a strong signal the text came from a model. |
| `ai/cliche` | warn | Filler phrases Persian LLM output leans on: «در دنیای امروز», «شایان ذکر است», «نقش بسزایی دارد», and about 30 more. Configurable. |
| `ai/smart-quotes` | warn | `“ ” ‘ ’` instead of Persian `« »`. |

### Typography

| Rule | Default | Catches |
|---|---|---|
| `type/arabic-letters` | error | Arabic `ي ك ة` instead of Persian `ی ک ه`. Different code points, so search and sorting silently break. Auto-fixable. |
| `type/zwnj-prefix` | error | «می شود» instead of «می‌شود». Auto-fixable. |
| `type/zwnj-plural` | error | «کتاب ها» instead of «کتاب‌ها». Auto-fixable. |
| `type/zwnj-comparative` | warn | «بزرگ تر» instead of «بزرگ‌تر». |
| `type/latin-punctuation` | error | `,` `?` `;` where Persian wants `،` `؟` `؛`. Auto-fixable. Thousands separators are left alone. |
| `type/space-before-punct` | error | A space before `،` `؛` `؟` `!`. Auto-fixable. |
| `type/space-after-punct` | warn | No space after `،` `؛` `؟`. Auto-fixable. |
| `type/latin-digits` | warn | A bare `123` sitting in a Persian sentence. |
| `type/multiple-spaces` | warn | Runs of spaces used as layout. Auto-fixable. |
| `type/tatweel` | warn | Kashida (`ـ`) stretching. Auto-fixable. |
| `type/hamza-before-verb` | error | «مشاهدهٔ است», «گرفتهٔ می‌شود». An ezafe attaches to a noun, never a verb, so this is the fingerprint of a generation pipeline placing the mark blindly. |
| `type/ezafe-kasra` | **off** | A written ezafe kasra (`ِ`). Off by default. Turn it on if your site is diacritic-free: a user never types a kasra into a search box, so a kasra in a title or an FAQ question quietly breaks keyword matching. |

### Encoding

| Rule | Default | Catches |
|---|---|---|
| `enc/mojibake` | error | UTF-8 read as cp1252 and saved again, so every Persian character became `Ø´` or `â€`. One bad save can wreck a whole content directory in a single commit, and it is invisible until someone opens the page. |
| `enc/replacement-char` | error | `U+FFFD`, a character lost in a conversion. |

### Text integrity

| Rule | Default | Catches |
|---|---|---|
| `text/repeated-word` | error | The same word typed twice. ZWNJ-aware, so «کم‌کم کم می‌شود» is correctly left alone. |
| `text/repeated-number` | error | «۶ تا ۶ تا ۸», a fragment of a previous edit surviving in a range. |
| `text/unresolved-marker` | error | `TODO`, `FIXME`, `[[...]]` left in content. Configurable. |

### SEO budgets (front matter)

| Rule | Default | Catches |
|---|---|---|
| `seo/title-length` | warn | `title` over 66 characters. Google cuts titles by pixel width, not character count. Measured on Persian titles in Tahoma 20px, the widest a Windows user sees in a result: about 8.9px per character against a ~600px desktop budget, so ~67 characters. |
| `seo/h1-length` | warn | `h1` over 85 characters. |
| `seo/description-length` | warn | `description` outside 120 to 170 characters. |

Run `parsi-lint --list-rules` for the live list.

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

Presets:

- **`recommended`** (default): everything that is unambiguously a defect.
- **`strict`**: adds the judgement calls. Diacritics, digit style, and filler phrases become errors.
- **`seo-only`**: just the front-matter budgets, for a pipeline that has its own prose rules.

Rule values: `"error"`, `"warn"`, `"off"`, or `true` / `false`.

## Silence a finding

```html
<!-- parsi-lint-disable-next-line ai/long-dash -->
یک خط با خط تیرهٔ عمدی — که باید بماند.

متن دیگر. <!-- parsi-lint-disable-line -->

<!-- parsi-lint-disable-file type/latin-digits -->
```

With no rule names, the comment silences every rule. With names, only those.

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
      - run: npx parsi-lint content/ --format github
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

Every message ships in both English and Persian. `--lang fa` in the CLI, `messageFa` in the API.

## Design notes

**A linter people mute is a linter that does nothing.** Every rule prefers a narrow regex that misses a case over a broad one that cries wolf. The false-positive cases in the test suite are not hypothetical, they came from running this over a live Persian medical site:

- `GLP-1`, `SURMOUNT-1`, `REDEFINE 1`, `SPF 30`, `50 mg`, `v1.2`, `2026-08-26` are not Latin-digit errors.
- `۲۳,۸۰۰,۰۰۰` is a thousands separator, not a misplaced comma.
- «کم‌کم کم می‌شود» is correct Persian, not a repeated word. A ZWNJ joins two halves of one word, so the half after it is not a word of its own.
- «دربارهٔ مناسب‌ترین» and «تعرفهٔ به‌روز» are correct ezafes. Only an ezafe directly before a copular or auxiliary verb is wrong.

On 100 published Persian articles that had already passed a hand-written content guard, this reports 2 findings, and both are real.

**Fixers never guess.** `--fix` handles Arabic letters, ZWNJ after می, plural ها, Latin punctuation, spacing, and tatweel. It does not touch «ای» or «اش», which are ambiguous often enough that an automatic rewrite would corrupt real sentences. Fixes are idempotent and never run inside code or front matter.

## Contributing

Adding a rule means adding an object to `src/rules.mjs` with an `id`, a `category`, a `severity`, and a `check(line, ctx)`. Add a `fix(line)` only when the rewrite cannot change meaning.

Please bring a test for both directions: what the rule catches, and a real sentence it must leave alone. The second one matters more.

```bash
npm test
```

## License

MIT
