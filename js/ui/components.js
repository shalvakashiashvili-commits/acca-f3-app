/* =========================================================
   საერთო UI დამხმარეები: HTML-ის escape, ტექსტის ფორმატირება,
   toast შეტყობინებები, დიალოგები, რიცხვების ფორმატი.
   ========================================================= */

import { T } from '../strings.ka.js';

/** HTML-ის უსაფრთხოდ ჩასმა: კონტენტი JSON-იდან მოდის, ამიტომ ყოველთვის escape */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * კონტენტის მარტივი ფორმატირება (escape-ის შემდეგ):
 *  - ცარიელი ხაზი → ახალი აბზაცი
 *  - ხაზები, რომლებიც "- " ან "• "-ით იწყება → სია
 *  - **ტექსტი** → მუქი
 */
export function richText(text) {
  if (!text) return '';
  const blocks = String(text).replace(/\r\n/g, '\n').split(/\n\s*\n/);
  return blocks.map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
      return '<ul>' + lines.map((l) => `<li>${inline(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('') + '</ul>';
    }
    return '<p>' + lines.map(inline).join('<br>') + '</p>';
  }).join('');
}
function inline(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/** რიცხვი ათასების გამყოფით (ინტერვალი): 12500 → "12 500" */
export function fmtNum(n) {
  if (typeof n !== 'number' || !isFinite(n)) return esc(n);
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 }).replace(/,/g, ' ');
}

/** ბაიტები → "12.3 MB" */
export function fmtBytes(b) {
  if (!b && b !== 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(i ? 1 : 0)} ${u[i]}`;
}

/** თარიღი: "3 ნოე 2026" */
export function fmtDate(ts) {
  const m = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ'];
  const d = new Date(ts);
  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
}

/** მილიწამები → "12:05" ან "1:02:05" */
export function fmtDuration(ms) {
  const t = Math.max(0, Math.round((ms || 0) / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

/* ---------- toast ---------- */

/**
 * მოკლე შეტყობინება ეკრანის ქვედა ნაწილში.
 * opts: { type: 'error', action: { label, onClick }, ms }
 */
export function toast(message, opts = {}) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast' + (opts.type === 'error' ? ' error' : '');
  el.textContent = message;
  if (opts.action) {
    const b = document.createElement('button');
    b.className = 'btn sm';
    b.textContent = opts.action.label;
    b.onclick = () => { el.remove(); opts.action.onClick(); };
    el.append(b);
  }
  root.append(el);
  setTimeout(() => el.remove(), opts.ms ?? (opts.action ? 10000 : 3000));
}

/* ---------- დიალოგები (bottom sheet) ---------- */

/**
 * ქვედა ფურცელი (dialog). bodyHtml — შიგთავსი.
 * აბრუნებს { dialog, close } — ღილაკებზე რეაგირება გამომძახებლის საქმეა.
 */
export function sheet(bodyHtml) {
  const d = document.createElement('dialog');
  d.className = 'sheet';
  d.innerHTML = `<div class="sheet-body">${bodyHtml}</div>`;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  // ფონზე დაჭერით დახურვა
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.showModal();
  return { dialog: d, close: () => d.close() };
}

/** დადასტურების დიალოგი → Promise<boolean> */
export function confirmDialog(message, { okLabel = T.common.yes, danger = false } = {}) {
  return new Promise((resolve) => {
    const { dialog, close } = sheet(`
      <p>${esc(message)}</p>
      <div class="btn-row">
        <button class="btn" data-a="no">${T.common.cancel}</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-a="yes">${esc(okLabel)}</button>
      </div>`);
    let answer = false;
    dialog.querySelector('[data-a="yes"]').onclick = () => { answer = true; close(); };
    dialog.querySelector('[data-a="no"]').onclick = close;
    dialog.addEventListener('close', () => resolve(answer));
  });
}

/** ტექსტის შეყვანის დიალოგი → Promise<string|null> */
export function textDialog(title, value = '', placeholder = '') {
  return new Promise((resolve) => {
    const { dialog, close } = sheet(`
      <h3>${esc(title)}</h3>
      <textarea placeholder="${esc(placeholder)}">${esc(value)}</textarea>
      <div class="btn-row">
        <button class="btn" data-a="no">${T.common.cancel}</button>
        <button class="btn primary" data-a="yes">${T.common.save}</button>
      </div>`);
    let answer = null;
    const ta = dialog.querySelector('textarea');
    dialog.querySelector('[data-a="yes"]').onclick = () => { answer = ta.value.trim(); close(); };
    dialog.querySelector('[data-a="no"]').onclick = close;
    dialog.addEventListener('close', () => resolve(answer));
    setTimeout(() => ta.focus(), 50);
  });
}

/** SVG ხატულები (emoji ყველა ტელეფონზე ერთნაირად არ ჩანს) */
export const ICON = {
  trash: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
};

/** სტატუსის ნიშანი */
export function statusBadge(status) {
  return `<span class="badge ${status}">${T.status[status]}</span>`;
}
