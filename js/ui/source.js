/* =========================================================
   წყაროს ფილტრი (ვარჯიში, გამოცდა): „ყველა“ + აპლიკაცია / კრებული / წიგნი.
   შეიძლება რამდენიმეს ერთად არჩევა. მნიშვნელობა — მასივი ან null (ყველა),
   იხ. core/picker.js → normalizeSources.
   ========================================================= */

import { T } from '../strings.ka.js';
import { SOURCES, normalizeSources } from '../core/picker.js';

/** ჩიპების HTML. data-src="all" | "app" | "kit" | "book" */
export function sourceChipsHtml(source) {
  const sel = normalizeSources(source);
  return `
    <div class="chip-wrap" data-sources>
      <button type="button" class="chip ${!sel ? 'on' : ''}" data-src="all" aria-pressed="${!sel}">${T.source.all}</button>
      ${SOURCES.map((s) => `<button type="button" class="chip ${sel?.includes(s) ? 'on' : ''}" data-src="${s}" aria-pressed="${!!sel?.includes(s)}">${T.source[s]}</button>`).join('')}
    </div>`;
}

/** ჩიპზე დაჭერა → ახალი მნიშვნელობა (მასივი ან null) */
export function toggleSource(source, clicked) {
  if (clicked === 'all') return null;
  const set = new Set(normalizeSources(source) || []);
  set.has(clicked) ? set.delete(clicked) : set.add(clicked);
  return normalizeSources([...set]);
}

/** ჩიპების მდგომარეობის განახლება ხელახალი ხატვის გარეშე */
export function syncSourceChips(root, source) {
  const sel = normalizeSources(source);
  root.querySelectorAll('[data-sources] [data-src]').forEach((b) => {
    const on = b.dataset.src === 'all' ? !sel : !!sel?.includes(b.dataset.src);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
}

/** მოკლე წარწერა ისტორიისთვის: „ყველა წყარო“ ან „კრებული + წიგნი“ */
export function sourceLabel(source) {
  const sel = normalizeSources(source);
  return sel ? sel.map((s) => T.source[s]).join(' + ') : T.source.allLong;
}
