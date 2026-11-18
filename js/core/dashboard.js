/* =========================================================
   დაშბორდი: მზადყოფნა, დღიური მიზანი, სერია (streak), სუსტი თავები.

   მზადყოფნა (%) = 0.6 × თავების ქულა + 0.4 × ბოლო 3 გამოცდის საშუალო − ჯარიმა
     თავების ქულა  — თავების „დაფარვის“ საშუალო, თავის წონით
                     (დაფარვა = ბოლო შედეგების ჯამი / თავის ყველა კითხვა;
                      უპასუხო კითხვა = 0). წონა — როგორც გამოცდაში:
                      chapter.weight ან კითხვების რაოდენობა.
     გამოცდები     — ბოლო 3 დასრულებული გამოცდის ქულა (100-დან);
                     თუ გამოცდა ჯერ არ ჩაგიბარებია = 0.
     ჯარიმა        — აქტიური შეცდომების წილი ყველა კითხვაში (%) × 0.5,
                     მაქსიმუმ 15 ქულა.

   დღიური მიზანი: ნაპასუხები კითხვები + ნანახი ფლეშქარდები დღეში.
   სერია: ზედიზედ დღეები, როცა მიზანი შესრულდა. დღევანდელი დღე
   სერიას არ წყვეტს, სანამ არ დასრულებულა (ითვლება გუშინდლიდან).
   ========================================================= */

import { S, getAll, getSetting } from '../db.js';
import { loadChaptersWithStatus } from './stats.js';
import { finishedSessions } from './session.js';
import { activeMistakes } from './mistakes.js';
import { now, dayKey } from './clock.js';

export const READINESS = { chapters: 0.6, exams: 0.4, penaltyFactor: 0.5, penaltyMax: 15, lastExams: 3 };

/** მზადყოფნის გამოთვლა (წმინდა ფუნქცია — ტესტირებისთვის) */
export function readiness({ rows, examPcts, activeMistakeN }) {
  const withQ = rows.filter((r) => r.total > 0);
  const explicit = withQ.map((r) => Number(r.ch.weight)).filter((w) => w > 0);
  const avgW = explicit.length ? explicit.reduce((a, b) => a + b, 0) / explicit.length : 0;
  let wSum = 0;
  let cSum = 0;
  for (const r of withQ) {
    const w = Number(r.ch.weight) > 0 ? Number(r.ch.weight) : (avgW || r.total);
    wSum += w;
    cSum += w * (r.coveragePct || 0);
  }
  const chapterPct = wSum ? cSum / wSum : 0;
  const last = examPcts.slice(0, READINESS.lastExams);
  const examPct = last.length ? last.reduce((a, b) => a + b, 0) / last.length : 0;
  const totalQ = withQ.reduce((a, r) => a + r.total, 0);
  const penalty = totalQ ? Math.min(READINESS.penaltyMax, (activeMistakeN / totalQ) * 100 * READINESS.penaltyFactor) : 0;
  const value = Math.max(0, Math.min(100, Math.round(READINESS.chapters * chapterPct + READINESS.exams * examPct - penalty)));
  return { value, chapterPct: Math.round(chapterPct), examPct: Math.round(examPct), examN: last.length, penalty: Math.round(penalty * 10) / 10 };
}

const dayTotal = (d) => (d ? (d.answered || 0) + (d.cards || 0) : 0);

/** სერია: ზედიზედ დღეები, როცა მიზანი შესრულდა */
export function streak(dailyMap, goal, t = now()) {
  let n = 0;
  let ts = t;
  // დღეს მიზანი ჯერ არ შესრულებულა → ვიწყებთ გუშინდლიდან
  if (dayTotal(dailyMap.get(dayKey(ts))) < goal) ts -= 86400000;
  while (dayTotal(dailyMap.get(dayKey(ts))) >= goal) { n++; ts -= 86400000; }
  return n;
}

export async function loadDashboard() {
  const [rows, exams, bank, daily, goal] = await Promise.all([
    loadChaptersWithStatus(), finishedSessions(['exam']), activeMistakes(), getAll(S.daily), getSetting('dailyGoal'),
  ]);
  const dailyMap = new Map(daily.map((d) => [d.date, d]));
  const today = dailyMap.get(dayKey()) || {};
  const r = readiness({ rows, examPcts: exams.map((e) => e.summary.pct), activeMistakeN: bank.length });

  // 3 ყველაზე სუსტი თავი: ნაპასუხები თავებიდან ყველაზე დაბალი ქულა,
  // თუ ასეთი 3-ზე ნაკლებია — ემატება ჯერ დაუწყებელი თავები
  const withQ = rows.filter((x) => x.total > 0);
  const tried = withQ.filter((x) => x.scorePct != null && x.scorePct < 100).sort((a, b) => a.scorePct - b.scorePct);
  const untried = withQ.filter((x) => x.scorePct == null);
  const weakest = [...tried, ...untried].slice(0, 3);

  return {
    rows, readiness: r, weakest, activeMistakeN: bank.length,
    goal, today: { total: dayTotal(today), answered: today.answered || 0, cards: today.cards || 0 },
    streak: streak(dailyMap, goal),
    lastExam: exams[0] || null,
  };
}
