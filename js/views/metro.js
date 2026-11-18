/* =========================================================
   მეტრო-რეჟიმი: #/metro (ახალი ან დაუსრულებელი სესია) და #/metro/<id>
   10 წუთი: შეცდომები + ფლეშქარდები შერეულად (იხ. core/metro.js).
   - კითხვა: პასუხი → „შემოწმება“ → სწორი პასუხი, ახსნა, ბანკის სტატუსი
   - ბარათი: დაჭერით გადაბრუნება → „ვიცი / არ ვიცი“
   - დრო ჩერდება, როცა ეკრანს ტოვებ; 0-ზე სესია სრულდება
   ========================================================= */

import { setHeader, navigate } from '../router.js';
import { T } from '../strings.ka.js';
import { toast, fmtDuration } from '../ui/components.js';
import { questionHtml, toggleOption, setText } from '../ui/question.js';
import { cardHtml } from '../ui/card.js';
import { answerState } from '../core/scoring.js';
import { S, get } from '../db.js';
import { getSession, saveSession, checkQuizQuestion, inProgressSessions } from '../core/session.js';
import { createMetroSession } from '../core/metro.js';
import { loadCards, rateCard } from '../core/cards.js';
import { EXIT_STREAK, EXIT_DAYS } from '../core/mistakes.js';
import { now } from '../core/clock.js';

/** ერთი ღილაკი: დაუსრულებელი სესიის გაგრძელება ან ახლის შექმნა */
export async function startMetro() {
  const [pending] = await inProgressSessions(['metro']);
  if (pending) { navigate(`/metro/${pending.id}`); return; }
  const s = await createMetroSession();
  if (!s) { toast(T.metro.nothing, { type: 'error' }); return; }
  navigate(`/metro/${s.id}`);
}

export async function renderMetroStart(el) {
  setHeader(T.metro.title, { back: true });
  el.innerHTML = `<div class="empty">${T.common.loading}</div>`;
  await startMetro();
}

export async function renderMetro(el, { id }) {
  const s = await getSession(Number(id));
  setHeader(T.metro.title, { back: true });
  if (!s || s.type !== 'metro') { navigate('/', { replace: true }); return; }
  if (s.state === 'done') { renderSummary(el, s); return; }

  // ელემენტების ჩატვირთვა (წაშლილი კითხვები/ბარათები გამოტოვებულია)
  const cards = new Map((await loadCards()).map((c) => [c.cardId, c]));
  const qs = new Map();
  for (const it of s.items) if (it.k === 'q') { const q = await get(S.questions, it.id); if (q) qs.set(q.id, q); }
  const items = s.items.filter((it) => (it.k === 'q' ? qs.has(it.id) : cards.has(it.id)));
  if (!items.length) { el.innerHTML = `<div class="empty">${T.quiz.noQuestionsLeft}</div>`; return; }
  s.index = Math.min(s.index || 0, items.length);
  document.body.classList.add('no-nav');

  let segStart = now();
  let flipped = false;
  let lastEvent = null;
  let done = false;
  const flush = () => { if (segStart != null) { const t = now(); s.elapsedMs += t - segStart; segStart = t; } };
  const persist = () => { flush(); return saveSession(s); };
  const remaining = () => s.durationMs - s.elapsedMs - (segStart != null ? now() - segStart : 0);

  if (s.index > 0) toast(T.metro.resumed);

  function render() {
    if (s.index >= items.length) { finish(); return; }
    const it = items[s.index];
    const top = `
      <div class="run-top">
        <div class="progress-line">
          <strong>🚇 ${s.index + 1} / ${items.length}</strong>
          <span>${it.k === 'q' ? T.metro.question : T.metro.card}</span>
          <span id="clock" class="exam-clock"></span>
        </div>
        <div class="bar"><i id="tbar" style="width:0%"></i></div>
      </div>`;
    if (it.k === 'c') {
      el.innerHTML = top + cardHtml(cards.get(it.id), flipped);
    } else {
      const q = qs.get(it.id);
      const checked = s.results[q.id];
      const state = answerState(q, s.answers[q.id]);
      el.innerHTML = top + `
        <div class="card q-card">${questionHtml(q, s.answers[q.id], { review: !!checked, result: checked })}</div>
        ${checked && lastEvent?.qid === q.id ? bankNote(lastEvent) : ''}
        <div class="run-actions">
          ${checked ? `<button class="btn primary block" data-a="next">${T.quiz.next} →</button>`
                    : `<button class="btn primary block" data-a="check" ${state === 'none' ? 'disabled' : ''}>${T.quiz.check}</button>
                       <button class="btn ghost block" data-a="skip">${T.metro.skip}</button>`}
        </div>`;
    }
    tick();
  }

  function bankNote({ event, rec }) {
    if (event === 'entered' || event === 'wrong-again') return `<p class="bank-note wrong">📌 ${T.quiz.bankEntered(rec.wrongCount)}</p>`;
    if (event === 'progress') return `<p class="bank-note">🔁 ${T.quiz.bankProgress(rec.streak, EXIT_STREAK, rec.streakDays.length, EXIT_DAYS)}</p>`;
    if (event === 'exited') return `<p class="bank-note ok">🎉 ${T.quiz.bankExited}</p>`;
    return '';
  }

  function tick() {
    const rem = remaining();
    const c = el.querySelector('#clock');
    if (c) c.textContent = '⏱ ' + fmtDuration(Math.max(0, rem));
    const b = el.querySelector('#tbar');
    if (b) b.style.width = Math.min(100, Math.round(((s.durationMs - rem) / s.durationMs) * 100)) + '%';
    if (rem <= 0 && !done) { toast('⏰ ' + T.metro.timeUp); finish(); }
  }

  async function finish() {
    if (done) return;
    done = true;
    flush();
    s.elapsedMs = Math.min(s.elapsedMs, s.durationMs);
    const res = Object.values(s.results);
    const cr = Object.values(s.cardResults);
    s.summary = {
      questions: res.length, correct: res.filter((r) => r.correct).length,
      cards: cr.length, known: cr.filter(Boolean).length,
    };
    s.state = 'done';
    s.finishedAt = now();
    await saveSession(s);
    document.body.classList.remove('no-nav');
    renderSummary(el, s);
  }

  async function onClick(e) {
    if (done) return;
    const it = items[s.index];
    const opt = e.target.closest('[data-opt]');
    const act = e.target.closest('[data-a]')?.dataset.a;
    if (it.k === 'q' && opt && !opt.disabled) {
      const q = qs.get(it.id);
      s.answers[q.id] = toggleOption(q, s.answers[q.id], Number(opt.dataset.part), Number(opt.dataset.opt));
      persist(); render();
      return;
    }
    if (!act) return;
    if (act === 'flip') { flipped = !flipped; render(); return; }
    if (act === 'known' || act === 'unknown') {
      e.target.closest('button').disabled = true;
      await rateCard(cards.get(it.id), act === 'known');
      s.cardResults[it.id] = act === 'known';
      flipped = false;
      s.index++;
      persist(); render();
      return;
    }
    if (act === 'check') {
      flush();
      const r = await checkQuizQuestion(s, qs.get(it.id));
      lastEvent = { qid: it.id, event: r.event, rec: r.rec };
      render();
      return;
    }
    if (act === 'next' || act === 'skip') { s.index++; persist(); render(); window.scrollTo(0, 0); }
  }

  let saveTimer = 0;
  function onInput(e) {
    const inp = e.target.closest('.ans-in');
    const it = items[s.index];
    if (!inp || it.k !== 'q') return;
    const q = qs.get(it.id);
    s.answers[q.id] = setText(q, s.answers[q.id], Number(inp.dataset.part), inp.value);
    const btn = el.querySelector('[data-a="check"]');
    if (btn) btn.disabled = answerState(q, s.answers[q.id]) === 'none';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  }
  function onKey(e) {
    if (e.key !== 'Enter' || !e.target.closest('.ans-in')) return;
    e.preventDefault();
    el.querySelector('[data-a="check"]:not([disabled]), [data-a="next"]')?.click();
  }
  const onVis = () => {
    if (done) return;
    if (document.hidden) { flush(); segStart = null; saveSession(s); } else { segStart = now(); tick(); }
  };
  const timer = setInterval(() => { if (!document.hidden) tick(); }, 1000);

  el.addEventListener('click', onClick);
  el.addEventListener('input', onInput);
  el.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVis);
  render();

  return () => {
    clearInterval(timer);
    clearTimeout(saveTimer);
    document.removeEventListener('visibilitychange', onVis);
    document.body.classList.remove('no-nav');
    if (!done) { flush(); segStart = null; saveSession(s); }
  };
}

function renderSummary(el, s) {
  const m = s.summary;
  el.innerHTML = `
    <div class="card result-hero">
      <div class="big">🚇</div>
      <div class="sub">${T.metro.doneTitle}</div>
      <div class="stats">
        <span>✎ ${T.metro.sumQuestions(m.correct, m.questions)}</span>
        <span>🎴 ${T.metro.sumCards(m.known, m.cards)}</span>
        <span>⏱ ${fmtDuration(s.elapsedMs)}</span>
      </div>
    </div>
    <div class="btn-row">
      <button class="btn primary" id="again">${T.metro.again}</button>
      <a class="btn" href="#/">${T.metro.home}</a>
    </div>`;
  el.querySelector('#again').onclick = () => startMetro();
}
