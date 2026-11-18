/* =========================================================
   თავის სასწავლო ეკრანი:
   PDF → შეჯამება → აუცილებლად დასამახსოვრებელი → გამარტივებული ახსნა
   → საგამოცდო რჩევები → პრაქტიკული ქეისი (ამოხსნა დამალულია).
   სექცია „ნანახად“ ითვლება, როცა მის ბოლომდე ჩამოხვალ.
   ========================================================= */

import { setHeader } from '../router.js';
import { T } from '../strings.ka.js';
import { S, get, getAll, getAllByIndex } from '../db.js';
import { esc, richText, fmtNum, sheet, toast, statusBadge } from '../ui/components.js';
import { listPdfs, resolveChapterPdf, getChapterLink, saveChapterLink } from '../core/pdfstore.js';
import { sectionsFor, chapterStatus } from '../core/stats.js';
import { markSectionSeen } from '../core/progress.js';

const SECTION_LABEL = {
  pdf: T.study.pdf, summary: T.study.summary, memorize: T.study.memorize,
  simple: T.study.simple, tips: T.study.tips, case: T.study.case,
};

export async function renderChapter(el, { id }) {
  const chapterId = Number(id);
  const ch = await get(S.chapters, chapterId);
  if (!ch) {
    setHeader(T.study.notFound, { back: true });
    el.innerHTML = `<div class="empty">${T.study.notFound}</div>`;
    return;
  }
  setHeader(`${T.chapters.chapter} ${ch.id}`, { back: true });

  const [progress, questions, statsAll] = await Promise.all([
    get(S.chapterProgress, chapterId),
    getAllByIndex(S.questions, 'chapterId', chapterId),
    getAll(S.questionStats), // ივსება ეტაპ 2-დან (ქვიზი/ტესტი)
  ]);
  const st = chapterStatus(ch, progress, questions, new Map(statsAll.map((s) => [s.questionId, s])));
  const sections = sectionsFor(ch);
  const seen = new Set(progress?.sectionsSeen || []);
  if (progress?.pdfOpened) seen.add('pdf'); // მხოლოდ chip-ის ნიშნისთვის, სტატუსში არ ითვლება
  const s = ch.summary || {};
  const c = ch.case_study;

  el.innerHTML = `
    <nav class="chips" aria-label="სექციები">
      ${['pdf', ...sections].map((k) => `<a class="chip ${seen.has(k) ? 'seen' : ''}" data-chip="${k}" href="#sec-${k}">${SECTION_LABEL[k]}</a>`).join('')}
    </nav>

    <div class="chapter-head">
      <h2>${esc(ch.title_ka || ch.title_en || T.chapters.stub)}</h2>
      ${ch.title_en && ch.title_ka ? `<p class="t-en">${esc(ch.title_en)}</p>` : ''}
      <p>${statusBadge(st.status)} <small>${T.study.seenOf(st.seen, st.sectionsTotal)} · ${questions.length} ${T.chapters.questions}</small></p>
    </div>

    <section class="study-section" id="sec-pdf">
      <div class="section-title">${T.study.pdf}</div>
      <div class="card" id="pdf-box">${T.common.loading}</div>
    </section>

    ${sections.includes('summary') ? `
    <section class="study-section" id="sec-summary" data-sec="summary">
      <div class="section-title">${T.study.summary}</div>
      <div class="card rich">
        ${richText(s.short_ka)}
        ${s.key_points_ka?.length ? `<h3>${T.study.keyPoints}</h3><ul>${s.key_points_ka.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      </div>
      <i data-end="summary"></i>
    </section>` : ''}

    ${sections.includes('memorize') ? `
    <section class="study-section" id="sec-memorize" data-sec="memorize">
      <div class="section-title">★ ${T.study.memorize}</div>
      <div class="memo">
        ${s.must_memorize.map((m) => `
          <div class="memo-item">
            <div class="memo-term">${esc(m.term_ka || m.term_en)}${m.term_ka && m.term_en ? ` <span class="en">· ${esc(m.term_en)}</span>` : ''}</div>
            ${m.definition_ka ? `<div class="rich">${richText(m.definition_ka)}</div>` : ''}
            ${m.formula ? `<div class="formula">${esc(m.formula)}</div>` : ''}
          </div>`).join('')}
      </div>
      <i data-end="memorize"></i>
    </section>` : ''}

    ${sections.includes('simple') ? `
    <section class="study-section" id="sec-simple" data-sec="simple">
      <div class="section-title">${T.study.simple}</div>
      <div class="card rich">${richText(s.simple_explanation_ka)}</div>
      <i data-end="simple"></i>
    </section>` : ''}

    ${sections.includes('tips') ? `
    <section class="study-section" id="sec-tips" data-sec="tips">
      <div class="section-title">${T.study.tips}</div>
      <div class="card"><ul class="tips">${s.exam_tips_ka.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
      <i data-end="tips"></i>
    </section>` : ''}

    ${sections.includes('case') ? `
    <section class="study-section" id="sec-case" data-sec="case">
      <div class="section-title">${T.study.case}</div>
      <div class="card">
        ${c.title_ka ? `<h3>${esc(c.title_ka)}</h3>` : ''}
        <div class="rich">${richText(c.scenario_ka)}</div>
        ${c.tasks_ka?.length ? `<h3>${T.study.tasks}</h3><ol>${c.tasks_ka.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>` : ''}
        ${c.solution_ka || c.journal_entries?.length ? `
          <button class="btn primary block" id="toggle-solution" aria-expanded="false">${T.study.showSolution}</button>
          <div class="solution" id="solution" hidden>
            <h3>${T.study.solution}</h3>
            <div class="rich">${richText(c.solution_ka)}</div>
            ${c.journal_entries?.length ? journalTable(c.journal_entries) : ''}
          </div>` : ''}
      </div>
      <i data-end="case"></i>
    </section>` : ''}
  `;

  // ---- ამოხსნის ჩვენება/დამალვა ----
  const tBtn = el.querySelector('#toggle-solution');
  if (tBtn) tBtn.onclick = () => {
    const sol = el.querySelector('#solution');
    sol.hidden = !sol.hidden;
    tBtn.setAttribute('aria-expanded', String(!sol.hidden));
    tBtn.textContent = sol.hidden ? T.study.showSolution : T.study.hideSolution;
    tBtn.classList.toggle('primary', sol.hidden);
  };

  // ---- chips: გლუვი გადასვლა სექციაზე (hash-ს არ ვცვლით, რომ router არ ამოქმედდეს) ----
  el.querySelector('.chips').addEventListener('click', (e) => {
    const a = e.target.closest('[data-chip]');
    if (!a) return;
    e.preventDefault();
    el.querySelector('#sec-' + a.dataset.chip)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---- „ნანახად“ მონიშვნა: როცა სექციის ბოლო ეკრანზე გამოჩნდება ----
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const key = en.target.dataset.end;
      io.unobserve(en.target);
      if (seen.has(key)) continue;
      seen.add(key);
      markSectionSeen(chapterId, key).catch(console.error);
      el.querySelector(`[data-chip="${key}"]`)?.classList.add('seen');
    }
  });
  el.querySelectorAll('[data-end]').forEach((n) => io.observe(n));

  // ---- PDF ბლოკი ----
  await renderPdfBox(el.querySelector('#pdf-box'), ch);

  return () => io.disconnect();
}

/** PDF ღილაკები (წიგნი / კრებული) და მიბმის რედაქტირება */
async function renderPdfBox(box, ch) {
  const [pdfs, link] = await Promise.all([listPdfs(), getChapterLink(ch.id)]);
  const book = resolveChapterPdf(ch, 'book', pdfs, link);
  const kit = resolveChapterPdf(ch, 'kit', pdfs, link);

  const btn = (slot, r) => {
    if (!r) return '';
    if (r.missing) return `<p class="muted">${T.study[slot]}: ${T.study.pdfMissing}</p>`;
    const range = r.whole ? T.study.wholeFile : `${T.study.pages} ${r.from}–${r.to}`;
    return `<a class="btn ${slot === 'book' ? 'primary' : ''}" href="#/pdf/${r.pdf.id}?from=${r.from}&to=${r.to}&ch=${ch.id}">
      ${slot === 'book' ? '📖' : '📝'} ${T.study[slot]} · ${range}</a>`;
  };

  box.innerHTML = `
    ${!book && !kit ? `<p class="muted">${T.study.noPdf}</p>` : ''}
    <div class="btn-row">${btn('book', book)}${btn('kit', kit)}</div>
    <button class="btn ghost block" id="edit-link">⚙ ${T.study.linkEdit}</button>`;
  box.querySelector('#edit-link').onclick = () => openLinkEditor(box, ch, pdfs, link);
}

/** ხელით მიბმის ფორმა (bottom sheet) */
function openLinkEditor(box, ch, pdfs, link) {
  const kindLabel = { book: T.library.kindBook, kit: T.library.kindKit, chapter: T.library.kindChapter };
  const slotForm = (slot) => {
    const cur = link?.[slot];
    const sel = cur ? cur.pdfId : 'auto';
    const def = ch.pdf_pages?.[slot];
    return `
      <h3>${T.study[slot]}</h3>
      <label class="field"><span>PDF</span>
        <select name="${slot}-pdf">
          <option value="auto" ${sel === 'auto' ? 'selected' : ''}>${T.study.linkAuto}</option>
          <option value="none" ${sel === 'none' ? 'selected' : ''}>${T.study.linkNone}</option>
          ${pdfs.map((p) => `<option value="${p.id}" ${sel === p.id ? 'selected' : ''}>${esc(p.name)} (${kindLabel[p.kind]}, ${p.pageCount} ${T.library.pages})</option>`).join('')}
        </select>
      </label>
      <div class="grid-2">
        <label class="field"><span>${T.study.from}</span><input type="number" inputmode="numeric" min="1" name="${slot}-from" value="${cur?.from ?? ''}" placeholder="${def ? def[0] : ''}"></label>
        <label class="field"><span>${T.study.to}</span><input type="number" inputmode="numeric" min="1" name="${slot}-to" value="${cur?.to ?? ''}" placeholder="${def ? def[1] : ''}"></label>
      </div>`;
  };

  const { dialog, close } = sheet(`
    <form method="dialog" id="link-form">
      <h3>${T.study.linkEdit}</h3>
      <p class="muted"><small>ცარიელი გვერდები = JSON-ის pdf_pages (ცალკე თავის PDF-ზე — მთლიანი ფაილი).</small></p>
      ${slotForm('book')}
      ${slotForm('kit')}
      <div class="btn-row">
        <button type="button" class="btn" data-a="cancel">${T.common.cancel}</button>
        <button type="submit" class="btn primary">${T.study.save}</button>
      </div>
    </form>`);
  dialog.querySelector('[data-a="cancel"]').onclick = close;
  dialog.querySelector('#link-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const rec = { chapterId: ch.id };
    for (const slot of ['book', 'kit']) {
      const pdfId = f.get(`${slot}-pdf`);
      const from = parseInt(f.get(`${slot}-from`), 10) || null;
      const to = parseInt(f.get(`${slot}-to`), 10) || null;
      if (pdfId === 'auto') continue;         // ავტომატური = ჩანაწერის გარეშე
      rec[slot] = { pdfId, from, to: to && from && to < from ? from : to };
    }
    await saveChapterLink(rec);
    close();
    toast(T.study.saved);
    renderPdfBox(box, ch);
  };
}

/** საბუღალტრო გატარებების ცხრილი */
function journalTable(rows) {
  return `
    <h3>${T.study.journal}</h3>
    <table class="je">
      <thead><tr><th>${T.study.dr} / ${T.study.cr}</th><th class="amt">${T.study.amount}</th><th>${T.study.note}</th></tr></thead>
      <tbody>
        ${rows.map((j) => `
          <tr>
            <td><div><strong>Dr</strong> ${esc(j.dr)}</div><div class="cr"><strong>Cr</strong> ${esc(j.cr)}</div></td>
            <td class="amt">${fmtNum(j.amount)}</td>
            <td class="note">${esc(j.note_ka || '')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}
