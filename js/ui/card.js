/* =========================================================
   ფლეშქარდის ჩვენება (იყენებს ფლეშქარდების ეკრანი და მეტრო-რეჟიმი).
   წინა მხარე → დაჭერით ბრუნდება → უკანა მხარე + „ვიცი / არ ვიცი“.
   ========================================================= */

import { T } from '../strings.ka.js';
import { esc, richText } from './components.js';

export function cardHtml(c, flipped) {
  return `
    <button type="button" class="flashcard ${flipped ? 'flipped' : ''}" data-a="flip" aria-label="${T.cards.flip}">
      <span class="fc-meta">${c.kind === 'memo' ? '★ ' + T.cards.memo : T.cards.card} · ${T.chapters.chapter} ${c.chapterId}</span>
      <span class="fc-front" lang="${c.kind === 'memo' ? 'en' : 'ka'}">${esc(c.front)}</span>
      ${c.frontSub && flipped ? `<span class="fc-sub">${esc(c.frontSub)}</span>` : ''}
      ${flipped
        ? `<span class="fc-back">${richText(c.back)}</span>${c.formula ? `<code class="fc-formula">${esc(c.formula)}</code>` : ''}`
        : `<span class="fc-hint">${T.cards.tapToFlip}</span>`}
    </button>
    ${flipped ? `
      <div class="btn-row fc-rate">
        <button class="btn danger-soft" data-a="unknown">✗ ${T.cards.dontKnow}</button>
        <button class="btn success-soft" data-a="known">✓ ${T.cards.know}</button>
      </div>` : ''}`;
}
