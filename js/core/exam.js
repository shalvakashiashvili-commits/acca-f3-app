/* =========================================================
   საგამოცდო სიმულაცია: ფორმატი, კითხვების შერჩევა, ტაიმერი.

   ფორმატი (პარამეტრებში იცვლება, setting 'exam'):
     Section A — aCount კითხვა × aMarks ქულა  (ყველა ტიპი, გარდა mtq)
     Section B — bCount mtq × bMarks ქულა
     minutes   — დრო, passPct — გამსვლელი %
   ორი ვარიანტი:
     full — სრული ფორმატი (ნაგულისხმევად 35 + 2, 2 საათი)
     mini — ნახევარი (17 + 1, 1 საათი) — მეტროსთვის

   შერჩევა: კითხვები ყველა თავიდან, თავის წონის პროპორციულად.
     წონა = chapter.weight, ან თუ არ არის — თავის კითხვების რაოდენობა
     ამ სექციაში (ანუ ყველა კითხვას თანაბარი შანსი აქვს). თუ წონა მხოლოდ
     ზოგ თავს აქვს, დანარჩენები იღებენ მითითებული წონების საშუალოს.
     რაოდენობა თავებზე ნაწილდება „უდიდესი ნაშთის“ მეთოდით; ნაშთი
     (წილადი ნაწილი) ნაწილდება შემთხვევით, წილადის წონით — ასე
     Section B-ის 2 mtq სხვადასხვა გამოცდაში სხვადასხვა თავიდან მოდის.

   კითხვები თუ არ ჰყოფნის: გამოცდა ტარდება არსებულით. ქულა მაინც
   100-დან ითვლება (მიღებული / შესაძლო × 100), დრო კი მცირდება
   შესაძლო ქულის პროპორციულად.

   ტაიმერი:
     ჩვეულებრივი რეჟიმი — დრო ითვლება მხოლოდ მაშინ, როცა გამოცდის
       ეკრანი ღიაა (მეტროში შეწყვეტა). ყოველი შეწყვეტა იწერება პაუზად.
     მკაცრი რეჟიმი — დრო ითვლება დაწყებიდან, აპლიკაცია ღიაა თუ არა.
   ========================================================= */

import { S, getAll } from '../db.js';
import { now } from './clock.js';
import { maxMarks, answerState } from './scoring.js';
import { matchesScope, shuffle } from './picker.js';

export const WARN_MS = 10 * 60000; // გაფრთხილება ბოლო 10 წუთზე

/** ვარიანტის გეგმა: რამდენი კითხვა, რამდენი ქულა, რამდენი წუთი */
export function examPlan(cfg, variant) {
  const mini = variant === 'mini';
  const aCount = mini ? Math.floor(cfg.aCount / 2) : cfg.aCount;
  const bCount = mini ? Math.max(cfg.bCount ? 1 : 0, Math.floor(cfg.bCount / 2)) : cfg.bCount;
  const minutes = mini ? Math.round(cfg.minutes / 2) : cfg.minutes;
  return {
    variant, aCount, bCount, aMarks: cfg.aMarks, bMarks: cfg.bMarks, minutes, passPct: cfg.passPct,
    plannedMax: aCount * cfg.aMarks + bCount * cfg.bMarks,
  };
}

/** კითხვის სექცია: mtq → B, დანარჩენი → A */
export const sectionOf = (q) => (q.type === 'mtq' ? 'B' : 'A');

/**
 * კითხვების შერჩევა გამოცდისთვის.
 * აბრუნებს { plan, a: [ids], b: [ids], have: {a, b}, missing: {a, b},
 *            actualMax, minutes, durationMs, short }
 * short = true, თუ კითხვები არ ჰყოფნის (გამოცდა შემცირებული იქნება).
 */
export async function buildExam({ variant, source }, cfg, rnd = Math.random) {
  const plan = examPlan(cfg, variant);
  const [questions, chapters] = await Promise.all([getAll(S.questions), getAll(S.chapters)]);
  const weightOf = new Map(chapters.map((c) => [c.id, c.weight]));
  const scoped = questions.filter((q) => matchesScope(q, { chapterIds: null, source }));

  const pick = (section, k) => {
    const items = scoped.filter((q) => sectionOf(q) === section);
    const groups = groupByChapter(items, weightOf);
    const alloc = allocate(k, groups, rnd);
    const ids = groups.flatMap((g) => shuffle(g.items, rnd).slice(0, alloc.get(g.id)).map((q) => q.id));
    return { ids: shuffle(ids, rnd), have: items.length };
  };
  const A = pick('A', plan.aCount);
  const B = pick('B', plan.bCount);

  const actualMax = A.ids.length * plan.aMarks + B.ids.length * plan.bMarks;
  const short = A.ids.length < plan.aCount || B.ids.length < plan.bCount;
  // დრო — შესაძლო ქულის პროპორციულად (სრული ნაკრებისას = გეგმის დრო)
  const minutes = plan.plannedMax ? Math.max(1, Math.round((plan.minutes * actualMax) / plan.plannedMax)) : plan.minutes;
  return {
    plan, a: A.ids, b: B.ids,
    have: { a: A.have, b: B.have },
    missing: { a: plan.aCount - A.ids.length, b: plan.bCount - B.ids.length },
    actualMax, minutes, durationMs: minutes * 60000, short,
  };
}

/** კითხვების დაჯგუფება თავებად წონით */
export function groupByChapter(items, weightOf = new Map()) {
  const by = new Map();
  for (const q of items) {
    if (!by.has(q.chapterId)) by.set(q.chapterId, []);
    by.get(q.chapterId).push(q);
  }
  // თუ ზოგ თავს წონა აქვს მითითებული, წონის გარეშე თავი იღებს მითითებული
  // წონების საშუალოს (რაოდენობა სხვა მასშტაბია და შეადარებელი არ არის)
  const explicit = [...by.keys()].map((id) => Number(weightOf.get(id))).filter((w) => w > 0);
  const avg = explicit.length ? explicit.reduce((s, w) => s + w, 0) / explicit.length : 0;
  return [...by.entries()].map(([id, list]) => {
    const w = Number(weightOf.get(id));
    return { id, items: list, weight: w > 0 ? w : (avg || list.length) };
  });
}

/**
 * k ადგილის განაწილება ჯგუფებზე წონის პროპორციულად.
 * ჯგუფს მეტს ვერ მისცემ, ვიდრე მასში კითხვაა — ზედმეტი სხვებზე გადანაწილდება.
 * აბრუნებს Map(groupId → რაოდენობა).
 */
export function allocate(k, groups, rnd = Math.random) {
  const alloc = new Map(groups.map((g) => [g.id, 0]));
  const cap = (g) => g.items.length - alloc.get(g.id);
  let left = Math.min(k, groups.reduce((s, g) => s + g.items.length, 0));

  while (left > 0) {
    const open = groups.filter((g) => cap(g) > 0);
    if (!open.length) break;
    const W = open.reduce((s, g) => s + g.weight, 0);
    const quota = open.map((g) => ({ g, q: (left * g.weight) / W }));

    // 1) მთელი ნაწილები
    let given = 0;
    for (const { g, q } of quota) {
      const n = Math.min(cap(g), Math.floor(q));
      alloc.set(g.id, alloc.get(g.id) + n);
      given += n;
    }
    left -= given;
    if (left <= 0) break;

    // 2) ნაშთი: თითო ადგილი, შემთხვევით, წონა = წილადი ნაწილი
    const cand = quota.filter(({ g }) => cap(g) > 0).map(({ g, q }) => ({ g, w: q - Math.floor(q) || 1e-6 }));
    const chosen = cand
      .map((c) => ({ c, key: Math.pow(rnd(), 1 / c.w) }))
      .sort((x, y) => y.key - x.key)
      .slice(0, left);
    for (const { c } of chosen) alloc.set(c.g.id, alloc.get(c.g.id) + 1);
    left -= chosen.length;
  }
  return alloc;
}

/* ---------- ტაიმერი ---------- */

/**
 * დახარჯული დრო.
 * segStart — მიმდინარე (ჯერ არ შენახული) ღია ეკრანის მონაკვეთის დასაწყისი.
 */
export function examElapsed(s, segStart = null, t = now()) {
  if (s.strict) return t - s.startedAt;
  return s.elapsedMs + (segStart ? t - segStart : 0);
}

export const examRemaining = (s, segStart, t) => s.durationMs - examElapsed(s, segStart, t);

/* ---------- შეფასება ---------- */

/**
 * გამოცდის შედეგი (s.results უკვე შევსებულია gradeQuestion-ით).
 * ქულა კითხვაზე = (მიღებული / მაქსიმუმი) × სექციის ქულა:
 *   A: სწორი = aMarks, არასწორი = 0
 *   B: mtq-ის სწორი ნაწილების ჯამი, გადაყვანილი bMarks-ზე
 *      (თუ mtq-ის ქულა JSON-ში = bMarks, გადაყვანა არაფერს ცვლის).
 */
export function summarizeExam(s, questions) {
  const plan = s.plan;
  const sec = { A: blank(), B: blank() };
  const perChapter = {};
  const perQuestion = {};
  let correctN = 0;
  let unanswered = 0;

  for (const q of questions) {
    const S2 = s.sections.B.includes(q.id) ? 'B' : 'A';
    const secMax = S2 === 'B' ? plan.bMarks : plan.aMarks;
    const r = s.results[q.id] || { earned: 0, max: maxMarks(q), correct: false };
    const earned = round2(r.max ? (r.earned / r.max) * secMax : 0);
    perQuestion[q.id] = { earned, max: secMax, section: S2 };

    sec[S2].earned += earned;
    sec[S2].max += secMax;
    sec[S2].n++;
    if (r.correct) { sec[S2].correctN++; correctN++; }
    if (answerState(q, s.answers[q.id]) === 'none') { sec[S2].unanswered++; unanswered++; }

    const c = (perChapter[q.chapterId] ||= { earned: 0, max: 0 });
    c.earned += earned;
    c.max += secMax;
  }
  for (const k of ['A', 'B']) { sec[k].earned = round2(sec[k].earned); sec[k].pct = pctOf(sec[k].earned, sec[k].max); }
  for (const c of Object.values(perChapter)) { c.earned = round2(c.earned); c.pct = pctOf(c.earned, c.max); }

  const earned = round2(sec.A.earned + sec.B.earned);
  const max = sec.A.max + sec.B.max;
  const exact = max ? (earned / max) * 100 : 0;

  // 3 ყველაზე სუსტი თავი: ყველაზე დაბალი %, თანაბრობისას — მეტი ქულა იყო სათამაშოდ
  const weakest = Object.entries(perChapter)
    .filter(([, c]) => c.pct < 100)
    .sort((a, b) => a[1].pct - b[1].pct || b[1].max - a[1].max)
    .slice(0, 3)
    .map(([id]) => Number(id));

  return {
    earned, max,
    pct: Math.round(exact),           // ქულა 100-დან
    passed: exact >= plan.passPct,
    scaled: max !== plan.plannedMax,  // შემცირებული გამოცდა (კითხვები არ ჰყოფნიდა)
    correctN, total: questions.length, unanswered,
    sections: sec, perChapter, perQuestion, weakest,
  };
}

const blank = () => ({ earned: 0, max: 0, n: 0, correctN: 0, unanswered: 0, pct: 0 });
const round2 = (x) => Math.round(x * 100) / 100;
const pctOf = (e, m) => (m ? Math.round((e / m) * 100) : 0);
