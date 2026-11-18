/* =========================================================
   საგამოცდო სიმულაცია — მთავარი ეკრანი: #/exam
   - დაუსრულებელი გამოცდის გაგრძელება
   - ვარიანტი (სრული / მინი) და წყარო (აპლიკაცია / კრებული / ორივე)
   - გაფრთხილება, თუ კითხვები არ ჰყოფნის, და შეთავაზება
     არსებული კითხვებით (ქულა გადაითვლება 100-დან)
   - გამოცდების ისტორია და ქულების დინამიკის გრაფიკი
   ========================================================= */

import { setHeader, navigate } from '../router.js';
import { T } from '../strings.ka.js';
import { getSetting, setSetting, DEFAULT_SETTINGS } from '../db.js';
import { esc, toast, fmtDate, fmtDuration, confirmDialog } from '../ui/components.js';
import { examPlan, buildExam, examRemaining } from '../core/exam.js';
import { createSession, inProgressSessions, finishedSessions, deleteSession } from '../core/session.js';

export async function renderExam(el) {
  setHeader(T.exam.title, { back: true });
  const [cfg, strict, saved, pending, done] = await Promise.all([
    getSetting('exam'), getSetting('examStrict'), getSetting('examChoice'),
    inProgressSessions(['exam']), finishedSessions(['exam']),
  ]);
  const f = { variant: 'full', source: 'both', ...(saved || {}) };
  Object.assign(cfg, { ...DEFAULT_SETTINGS.exam, ...cfg }); // ძველ ჩანაწერს ახალი ველები ევსება
  const plans = { full: examPlan(cfg, 'full'), mini: examPlan(cfg, 'mini') };

  const seg = (name, items, cur) => `
    <div class="segmented" data-seg="${name}">
      ${items.map(([v, label]) => `<button data-v="${v}" class="${cur === v ? 'on' : ''}">${label}</button>`).join('')}
    </div>`;

  el.innerHTML = `
    ${pending.map((p) => `
      <div class="section-title">${T.exam.unfinished}</div>
      <div class="card list-row resume">
        <div class="grow">
          <strong>${p.plan.variant === 'mini' ? T.exam.mini : T.exam.full}</strong>
          <small class="muted"> · ${Object.keys(p.answers).length}/${p.questionIds.length} · ${T.exam.timeLeft} ${fmtDuration(examRemaining(p))}</small>
        </div>
        <a class="btn sm primary" href="#/exam/run/${p.id}">${T.exam.resume}</a>
        <button class="btn sm ghost" data-drop="${p.id}">${T.common.delete}</button>
      </div>`).join('')}

    <div class="section-title">${T.exam.variant}</div>
    <div class="variant-cards" data-seg="variant">
      ${['full', 'mini'].map((v) => `
        <button class="card variant ${f.variant === v ? 'on' : ''}" data-v="${v}">
          <strong>${v === 'full' ? T.exam.full : T.exam.mini}</strong>
          <small>${T.exam.planLine(plans[v].aCount, plans[v].bCount, plans[v].minutes)}</small>
        </button>`).join('')}
    </div>

    <div class="section-title">${T.exam.source}</div>
    ${seg('source', [['app', T.source.app], ['kit', T.source.kit], ['both', T.practice.both]], f.source)}

    <div class="section-title">${T.exam.timer}</div>
    <div class="card">
      <p>${strict ? T.exam.timerStrict : T.exam.timerSoft} <a href="#/settings">${T.exam.timerChange}</a></p>
      <p class="muted"><small>${T.exam.noAnswersShown}</small></p>
    </div>

    <div id="info"></div>
    <button class="btn primary block" id="start">${T.exam.start}</button>

    <div class="section-title">${T.exam.history}</div>
    ${done.length >= 2 ? trendChart(done, cfg.passPct) : ''}
    ${done.length ? `<div class="card">${done.map((s) => `
      <a class="list-row exam-row" href="#/exam/result/${s.id}">
        <div class="grow">
          <strong>${s.plan.variant === 'mini' ? T.exam.mini : T.exam.full}</strong>
          <small class="muted">${fmtDate(s.finishedAt)} · ${esc(sourceLabel(s.filters.source))}${s.summary.scaled ? ' · ' + s.summary.max + '/' + s.plan.plannedMax : ''}</small>
        </div>
        <span class="badge ${s.summary.passed ? 'done' : 'wrong'}">${s.summary.passed ? '✓ ' + T.exam.passed : '✗ ' + T.exam.failed}</span>
        <strong class="score">${s.summary.pct}</strong>
      </a>`).join('')}</div>` : `<p class="muted">${T.exam.noHistory}</p>`}`;

  // ---- ინფორმაცია: რამდენი კითხვაა, რა აკლია ----
  let seq = 0;
  async function updateInfo() {
    const my = ++seq;
    const r = await buildExam(f, cfg);
    if (my !== seq) return;
    const info = el.querySelector('#info');
    const btn = el.querySelector('#start');
    const total = r.a.length + r.b.length;
    if (!total) {
      info.innerHTML = `<p class="pool-info">${T.exam.nothing}</p>`;
      btn.disabled = true;
      btn.textContent = T.exam.start;
      return;
    }
    btn.disabled = false;
    if (!r.short) {
      info.innerHTML = `<p class="pool-info">${T.exam.available(r.have.a, r.have.b)}</p>`;
      btn.textContent = T.exam.start;
      return;
    }
    info.innerHTML = `
      <div class="card warn-box">
        <strong>${T.exam.shortTitle}</strong>
        ${r.missing.a > 0 ? `<p>${T.exam.shortA(r.missing.a, r.plan.aCount)}</p>` : ''}
        ${r.missing.b > 0 ? `<p>${T.exam.shortB(r.missing.b, r.plan.bCount)}</p>` : ''}
        <p>${T.exam.shortOffer(r.actualMax, r.minutes)}</p>
      </div>`;
    btn.textContent = T.exam.startShort;
  }

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const segEl = b.closest('[data-seg]');
    if (segEl && b.dataset.v) {
      f[segEl.dataset.seg] = b.dataset.v;
      segEl.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('on', x === b));
      await setSetting('examChoice', f);
      updateInfo();
      return;
    }
    if (b.dataset.drop) {
      if (await confirmDialog(T.exam.confirmDrop, { danger: true, okLabel: T.common.delete })) {
        await deleteSession(Number(b.dataset.drop));
        renderExam(el); // სიის განახლება
      }
      return;
    }
    if (b.id === 'start') {
      if (pending.length && !(await confirmDialog(T.exam.confirmReplace, { danger: true, okLabel: T.exam.start }))) return;
      b.disabled = true;
      // ახალი შერჩევა (ინფო-ბლოკის შერჩევა მხოლოდ რაოდენობისთვის იყო)
      const r = await buildExam(f, cfg);
      if (!r.a.length && !r.b.length) { toast(T.exam.nothing, { type: 'error' }); b.disabled = false; return; }
      for (const p of pending) await deleteSession(p.id);
      const s = await createSession('exam', { ...f }, [...r.a, ...r.b], {
        plan: r.plan,
        sections: { A: r.a, B: r.b },
        durationMs: r.durationMs,
        strict: !!strict,
        flags: {},
        pauseCount: 0, pausedMs: 0, pausedAt: null,
        warned: false, autoFinished: false,
      });
      navigate(`/exam/run/${s.id}`);
    }
  });

  await updateInfo();
}

const sourceLabel = (s) => (s === 'app' ? T.source.app : s === 'kit' ? T.source.kit : T.practice.both);

/**
 * ქულების დინამიკა — მარტივი ხაზოვანი გრაფიკი (SVG, ბოლო 20 გამოცდა).
 * ერთი სერია → ლეგენდა არ სჭირდება; წყვეტილი ხაზი = ჩაბარების ზღვარი.
 * წერტილზე დაჭერით/მიტანით ჩანს ქულა და თარიღი (<title>).
 */
function trendChart(done, passPct) {
  const pts = done.slice(0, 20).reverse(); // ძველიდან ახლისკენ
  const W = 320, H = 150, L = 28, R = 14, TOP = 12, B = 22;
  const x = (i) => L + (pts.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (pts.length - 1));
  const y = (v) => TOP + ((100 - v) * (H - TOP - B)) / 100;
  const line = pts.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.summary.pct).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return `
    <div class="card chart-card">
      <div class="chart-h">${T.exam.trend}</div>
      <svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="${T.exam.trend}">
        ${[0, 100].map((v) => `
          <line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>
          <text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
        <line class="pass" x1="${L}" x2="${W - R}" y1="${y(passPct)}" y2="${y(passPct)}"/>
        <text class="axis" x="${L - 6}" y="${y(passPct) + 4}" text-anchor="end">${passPct}</text>
        <path class="series" d="${line}"/>
        ${pts.map((s, i) => `
          <g class="pt">
            <circle class="hit" cx="${x(i)}" cy="${y(s.summary.pct)}" r="12"/>
            <circle class="dot" cx="${x(i)}" cy="${y(s.summary.pct)}" r="4"/>
            <title>${s.summary.pct} — ${fmtDate(s.finishedAt)}</title>
          </g>`).join('')}
        <text class="val" x="${x(pts.length - 1)}" y="${y(last.summary.pct) - 9}" text-anchor="end">${last.summary.pct}</text>
      </svg>
      <p class="muted chart-note"><small>– – ${T.exam.trendPass(passPct)} · ${T.exam.lastN(pts.length)}</small></p>
    </div>`;
}
