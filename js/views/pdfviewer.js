/* =========================================================
   PDF მნახველი (pdf.js, ლოკალურად).
   - გვერდები ვერტიკალურად, იხატება მხოლოდ ეკრანთან ახლოს მყოფი
     გვერდები (ტელეფონის მეხსიერების დასაზოგად).
   - დიაპაზონი: ?from=&to= (თავის გვერდები) ან მთლიანი ფაილი (?full=1)
   - სანიშნეები (☆) და შენიშვნები (✎) ინახება notes ცხრილში.
   - ბოლო ნანახი გვერდი ინახება და შემდეგ ჯერზე იქიდან იხსნება.
   URL: #/pdf/<pdfId>?from=1&to=20&ch=3[&full=1][&page=5]
   ========================================================= */

import { setHeader, navigate } from '../router.js';
import { T } from '../strings.ka.js';
import { S, get, put, del, getAllByIndex, getSetting, setSetting } from '../db.js';
import { esc, toast, sheet, textDialog, confirmDialog, ICON } from '../ui/components.js';
import { openPdfDocument } from '../core/pdfstore.js';
import { markPdfOpened } from '../core/progress.js';

const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3];
const MAX_RENDERED = 8; // ერთდროულად დახატული გვერდების მაქსიმუმი

export async function renderPdfViewer(el, { id }, query) {
  const rec = await get(S.pdfs, id);
  if (!rec) {
    setHeader(T.pdf.error, { back: true });
    el.innerHTML = `<div class="empty">${T.pdf.error}</div>`;
    return;
  }
  setHeader(rec.name.replace(/\.pdf$/i, ''), { back: true });
  document.body.classList.add('no-nav');

  const chapterId = query.ch ? Number(query.ch) : null;
  if (chapterId) markPdfOpened(chapterId).catch(console.error);

  const full = query.full === '1';
  const hasRange = query.from && query.to;
  const total = rec.pageCount;
  const rFrom = Math.min(Math.max(1, parseInt(query.from, 10) || 1), total);
  const rTo = Math.min(Math.max(rFrom, parseInt(query.to, 10) || total), total);
  const start = full || !hasRange ? 1 : rFrom;
  const end = full || !hasRange ? total : rTo;
  const isRange = !(start === 1 && end === total);

  el.innerHTML = `
    <div class="pdf-toolbar">
      <button class="icon-btn" data-a="zoom-out" aria-label="${T.pdf.zoomOut}">−</button>
      <button class="icon-btn" data-a="zoom-in" aria-label="${T.pdf.zoomIn}">+</button>
      <button class="pageno btn ghost sm" data-a="goto" aria-label="${T.pdf.goTo}"><span id="pg-cur">${start}</span>&nbsp;/&nbsp;${total}</button>
      <button class="icon-btn" data-a="bookmark" aria-label="${T.pdf.bookmark}" id="bm-btn">☆</button>
      <button class="icon-btn" data-a="note" aria-label="${T.pdf.addNote}">✎</button>
      <button class="icon-btn" data-a="list" aria-label="${T.pdf.notes}">☰</button>
    </div>
    ${hasRange && (isRange || full) ? `
      <div class="pdf-range-note">
        ${isRange ? T.pdf.rangeNote(start, end) : ''}
        <button class="btn ghost sm" data-a="toggle-range">${isRange ? T.pdf.showAll : T.pdf.showRange(rFrom, rTo)}</button>
      </div>` : ''}
    <div class="pdf-pages" id="pages"><p class="pdf-range-note">${T.pdf.loading}</p></div>`;

  let doc;
  try {
    doc = await openPdfDocument(rec.blob);
  } catch (e) {
    console.error(e);
    el.querySelector('#pages').innerHTML = `<div class="empty">${T.pdf.error}: ${esc(e.message)}</div>`;
    return () => document.body.classList.remove('no-nav');
  }

  const pagesEl = el.querySelector('#pages');
  const curEl = el.querySelector('#pg-cur');
  const bmBtn = el.querySelector('#bm-btn');
  let zoomIdx = 0;
  let current = start;
  let notes = await getAllByIndex(S.notes, 'pdfId', id);
  const rendered = new Map();  // pageNum → { task, canvas }
  let destroyed = false;

  // ზომის შესაფასებლად ვიღებთ პირველი გვერდის პროპორციას
  const first = await doc.getPage(start);
  const vp1 = first.getViewport({ scale: 1 });
  const aspect = vp1.height / vp1.width;

  // ---- გვერდების „ადგილების“ შექმნა ----
  const holders = [];
  pagesEl.innerHTML = '';
  for (let n = start; n <= end; n++) {
    const d = document.createElement('div');
    d.className = 'pdf-page';
    d.dataset.page = n;
    d.innerHTML = `<span class="pg-label">${n}</span>`;
    pagesEl.append(d);
    holders.push(d);
  }

  function pageWidth() {
    return Math.floor((pagesEl.clientWidth - 16) * ZOOMS[zoomIdx]);
  }
  function layout() {
    const w = pageWidth();
    for (const h of holders) {
      const a = Number(h.dataset.aspect) || aspect;
      h.style.width = w + 'px';
      h.style.height = Math.round(w * a) + 'px';
    }
  }

  // ---- გვერდის დახატვა / წაშლა ----
  async function draw(holder) {
    const n = Number(holder.dataset.page);
    if (rendered.has(n) || destroyed) return;
    const entry = { task: null, canvas: null };
    rendered.set(n, entry);
    try {
      const page = await doc.getPage(n);
      if (destroyed || !rendered.has(n)) return;
      const base = page.getViewport({ scale: 1 });
      holder.dataset.aspect = base.height / base.width;
      const cssW = pageWidth();
      holder.style.height = Math.round(cssW * (base.height / base.width)) + 'px';
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (cssW / base.width) * dpr });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      entry.canvas = canvas;
      entry.task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
      await entry.task.promise;
      if (rendered.get(n) !== entry) return;
      holder.prepend(canvas);
      trimRendered();
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException') console.error(e);
    }
  }
  function undraw(n) {
    const entry = rendered.get(n);
    if (!entry) return;
    entry.task?.cancel();
    entry.canvas?.remove();
    if (entry.canvas) { entry.canvas.width = 0; entry.canvas.height = 0; } // მეხსიერების გათავისუფლება (iOS)
    rendered.delete(n);
  }
  /** ზედმეტი გვერდების წაშლა — ყველაზე შორს მყოფიდან */
  function trimRendered() {
    if (rendered.size <= MAX_RENDERED) return;
    const far = [...rendered.keys()].sort((a, b) => Math.abs(b - current) - Math.abs(a - current));
    far.slice(0, rendered.size - MAX_RENDERED).forEach(undraw);
  }

  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) draw(en.target);
  }, { rootMargin: '800px 0px' });

  function observeAll() {
    io.disconnect();
    holders.forEach((h) => io.observe(h));
  }

  // ---- მიმდინარე გვერდის დადგენა სქროლისას ----
  let raf = 0;
  let saveTimer = 0;
  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const mid = window.innerHeight / 2;
      for (const h of holders) {
        const r = h.getBoundingClientRect();
        if (r.top <= mid && r.bottom >= mid) { setCurrent(Number(h.dataset.page)); break; }
      }
    });
  }
  function setCurrent(n) {
    if (n === current) return;
    current = n;
    curEl.textContent = n;
    updateBookmarkBtn();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => setSetting(`lastPage:${id}`, n), 600);
  }
  function scrollToPage(n, smooth = false) {
    const h = holders.find((x) => Number(x.dataset.page) === n);
    if (!h) return false;
    const top = h.getBoundingClientRect().top + window.scrollY - (document.querySelector('.topbar').offsetHeight + 56);
    window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    current = n;
    curEl.textContent = n;
    updateBookmarkBtn();
    return true;
  }

  // ---- სანიშნეები ----
  const bookmarkOn = (n) => notes.find((x) => x.type === 'bookmark' && x.page === n);
  function updateBookmarkBtn() {
    const on = !!bookmarkOn(current);
    bmBtn.textContent = on ? '★' : '☆';
    bmBtn.classList.toggle('on', on);
    holders.forEach((h) => {
      const has = !!bookmarkOn(Number(h.dataset.page));
      let m = h.querySelector('.pg-mark');
      if (has && !m) { m = document.createElement('span'); m.className = 'pg-mark'; m.textContent = '🔖'; h.append(m); }
      if (!has && m) m.remove();
    });
  }
  async function toggleBookmark() {
    const b = bookmarkOn(current);
    if (b) {
      await del(S.notes, b.id);
      notes = notes.filter((x) => x !== b);
      toast(T.pdf.bookmarkRemoved);
    } else {
      const rec2 = { pdfId: id, chapterId, page: current, type: 'bookmark', text: '', createdAt: Date.now() };
      rec2.id = await put(S.notes, rec2);
      notes.push(rec2);
      toast(T.pdf.bookmarkAdded);
    }
    updateBookmarkBtn();
  }
  async function addNote(existing) {
    const text = await textDialog(`${T.pdf.addNote} · ${T.pdf.page} ${existing?.page ?? current}`, existing?.text || '', T.pdf.notePlaceholder);
    if (text == null || text === '') return;
    if (existing) {
      existing.text = text;
      await put(S.notes, existing);
    } else {
      const n = { pdfId: id, chapterId, page: current, type: 'note', text, createdAt: Date.now() };
      n.id = await put(S.notes, n);
      notes.push(n);
    }
    toast(T.study.saved);
  }
  function openList() {
    const items = [...notes].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
    const { dialog, close } = sheet(`
      <h3>${T.pdf.notes}</h3>
      ${items.length ? items.map((n) => `
        <div class="list-row">
          <button class="btn sm" data-go="${n.page}">${n.type === 'bookmark' ? '🔖' : '✎'} ${T.pdf.page} ${n.page}</button>
          <div class="grow">${n.type === 'note' ? esc(n.text) : ''}</div>
          ${n.type === 'note' ? `<button class="icon-btn" data-edit="${n.id}" aria-label="${T.common.edit}">${ICON.edit}</button>` : ''}
          <button class="icon-btn" data-del="${n.id}" aria-label="${T.common.delete}">${ICON.trash}</button>
        </div>`).join('') : `<p class="muted">${T.pdf.noNotes}</p>`}
      <div class="btn-row"><button class="btn" data-a="close">${T.common.close}</button></div>`);
    dialog.addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.a === 'close') close();
      if (t.dataset.go) {
        const p = Number(t.dataset.go);
        close();
        // გვერდი დიაპაზონის გარეთაა → მთლიან ფაილზე გადასვლა
        if (!scrollToPage(p)) navigate(`/pdf/${id}?full=1&page=${p}${hasRange ? `&from=${rFrom}&to=${rTo}` : ''}${chapterId ? `&ch=${chapterId}` : ''}`, { replace: true });
      }
      if (t.dataset.edit) { close(); addNote(notes.find((x) => x.id === Number(t.dataset.edit))); }
      if (t.dataset.del) {
        const n = notes.find((x) => x.id === Number(t.dataset.del));
        if (n.type === 'note' && !(await confirmDialog(`${T.common.delete}?`, { danger: true, okLabel: T.common.delete }))) return;
        await del(S.notes, n.id);
        notes = notes.filter((x) => x !== n);
        updateBookmarkBtn();
        close();
        openList();
      }
    });
  }
  function gotoDialog() {
    const { dialog, close } = sheet(`
      <form method="dialog">
        <h3>${T.pdf.goTo}</h3>
        <input type="number" inputmode="numeric" min="1" max="${total}" value="${current}">
        <div class="btn-row">
          <button type="button" class="btn" data-a="no">${T.common.cancel}</button>
          <button class="btn primary">${T.common.ok}</button>
        </div>
      </form>`);
    const inp = dialog.querySelector('input');
    dialog.querySelector('[data-a="no"]').onclick = close;
    dialog.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const p = Math.min(Math.max(1, parseInt(inp.value, 10) || 1), total);
      close();
      if (!scrollToPage(p)) navigate(`/pdf/${id}?full=1&page=${p}${hasRange ? `&from=${rFrom}&to=${rTo}` : ''}${chapterId ? `&ch=${chapterId}` : ''}`, { replace: true });
    };
    setTimeout(() => inp.select(), 50);
  }

  // ---- გადიდება ----
  function setZoom(i) {
    zoomIdx = Math.max(0, Math.min(ZOOMS.length - 1, i));
    const keep = current;
    [...rendered.keys()].forEach(undraw);
    layout();
    scrollToPage(keep);
    observeAll();
  }

  // ---- ღილაკები ----
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'zoom-in') setZoom(zoomIdx + 1);
    if (a === 'zoom-out') setZoom(zoomIdx - 1);
    if (a === 'bookmark') toggleBookmark();
    if (a === 'note') addNote();
    if (a === 'list') openList();
    if (a === 'goto') gotoDialog();
    if (a === 'toggle-range') {
      const q = isRange ? `full=1&from=${rFrom}&to=${rTo}` : `from=${rFrom}&to=${rTo}`;
      navigate(`/pdf/${id}?${q}${chapterId ? `&ch=${chapterId}` : ''}`, { replace: true });
    }
  });

  // ---- გაშვება: საწყისი გვერდი = ?page, ან ბოლოს ნანახი, ან დიაპაზონის დასაწყისი ----
  layout();
  const last = await getSetting(`lastPage:${id}`);
  const wanted = Number(query.page) || last;
  const initial = wanted >= start && wanted <= end ? wanted : start;
  observeAll();
  if (initial !== start) scrollToPage(initial);
  updateBookmarkBtn();

  let resizeTimer = 0;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => setZoom(zoomIdx), 250); };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);

  // ეკრანიდან გასვლისას ყველაფრის გასუფთავება
  return () => {
    destroyed = true;
    io.disconnect();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    clearTimeout(saveTimer);
    if (current) setSetting(`lastPage:${id}`, current);
    [...rendered.keys()].forEach(undraw);
    doc.destroy();
    document.body.classList.remove('no-nav');
  };
}
