/* =========================================================
   პარამეტრები: თემა, შეცდომების %, გამოცდის ფორმატი და მკაცრი
   რეჟიმი, მეხსიერება. ეტაპ 4-ში: დღიური მიზანი, სარეზერვო ასლი.
   ========================================================= */

import { setHeader } from '../router.js';
import { T } from '../strings.ka.js';
import { getSetting, setSetting, DEFAULT_SETTINGS } from '../db.js';
import { examPlan } from '../core/exam.js';
import { fmtBytes, toast } from '../ui/components.js';
import { applyTheme } from '../ui/theme.js';
import { APP_VERSION } from '../config.js';

export async function renderSettings(el) {
  setHeader(T.settings.title);
  const theme = await getSetting('theme');
  const persisted = (await navigator.storage?.persisted?.()) ?? false;
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  const swReady = !!navigator.serviceWorker?.controller;
  // ძველ შენახულ ფორმატს ახალი ველები ნაგულისხმევიდან ევსება
  let exam = { ...DEFAULT_SETTINGS.exam, ...(await getSetting('exam')) };
  const strict = await getSetting('examStrict');

  el.innerHTML = `
    <div class="section-title">${T.settings.theme}</div>
    <div class="segmented" id="theme">
      ${['system', 'light', 'dark'].map((k) => `<button data-t="${k}" class="${theme === k ? 'on' : ''}">${T.settings['theme' + k[0].toUpperCase() + k.slice(1)]}</button>`).join('')}
    </div>

    <div class="section-title">${T.settings.practice}</div>
    <div class="card">
      <label class="field"><span>${T.settings.mistakeShare}</span>
        <input type="number" id="mistake-share" inputmode="numeric" min="0" max="100" step="5" value="${await getSetting('mistakeShare')}">
      </label>
      <p class="muted"><small>${T.settings.mistakeShareHint}</small></p>
    </div>

    <div class="section-title">${T.settings.exam}</div>
    <div class="card" id="exam-cfg">
      ${[['aCount', T.settings.examA, 1, 100], ['aMarks', T.settings.examAMarks, 1, 10], ['bCount', T.settings.examB, 0, 10],
         ['bMarks', T.settings.examBMarks, 1, 50], ['minutes', T.settings.examMinutes, 5, 300], ['passPct', T.settings.examPass, 1, 100]]
        .map(([k, label, min, max]) => `<label class="field"><span>${label}</span>
          <input type="number" inputmode="numeric" data-k="${k}" min="${min}" max="${max}" value="${exam[k]}"></label>`).join('')}
      <p class="muted"><small id="exam-sum"></small></p>
      <button class="btn sm ghost" id="exam-reset">${T.settings.examReset}</button>
    </div>
    <label class="toggle-row card">
      <input type="checkbox" id="exam-strict" ${strict ? 'checked' : ''}>
      <span>${T.settings.examStrict}</span>
    </label>
    <p class="muted hint"><small>${T.settings.examStrictHint}</small></p>

    <div class="section-title">${T.settings.storage}</div>
    <div class="card">
      ${est ? `<p>${T.library.storage(fmtBytes(est.usage), fmtBytes(est.quota))}</p>` : ''}
      <p class="${persisted ? '' : 'muted'}">${persisted ? '✅ ' + T.settings.persisted : '⚠ ' + T.settings.notPersisted}</p>
      <p>${swReady ? '✅ ' + T.settings.offlineReady : '⏳ ' + T.settings.offlineNotReady}</p>
    </div>

    <p class="muted" style="text-align:center"><small>${T.settings.version}: ${APP_VERSION}</small></p>`;

  el.querySelector('#mistake-share').onchange = async (e) => {
    const v = Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0)));
    e.target.value = v;
    await setSetting('mistakeShare', v);
    toast(T.study.saved);
  };

  // ---- გამოცდის ფორმატი ----
  const sumEl = el.querySelector('#exam-sum');
  const showSum = () => {
    const p = (v) => { const x = examPlan(exam, v); return T.exam.planLine(x.aCount, x.bCount, x.minutes) + ` (${x.plannedMax} ${T.quiz.marks})`; };
    sumEl.textContent = T.settings.examSummary(p('full'), p('mini'));
  };
  showSum();
  el.querySelector('#exam-cfg').onchange = async (e) => {
    const inp = e.target.closest('[data-k]');
    if (!inp) return;
    const v = Math.min(Number(inp.max), Math.max(Number(inp.min), Math.round(Number(inp.value) || 0)));
    inp.value = v;
    exam = { ...exam, [inp.dataset.k]: v };
    await setSetting('exam', exam);
    showSum();
    toast(T.study.saved);
  };
  el.querySelector('#exam-reset').onclick = async () => {
    exam = { ...DEFAULT_SETTINGS.exam };
    await setSetting('exam', exam);
    el.querySelectorAll('#exam-cfg [data-k]').forEach((i) => { i.value = exam[i.dataset.k]; });
    showSum();
    toast(T.study.saved);
  };
  el.querySelector('#exam-strict').onchange = async (e) => {
    await setSetting('examStrict', e.target.checked);
    toast(T.study.saved);
  };

  el.querySelector('#theme').onclick = async (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    await setSetting('theme', b.dataset.t);
    applyTheme(b.dataset.t);
    el.querySelectorAll('#theme button').forEach((x) => x.classList.toggle('on', x === b));
  };
}
