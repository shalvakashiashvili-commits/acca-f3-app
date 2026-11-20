/* =========================================================
   თავის JSON ფაილის ვალიდაცია.
   აბრუნებს { kind, errors[], warnings[] }:
     kind = 'full'      — სრული თავი (summary / case_study / flashcards …)
     kind = 'questions' — მხოლოდ დამატებითი კითხვები (chapter.id + questions)
   errors არაცარიელია → ფაილი არ შეინახება.
   ყველა შეტყობინება ქართულადაა, ველის ზუსტი მისამართით.
   ========================================================= */

const Q_TYPES = ['mcq', 'multi', 'numeric', 'fill', 'mtq'];
const PART_TYPES = ['mcq', 'multi', 'numeric', 'fill']; // mtq-ის ნაწილები
const SOURCES = ['app', 'kit', 'book']; // აპლიკაცია, კრებული (Exam Kit), წიგნი (სავარჯიშოები და პრაქტიკული კითხვები)
const MAX_ERRORS = 40;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
const isNum = (v) => typeof v === 'number' && isFinite(v);
const isInt = (v) => Number.isInteger(v);

export function validateChapterFile(data) {
  const errors = [];
  const warnings = [];
  const err = (path, msg) => { if (errors.length < MAX_ERRORS) errors.push(path ? `${path}: ${msg}` : msg); };
  const warn = (path, msg) => warnings.push(path ? `${path}: ${msg}` : msg);

  if (!isObj(data)) {
    err('', 'ფაილის შიგთავსი უნდა იყოს ობიექტი { … }');
    return { kind: null, errors, warnings };
  }

  // ---- chapter ----
  const ch = data.chapter;
  if (!isObj(ch)) {
    err('chapter', 'აკლია ბლოკი "chapter" (მინიმუმ { "id": 1 })');
    return { kind: null, errors, warnings };
  }
  if (!isInt(ch.id) || ch.id < 1) err('chapter.id', 'უნდა იყოს მთელი დადებითი რიცხვი, მაგ. 1 (ბრჭყალების გარეშე)');

  // ფაილის ტიპის განსაზღვრა
  const hasContent = 'summary' in data || 'case_study' in data || 'flashcards' in data || ch.title_en || ch.title_ka;
  const kind = hasContent ? 'full' : 'questions';
  if (kind === 'questions' && !Array.isArray(data.questions)) {
    err('', 'ფაილში არ არის არც თავის კონტენტი (summary, case_study, flashcards), არც "questions" მასივი');
  }

  if (kind === 'full') {
    if (!str(ch.title_ka) && !str(ch.title_en)) err('chapter', 'საჭიროა სათაური: "title_ka" ან "title_en"');
    optStr(ch, 'title_en', 'chapter', err);
    optStr(ch, 'title_ka', 'chapter', err);
  }
  if ('weight' in ch && (!isNum(ch.weight) || ch.weight <= 0)) err('chapter.weight', 'უნდა იყოს დადებითი რიცხვი');

  if ('pdf_pages' in ch && ch.pdf_pages != null) {
    if (!isObj(ch.pdf_pages)) err('chapter.pdf_pages', 'უნდა იყოს ობიექტი, მაგ. { "book": [1, 20], "kit": [5, 12] }');
    else for (const k of ['book', 'kit']) {
      const r = ch.pdf_pages[k];
      if (r == null) continue;
      if (!Array.isArray(r) || r.length !== 2 || !isInt(r[0]) || !isInt(r[1]) || r[0] < 1 || r[1] < r[0]) {
        err(`chapter.pdf_pages.${k}`, 'უნდა იყოს [საწყისი, ბოლო] გვერდი, მაგ. [1, 20], სადაც საწყისი ≤ ბოლო');
      }
    }
  }

  // ---- summary ----
  if ('summary' in data) {
    const s = data.summary;
    if (!isObj(s)) err('summary', 'უნდა იყოს ობიექტი');
    else {
      optStr(s, 'short_ka', 'summary', err);
      optStr(s, 'simple_explanation_ka', 'summary', err);
      optStrArr(s, 'key_points_ka', 'summary', err);
      optStrArr(s, 'exam_tips_ka', 'summary', err);
      if ('must_memorize' in s) {
        if (!Array.isArray(s.must_memorize)) err('summary.must_memorize', 'უნდა იყოს მასივი [ … ]');
        else s.must_memorize.forEach((m, i) => {
          const p = `summary.must_memorize[${i + 1}]`;
          if (!isObj(m)) return err(p, 'უნდა იყოს ობიექტი');
          if (!str(m.term_en) && !str(m.term_ka)) err(p, 'საჭიროა "term_en" ან "term_ka"');
          ['term_en', 'term_ka', 'definition_ka', 'formula'].forEach((k) => optStr(m, k, p, err));
        });
      }
    }
  }

  // ---- case_study ----
  if ('case_study' in data && data.case_study != null) {
    const c = data.case_study;
    if (!isObj(c)) err('case_study', 'უნდა იყოს ობიექტი');
    else {
      ['title_ka', 'scenario_ka', 'solution_ka'].forEach((k) => optStr(c, k, 'case_study', err));
      optStrArr(c, 'tasks_ka', 'case_study', err);
      if ('journal_entries' in c) {
        if (!Array.isArray(c.journal_entries)) err('case_study.journal_entries', 'უნდა იყოს მასივი');
        else c.journal_entries.forEach((j, i) => {
          const p = `case_study.journal_entries[${i + 1}]`;
          if (!isObj(j)) return err(p, 'უნდა იყოს ობიექტი { "dr", "cr", "amount" }');
          if (!str(j.dr) || !str(j.cr)) err(p, '"dr" და "cr" სავალდებულოა (ანგარიშების სახელები)');
          if (!isNum(j.amount)) err(p, '"amount" უნდა იყოს რიცხვი ბრჭყალების გარეშე, მაგ. 12500');
          optStr(j, 'note_ka', p, err);
        });
      }
    }
  }

  // ---- flashcards ----
  if ('flashcards' in data) {
    if (!Array.isArray(data.flashcards)) err('flashcards', 'უნდა იყოს მასივი');
    else data.flashcards.forEach((f, i) => {
      const p = `flashcards[${i + 1}]`;
      if (!isObj(f) || !str(f.front) || !str(f.back)) err(p, 'საჭიროა არაცარიელი "front" და "back"');
    });
  }

  // ---- questions ----
  if ('questions' in data) {
    if (!Array.isArray(data.questions)) err('questions', 'უნდა იყოს მასივი [ … ]');
    else {
      const seen = new Set();
      data.questions.forEach((q, i) => {
        const p = `კითხვა #${i + 1}` + (isObj(q) && str(q.id) ? ` (${q.id})` : '');
        if (!isObj(q)) return err(p, 'უნდა იყოს ობიექტი');
        if (!str(q.id)) err(p, '"id" სავალდებულოა, მაგ. "ch1-app-001"');
        else if (seen.has(q.id)) err(p, `id „${q.id}“ ფაილში მეორდება`);
        else seen.add(q.id);

        if (!SOURCES.includes(q.source)) err(p, '"source" უნდა იყოს "app", "kit" ან "book"');
        if (q.source === 'kit' && !str(q.kit_ref)) warn(p, 'source = "kit", მაგრამ "kit_ref" (კრებულის ნომერი) არ არის მითითებული');
        if (q.source === 'book' && !str(q.kit_ref)) warn(p, 'source = "book", მაგრამ "kit_ref" (მაგ. „სავარჯიშო 2“ ან „პრაქტიკული 7“) არ არის მითითებული');
        if ('difficulty' in q && (!isInt(q.difficulty) || q.difficulty < 1 || q.difficulty > 5)) err(p, '"difficulty" უნდა იყოს მთელი რიცხვი 1-დან 5-მდე');
        optStr(q, 'explanation_ka', p, err);

        if (!Q_TYPES.includes(q.type)) {
          err(p, `"type" უნდა იყოს ერთ-ერთი: ${Q_TYPES.join(', ')}`);
          return;
        }
        if (!str(q.question_en)) err(p, '"question_en" (კითხვის ტექსტი) სავალდებულოა');

        if (q.type === 'mtq') {
          if (!Array.isArray(q.parts) || q.parts.length === 0) return err(p, 'mtq ტიპს სჭირდება არაცარიელი "parts" მასივი');
          let sum = 0;
          q.parts.forEach((part, j) => {
            const pp = `${p} → ნაწილი ${j + 1}`;
            if (!isObj(part)) return err(pp, 'უნდა იყოს ობიექტი');
            if (!PART_TYPES.includes(part.type)) return err(pp, `ნაწილის "type" უნდა იყოს: ${PART_TYPES.join(', ')}`);
            if (!str(part.question_en)) err(pp, '"question_en" სავალდებულოა');
            checkAnswer(part, pp, err, warn);
            if (isNum(part.marks)) sum += part.marks;
          });
          if ('marks' in q && isNum(q.marks) && q.marks !== sum) warn(p, `"marks" (${q.marks}) არ უდრის ნაწილების ჯამს (${sum}) — გამოყენებული იქნება ჯამი`);
        } else {
          checkAnswer(q, p, err, warn);
        }
      });
    }
  }

  return { kind, errors, warnings };
}

/** პასუხის ველების შემოწმება ტიპის მიხედვით (კითხვისთვის ან mtq-ის ნაწილისთვის) */
function checkAnswer(q, p, err, warn) {
  if (!isNum(q.marks) || q.marks <= 0) err(p, '"marks" უნდა იყოს დადებითი რიცხვი, მაგ. 2');
  if (!Array.isArray(q.correct) || q.correct.length === 0) {
    err(p, '"correct" უნდა იყოს არაცარიელი მასივი, მაგ. [0]');
    return;
  }
  if (q.type === 'mcq' || q.type === 'multi') {
    if (!Array.isArray(q.options) || q.options.length < 2 || !q.options.every(str)) {
      err(p, '"options" უნდა იყოს სულ მცირე 2 ტექსტური ვარიანტის მასივი');
      return;
    }
    const n = q.options.length;
    const okIdx = q.correct.every((c) => isInt(c) && c >= 0 && c < n);
    if (!okIdx) err(p, `"correct" უნდა შეიცავდეს ვარიანტის ნომრებს 0-დან ${n - 1}-მდე (0 = პირველი ვარიანტი)`);
    if (q.type === 'mcq' && q.correct.length !== 1) err(p, 'mcq-ს უნდა ჰქონდეს ზუსტად ერთი სწორი პასუხი; რამდენიმესთვის გამოიყენე "multi"');
    if (q.type === 'multi' && new Set(q.correct).size !== q.correct.length) err(p, '"correct"-ში ნომრები მეორდება');
    if (Array.isArray(q.why_wrong_ka) && q.why_wrong_ka.length !== n) warn(p, `"why_wrong_ka"-ში ${q.why_wrong_ka.length} ჩანაწერია, ვარიანტი კი ${n}`);
  } else if (q.type === 'numeric') {
    if (!q.correct.every(isNum)) err(p, 'numeric: "correct" უნდა შეიცავდეს რიცხვებს ბრჭყალების გარეშე, მაგ. [12500]');
    if ('tolerance' in q && (!isNum(q.tolerance) || q.tolerance < 0)) err(p, '"tolerance" უნდა იყოს არაუარყოფითი რიცხვი');
  } else if (q.type === 'fill') {
    if (!q.correct.every(str)) err(p, 'fill: "correct" უნდა შეიცავდეს ტექსტურ პასუხებს, მაგ. ["accruals"]');
  }
  if ('why_wrong_ka' in q && !Array.isArray(q.why_wrong_ka)) err(p, '"why_wrong_ka" უნდა იყოს მასივი');
}

/* ---- მცირე დამხმარეები ---- */
function str(v) { return isStr(v) && v.trim().length > 0; }
function optStr(obj, key, path, err) {
  if (key in obj && obj[key] != null && !isStr(obj[key])) err(`${path}.${key}`, 'უნდა იყოს ტექსტი (ბრჭყალებში)');
}
function optStrArr(obj, key, path, err) {
  if (!(key in obj) || obj[key] == null) return;
  if (!Array.isArray(obj[key]) || !obj[key].every(isStr)) err(`${path}.${key}`, 'უნდა იყოს ტექსტების მასივი ["…", "…"]');
}
