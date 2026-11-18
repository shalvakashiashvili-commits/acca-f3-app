/* =========================================================
   პარამეტრები: თემა, შეცდომების %, დღიური მიზანი, გამოცდის ფორმატი
   და მკაცრი რეჟიმი, სარეზერვო ასლი (ექსპორტი/აღდგენა), მეხსიერება.
   ========================================================= */

import { setHeader } from '../router.js';
import { T } from '../strings.ka.js';
import { getSetting, setSetting, DEFAULT_SETTINGS } from '../db.js';
import { examPlan } from '../core/exam.js';
import { fmtBytes, fmtDate, toast, confirmDialog } from '../ui/components.js';
import { S, getAll } from '../db.js';
import { exportBackup, markBackupDone, readBackup, restoreBackup, requestPersist } from '../core/backup.js';
import { applyTheme } from '../ui/theme.js';
import { APP_VERSION } from '../config.js';

export async function renderSettings(el, _params = {}, query = {}) {
  setHeader(T.settings.title);
  const theme = await getSetting('theme');
  const persisted = (await navigator.storage?.persisted?.()) ?? false;
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  const swReady = !!navigator.serviceWorker?.controller;
  // ძველ შენახულ ფორმატს ახალი ველები ნაგულისხმევიდან ევსება
  let exam = { ...DEFAULT_SETTINGS.exam, ...(await getSetting('exam')) };
  const strict = await getSetting('examStrict');
  const lastBackup = await getSetting('lastBackup');
  const pdfBytes = (await getAll(S.pdfs)).reduce((a, p) => a + (p.size || 0), 0);

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
      <label class="field"><span>${T.settings.dailyGoal}</span>
        <input type="number" id="daily-goal" inputmode="numeric" min="1" max="500" value="${await getSetting('dailyGoal')}">
      </label>
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

    <div class="section-title" id="backup">${T.backup.title}</div>
    <div class="card">
      <p>${T.backup.text}</p>
      <label class="toggle-row"><input type="checkbox" id="with-pdfs" ${pdfBytes ? '' : 'disabled'}> <span>${T.backup.withPdfs(fmtBytes(pdfBytes))}</span></label>
      <p class="muted"><small>${T.backup.withPdfsHint}</small></p>
      <div class="btn-row">
        <button class="btn primary" id="export">${T.backup.export}</button>
        ${navigator.canShare ? `<button class="btn" id="share">${T.backup.share}</button>` : ''}
      </div>
      <p class="muted"><small id="backup-last">${lastBackup ? T.backup.last(fmtDate(lastBackup)) : T.backup.never}. ${T.backup.reminder}</small></p>
      <label class="btn block file-btn">${T.backup.import}<input type="file" id="import" accept="application/json,.json" hidden></label>
    </div>

    <div class="section-title">${T.settings.storage}</div>
    <div class="card">
      ${est ? `<p>${T.library.storage(fmtBytes(est.usage), fmtBytes(est.quota))}</p>` : ''}
      <p class="${persisted ? '' : 'muted'}">${persisted ? '✅ ' + T.settings.persisted : '⚠ ' + T.settings.notPersisted}</p>
      ${persisted ? '' : `<button class="btn sm" id="persist">${T.settings.persistAsk}</button>`}
      <p>${swReady ? '✅ ' + T.settings.offlineReady : '⏳ ' + T.settings.offlineNotReady}</p>
    </div>

    <p class="muted" style="text-align:center"><small>${T.settings.version}: ${APP_VERSION}</small></p>`;

  el.querySelector('#mistake-share').onchange = async (e) => {
    const v = Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0)));
    e.target.value = v;
    await setSetting('mistakeShare', v);
    toast(T.study.saved);
  };

  el.querySelector('#daily-goal').onchange = async (e) => {
    const v = Math.min(500, Math.max(1, Math.round(Number(e.target.value) || 1)));
    e.target.value = v;
    await setSetting('dailyGoal', v);
    toast(T.study.saved);
  };

  // ---- სარეზერვო ასლი ----
  const lastEl = el.querySelector('#backup-last');
  async function doExport(viaShare) {
    const btns = el.querySelectorAll('#export, #share');
    btns.forEach((b) => { b.disabled = true; });
    const label = el.querySelector('#export').textContent;
    el.querySelector('#export').textContent = T.backup.exporting;
    try {
      const { blob, filename } = await exportBackup({ includePdfs: el.querySelector('#with-pdfs').checked });
      const file = new File([blob], filename, { type: 'application/json' });
      if (viaShare && navigator.canShare?.({ files: [file] })) {
        // ტელეფონზე: „ფაილებში შენახვა“, Google Drive, ტელეგრამი …
        try { await navigator.share({ files: [file], title: filename }); } catch (err) { if (err.name === 'AbortError') return; throw err; }
      } else {
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: filename });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      await markBackupDone();
      lastEl.textContent = `${T.backup.last(fmtDate(Date.now()))}. ${T.backup.reminder}`;
      toast(T.backup.exported(filename));
    } catch (err) {
      toast(`${T.common.error}: ${err.message}`, { type: 'error' });
    } finally {
      btns.forEach((b) => { b.disabled = false; });
      el.querySelector('#export').textContent = label;
    }
  }
  el.querySelector('#export').onclick = () => doExport(false);
  el.querySelector('#share')?.addEventListener('click', () => doExport(true));

  el.querySelector('#import').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { data } = await readBackup(file);
      if (!(await confirmDialog(T.backup.confirmRestore(fmtDate(data.exportedAt), data.includesPdfs), { danger: true, okLabel: T.backup.import }))) return;
      await restoreBackup(data);
      toast(T.backup.restored);
      applyTheme(await getSetting('theme'));
      renderSettings(el, _params, {});
    } catch (err) {
      toast(`${T.backup.failed}: ${err.message}`, { type: 'error', ms: 6000 });
    }
  };

  el.querySelector('#persist')?.addEventListener('click', async () => {
    if (await requestPersist()) renderSettings(el, _params, {});
    else toast(T.settings.persistDenied, { ms: 7000 });
  });
  if (query.backup) el.querySelector('#backup').scrollIntoView();

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
