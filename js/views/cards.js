/* =========================================================
   ფლეშქარდები: #/cards[?ch=3]
   ბარათები = თავის flashcards + „აუცილებლად დასამახსოვრებელი“ (must_memorize).
   პარამეტრები (თავები, „მხოლოდ არ ვიცი“) → ბარათების წყება →
   დაჭერით გადაბრუნება → „ვიცი / არ ვიცი“ (მაშინვე ინახება).
   ========================================================= */

import { setHeader } from '../router.js';
import { T } from '../strings.ka.js';
import { S, getAll, getSetting, setSetting } from '../db.js';
import { esc } from '../ui/components.js';
import { cardHtml } from '../ui/card.js';
import { loadCards, orderCards, cardState, rateCard } from '../core/cards.js';

export async function renderCards(el, _params, query) {
  setHeader(T.cards.title, { back: true });
  const chapters = (await getAll(S.chapters)).sort((a, b) => a.id - b.id);
  const saved = (await getSetting('cardFilters')) || {};
  const f = { chapterIds: null, onlyUnknown: false, ...saved };
  if (query.ch) f.chapterIds = query.ch.split(',').map(Number);
  if (f.chapterIds) {
    f.chapterIds = f.chapterIds.filter((id) => chapters.some((c) => c.id === id));
    if (!f.chapterIds.length) f.chapterIds = null;
  }

  let deck = null;   // მიმდინარე წყება
  let pos = 0;
  let flipped = false;
  let tally = { known: 0, unknown: 0 };

  async function renderSetup() {
    const cards = await loadCards({ chapterIds: f.chapterIds });
    const n = { new: 0, unknown: 0, known: 0 };
    cards.forEach((c) => n[cardState(c)]++);
    const available = orderCards(cards, f).length;
    el.innerHTML = `
      <div class="section-title">${T.practice.chapters}</div>
      <div class="chip-wrap" id="chapters">
        <button class="chip ${!f.chapterIds ? 'on' : ''}" data-ch="all">${T.practice.allChapters}</button>
        ${chapters.map((c) => `<button class="chip ${f.chapterIds?.includes(c.id) ? 'on' : ''}" data-ch="${c.id}" title="${esc(c.title_ka || c.title_en || '')}">${T.chapters.chapter} ${c.id}</button>`).join('')}
      </div>
      <div class="card card-counts">
        <div><strong>${n.new}</strong><small>${T.cards.stNew}</small></div>
        <div><strong class="bad-text">${n.unknown}</strong><small>${T.cards.stUnknown}</small></div>
        <div><strong class="ok-text">${n.known}</strong><small>${T.cards.stKnown}</small></div>
      </div>
      <label class="toggle-row card">
        <input type="checkbox" id="only-unknown" ${f.onlyUnknown ? 'checked' : ''}>
        <span>${T.cards.onlyUnknown}</span>
      </label>
      <p class="muted hint"><small>${T.cards.rule}</small></p>
      ${cards.length ? '' : `<p class="pool-info">${T.cards.none}</p>`}
      <button class="btn primary block" data-a="start" ${available ? '' : 'disabled'}>${T.cards.start(available)}</button>`;
  }

  function renderDeck() {
    if (pos >= deck.length) {
      el.innerHTML = `
        <div class="card result-hero">
          <div class="big">🎴</div>
          <div class="sub">${T.cards.done}</div>
          <div class="stats"><span class="ok-text">✓ ${T.cards.know}: ${tally.known}</span><span class="bad-text">✗ ${T.cards.dontKnow}: ${tally.unknown}</span></div>
        </div>
        <div class="btn-row">
          <button class="btn primary" data-a="again">${T.cards.again}</button>
          <button class="btn" data-a="setup">${T.cards.settings}</button>
        </div>`;
      return;
    }
    el.innerHTML = `
      <div class="run-top">
        <div class="progress-line"><strong>${pos + 1} / ${deck.length}</strong>
          <span class="ok-text">✓ ${tally.known}</span><span class="bad-text">✗ ${tally.unknown}</span></div>
        <div class="bar"><i style="width:${Math.round((pos / deck.length) * 100)}%"></i></div>
      </div>
      ${cardHtml(deck[pos], flipped)}`;
  }

  async function start() {
    await setSetting('cardFilters', f);
    deck = orderCards(await loadCards({ chapterIds: f.chapterIds }), f);
    pos = 0; flipped = false; tally = { known: 0, unknown: 0 };
    document.body.classList.add('no-nav');
    renderDeck();
  }

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.ch) {
      if (b.dataset.ch === 'all') f.chapterIds = null;
      else {
        const set = new Set(f.chapterIds || []);
        const id = Number(b.dataset.ch);
        set.has(id) ? set.delete(id) : set.add(id);
        f.chapterIds = set.size ? [...set].sort((x, y) => x - y) : null;
      }
      renderSetup();
      return;
    }
    const a = b.dataset.a;
    if (a === 'start' || a === 'again') start();
    if (a === 'setup') { document.body.classList.remove('no-nav'); renderSetup(); }
    if (a === 'flip') { flipped = !flipped; renderDeck(); }
    if (a === 'known' || a === 'unknown') {
      b.disabled = true;
      await rateCard(deck[pos], a === 'known');
      tally[a]++;
      // „არ ვიცი“ → ბარათი ამ წყების ბოლოს კიდევ ერთხელ გამოჩნდება
      if (a === 'unknown' && !deck[pos]._repeat) deck.push({ ...deck[pos], _repeat: true });
      pos++; flipped = false;
      renderDeck();
    }
  });
  el.addEventListener('change', (e) => {
    if (e.target.id === 'only-unknown') { f.onlyUnknown = e.target.checked; renderSetup(); }
  });

  await renderSetup();
  return () => document.body.classList.remove('no-nav');
}
