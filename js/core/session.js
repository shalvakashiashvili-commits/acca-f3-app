/* =========================================================
   ქვიზისა და ტესტის სესიები (sessions ცხრილი).

   ჩანაწერი:
   { id, type: 'quiz'|'test', state: 'in_progress'|'done',
     filters, questionIds: [...], index,
     answers: { [qid]: პასუხი }, results: { [qid]: { earned, max, ratio, correct } },
     startedAt, finishedAt, elapsedMs,
     summary: { earned, max, pct, correctN, total, perChapter: { [chId]: { earned, max } } } }

   - ქვიზი: პასუხი მოწმდება და ბანკში იწერება მაშინვე („შემოწმება“).
   - ტესტი: ყველაფერი მოწმდება და იწერება „დასრულებისას“;
     უპასუხო კითხვა = 0 ქულა და შედის შეცდომების ბანკში.
   - გამოცდა (type: 'exam'): როგორც ტესტი, შედეგი — summarizeExam (core/exam.js).
   - დაუსრულებელი სესია ინახება და შეიძლება გაგრძელდეს.
   ========================================================= */

import { S, get, put, del, getAll, getAllByIndex } from '../db.js';
import { now } from './clock.js';
import { gradeQuestion, maxMarks } from './scoring.js';
import { recordAnswers } from './mistakes.js';
import { summarizeExam } from './exam.js';

export async function createSession(type, filters, questionIds, extra = {}) {
  const s = {
    type, state: 'in_progress', filters, questionIds, index: 0,
    answers: {}, results: {}, startedAt: now(), finishedAt: null, elapsedMs: 0,
    ...extra, // გამოცდა: plan, sections, durationMs, strict, flags, pauses…
  };
  s.id = await put(S.sessions, s);
  return s;
}

export const getSession = (id) => get(S.sessions, id);
export const saveSession = (s) => put(S.sessions, s);
export const deleteSession = (id) => del(S.sessions, id);

/** სესიის კითხვები იმავე თანმიმდევრობით (წაშლილი კითხვები გამოტოვებულია) */
export async function loadSessionQuestions(s) {
  const all = await Promise.all(s.questionIds.map((id) => get(S.questions, id)));
  return all.filter(Boolean);
}

/** ქვიზი: ერთი კითხვის შემოწმება და ჩაწერა ბანკში */
export async function checkQuizQuestion(s, q) {
  const result = gradeQuestion(q, s.answers[q.id]);
  s.results[q.id] = slim(result);
  const events = await recordAnswers([{ q, result }]);
  await saveSession(s);
  return { result, ...events.get(q.id) }; // { result, event, rec }
}

/** სესიის დასრულება: ტესტში — ყველა კითხვის შეფასება და ჩაწერა */
export async function finishSession(s, questions) {
  // ტესტი და გამოცდა: ყველაფერი ფასდება ბოლოს. ქვიზი და მეტრო: უკვე ჩაწერილია შემოწმებისას.
  if (s.type === 'test' || s.type === 'exam') {
    const items = questions.map((q) => ({ q, result: gradeQuestion(q, s.answers[q.id]) }));
    items.forEach(({ q, result }) => { s.results[q.id] = slim(result); });
    await recordAnswers(items);
  }
  s.summary = s.type === 'exam' ? summarizeExam(s, questions) : summarize(s, questions);
  s.state = 'done';
  s.finishedAt = now();
  await saveSession(s);
  return s;
}

/** ჯამური ქულა და თავების მიხედვით დაყოფა */
export function summarize(s, questions) {
  let earned = 0;
  let max = 0;
  let correctN = 0;
  const perChapter = {};
  for (const q of questions) {
    const r = s.results[q.id] || { earned: 0, max: maxMarks(q), correct: false };
    earned += r.earned;
    max += r.max;
    if (r.correct) correctN++;
    const c = (perChapter[q.chapterId] ||= { earned: 0, max: 0 });
    c.earned += r.earned;
    c.max += r.max;
  }
  return { earned, max, pct: max ? Math.round((earned / max) * 100) : 0, correctN, total: questions.length, perChapter };
}

/** დაუსრულებელი სესიები (ახალი პირველი) */
export async function inProgressSessions(types = ['quiz', 'test']) {
  const all = await getAllByIndex(S.sessions, 'state', 'in_progress');
  return all.filter((s) => types.includes(s.type)).sort((a, b) => b.startedAt - a.startedAt);
}

export async function finishedSessions(types = ['quiz', 'test']) {
  const all = await getAll(S.sessions);
  return all.filter((s) => s.state === 'done' && types.includes(s.type)).sort((a, b) => b.finishedAt - a.finishedAt);
}

function slim(r) {
  return { earned: r.earned, max: r.max, ratio: r.ratio, correct: r.correct, parts: r.parts?.map((p) => p.correct) };
}
