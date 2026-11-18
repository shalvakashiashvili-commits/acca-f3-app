/* =========================================================
   პარამეტრები. ეტაპ 1-ში: თემა, მეხსიერება, offline სტატუსი.
   შემდეგ ეტაპებზე დაემატება: შეცდომების %, გამოცდის ფორმატი,
   დღიური მიზანი, სარეზერვო ასლი.
   ========================================================= */

import { setHeader } from '../router.js';
import { T } from '../strings.ka.js';
import { getSetting, setSetting } from '../db.js';
import { fmtBytes, toast } from '../ui/components.js';
import { applyTheme } from '../ui/theme.js';
import { APP_VERSION } from '../config.js';

export async function renderSettings(el) {
  setHeader(T.settings.title);
  const theme = await getSetting('theme');
  const persisted = (await navigator.storage?.persisted?.()) ?? false;
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  const swReady = !!navigator.serviceWorker?.controller;

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

  el.querySelector('#theme').onclick = async (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    await setSetting('theme', b.dataset.t);
    applyTheme(b.dataset.t);
    el.querySelectorAll('#theme button').forEach((x) => x.classList.toggle('on', x === b));
  };
}
