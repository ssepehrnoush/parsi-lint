import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { lint, fix, PRESETS } from '../src/index.mjs';

/** Rule ids fired by linting `text`. `opts` is the lint() options object. */
const ids = (text, opts = {}) => lint(text, opts).findings.map((f) => f.rule);
/** `config` is a config object, not lint() options — the common case in these tests. */
const has = (text, rule, config) => ids(text, config ? { config } : {}).includes(rule);

const strict = { rules: { ...PRESETS.strict.rules } };

describe('ai tells', () => {
  test('flags an em-dash in Persian prose', () => {
    assert.ok(has('این یک جمله — با خط تیره است.', 'ai/long-dash'));
  });

  test('flags en-dash and horizontal bar too', () => {
    assert.ok(has('نمونه – دو', 'ai/long-dash'));
    assert.ok(has('نمونه ― سه', 'ai/long-dash'));
  });

  test('a hyphen is not a long dash', () => {
    assert.ok(!has('کلمه-دیگر', 'ai/long-dash'));
  });

  test('flags a known filler phrase', () => {
    assert.ok(has('در دنیای امروز همه به اینترنت نیاز دارند.', 'ai/cliche', strict));
  });

  test('matches a phrase written with a plain space instead of a ZWNJ', () => {
    assert.ok(has('لازم به ذکر است که این نکته مهم است.', 'ai/cliche', strict));
  });

  test('flags curly quotes', () => {
    assert.ok(has('او گفت “سلام” و رفت.', 'ai/smart-quotes', strict));
  });
});

describe('typography', () => {
  test('flags Arabic \u064A and \u0643', () => {
    assert.ok(has('ا\u064Aران و \u0643تاب', 'type/arabic-letters'));
  });

  test('fixes Arabic letters to Persian', () => {
    assert.equal(fix('ا\u064Aران و \u0643تاب').text, 'ایران و کتاب');
  });

  test('flags a missing ZWNJ after می', () => {
    assert.ok(has('این کار انجام می شود.', 'type/zwnj-prefix'));
  });

  test('does not flag می that is already joined', () => {
    assert.ok(!has('این کار انجام می\u200Cشود.', 'type/zwnj-prefix'));
  });

  test('fixes می شود to می\u200Cشود', () => {
    assert.equal(fix('انجام می شود').text, 'انجام می\u200Cشود');
  });

  test('flags a missing ZWNJ before the plural ها', () => {
    assert.ok(has('کتاب ها روی میز است.', 'type/zwnj-plural'));
  });

  test('fixes کتاب ها to کتاب\u200Cها', () => {
    assert.equal(fix('کتاب ها روی میز').text, 'کتاب\u200Cها روی میز');
  });

  test('flags a Latin comma after Persian', () => {
    assert.ok(has('سلام, خوبی', 'type/latin-punctuation'));
  });

  test('fixes a Latin comma to ،', () => {
    assert.equal(fix('سلام, خوبی').text, 'سلام، خوبی');
  });

  test('flags a space before punctuation', () => {
    assert.ok(has('سلام ، خوبی', 'type/space-before-punct'));
  });

  test('flags tatweel', () => {
    assert.ok(has('سـلام', 'type/tatweel'));
  });

  test('flags an ezafe hamza before a verb', () => {
    assert.ok(has('این صفحهٔ می\u200Cخواهد بارگذاری شود.', 'type/hamza-before-verb'));
  });

  test('leaves a correct ezafe alone', () => {
    assert.ok(!has('دربارهٔ مناسب\u200Cترین روش', 'type/hamza-before-verb'));
    assert.ok(!has('تعرفهٔ به\u200Cروز کلینیک', 'type/hamza-before-verb'));
  });

  // Every "does not flag" case below came from a false positive found while
  // running the linter over a live Persian medical site. Keep them.
  test('flags a bare Latin number in a Persian sentence', () => {
    assert.ok(has('قیمت 500 تومان است', 'type/latin-digits'));
    assert.ok(has('حدود 12 نفر آمدند', 'type/latin-digits'));
  });

  test('does not flag a number inside a Latin identifier', () => {
    assert.ok(!has('داروی GLP-1 موثر است', 'type/latin-digits'));
    assert.ok(!has('کارآزمایی SURMOUNT-1 بود', 'type/latin-digits'));
  });

  test('does not flag a number naming a Latin-titled thing', () => {
    assert.ok(!has('کارآزمایی REDEFINE 1 نشان داد', 'type/latin-digits'));
    assert.ok(!has('ضدآفتاب SPF 30 بزن', 'type/latin-digits'));
  });

  test('does not flag units, versions or ISO dates', () => {
    assert.ok(!has('دوز 50 mg بود', 'type/latin-digits'));
    assert.ok(!has('نسخهٔ v1.2 آمد', 'type/latin-digits'));
    assert.ok(!has('تاریخ 2026-08-26 بود', 'type/latin-digits'));
  });

  test('ezafe kasra is off by default and on in strict', () => {
    assert.ok(!has('کتابِ من', 'type/ezafe-kasra'));
    assert.ok(has('کتابِ من', 'type/ezafe-kasra', strict));
  });

  test('the kasra allowlist protects real spellings', () => {
    assert.ok(!has('کِرم دور چشم', 'type/ezafe-kasra', strict));
  });
});

describe('encoding', () => {
  test('flags double-encoded UTF-8', () => {
    assert.ok(has('Ø³Ù„Ø§Ù… Ø¯Ù†ÛŒØ§', 'enc/mojibake'));
  });

  test('flags the replacement character', () => {
    assert.ok(has('سلام � دنیا', 'enc/replacement-char'));
  });

  test('clean Persian is not mojibake', () => {
    assert.ok(!has('سلام دنیا، حال شما چطور است؟', 'enc/mojibake'));
  });
});

describe('text integrity', () => {
  test('flags a repeated number in a range', () => {
    assert.ok(has('تا ۶ تا ۶ تا ۸ ساعت اول دراز نکشید.', 'text/repeated-number'));
  });

  test('flags a repeated word', () => {
    assert.ok(has('این یک یک نمونه است.', 'text/repeated-word'));
  });

  test('flags an unresolved marker', () => {
    assert.ok(has('قیمت [[تأیید کن]] تومان است.', 'text/unresolved-marker'));
    assert.ok(has('TODO: بنویس', 'text/unresolved-marker'));
  });
});

describe('seo front matter', () => {
  const fm = (title) => `---\ntitle: "${title}"\n---\n\nمتن.\n`;

  test('flags a title over the budget', () => {
    const long = 'ب'.repeat(80);
    assert.ok(has(fm(long), 'seo/title-length'));
  });

  test('accepts a title within the budget', () => {
    assert.ok(!has(fm('یک تیتر کوتاه'), 'seo/title-length'));
  });

  test('flags a description that is too short', () => {
    const text = `---\ndescription: "خیلی کوتاه"\n---\n\nمتن.\n`;
    assert.ok(has(text, 'seo/description-length'));
  });

  test('reads a description continued on the next line', () => {
    const text = `---\ndescription: "${'د'.repeat(200)}"\n---\n\nمتن.\n`;
    assert.ok(has(text, 'seo/description-length'));
  });
});

describe('skip regions', () => {
  test('ignores a fenced code block', () => {
    const text = 'متن سالم.\n\n```js\nconst a = 1, b = 2; // dash — here\n```\n';
    assert.deepEqual(ids(text), []);
  });

  test('ignores a style element', () => {
    const text = 'متن سالم.\n<style>\n  .a { margin: 0 } /* — */\n</style>\n';
    assert.ok(!ids(text).includes('ai/long-dash'));
  });

  test('ignores code files entirely', () => {
    assert.deepEqual(ids('const a = 1, b = 2; // — dash', { ext: '.ts' }), []);
  });

  test('front matter is not scanned by line rules', () => {
    const text = `---\ntitle: "سلام, دنیا"\n---\n\nمتن سالم.\n`;
    assert.ok(!ids(text).includes('type/latin-punctuation'));
  });
});

describe('disable comments', () => {
  test('parsi-lint-disable-line silences that line', () => {
    const text = 'یک جمله — با تیره. <!-- parsi-lint-disable-line -->\n';
    assert.deepEqual(ids(text), []);
  });

  test('a disable comment can name one rule', () => {
    const text = 'یک جمله — با تیره. <!-- parsi-lint-disable-line ai/long-dash -->\n';
    assert.ok(!ids(text).includes('ai/long-dash'));
  });

  test('parsi-lint-disable-next-line silences the following line', () => {
    const text = '<!-- parsi-lint-disable-next-line -->\nیک جمله — با تیره.\n';
    assert.deepEqual(ids(text), []);
  });

  test('parsi-lint-disable-file silences the whole file', () => {
    const text = '<!-- parsi-lint-disable-file -->\nیک جمله — با تیره.\nکتاب ها.\n';
    assert.deepEqual(ids(text), []);
  });
});

describe('findings', () => {
  test('carries both languages', () => {
    const f = lint('جمله — تیره').findings[0];
    assert.ok(f.message.length > 0);
    assert.ok(f.messageFa.length > 0);
    assert.notEqual(f.message, f.messageFa);
  });

  test('column is a code-point offset, not a UTF-16 index', () => {
    const f = lint('سلام — دنیا').findings[0];
    assert.equal(f.col, 6);
  });

  test('a clean Persian paragraph produces nothing', () => {
    const clean = 'کلینیک ما از ساعت ۹ صبح باز است و نوبت\u200Cدهی تلفنی دارد.\n';
    assert.deepEqual(ids(clean), []);
  });
});

describe('fix safety', () => {
  test('does not touch code lines', () => {
    const text = '```js\nconst a = 1, b = 2;\n```\n';
    assert.equal(fix(text).text, text);
  });

  test('does not touch front matter', () => {
    const text = `---\ntitle: "سلام, دنیا"\n---\n\nمتن.\n`;
    assert.equal(fix(text).text, text);
  });

  test('is idempotent', () => {
    const once = fix('ا\u064Aران، \u0643تاب ها انجام می شود').text;
    assert.equal(fix(once).text, once);
  });
});

describe('word boundaries and ZWNJ', () => {
  // From live content: «کم\u200Cکم کم می\u200Cشود» is correct Persian ("little by little
  // it decreases"). The second half of a ZWNJ-joined word is not its own word.
  test('does not flag the second half of a ZWNJ-joined word as a repeat', () => {
    assert.ok(!has('بعد کم\u200Cکم کم می\u200Cشود', 'text/repeated-word'));
    assert.ok(!has('آرام\u200Cآرام آرام شد', 'text/repeated-word'));
  });

  test('still flags a genuine repeat next to a ZWNJ word', () => {
    assert.ok(has('کم\u200Cکم بهتر بهتر شد', 'text/repeated-word'));
  });

  test('a thousands separator is not a latin comma error', () => {
    assert.ok(!has('قیمت ۲۳,۸۰۰,۰۰۰ تومان', 'type/latin-punctuation'));
  });

  test('digits are not words', () => {
    assert.ok(!has('دوز ۲.۵، ۵، ۷.۵ گرم', 'text/repeated-word'));
  });
});

describe('cliche overlap', () => {
  // «دنیای امروز» nests inside «در دنیای امروز». Only the longest should report.
  test('reports a nested filler phrase once', () => {
    const found = lint('در دنیای امروز همه آنلاین\u200Cاند.', { config: strict })
      .findings.filter((f) => f.rule === 'ai/cliche');
    assert.equal(found.length, 1);
    assert.match(found[0].message, /در دنیای امروز/);
  });

  test('still reports two distinct phrases on one line', () => {
    const found = lint('شایان ذکر است که این نکته حائز اهمیت است.', { config: strict })
      .findings.filter((f) => f.rule === 'ai/cliche');
    assert.equal(found.length, 2);
  });
});
