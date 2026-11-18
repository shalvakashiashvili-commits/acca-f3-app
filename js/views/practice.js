/* =========================================================
   ვარჯიშის პარამეტრები: #/practice[?ch=3][&mistakes=1]
   რეჟიმი (ქვიზი/ტესტი), თავები, წყარო, სირთულე, რაოდენობა.
   ბოლოს არჩეული პარამეტრები ინახება შემდეგი ჯერისთვის.
   ========================================================= */

import { setHeader, navigate } from '../router.js';
import { T } from '../strings.ka.js';
import { S, getAll, getSetting, setSetting } from '../db.js';
import { esc, toast, fmtDate, confirmDialog } from '../ui/components.js';
import { pickQuestions } from '../core/picker.js';
import { createSession, inProgressSessions, deleteSession } from '../core/session.js';

const COUNTS = [5, 10, 20, 30, 0]; // 0 = ყველა

export async function renderPractice(el, _params, query) {
  setHeader(T.practice.title);
  const [chapters, saved, share, pending] = await Promise.all([
    getAll(S.chapters), getSetting('practiceFilters'), getSetting('mistakeShare'), inProgressSessions(),
  ]);
  chapters.sort((a, b) => a.id - b.id);

  // პარამეტრები: შენახული → URL-ით გადმოცემული (?ch=, ?mistakes=)
  const f = {
    mode: 'quiz', chapterIds: null, source: 'both', difficulty: 'all', count: 10, mistakesOnly: false,
    ...(saved || {}),
  };
  if (query.ch) f.chapterIds = query.ch.split(',').map(Number);
  if (query.mistakes) f.mistakesOnly = true;
  // არარსებული თავები სიიდან ამოვიღოთ
  if (f.chapterIds) {
    f.chapterIds = f.chapterIds.filter((id) => chapters.some((c) => c.id === id));
    if (!f.chapterIds.length) f.chapterIds = null;
  }

  if (!chapters.length) {
    el.innerHTML = `<div class="empty"><p>${T.chapters.emptyText}</p><a class="btn primary" href="#/library">${T.chapters.goLibrary}</a></div>`;
    return;
  }

  const seg = (name, items, cur) => `
    <div class="segmented" data-seg="${name}">
      ${items.map(([v, label]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${label}</button>`).join('')}
    </div>`;

  el.innerHTML = `
    <a class="card exam-entry" href="#/exam">
      <span class="exam-ico" aria-hidden="true">⏱</span>
      <span class="grow"><strong>${T.exam.cardTitle}</strong><small class="muted">${T.exam.cardText}</small></span>
      <span aria-hidden="true">›</span>
    </a>
    ${pending.length ? `
      <div class="section-title">${T.practice.unfinished}</div>
      ${pending.map((p) => `
        <div class="card list-row resume">
          <div class="grow">
            <strong>${p.type === 'quiz' ? T.quiz.quizTitle : T.quiz.testTitle}</strong>
            <small class="muted"> · ${Object.keys(p.answers).length}/${p.questionIds.length} · ${fmtDate(p.startedAt)}</small>
          </div>
          <a class="btn sm primary" href="#/run/${p.id}">${T.practice.resume}</a>
          <button class="btn sm ghost" data-drop="${p.id}">${T.common.delete}</button>
        </div>`).join('')}` : ''}

    <div class="section-title">${T.practice.mode}</div>
    ${seg('mode', [['quiz', T.practice.modeQuiz], ['test', T.practice.modeTest]], f.mode)}
    <p class="muted hint"><small id="mode-hint"></small></p>

    <div class="section-title">${T.practice.chapters}</div>
    <div class="chip-wrap" id="chapters">
      <button class="chip ${!f.chapterIds ? 'on' : ''}" data-ch="all">${T.practice.allChapters}</button>
      ${chapters.map((c) => `<button class="chip ${f.chapterIds?.includes(c.id) ? 'on' : ''}" data-ch="${c.id}" title="${esc(c.title_ka || c.title_en)}">${T.chapters.chapter} ${c.id}</button>`).join('')}
    </div>

    <div class="section-title">${T.practice.source}</div>
    ${seg('source', [['app', T.source.app], ['kit', T.source.kit], ['both', T.practice.both]], f.source)}

    <div class="section-title">${T.practice.difficulty}</div>
    ${seg('difficulty', [['all', T.practice.diffAll], ['easy', '1–2'], ['medium', '3'], ['hard', '4–5']], f.difficulty)}

    <div class="section-title">${T.practice.count}</div>
    ${seg('count', COUNTS.map((n) => [n, n || T.practice.all]), f.count)}

    <label class="toggle-row card">
      <input type="checkbox" id="mistakes-only" ${f.mistakesOnly ? 'checked' : ''}>
      <span>${T.practice.mistakesOnly}</span>
    </label>

    <p class="pool-info" id="info"></p>
    <button class="btn primary block" id="start">${T.practice.start}</button>`;

  // ---- ინფორმაცია: რამდენი კითხვა ემთხვევა ფილტრს ----
  let infoSeq = 0;
  async function updateInfo() {
    el.querySelector('#mode-hint').textContent = f.mode === 'quiz' ? T.practice.quizHint : T.practice.testHint;
    const seq = ++infoSeq;
    const r = await pickQuestions(f, { mistakeShare: share });
    if (seq !== infoSeq) return; // უფრო ახალი განახლება უკვე დაიწყო
    const info = el.querySelector('#info');
    if (f.mistakesOnly) info.innerHTML = T.practice.infoMistakes(r.mistakes);
    else info.innerHTML = T.practice.info(r.pool, r.mistakes, r.mistakeIds.size, r.ids.length);
    el.querySelector('#start').disabled = r.ids.length === 0;
    el.querySelectorAll('[data-seg="difficulty"] button').forEach((b) => { b.disabled = f.mistakesOnly; });
  }

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const segEl = b.closest('[data-seg]');
    if (segEl && b.dataset.v !== undefined) {
      const name = segEl.dataset.seg;
      f[name] = name === 'count' ? Number(b.dataset.v) : b.dataset.v;
      segEl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      updateInfo();
      return;
    }
    if (b.dataset.ch) {
      if (b.dataset.ch === 'all') f.chapterIds = null;
      else {
        const id = Number(b.dataset.ch);
        const set = new Set(f.chapterIds || []);
        set.has(id) ? set.delete(id) : set.add(id);
        f.chapterIds = set.size ? [...set].sort((x, y) => x - y) : null;
      }
      el.querySelectorAll('#chapters .chip').forEach((c) => {
        c.classList.toggle('on', c.dataset.ch === 'all' ? !f.chapterIds : !!f.chapterIds?.includes(Number(c.dataset.ch)));
      });
      updateInfo();
      return;
    }
    if (b.dataset.drop) {
      if (await confirmDialog(T.practice.confirmDrop, { danger: true, okLabel: T.common.delete })) {
        await deleteSession(Number(b.dataset.drop));
        b.closest('.resume').remove();
      }
      return;
    }
    if (b.id === 'start') {
      b.disabled = true;
      await setSetting('practiceFilters', f);
      const r = await pickQuestions(f, { mistakeShare: share });
      if (!r.ids.length) { toast(T.practice.nothing, { type: 'error' }); b.disabled = false; return; }
      const s = await createSession(f.mode, { ...f }, r.ids);
      navigate(`/run/${s.id}`);
    }
  });
  el.querySelector('#mistakes-only').onchange = (e) => { f.mistakesOnly = e.target.checked; updateInfo(); };

  await updateInfo();
}

/** სხვა ეკრანებიდან: ვარჯიში ახალი პარამეტრებით (მაგ. „ივარჯიშე მხოლოდ შეცდომებზე“) */
export async function startPractice(filters) {
  const share = await getSetting('mistakeShare');
  const f = { mode: 'quiz', chapterIds: null, source: 'both', difficulty: 'all', count: 10, mistakesOnly: false, ...filters };
  const r = await pickQuestions(f, { mistakeShare: share });
  if (!r.ids.length) { toast(T.practice.nothing, { type: 'error' }); return null; }
  const s = await createSession(f.mode, f, r.ids);
  navigate(`/run/${s.id}`);
  return s;
}
