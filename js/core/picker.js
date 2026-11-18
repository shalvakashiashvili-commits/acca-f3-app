/* =========================================================
   კითხვების შერჩევა ქვიზისა და ტესტისთვის.

   ფილტრები:
     chapterIds  — [1, 3] ან null (ყველა თავი)
     source      — 'app' | 'kit' | 'both'
     difficulty  — 'all' | 'easy' (1–2) | 'medium' (3) | 'hard' (4–5)
     count       — კითხვების რაოდენობა (0 = ყველა შესაფერისი)
     mistakesOnly — მხოლოდ ბანკში მყოფი შეცდომები

   შეცდომების პრიორიტეტი:
   - არჩეული თავების (და არჩეული წყაროს) შეცდომები შედის აუცილებლად:
     სულ მცირე mistakeShare% (ნაგულისხმევად 30%), თუ იმდენი შეცდომა არსებობს.
   - შეცდომებიდან ირჩევა შემთხვევით, მაგრამ წონით = wrongCount:
     რაც მეტჯერ შეცდი, მით უფრო ხშირად გამოდის.
   - სირთულის ფილტრი შეცდომებზე არ მოქმედებს (შეცდომა ყოველთვის მნიშვნელოვანია).
   ========================================================= */

import { S, getAll } from '../db.js';
import { activeMistakes } from './mistakes.js';

export const DIFFICULTY = {
  all: () => true,
  easy: (d) => d <= 2,
  medium: (d) => d === 3,
  hard: (d) => d >= 4,
};

/** კითხვა აკმაყოფილებს თუ არა თავისა და წყაროს ფილტრს */
export function matchesScope(q, { chapterIds, source }) {
  if (chapterIds && chapterIds.length && !chapterIds.includes(q.chapterId)) return false;
  if (source === 'app' || source === 'kit') return q.source === source;
  return true;
}

/**
 * აბრუნებს { ids, pool, mistakes, mistakeIds }
 *  ids        — შერჩეული კითხვების id-ები (არეული თანმიმდევრობით)
 *  pool       — ყველა შესაფერისი კითხვის რაოდენობა
 *  mistakes   — ფილტრში მოხვედრილი აქტიური შეცდომების რაოდენობა
 *  mistakeIds — შერჩეულთაგან რომელია შეცდომა
 */
export async function pickQuestions(filters, { mistakeShare = 30 } = {}, rnd = Math.random) {
  const [questions, bank] = await Promise.all([getAll(S.questions), activeMistakes()]);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const diffOk = DIFFICULTY[filters.difficulty] || DIFFICULTY.all;

  const scoped = questions.filter((q) => matchesScope(q, filters));
  // ბანკის ჩანაწერი მხოლოდ მაშინ, თუ კითხვა ჯერ კიდევ არსებობს და ფილტრშია
  const mistakes = bank.filter((m) => byId.has(m.questionId) && matchesScope(byId.get(m.questionId), filters));
  const mistakeSet = new Set(mistakes.map((m) => m.questionId));

  let picked;
  if (filters.mistakesOnly) {
    const n = filters.count > 0 ? Math.min(filters.count, mistakes.length) : mistakes.length;
    picked = weightedSample(mistakes, n, rnd).map((m) => m.questionId);
    return { ids: shuffle(picked, rnd), pool: mistakes.length, mistakes: mistakes.length, mistakeIds: new Set(picked) };
  }

  const others = scoped.filter((q) => !mistakeSet.has(q.id) && diffOk(q.difficulty ?? 1));
  const poolSize = others.length + mistakes.length;
  const count = filters.count > 0 ? Math.min(filters.count, poolSize) : poolSize;

  // 1) შეცდომების სავალდებულო წილი
  const minMist = Math.min(mistakes.length, Math.ceil((count * mistakeShare) / 100));
  const fromBank = weightedSample(mistakes, minMist, rnd).map((m) => m.questionId);

  // 2) დანარჩენი — ახალი კითხვებით; თუ არ ჰყოფნის — დარჩენილი შეცდომებით
  const rest = shuffle(others.map((q) => q.id), rnd).slice(0, count - fromBank.length);
  const used = new Set(fromBank);
  const leftoverMist = weightedSample(mistakes.filter((m) => !used.has(m.questionId)), count - fromBank.length - rest.length, rnd)
    .map((m) => m.questionId);

  picked = [...fromBank, ...rest, ...leftoverMist];
  return {
    ids: shuffle(picked, rnd),
    pool: poolSize,
    mistakes: mistakes.length,
    mistakeIds: new Set(picked.filter((id) => mistakeSet.has(id))),
  };
}

/**
 * წონიანი შერჩევა გამეორების გარეშე (Efraimidis–Spirakis):
 * გასაღები = rnd^(1/წონა), ვიღებთ k უდიდესს. წონა = wrongCount.
 */
export function weightedSample(items, k, rnd = Math.random) {
  if (k <= 0) return [];
  return items
    .map((m) => ({ m, key: Math.pow(rnd(), 1 / Math.max(1, m.wrongCount || 1)) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, k)
    .map((x) => x.m);
}

export function shuffle(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
