/* =========================================================
   ბიბლიოთეკა: თავების JSON-ის იმპორტი, PDF-ების ატვირთვა,
   იმპორტირებული თავებისა და ფაილების მართვა.
   ========================================================= */

import { setHeader } from '../router.js';
import { T } from '../strings.ka.js';
import { S, getAll } from '../db.js';
import { esc, fmtBytes, fmtDate, toast, confirmDialog, ICON } from '../ui/components.js';
import { importJsonFiles, deleteChapterContent } from '../import/importer.js';
import { addPdf, deletePdf, listPdfs } from '../core/pdfstore.js';
import { loadDemoChapter } from '../core/demo.js';

const KIND_LABEL = { book: T.library.kindBook, kit: T.library.kindKit, chapter: T.library.kindChapter };

export async function renderLibrary(el) {
  setHeader(T.library.title);
  let pdfKind = 'book';

  el.innerHTML = `
    <div class="section-title">${T.library.jsonSection}</div>
    <div class="card">
      <p class="muted"><small>${T.library.jsonHint}</small></p>
      <div class="btn-row">
        <label class="btn primary file-drop">📄 ${T.library.chooseJson}
          <input type="file" id="json-input" accept=".json,application/json" multiple>
        </label>
        <button class="btn" id="demo">${T.chapters.loadDemo}</button>
      </div>
      <div id="report"></div>
    </div>

    <div class="section-title">${T.library.pdfSection}</div>
    <div class="card">
      <label class="field"><span>${T.library.kind}</span></label>
      <div class="segmented" id="kind">
        <button data-k="book" class="on">${T.library.kindBook}</button>
        <button data-k="kit">${T.library.kindKit}</button>
        <button data-k="chapter">${T.library.kindChapter}</button>
      </div>
      <label class="field" id="chapter-pick" hidden style="margin-top:12px"><span>${T.library.forChapter}</span>
        <select id="chapter-select"></select>
      </label>
      <p class="muted" style="margin-top:10px"><small>${T.library.pdfHint}</small></p>
      <label class="btn primary block file-drop">📚 ${T.library.choosePdf}
        <input type="file" id="pdf-input" accept="application/pdf,.pdf" multiple>
      </label>
      <div id="pdf-list" style="margin-top:12px"></div>
    </div>

    <div class="section-title">${T.library.chaptersSection}</div>
    <div class="card" id="chapter-list"></div>

    <p class="muted" id="storage" style="text-align:center"><small></small></p>`;

  const chapterSelect = el.querySelector('#chapter-select');

  async function refresh() {
    const [chapters, questions, pdfs] = await Promise.all([getAll(S.chapters), getAll(S.questions), listPdfs()]);
    chapters.sort((a, b) => a.id - b.id);
    const chTitle = (c) => `${T.chapters.chapter} ${c.id}: ${c.title_ka || c.title_en || T.chapters.stub}`;

    chapterSelect.innerHTML = chapters.length
      ? chapters.map((c) => `<option value="${c.id}">${esc(chTitle(c))}</option>`).join('')
      : `<option value="">${T.library.noChapters}</option>`;

    el.querySelector('#pdf-list').innerHTML = pdfs.length ? pdfs.map((p) => `
      <div class="list-row">
        <div class="grow">
          <a class="name" href="#/pdf/${p.id}">${esc(p.name)}</a><br>
          <small class="muted">${KIND_LABEL[p.kind]}${p.kind === 'chapter' ? ` · ${T.chapters.chapter} ${p.chapterId}` : ''} · ${p.pageCount} ${T.library.pages} · ${fmtBytes(p.size)}</small>
        </div>
        <button class="icon-btn" data-del-pdf="${p.id}" aria-label="${T.library.deletePdf}">${ICON.trash}</button>
      </div>`).join('') : `<p class="muted">${T.library.noPdfs}</p>`;

    const counts = new Map();
    questions.forEach((q) => {
      const c = counts.get(q.chapterId) || { app: 0, kit: 0, book: 0 };
      c[q.source] = (c[q.source] || 0) + 1;
      counts.set(q.chapterId, c);
    });
    el.querySelector('#chapter-list').innerHTML = chapters.length ? chapters.map((c) => {
      const n = counts.get(c.id) || { app: 0, kit: 0, book: 0 };
      return `
        <div class="list-row">
          <div class="grow">
            <a class="name" href="#/chapter/${c.id}">${esc(chTitle(c))}</a><br>
            <small class="muted">${T.source.app}: ${n.app} · ${T.source.kit}: ${n.kit} · ${T.source.book}: ${n.book} · ${(c.flashcards || []).length} 🃏 · ${fmtDate(c.importedAt)}</small>
          </div>
          <button class="icon-btn" data-del-ch="${c.id}" aria-label="${T.library.deleteChapter}">${ICON.trash}</button>
        </div>`;
    }).join('') : `<p class="muted">${T.library.noChapters}</p>`;

    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      el.querySelector('#storage small').textContent = T.library.storage(fmtBytes(est.usage), fmtBytes(est.quota));
    }
  }

  function showReport(reports) {
    el.querySelector('#report').innerHTML = `
      <div class="report">
        <h3 style="margin-top:12px">${T.library.reportTitle}</h3>
        ${reports.map((r) => `
          <div style="margin-bottom:10px">
            <strong>${r.ok ? '✅' : '❌'} ${esc(r.name)}</strong>
            <ul>${r.lines.map((l) => `<li class="${l.cls}">${esc(l.text)}</li>`).join('')}</ul>
          </div>`).join('')}
      </div>`;
  }

  // ---- JSON იმპორტი ----
  el.querySelector('#json-input').onchange = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const reports = await importJsonFiles(files);
    showReport(reports);
    await refresh();
    requestPersist();
  };
  el.querySelector('#demo').onclick = async () => {
    showReport([await loadDemoChapter()]);
    await refresh();
  };

  // ---- PDF ტიპის არჩევა ----
  el.querySelector('#kind').onclick = (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    pdfKind = b.dataset.k;
    el.querySelectorAll('#kind button').forEach((x) => x.classList.toggle('on', x === b));
    el.querySelector('#chapter-pick').hidden = pdfKind !== 'chapter';
  };

  // ---- PDF ატვირთვა (თანმიმდევრობით, რომ ტელეფონის მეხსიერება არ გადაივსოს) ----
  el.querySelector('#pdf-input').onchange = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const chapterId = pdfKind === 'chapter' ? Number(chapterSelect.value) || null : null;
    if (pdfKind === 'chapter' && !chapterId) { toast(T.library.noChapters, { type: 'error' }); return; }
    for (const f of files) {
      if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { toast(T.library.notPdf(f.name), { type: 'error' }); continue; }
      toast(`${T.library.saving} ${f.name}`);
      try {
        const rec = await addPdf(f, pdfKind, chapterId);
        toast(T.library.pdfSaved(rec.pageCount));
      } catch (err) {
        console.error(err);
        toast(`${f.name}: ${err.message}`, { type: 'error' });
      }
    }
    await refresh();
    requestPersist();
  };

  // ---- წაშლა ----
  el.addEventListener('click', async (e) => {
    const p = e.target.closest('[data-del-pdf]');
    const c = e.target.closest('[data-del-ch]');
    if (p) {
      const pdfs = await listPdfs();
      const rec = pdfs.find((x) => x.id === p.dataset.delPdf);
      if (await confirmDialog(T.library.confirmDeletePdf(rec?.name || ''), { danger: true, okLabel: T.common.delete })) {
        await deletePdf(p.dataset.delPdf);
        toast(T.library.deleted);
        refresh();
      }
    }
    if (c) {
      const id = Number(c.dataset.delCh);
      if (await confirmDialog(T.library.confirmDeleteChapter(id), { danger: true, okLabel: T.common.delete })) {
        await deleteChapterContent(id);
        toast(T.library.deleted);
        refresh();
      }
    }
  });

  await refresh();
}

/** ბრაუზერს ვთხოვთ, მონაცემები არ წაშალოს მეხსიერების ნაკლებობისას */
function requestPersist() {
  navigator.storage?.persist?.().catch(() => {});
}
