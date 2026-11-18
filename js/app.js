/* =========================================================
   აპლიკაციის გაშვება: მარშრუტები, თემა, service worker.
   ახალი ეკრანის დასამატებლად: შექმენი js/views/<name>.js,
   დაარეგისტრირე route(...) ქვემოთ და დაამატე sw.js-ის ASSETS სიაში.
   ========================================================= */

import { route, start, back } from './router.js';
import { getSetting, setSetting, openDB } from './db.js';
import { T } from './strings.ka.js';
import { toast } from './ui/components.js';
import { applyTheme, isDark } from './ui/theme.js';
import { renderChapters } from './views/chapters.js';
import { renderChapter } from './views/chapter.js';
import { renderLibrary } from './views/library.js';
import { renderPdfViewer } from './views/pdfviewer.js';
import { renderSettings } from './views/settings.js';
import { renderPractice } from './views/practice.js';
import { renderRun } from './views/run.js';
import { renderResult } from './views/result.js';
import { renderMistakes } from './views/mistakes.js';
import { renderExam } from './views/exam.js';
import { renderExamRun } from './views/examrun.js';
import { renderExamResult } from './views/examresult.js';

/* ---------- მარშრუტები ---------- */
route('/', renderChapters, { nav: 'home' });
route('/chapter/:id', renderChapter, { nav: 'home' });
route('/practice', renderPractice, { nav: 'practice' });
route('/run/:id', renderRun, { nav: 'practice' });
route('/result/:id', renderResult, { nav: 'practice' });
route('/exam', renderExam, { nav: 'practice' });
route('/exam/run/:id', renderExamRun, { nav: 'practice' });
route('/exam/result/:id', renderExamResult, { nav: 'practice' });
route('/mistakes', renderMistakes, { nav: 'mistakes' });
route('/pdf/:id', renderPdfViewer, { nav: 'library' });
route('/library', renderLibrary, { nav: 'library' });
route('/settings', renderSettings, { nav: 'settings' });

/* ---------- გაშვება ---------- */
async function boot() {
  try {
    await openDB();
  } catch (e) {
    document.getElementById('view').innerHTML = `<div class="card"><strong>${T.common.error}:</strong> ${e.message}</div>`;
    return;
  }

  applyTheme(await getSetting('theme'));
  // სისტემური თემის ცვლილებაზე რეაგირება
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => applyTheme(await getSetting('theme')));

  // ზედა ზოლის ღილაკები
  document.getElementById('btn-back').onclick = () => back();
  document.getElementById('btn-theme').onclick = async () => {
    const next = isDark() ? 'light' : 'dark';
    await setSetting('theme', next);
    applyTheme(next);
  };

  // ქვედა ნავიგაციის აქტიური ღილაკი
  start(document.getElementById('view'), (opts) => {
    document.querySelectorAll('#bottomnav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === opts.nav));
  });

  registerServiceWorker();
}

/* ---------- Service worker (offline) ---------- */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    // ახალი ვერსია ჩამოიტვირთა და ელოდება → ვთავაზობთ განახლებას
    const offer = (worker) => toast(T.common.updateReady, {
      action: { label: T.common.reload, onClick: () => worker.postMessage('SKIP_WAITING') },
    });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
  }).catch((e) => console.warn('SW registration failed', e));

  // ახალმა ვერსიამ მართვა აიღო → გვერდის გადატვირთვა
  // (პირველი დაყენებისას არა — მაშინ გვერდი უკვე სწორ ფაილებს იყენებს)
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
}

boot();
