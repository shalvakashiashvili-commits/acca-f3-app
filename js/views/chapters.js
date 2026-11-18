/* =========================================================
   მთავარი ეკრანი: დაშბორდი + თავების სია.
   - მეტრო-რეჟიმის ღილაკი (10 წუთი: შეცდომები + ფლეშქარდები)
   - მზადყოფნა %, დღიური მიზანი, სერია, 3 ყველაზე სუსტი თავი
   - სარეზერვო ასლის შეხსენება (7 დღეში ერთხელ)
   - თავების სია სტატუსით და ქულით (%)
   ========================================================= */

import { setHeader, navigate } from '../router.js';
import { T } from '../strings.ka.js';
import { esc, statusBadge, toast } from '../ui/components.js';
import { loadDemoChapter } from '../core/demo.js';
import { loadDashboard } from '../core/dashboard.js';
import { backupReminderDue } from '../core/backup.js';
import { inProgressSessions } from '../core/session.js';
import { startMetro } from './metro.js';

export async function renderChapters(el) {
  setHeader(T.dash.title);
  const [d, reminder, metroPending] = await Promise.all([loadDashboard(), backupReminderDue(), inProgressSessions(['metro'])]);
  const rows = d.rows;

  if (!rows.length) {
    el.innerHTML = `
      <div class="empty">
        <h2>${T.chapters.emptyTitle}</h2>
        <p>${T.chapters.emptyText}</p>
        <div class="btn-row">
          <a class="btn primary" href="#/library">${T.chapters.goLibrary}</a>
          <button class="btn" id="demo">${T.chapters.loadDemo}</button>
        </div>
      </div>`;
    el.querySelector('#demo').onclick = async () => {
      const rep = await loadDemoChapter();
      if (rep.ok) navigate(`/chapter/${rep.chapterId}`);
      else toast(rep.lines.map((l) => l.text).join('\n'), { type: 'error' });
    };
    return;
  }

  const r = d.readiness;
  const goalPct = Math.min(100, Math.round((d.today.total / Math.max(1, d.goal)) * 100));
  el.innerHTML = `
    ${reminder ? `
      <div class="card warn-box reminder">
        <span class="grow">${reminder.last ? T.dash.backupDue : T.dash.backupNever}</span>
        <a class="btn sm primary" href="#/settings?backup=1">${T.dash.backupGo}</a>
      </div>` : ''}

    <button class="metro-btn" id="metro">
      <span class="metro-ico" aria-hidden="true">🚇</span>
      <span class="grow"><strong>${metroPending.length ? T.dash.metroResume : T.dash.metro}</strong><small>${T.dash.metroSub}</small></span>
      <span aria-hidden="true">›</span>
    </button>

    <div class="dash-grid">
      <div class="card dash-ready">
        <div class="ring" style="--p:${r.value}"><span>${r.value}%</span></div>
        <div class="grow">
          <strong>${T.dash.readiness}</strong>
          <small class="muted">${T.dash.readinessParts(r.chapterPct, r.examPct, r.examN, r.penalty)}</small>
          ${r.examN ? '' : `<small class="muted"><a href="#/exam">${T.dash.noExamsHint}</a></small>`}
        </div>
      </div>
      <div class="card dash-goal">
        <div class="goal-h"><strong>${T.dash.today}: ${T.dash.goalLine(d.today.total, d.goal)}</strong><small class="muted">${T.dash.goalHint}</small></div>
        <div class="bar"><i style="width:${goalPct}%" class="${goalPct >= 100 ? 'ok' : ''}"></i></div>
        <small class="${goalPct >= 100 ? 'ok-text' : 'muted'}">${goalPct >= 100 ? T.dash.goalDone : ''}</small>
        <div class="streak">${d.streak ? T.dash.streak(d.streak) : T.dash.streakZero}</div>
      </div>
    </div>

    <div class="section-title">${T.dash.weakest}</div>
    <div class="card">
      ${d.weakest.map((x) => `
        <a class="list-row weak-row" href="#/chapter/${x.ch.id}">
          <div class="grow"><strong>${T.chapters.chapter} ${x.ch.id}</strong> <small class="muted">${esc(x.ch.title_ka || x.ch.title_en || '')}</small>
            ${x.scorePct != null ? `<div class="bar"><i style="width:${x.scorePct}%"></i></div>` : ''}</div>
          <strong>${x.scorePct == null ? `<small class="muted">${T.dash.notTried}</small>` : x.scorePct + '%'}</strong>
        </a>`).join('')}
      ${d.activeMistakeN ? `<a class="list-row" href="#/mistakes"><span class="grow">📌 ${T.dash.inBank(d.activeMistakeN)}</span><span>›</span></a>` : ''}
    </div>

    <div class="section-title">${T.dash.chapters}</div>
    ${rows.map(chapterItem).join('')}`;

  el.querySelector('#metro').onclick = () => startMetro();
}

function chapterItem(r) {
  const { ch } = r;
  const title = ch.stub ? T.chapters.stub : (ch.title_ka || ch.title_en);
  const seenPct = r.sectionsTotal ? Math.round((r.seen / r.sectionsTotal) * 100) : 0;
  return `
    <a class="chapter-item" href="#/chapter/${ch.id}">
      <div class="row">
        <div class="chapter-num">${ch.id}</div>
        <div class="titles">
          <div class="t-ka">${esc(title)}</div>
          ${ch.title_en && ch.title_ka ? `<div class="t-en">${esc(ch.title_en)}</div>` : ''}
        </div>
        <div class="score">${r.scorePct == null ? '—' : r.scorePct + '%'}</div>
      </div>
      <div class="meta">
        ${statusBadge(r.status)}
        <span>${r.total} ${T.chapters.questions}${r.total ? ` · ${T.source.app} ${r.appCount} / ${T.source.kit} ${r.kitCount}` : ''}</span>
      </div>
      ${r.sectionsTotal ? `<div class="bar" title="${T.study.seenOf(r.seen, r.sectionsTotal)}"><i style="width:${seenPct}%"></i></div>` : ''}
    </a>`;
}
