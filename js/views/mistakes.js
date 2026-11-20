/* =========================================================
   „ჩემი შეცდომები“: #/mistakes
   ბანკში მყოფი კითხვები თავების მიხედვით, შეცდომების რაოდენობა,
   ბოლო თარიღი და პროგრესი ბანკიდან გასვლამდე.
   ========================================================= */

import { setHeader } from '../router.js';
import { T } from '../strings.ka.js';
import { S, getAll } from '../db.js';
import { esc, fmtDate } from '../ui/components.js';
import { sourceBadge } from '../ui/question.js';
import { EXIT_STREAK, EXIT_DAYS } from '../core/mistakes.js';
import { startPractice } from './practice.js';

export async function renderMistakes(el) {
  setHeader(T.mistakes.title);
  const [bank, questions, chapters] = await Promise.all([getAll(S.mistakes), getAll(S.questions), getAll(S.chapters)]);
  const qById = new Map(questions.map((q) => [q.id, q]));
  const chById = new Map(chapters.map((c) => [c.id, c]));
  const active = bank.filter((m) => m.active && qById.has(m.questionId));
  const cleared = bank.filter((m) => !m.active).length;

  if (!active.length) {
    el.innerHTML = `<div class="empty"><h2>${T.mistakes.emptyTitle}</h2><p>${T.mistakes.emptyText}</p>
      ${cleared ? `<p>${T.mistakes.clearedN(cleared)}</p>` : ''}
      <a class="btn primary" href="#/practice">${T.practice.title}</a></div>`;
    return;
  }

  // თავების მიხედვით; თავის შიგნით — ყველაზე ხშირი შეცდომა პირველი
  const groups = new Map();
  for (const m of active) {
    if (!groups.has(m.chapterId)) groups.set(m.chapterId, []);
    groups.get(m.chapterId).push(m);
  }
  const sorted = [...groups.entries()].sort((a, b) => a[0] - b[0]);

  el.innerHTML = `
    <div class="card mistakes-head">
      <div><strong>${T.mistakes.inBank(active.length)}</strong>${cleared ? `<br><small class="muted">${T.mistakes.clearedN(cleared)}</small>` : ''}</div>
      <p class="muted"><small>${T.mistakes.rule(EXIT_STREAK, EXIT_DAYS)}</small></p>
      <button class="btn primary block" data-practice="all">${T.mistakes.practiceAll}</button>
    </div>
    ${sorted.map(([cid, list]) => `
      <div class="section-title">${T.chapters.chapter} ${cid} · ${esc(chById.get(cid)?.title_ka || chById.get(cid)?.title_en || '')} (${list.length})</div>
      <div class="card">
        ${list.sort((a, b) => b.wrongCount - a.wrongCount || b.lastWrongAt - a.lastWrongAt).map((m) => {
          const q = qById.get(m.questionId);
          return `
            <div class="list-row mistake-row">
              <div class="grow">
                <div class="m-q" lang="en">${esc(snippet(q.question_en))}</div>
                <small class="muted">${sourceBadge(q)} ✗ ${T.mistakes.wrongN(m.wrongCount)} · ${fmtDate(m.lastWrongAt)}</small><br>
                <small class="streak">${T.mistakes.progress(m.streak || 0, EXIT_STREAK, (m.streakDays || []).length, EXIT_DAYS)}</small>
              </div>
            </div>`;
        }).join('')}
        <button class="btn block" data-practice="${cid}">${T.mistakes.practiceChapter}</button>
      </div>`).join('')}`;

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-practice]');
    if (!b) return;
    const v = b.dataset.practice;
    startPractice({ mode: 'quiz', mistakesOnly: true, count: 0, chapterIds: v === 'all' ? null : [Number(v)], source: null });
  });
}

function snippet(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > 110 ? t.slice(0, 107) + '…' : t;
}
