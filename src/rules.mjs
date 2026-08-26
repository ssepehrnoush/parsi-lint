/**
 * parsi-lint rule set.
 *
 * Every rule is a plain object:
 *   id        stable name, used in config and in `parsi-lint-disable` comments
 *   category  ai | typography | encoding | text | seo
 *   severity  'error' (exit 1) or 'warn' (reported, exit 0)
 *   check     (line, ctx) => findings[]   — line-based rules
 *   fix       (line) => string            — optional, powers `--fix`
 *
 * A finding is { col, excerpt, message, messageFa }.
 *
 * Design notes that matter if you add a rule:
 *  - Persian text is scanned per line. Column numbers are 1-based code points,
 *    not UTF-16 units, so they line up with what an editor shows.
 *  - Only add a rule to `fix` when the rewrite is unambiguous. A fixer that
 *    guesses is worse than no fixer, because it silently changes meaning.
 *  - Prefer a narrow regex with a false-negative over a broad one with a
 *    false-positive. A linter people mute is a linter that does nothing.
 *
 * On the \uXXXX escapes: four characters in this file are written as escapes
 * on purpose, because they are unreviewable as literals.
 *   ‌  ZWNJ, the half-space. Invisible in every editor.
 *   ي  Arabic yeh, identical on screen to Persian ی (ی).
 *   ك  Arabic kaf, identical on screen to Persian ک (ک).
 *   ة  teh marbuta, near-identical to ه (ه).
 * The last three are exactly what `type/arabic-letters` exists to catch, so
 * writing them literally would make the rule impossible to review. Ordinary
 * readable Persian is left as-is: the cliche list and the messages are content,
 * and escaping them would mean nobody could edit them.
 */

const FA = '؀-ۿ';          // full Arabic block: letters, digits and punctuation
const ZWNJ = '\u200C';               // نیم\u200Cفاصله
const FA_LETTER = `[${FA}]`;

/**
 * Persian/Arabic *letters* only — no digits, no punctuation.
 *
 * The full block above includes ، ؛ ؟ and both Arabic (٠-٩) and Persian (۰-۹)
 * digits, which makes it wrong for any rule that means "a word". Using the
 * broad class for word rules produced two real false positives on live content:
 * «۲۳,۸۰۰,۰۰۰» read as a comma error, and «۵،» read as a repeated word.
 */
const FA_ALPHA_RANGE = 'ء-ٟٮ-ۓەۥۦۮۯۺ-ۿ';
const FA_ALPHA = `[${FA_ALPHA_RANGE}]`;
const FA_DIGIT = '[۰-۹٠-٩]';

/**
 * Word boundary for Persian, including the ZWNJ.
 *
 * A ZWNJ joins two halves of one word, so the half after it is not a word of
 * its own. Without this, «کم\u200Cکم کم می\u200Cشود» — perfectly correct Persian, "little
 * by little it decreases" — reads as the word «کم» typed twice. Found on live
 * content; the repeated-word rule is unusable without it.
 */
const FA_BOUND = `[${FA_ALPHA_RANGE}\u200C]`;

/** Count code points, not UTF-16 units. Persian is BMP, but emoji in titles is not. */
export const cpLength = (s) => [...s].length;

/** 1-based code-point column of a UTF-16 index. */
const colOf = (line, index) => cpLength(line.slice(0, index)) + 1;

/** Collect every match of a global regex as a finding. */
function scan(line, re, build) {
  const findings = [];
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m;
  while ((m = rx.exec(line)) !== null) {
    if (m[0] === '') { rx.lastIndex++; continue; }
    findings.push({ col: colOf(line, m.index), excerpt: m[0], ...build(m) });
  }
  return findings;
}

/* ─────────────────────────── AI tells ─────────────────────────── */

/**
 * Long dashes. In English an em-dash is ordinary punctuation; in Persian prose
 * it is almost never typed by hand, so its presence is a strong signal the text
 * came out of a model. Persian uses «...» or a comma where English uses a dash.
 */
const emDash = {
  id: 'ai/long-dash',
  category: 'ai',
  severity: 'error',
  docs: 'Long dashes (— – ― ‒) are not typed by hand in Persian prose.',
  check: (line) =>
    scan(line, /[‒–—―]/, () => ({
      message: 'Long dash in Persian content. A strong AI tell: use a comma, «» or restructure.',
      messageFa: 'خط تیرهٔ بلند در متن فارسی؛ نشانهٔ متن ماشینی است. به جایش ویرگول یا «» بگذار.',
    })),
};

/**
 * Curly/smart quotes around Persian. Persian quotation marks are «».
 * Word processors and models emit “ ” ‘ ’ instead.
 */
const smartQuotes = {
  id: 'ai/smart-quotes',
  category: 'ai',
  severity: 'warn',
  docs: 'Curly quotes instead of Persian «».',
  check: (line) =>
    scan(line, /[“”‘’]/, () => ({
      message: 'Curly quote in Persian content. Persian quotation marks are « ».',
      messageFa: 'گیومهٔ انگلیسی در متن فارسی. گیومهٔ فارسی « » است.',
    })),
};

/**
 * Filler phrases that Persian LLM output leans on. Each one is also written by
 * humans occasionally, which is why this rule is a warning: it is a smell, not
 * a defect. Density is the real signal — see the `ai/cliche-density` rule.
 */
export const CLICHES = [
  'در دنیای امروز',
  'در دنیای پرشتاب امروز',
  'در عصر حاضر',
  'در دنیای مدرن امروز',
  'شایان ذکر است',
  'لازم به ذکر است',
  'لازم به یادآوری است',
  'قابل ذکر است',
  'در نهایت می\u200Cتوان گفت',
  'به طور کلی می\u200Cتوان گفت',
  'در واقع می\u200Cتوان گفت',
  'با توجه به موارد فوق',
  'با توجه به مطالب فوق',
  'همان\u200Cطور که می\u200Cدانید',
  'همان طور که می دانید',
  'بدون شک می\u200Cتوان گفت',
  'در این مقاله سعی داریم',
  'در این مقاله قصد داریم',
  'در این مقاله می\u200Cخواهیم',
  'امیدواریم این مطلب مفید',
  'با ما همراه باشید',
  'تا انتهای این مطلب همراه ما باشید',
  'نقش بسزایی دارد',
  'نقش بسزایی ایفا می\u200Cکند',
  'از اهمیت بالایی برخوردار است',
  'از جایگاه ویژه\u200Cای برخوردار است',
  'حائز اهمیت است',
  'کلام آخر',
  'سخن پایانی',
  'جمع\u200Cبندی نهایی',
  'راهکارهای نوین',
  'به طور چشمگیری',
  'بهبود چشمگیری',
  'دنیای امروز',
];

const cliche = {
  id: 'ai/cliche',
  category: 'ai',
  severity: 'warn',
  docs: 'Filler phrases typical of Persian LLM output.',
  check: (line, ctx) => {
    const list = ctx.config.cliches ?? CLICHES;
    // Longest first, and mask what matched. Several phrases nest inside others
    // ("دنیای امروز" inside "در دنیای امروز"), and reporting both is noise that
    // says nothing extra. The longest match is the one worth showing.
    const byLength = [...list].sort((a, b) => b.length - a.length);
    let masked = line;
    const findings = [];

    for (const phrase of byLength) {
      // Tolerate a plain space where the phrase has a ZWNJ, and vice versa.
      const flexible = phrase.replace(/[\u200C ]/g, `[${ZWNJ} ]`);
      const hits = scan(masked, new RegExp(flexible, 'g'), () => ({
        message: `Filler phrase "${phrase}", common in machine-written Persian. Cut it or say the thing directly.`,
        messageFa: `عبارت پرکنندهٔ «${phrase}»؛ در متن ماشینی زیاد می\u200Cآید. حذفش کن یا حرف اصلی را مستقیم بزن.`,
      }));
      if (!hits.length) continue;
      findings.push(...hits);
      // Blank out the matched spans so a shorter nested phrase cannot re-match.
      // Same length, so every column already recorded stays correct.
      masked = masked.replace(new RegExp(flexible, 'g'), (m) => ' '.repeat(m.length));
    }

    return findings;
  },
};

/* ─────────────────────────── Typography ─────────────────────────── */

/**
 * Arabic letters that look Persian but are not. \u064A/\u0643/\u0629 come from Arabic
 * keyboards and from copy-paste; they break search, sorting, and matching
 * because \u064A (U+064A) and ی (U+06CC) are different code points.
 */
const arabicLetters = {
  id: 'type/arabic-letters',
  category: 'typography',
  severity: 'error',
  docs: 'Arabic \u064A \u0643 \u0629 instead of Persian ی ک ه.',
  check: (line) =>
    scan(line, /[\u064A\u0643\u0629]/, (m) => {
      const map = { '\u064A': 'ی', '\u0643': 'ک', '\u0629': 'ه' };
      return {
        message: `Arabic "${m[0]}" should be Persian "${map[m[0]]}". Different code points break search and matching.`,
        messageFa: `حرف عربی «${m[0]}» باید فارسیِ «${map[m[0]]}» باشد. کد این دو فرق دارد و سرچ را می\u200Cشکند.`,
      };
    }),
  fix: (line) => line.replace(/\u064A/g, 'ی').replace(/\u0643/g, 'ک').replace(/\u0629/g, 'ه'),
};

/** Tatweel/kashida — decorative letter stretching that survives copy-paste. */
const tatweel = {
  id: 'type/tatweel',
  category: 'typography',
  severity: 'warn',
  docs: 'Tatweel (ـ) used to stretch letters.',
  check: (line) =>
    scan(line, /ـ+/, () => ({
      message: 'Tatweel (kashida) in text. It is decoration and breaks word matching.',
      messageFa: 'کشیده (ـ) در متن. تزئینی است و تطبیق واژه را خراب می\u200Cکند.',
    })),
  fix: (line) => line.replace(/ـ+/g, ''),
};

/**
 * Missing ZWNJ — the single most common Persian typography defect.
 * Three narrow patterns, each unambiguous:
 *   می / نمی  + verb        «می شود»   → «می\u200Cشود»
 *   noun + ها/های/هایی      «کتاب ها»  → «کتاب\u200Cها»
 *   adj  + تر/ترین          «بزرگ تر»  → «بزرگ\u200Cتر»
 *
 * Deliberately not covered: «ای» and «اش», which are ambiguous often enough
 * that a fixer would corrupt real sentences.
 */
const zwnjPrefix = {
  id: 'type/zwnj-prefix',
  category: 'typography',
  severity: 'error',
  docs: 'Missing ZWNJ after می/نمی.',
  check: (line) =>
    scan(line, new RegExp(`(?<!${FA_ALPHA})(ن?می) (${FA_ALPHA}+)`, 'g'), (m) => ({
      message: `"${m[1]} ${m[2]}" needs a ZWNJ: "${m[1]}\u200C${m[2]}".`,
      messageFa: `«${m[1]} ${m[2]}» نیم\u200Cفاصله می\u200Cخواهد: «${m[1]}\u200C${m[2]}».`,
    })),
  fix: (line) => line.replace(new RegExp(`(?<!${FA_ALPHA})(ن?می) (?=${FA_ALPHA})`, 'g'), `$1${ZWNJ}`),
};

const zwnjPlural = {
  id: 'type/zwnj-plural',
  category: 'typography',
  severity: 'error',
  docs: 'Missing ZWNJ before the plural ها.',
  check: (line) =>
    scan(line, new RegExp(`(${FA_ALPHA}{2,}) (ها(?:ی|یی)?)(?!${FA_ALPHA})`, 'g'), (m) => ({
      message: `"${m[1]} ${m[2]}" needs a ZWNJ: "${m[1]}\u200C${m[2]}".`,
      messageFa: `«${m[1]} ${m[2]}» نیم\u200Cفاصله می\u200Cخواهد: «${m[1]}\u200C${m[2]}».`,
    })),
  fix: (line) =>
    line.replace(new RegExp(`(${FA_ALPHA}{2,}) (ها(?:ی|یی)?)(?!${FA_ALPHA})`, 'g'), `$1${ZWNJ}$2`),
};

const zwnjComparative = {
  id: 'type/zwnj-comparative',
  category: 'typography',
  severity: 'warn',
  docs: 'Missing ZWNJ before تر / ترین.',
  check: (line) =>
    scan(line, new RegExp(`(${FA_ALPHA}{2,}) (تر(?:ین)?)(?!${FA_ALPHA})`, 'g'), (m) => ({
      message: `"${m[1]} ${m[2]}" is usually written "${m[1]}\u200C${m[2]}".`,
      messageFa: `«${m[1]} ${m[2]}» معمولاً «${m[1]}\u200C${m[2]}» نوشته می\u200Cشود.`,
    })),
};

/**
 * Latin comma / question mark / semicolon next to Persian text.
 *
 * The trailing digit guard is what makes this usable: «۲۳,۸۰۰,۰۰۰» is a
 * thousands separator, not a misplaced comma, and Persian writing uses the
 * latin comma for it constantly.
 */
const latinPunct = {
  id: 'type/latin-punctuation',
  category: 'typography',
  severity: 'error',
  docs: 'Latin , ? ; touching Persian text instead of ، ؟ ؛.',
  check: (line) =>
    scan(line, new RegExp(`${FA_LETTER}[ \\t]*([,?;])(?!${FA_DIGIT}|\\d)`, 'g'), (m) => {
      const map = { ',': '،', '?': '؟', ';': '؛' };
      return {
        col: colOf(line, m.index + m[0].length - 1),
        excerpt: m[1],
        message: `Latin "${m[1]}" in Persian text. Use "${map[m[1]]}".`,
        messageFa: `نشانهٔ لاتین «${m[1]}» در متن فارسی. باید «${map[m[1]]}» باشد.`,
      };
    }),
  fix: (line) =>
    line
      .replace(new RegExp(`(${FA_LETTER}[ \\t]*),(?!${FA_DIGIT}|\\d)`, 'g'), '$1،')
      .replace(new RegExp(`(${FA_LETTER}[ \\t]*)\\?`, 'g'), '$1؟')
      .replace(new RegExp(`(${FA_LETTER}[ \\t]*);`, 'g'), '$1؛'),
};

/** A space before punctuation is always wrong, in every script. */
const spaceBeforePunct = {
  id: 'type/space-before-punct',
  category: 'typography',
  severity: 'error',
  docs: 'Space before ، . ؛ ؟ !',
  check: (line) =>
    scan(line, /\s+([،؛؟!.])/, (m) => ({
      message: `Space before "${m[1]}". Punctuation attaches to the word before it.`,
      messageFa: `فاصله پیش از «${m[1]}». نشانه به واژهٔ قبلش می\u200Cچسبد.`,
    })),
  fix: (line) => line.replace(/[ \t]+([،؛؟!])/g, '$1'),
};

/** Missing space after Persian punctuation. */
const noSpaceAfterPunct = {
  id: 'type/space-after-punct',
  category: 'typography',
  severity: 'warn',
  docs: 'Missing space after ، ؛ ؟',
  check: (line) =>
    scan(line, new RegExp(`([،؛؟])(${FA_LETTER})`, 'g'), (m) => ({
      message: `Missing space after "${m[1]}".`,
      messageFa: `بعد از «${m[1]}» فاصله لازم است.`,
    })),
  fix: (line) => line.replace(new RegExp(`([،؛؟])(${FA_LETTER})`, 'g'), '$1 $2'),
};

/**
 * Latin digits inside Persian prose.
 *
 * Deliberately narrow, because the naive version is unusable on real content.
 * A digit is only reported when no latin token sits next to it on either side,
 * within a space or two, so these all stay quiet. Each is a real thing that
 * appears in Persian medical, technical and news writing:
 *   GLP-1, SURMOUNT-1, COVID-19    a number inside a latin identifier
 *   REDEFINE 1, SPF 30, Windows 11 a number naming a latin-titled thing
 *   50 mg, 20px                    a number with a latin unit
 *   /blog/2, v1.2, 2026-08-26      paths, versions, ISO dates
 * What is left is the case the rule is actually about: a bare number sitting
 * in a Persian sentence, like «قیمت 500 تومان».
 */
const latinDigits = {
  id: 'type/latin-digits',
  category: 'typography',
  severity: 'warn',
  docs: 'Latin digits (123) standing alone in Persian prose instead of ۱۲۳.',
  check: (line) => {
    if (!new RegExp(FA_LETTER).test(line)) return []; // not Persian prose
    return scan(
      line,
      /(?<![A-Za-z0-9\-._/\\:#=][ \t]{0,2})(\d+(?:[.,]\d+)?)(?![ \t]{0,2}[A-Za-z0-9\-._/\\:%])/g,
      (m) => ({
        excerpt: m[0],
        message: 'Bare Latin digits in Persian prose. Persian numerals are ۰۱۲۳۴۵۶۷۸۹.',
        messageFa: 'عدد لاتین تنها در متن فارسی. عدد فارسی ۰۱۲۳۴۵۶۷۸۹ است.',
      }),
    );
  },
};

/** Two or more spaces used as layout. */
const multiSpace = {
  id: 'type/multiple-spaces',
  category: 'typography',
  severity: 'warn',
  docs: 'Runs of spaces inside a sentence.',
  check: (line) =>
    scan(line, new RegExp(`${FA_LETTER}(  +)${FA_LETTER}`, 'g'), () => ({
      message: 'Multiple spaces inside a sentence. Use one.',
      messageFa: 'چند فاصلهٔ پشت هم داخل جمله. یکی کافی است.',
    })),
  fix: (line) => line.replace(new RegExp(`(${FA_LETTER})  +(?=${FA_LETTER})`, 'g'), '$1 '),
};

/**
 * Ezafe kasra. Persian is written without diacritics; a written kasra also
 * never appears in what a user types into a search box, so it silently breaks
 * keyword matching in titles, descriptions and FAQ questions.
 *
 * Off by default because some projects genuinely want diacritics (poetry,
 * teaching material, children's books). Turn it on with "type/ezafe-kasra": "error".
 */
export const KASRA_KEEP = ['کِرِم', 'کِرم', 'کِشید', 'کِشد', 'کِش', 'کِی', 'گِرد', 'سِرم', 'مِلک', 'شِکر'];

const ezafeKasra = {
  id: 'type/ezafe-kasra',
  category: 'typography',
  severity: 'off',
  docs: 'Written ezafe kasra (ِ). Off by default.',
  check: (line, ctx) => {
    const keep = ctx.config.kasraAllow ?? KASRA_KEEP;
    let masked = line;
    for (const w of keep) masked = masked.split(w).join(' '.repeat(w.length));
    return scan(masked, /ِ/, () => ({
      message: 'Written ezafe kasra. Users never type a kasra in a search box, so it breaks keyword matching.',
      messageFa: 'کسرهٔ اضافه در متن. کاربر در سرچ کسره تایپ نمی\u200Cکند، پس تطبیق کیورد را می\u200Cشکند.',
    }));
  },
  fix: (line) => {
    let out = line;
    const holes = [];
    for (const w of KASRA_KEEP) {
      let i = out.indexOf(w);
      while (i !== -1) { holes.push([i, i + w.length]); i = out.indexOf(w, i + 1); }
    }
    return [...out]
      .map((ch, i) => (ch === 'ِ' && !holes.some(([a, b]) => i >= a && i < b) ? '' : ch))
      .join('');
  },
};

/**
 * The ezafe hamza (هٔ) attached to a verb. An ezafe links a noun or adjective
 * to what follows it, so «مشاهدهٔ است» or «گرفتهٔ می\u200Cشود» is never correct —
 * it is the signature of a generation pipeline placing the mark blindly.
 * Kept deliberately narrow: only explicit copular and auxiliary verbs, because
 * «دربارهٔ مناسب\u200Cترین» and «تعرفهٔ به\u200Cروز» are perfectly correct ezafes.
 */
const hamzaBeforeVerb = {
  id: 'type/hamza-before-verb',
  category: 'typography',
  severity: 'error',
  docs: 'Ezafe hamza (هٔ) directly before a verb.',
  check: (line) =>
    scan(
      line,
      /(\S*ٔ)\s+(است|بود|هست|نیست|شد|شود|شوید|باشد|می\u200C\S+|نمی\u200C\S+)(?![ء-\u064A])/g,
      (m) => ({
        message: `Ezafe "${m[1]}" before the verb "${m[2]}". An ezafe attaches to a noun, never a verb.`,
        messageFa: `نشانهٔ اضافهٔ «${m[1]}» پیش از فعل «${m[2]}». اضافه به فعل نمی\u200Cچسبد.`,
      }),
    ),
};

/* ─────────────────────────── Encoding ─────────────────────────── */

/**
 * UTF-8 read as cp1252 and saved again. Every Persian character turns into a
 * pair like "Ø´" or "â€". This is silent, catastrophic, and easy to detect —
 * a single bad save can wreck an entire content directory in one commit.
 */
const mojibake = {
  id: 'enc/mojibake',
  category: 'encoding',
  severity: 'error',
  docs: 'UTF-8 text double-encoded through cp1252/latin-1.',
  check: (line) =>
    scan(line, /â€|Ã[^\x00-\x7F]|Ø[\x80-\xBF]|Ù[\x80-\xBF]/, () => ({
      message: 'Double-encoded UTF-8 (mojibake). The file was saved with the wrong encoding. Re-save it as UTF-8 from the original.',
      messageFa: 'مویجیبیک؛ فایل با انکودینگ اشتباه ذخیره شده. از نسخهٔ سالم دوباره با UTF-8 ذخیره\u200Cاش کن.',
    })),
};

/** U+FFFD — a character that was lost in a conversion and cannot be recovered. */
const replacementChar = {
  id: 'enc/replacement-char',
  category: 'encoding',
  severity: 'error',
  docs: 'U+FFFD replacement character.',
  check: (line) =>
    scan(line, /�/, () => ({
      message: 'Replacement character (U+FFFD). A character was lost in a conversion.',
      messageFa: 'کاراکتر جایگزین (U+FFFD)؛ یک حرف در تبدیل انکودینگ گم شده.',
    })),
};

/* ─────────────────────────── Text integrity ─────────────────────────── */

/**
 * A number repeated across a "تا" range: «۶ تا ۶ تا ۸». This comes from a
 * fragment of the previous line surviving an edit. It matters more than it
 * looks — the real-world case that motivated it was a medical instruction,
 * where a reader was acting on a mangled number.
 */
const repeatedNumber = {
  id: 'text/repeated-number',
  category: 'text',
  severity: 'error',
  docs: 'A number repeated in a «تا» range, e.g. «۶ تا ۶ تا ۸».',
  check: (line) =>
    scan(line, /([۰-۹0-9]+)\s+تا\s+\1\s+تا\s/, () => ({
      message: 'Repeated number in a range. A fragment of an earlier edit survived, so check the real value.',
      messageFa: 'عدد تکراری در بازه؛ تکه\u200Cای از ویرایش قبلی جا مانده. عدد درست را چک کن.',
    })),
};

/** The same word typed twice in a row. */
const repeatedWord = {
  id: 'text/repeated-word',
  category: 'text',
  severity: 'error',
  docs: 'The same Persian word twice in a row.',
  check: (line) =>
    scan(line, new RegExp(`(?<!${FA_BOUND})(${FA_ALPHA}{2,}) \\1(?!${FA_BOUND})`, 'g'), (m) => ({
      message: `"${m[1]}" is repeated.`,
      messageFa: `واژهٔ «${m[1]}» دو بار پشت هم آمده.`,
    })),
};

/**
 * Unresolved authoring markers. The default list catches TODO/FIXME and the
 * `[[ ... ]]` convention; `markers` in config replaces it.
 */
const todoMarker = {
  id: 'text/unresolved-marker',
  category: 'text',
  severity: 'error',
  docs: 'TODO / FIXME / [[...]] markers left in content.',
  check: (line, ctx) => {
    const patterns = ctx.config.markers ?? ['\\[\\[[^\\]]*\\]\\]', 'TODO', 'FIXME', 'XXX'];
    const findings = [];
    for (const p of patterns) {
      findings.push(
        ...scan(line, new RegExp(p, 'g'), (m) => ({
          message: `Unresolved marker "${m[0]}" left in content.`,
          messageFa: `نشانهٔ تعیین\u200Cتکلیف\u200Cنشدهٔ «${m[0]}» در متن مانده.`,
        })),
      );
    }
    return findings;
  },
};

/* ─────────────────────────── SEO / front matter ─────────────────────────── */

/**
 * These three run on front matter, not on every line, so they are `meta` rules:
 * the engine calls them once per file with the parsed front matter.
 *
 * The character budgets come from measuring Persian titles rendered in Tahoma
 * 20px, which is the widest thing a Windows user sees in a Google result:
 * ~8.9 px per character against a ~600 px desktop budget, so ~67 characters.
 * 66 leaves a margin. Change the numbers in config if you measured your own.
 */
const seoTitle = {
  id: 'seo/title-length',
  category: 'seo',
  severity: 'warn',
  docs: 'Front-matter title longer than the Google result budget.',
  meta: (fm, ctx) => {
    const max = ctx.config.titleMax ?? 66;
    if (typeof fm.title !== 'string') return [];
    const len = cpLength(fm.title);
    if (len <= max) return [];
    return [{
      field: 'title',
      message: `Title is ${len} characters (budget ${max}); Google will cut the tail. Trim the brand suffix first, never a keyword.`,
      messageFa: `تیتر ${len} کاراکتر است (بودجه ${max})؛ گوگل ته آن را می\u200Cبُرد. اول پسوند برند را کوتاه کن، کیورد را هرگز.`,
    }];
  },
};

const seoH1 = {
  id: 'seo/h1-length',
  category: 'seo',
  severity: 'warn',
  docs: 'Front-matter h1 long enough to wrap to four lines.',
  meta: (fm, ctx) => {
    const max = ctx.config.h1Max ?? 85;
    if (typeof fm.h1 !== 'string') return [];
    const len = cpLength(fm.h1);
    if (len <= max) return [];
    return [{
      field: 'h1',
      message: `h1 is ${len} characters (budget ${max}). This is a safety net against a four-line heading, not a style rule.`,
      messageFa: `تیتر h1 ${len} کاراکتر است (بودجه ${max}). این تور ایمنی است نه قانون سبک.`,
    }];
  },
};

const seoDescription = {
  id: 'seo/description-length',
  category: 'seo',
  severity: 'warn',
  docs: 'Meta description outside the display budget.',
  meta: (fm, ctx) => {
    const max = ctx.config.descriptionMax ?? 170;
    const min = ctx.config.descriptionMin ?? 120;
    if (typeof fm.description !== 'string') return [];
    const len = cpLength(fm.description);
    if (len > max) {
      return [{
        field: 'description',
        message: `Description is ${len} characters (max ${max}); the tail gets cut in the result.`,
        messageFa: `توضیح متا ${len} کاراکتر است (سقف ${max})؛ ته آن در نتیجه بریده می\u200Cشود.`,
      }];
    }
    if (len < min) {
      return [{
        field: 'description',
        message: `Description is only ${len} characters (min ${min}); you are wasting result space. Add a concrete reason to click.`,
        messageFa: `توضیح متا فقط ${len} کاراکتر است (کف ${min})؛ فضای نتیجه هدر می\u200Cرود. یک دلیل واقعی برای کلیک اضافه کن.`,
      }];
    }
    return [];
  },
};

export const RULES = [
  emDash,
  smartQuotes,
  cliche,
  arabicLetters,
  tatweel,
  zwnjPrefix,
  zwnjPlural,
  zwnjComparative,
  latinPunct,
  spaceBeforePunct,
  noSpaceAfterPunct,
  latinDigits,
  multiSpace,
  ezafeKasra,
  hamzaBeforeVerb,
  mojibake,
  replacementChar,
  repeatedNumber,
  repeatedWord,
  todoMarker,
  seoTitle,
  seoH1,
  seoDescription,
];

export const RULES_BY_ID = new Map(RULES.map((r) => [r.id, r]));
