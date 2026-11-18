/* =========================================================
   შეცდომების ბანკი (spaced repetition) + კითხვების სტატისტიკა.

   წესები:
   - არასწორი პასუხი (ან არასრული ქულა mtq-ზე, ან ტესტში უპასუხო
     კითხვა) → კითხვა შედის ბანკში: wrongCount + 1, სერია ნულდება.
   - სწორი პასუხი ბანკში მყოფ კითხვაზე → სერია + 1 და იწერება დღე.
   - ბანკიდან გამოდის, როცა ზედიზედ EXIT_STREAK სწორი პასუხია და
     ამ სერიაში სულ მცირე EXIT_DAYS სხვადასხვა დღეა.
   - გამოსული კითხვა ისევ შეცდომისას ბრუნდება ბანკში (wrongCount გრძელდება).

   ჩანაწერი (mistakes ცხრილი):
   { questionId, chapterId, active: 1|0, wrongCount, firstWrongAt,
     lastWrongAt, streak, streakDays: ["2026-11-18", …], clearedAt }
   ========================================================= */

import { S, tx, reqP, getAllByIndex } from '../db.js';
import { now, dayKey } from './clock.js';

export const EXIT_STREAK = 3;
export const EXIT_DAYS = 2;

/**
 * ერთი პასუხის გავლენა ბანკის ჩანაწერზე (სუფთა ფუნქცია — ბაზის გარეშე).
 * rec — არსებული ჩანაწერი ან null. აბრუნებს { rec|null, event }
 * event: 'entered' | 'wrong-again' | 'progress' | 'exited' | null
 */
export function applyAnswer(rec, { questionId, chapterId, correct, ts }) {
  if (!correct) {
    const r = rec ? { ...rec } : { questionId, chapterId, wrongCount: 0, firstWrongAt: ts, active: 0 };
    const event = r.active ? 'wrong-again' : 'entered';
    r.chapterId = chapterId;
    r.wrongCount += 1;
    r.lastWrongAt = ts;
    r.streak = 0;
    r.streakDays = [];
    r.active = 1;
    r.clearedAt = null;
    return { rec: r, event };
  }
  if (!rec || !rec.active) return { rec, event: null }; // ბანკში არ არის — არაფერი იცვლება

  const r = { ...rec, streakDays: [...(rec.streakDays || [])] };
  r.streak = (r.streak || 0) + 1;
  const day = dayKey(ts);
  if (!r.streakDays.includes(day)) r.streakDays.push(day);
  if (r.streak >= EXIT_STREAK && r.streakDays.length >= EXIT_DAYS) {
    r.active = 0;
    r.clearedAt = ts;
    return { rec: r, event: 'exited' };
  }
  return { rec: r, event: 'progress' };
}

/**
 * პასუხების ჩაწერა ერთ ტრანზაქციაში: questionStats, mistakes, daily.
 * items: [{ q, result }]  (result — gradeQuestion-ის შედეგი)
 * აბრუნებს Map(questionId → { event, rec }) — rec არის ბანკის ახალი ჩანაწერი (ან null)
 */
export async function recordAnswers(items, ts = now()) {
  const events = new Map();
  if (!items.length) return events;
  await tx([S.questionStats, S.mistakes, S.daily], 'readwrite', async (t) => {
    const stats = t.objectStore(S.questionStats);
    const bank = t.objectStore(S.mistakes);
    const daily = t.objectStore(S.daily);
    let correctN = 0;

    for (const { q, result } of items) {
      const st = (await reqP(stats.get(q.id))) || { questionId: q.id, attempts: 0, correctCount: 0 };
      st.chapterId = q.chapterId;
      st.attempts += 1;
      if (result.correct) { st.correctCount += 1; correctN++; }
      st.lastResult = result.ratio;
      st.lastAt = ts;
      stats.put(st);

      const old = await reqP(bank.get(q.id));
      const { rec, event } = applyAnswer(old || null, { questionId: q.id, chapterId: q.chapterId, correct: result.correct, ts });
      if (rec && rec !== old) bank.put(rec);
      events.set(q.id, { event, rec });
    }

    // დღიური აქტივობა (ეტაპ 4-ის დღიური მიზნისა და სერიისთვის)
    const key = dayKey(ts);
    const d = (await reqP(daily.get(key))) || { date: key, answered: 0, correct: 0 };
    d.answered += items.length;
    d.correct += correctN;
    daily.put(d);
  });
  return events;
}

/** ბანკში მყოფი (აქტიური) შეცდომები */
export function activeMistakes() {
  return getAllByIndex(S.mistakes, 'active', 1);
}
