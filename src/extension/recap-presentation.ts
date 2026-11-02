import { escapeHtml } from './labels.ts';
import { CARD_HEIGHT, CARD_WIDTH, PERSONAS } from './recap-card.ts';
import { RECAP_TITLE, type Recap } from './recap.ts';

// Static, script-free markup for the recap card and the export section. The share summary (persona, Bobert's line, the big figure and the
// highlights) is the card image's full text alternative and is complete without any script; every figure with its basis follows in the
// collapsed "All figures". The buttons are hidden: only the dashboard script, once it runs, reveals them and wires them to its fixed messages.
const hiddenButton = (id: string, label: string) => `<button type="button" id="${id}" hidden>${label}</button>`;

export function recapSection(recap: Recap): string {
 const c = recap.card, persona = PERSONAS[c.persona];
 const items = recap.lines.map(line => `<li>${escapeHtml(line)}</li>`).join('');
 const highlights = c.highlights.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
 return `<section id="recap-card" aria-labelledby="recap-title"><h2 id="recap-title">${RECAP_TITLE}</h2><p id="recap-period" class="muted small">${escapeHtml(recap.period)}</p>`
  + `<div id="recap-summary"><p class="recap-persona"><strong id="recap-persona">${escapeHtml(persona.title)}</strong> <span id="recap-quip">${escapeHtml(persona.quip)}</span></p>`
  + `<p class="recap-headline"><strong id="recap-big">${escapeHtml(c.big)}</strong> <span id="recap-subline">${escapeHtml(c.subline)}</span></p>`
  + `<dl id="recap-highlights">${highlights}</dl></div>`
  + `<details id="recap-details"><summary>All figures</summary><ul id="recap-lines">${items}</ul></details>`
  + `<figure id="recap-preview" hidden><canvas id="recap-canvas" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" role="img" aria-labelledby="recap-title" aria-describedby="recap-summary"></canvas><figcaption class="muted small">Preview of the image that Share copies and Save image… writes. The text above is its text alternative.</figcaption></figure>`
  + `<p class="recap-actions">${hiddenButton('recap-share', 'Share')} ${hiddenButton('recap-save', 'Save image…')} ${hiddenButton('recap-copy', 'Copy text')} ${hiddenButton('recap-dismiss', 'Dismiss')}</p>`
  + `<p id="recap-status" role="status"></p></section>`;
}
