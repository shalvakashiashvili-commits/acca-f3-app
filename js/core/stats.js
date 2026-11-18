/* =========================================================
   თავის სტატუსი და ქულა.
   - სექციები: რომელი ნაწილები აქვს თავს (შეჯამება, ქეისი …)
   - სტატუსი:
       დასრულებული = ყველა სექცია ნანახია და თავის კითხვების ≥80%-ზე
                     გაცემულია პასუხი (თუ კითხვები საერთოდ აქვს)
       მიმდინარე   = რამე ნანახია ან რომელიმე კითხვაზე უპასუხია
       არ დაწყებული = სხვა შემთხვევაში
   - ქულა = ბოლო პასუხების საშუალო სიზუსტე (%) ნაპასუხებ კითხვებზე.
     questionStats.lastResult ინახავს 0..1 მნიშვნელობას (mtq-სთვის ნაწილობრივს).
   ========================================================= */

import { S, getAll } from '../db.js';

export const DONE_ANSWERED_SHARE = 0.8;

/** თავის სექციები იმ თანმიმდევრობით, როგორც ეკრანზეა. მხოლოდ არსებული. */
export function sectionsFor(ch) {
  const s = ch.summary || {};
  const list = [];
  if (s.short_ka || s.key_points_ka?.length) list.push('summary');
  if (s.must_memorize?.length) list.push('memorize');
  if (s.simple_explanation_ka) list.push('simple');
  if (s.exam_tips_ka?.length) list.push('tips');
  if (ch.case_study && (ch.case_study.scenario_ka || ch.case_study.tasks_ka?.length)) list.push('case');
  return list;
}

/**
 * ერთი თავის სტატუსი.
 * questions — ამ თავის კითხვები, statsMap — Map(questionId → questionStats)
 */
export function chapterStatus(ch, progress, questions, statsMap) {
  const sections = sectionsFor(ch);
  const seenSet = new Set(progress?.sectionsSeen || []);
  const seen = sections.filter((k) => seenSet.has(k)).length;

  let answered = 0;
  let sum = 0;
  for (const q of questions) {
    const st = statsMap.get(q.id);
    if (st && st.attempts > 0) { answered++; sum += st.lastResult ?? 0; }
  }
  const scorePct = answered ? Math.round((sum / answered) * 100) : null;
  const answeredShare = questions.length ? answered / questions.length : 1;
  const allSeen = sections.length === 0 || seen === sections.length;

  let status = 'new';
  if (allSeen && answeredShare >= DONE_ANSWERED_SHARE && (seen > 0 || answered > 0)) status = 'done';
  else if (seen > 0 || answered > 0 || progress?.pdfOpened) status = 'progress';

  // დაფარვა: ბოლო შედეგების ჯამი ყველა კითხვაზე (უპასუხო = 0) — მზადყოფნისთვის
  const coveragePct = questions.length ? Math.round((sum / questions.length) * 100) : null;
  return { status, scorePct, coveragePct, seen, sectionsTotal: sections.length, answered, total: questions.length };
}

/** ყველა თავი სტატუსით — თავების სიისთვის */
export async function loadChaptersWithStatus() {
  const [chapters, questions, progress, stats] = await Promise.all([
    getAll(S.chapters), getAll(S.questions), getAll(S.chapterProgress), getAll(S.questionStats),
  ]);
  const statsMap = new Map(stats.map((s) => [s.questionId, s]));
  const progMap = new Map(progress.map((p) => [p.chapterId, p]));
  const byChapter = new Map();
  for (const q of questions) {
    if (!byChapter.has(q.chapterId)) byChapter.set(q.chapterId, []);
    byChapter.get(q.chapterId).push(q);
  }
  return chapters
    .sort((a, b) => a.id - b.id)
    .map((ch) => {
      const qs = byChapter.get(ch.id) || [];
      return {
        ch,
        qs,
        appCount: qs.filter((q) => q.source === 'app').length,
        kitCount: qs.filter((q) => q.source === 'kit').length,
        ...chapterStatus(ch, progMap.get(ch.id), qs, statsMap),
      };
    });
}
