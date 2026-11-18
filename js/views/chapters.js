/* =========================================================
   მთავარი ეკრანი: თავების სია სტატუსით და ქულით.
   ========================================================= */

import { setHeader, navigate } from '../router.js';
import { T } from '../strings.ka.js';
import { esc, statusBadge, toast } from '../ui/components.js';
import { loadChaptersWithStatus } from '../core/stats.js';
import { loadDemoChapter } from '../core/demo.js';

export async function renderChapters(el) {
  setHeader(T.chapters.title);
  const rows = await loadChaptersWithStatus();

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

  el.innerHTML = rows.map(chapterItem).join('');
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
