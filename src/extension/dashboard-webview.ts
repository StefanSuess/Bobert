import {reconcileAdvisorDraft} from './advisor-draft.js';
import {BOBERT, BRAND, CARD_FOOTER, CARD_HEIGHT, CARD_WIDTH, MAX_HIGHLIGHTS, cardLayout, encodePng, personaByTitle, toBase64, wrapText, type Mood} from './recap-card.js';
import {ACTION_CODES, ACTION_NAMES, ACTION_TEXT, type ActionCode, type ActionName} from './recap-actions.js';
// Bundled separately into one nonce'd inline script. No Node or extension APIs are available here.
type DomNode = { kind: 'text'; text: string } | DomElement;
interface DomElement { kind: 'element'; tag: string; attrs: Record<string, string>; children: DomNode[] }

declare function acquireVsCodeApi(): { postMessage(message: object): void };
const vscode = acquireVsCodeApi();
const load = Number(document.documentElement.getAttribute('data-cg-load'));
const TAGS = new Set('main section article div h1 h2 h3 h4 p span dl dt dd details summary table caption thead tbody tr th td footer form fieldset legend label select option input button a svg defs pattern line rect circle polygon path text title desc ul li figure figcaption strong em small br canvas'.split(' '));
const ATTRS = new Set('id class role aria-label aria-hidden aria-labelledby aria-describedby aria-live aria-atomic aria-invalid scope type name for value data-advisor-epoch data-plan data-billing data-add-ons data-add-on-credits data-hint data-kind data-chart-point tabindex hidden x y x1 x2 y1 y2 cx cy r width height viewBox preserveAspectRatio d points text-anchor patternUnits patternTransform stroke-dasharray stroke-width stroke-opacity stroke-linecap fill-opacity'.split(' '));
const SAFE_LINKS = new Set(['https://open-vsx.org/extension/StefanSuess/bobert/reviews', 'https://github.com/StefanSuess/Bobert', 'https://ko-fi.com/stefansuess', 'https://github.com/StefanSuess/Bobert/blob/main/docs/credit-tips.md', 'command:bobert.costAdvisor', 'command:bobert.auditWorkspace', 'command:bobert.audit.show', 'command:bobert.share', 'command:bobert.reportProblem']);
const SVG = 'http://www.w3.org/2000/svg';
// `hidden` is allowed only on these ids, each on its own tag; the script reveals them once it runs.
const HIDDEN_IDS: Record<string, string> = Object.assign(Object.create(null), { 'chart-tooltip': 'p', 'advisor-review-again': 'button', 'advisor-confirm': 'button', 'advisor-change-open': 'button', 'recap-share': 'button', 'recap-save': 'button', 'recap-copy': 'button', 'recap-dismiss': 'button', 'export-csv': 'button', 'recap-preview': 'figure' });
// Literal DOM sinks make the permitted grammar explicit even if an inbound model is hostile.
const HTML_ELEMENTS: Record<string, () => Element> = {
 main: () => document.createElement('main'), section: () => document.createElement('section'), article: () => document.createElement('article'), div: () => document.createElement('div'),
 h1: () => document.createElement('h1'), h2: () => document.createElement('h2'), h3: () => document.createElement('h3'), h4: () => document.createElement('h4'),
 p: () => document.createElement('p'), span: () => document.createElement('span'), dl: () => document.createElement('dl'), dt: () => document.createElement('dt'), dd: () => document.createElement('dd'),
 details: () => document.createElement('details'), summary: () => document.createElement('summary'), table: () => document.createElement('table'), caption: () => document.createElement('caption'),
 thead: () => document.createElement('thead'), tbody: () => document.createElement('tbody'), tr: () => document.createElement('tr'), th: () => document.createElement('th'), td: () => document.createElement('td'),
 footer: () => document.createElement('footer'), form: () => document.createElement('form'), fieldset: () => document.createElement('fieldset'), legend: () => document.createElement('legend'), label: () => document.createElement('label'), select: () => document.createElement('select'), option: () => document.createElement('option'), input: () => document.createElement('input'), button: () => document.createElement('button'), ul: () => document.createElement('ul'), li: () => document.createElement('li'), figure: () => document.createElement('figure'),
 figcaption: () => document.createElement('figcaption'), canvas: () => document.createElement('canvas'), strong: () => document.createElement('strong'), em: () => document.createElement('em'), small: () => document.createElement('small'), br: () => document.createElement('br'),
};
const SVG_ELEMENTS: Record<string, () => Element> = {
 svg: () => document.createElementNS(SVG, 'svg'), defs: () => document.createElementNS(SVG, 'defs'), pattern: () => document.createElementNS(SVG, 'pattern'),
 line: () => document.createElementNS(SVG, 'line'), rect: () => document.createElementNS(SVG, 'rect'), circle: () => document.createElementNS(SVG, 'circle'),
 polygon: () => document.createElementNS(SVG, 'polygon'), path: () => document.createElementNS(SVG, 'path'), text: () => document.createElementNS(SVG, 'text'),
 title: () => document.createElementNS(SVG, 'title'), desc: () => document.createElementNS(SVG, 'desc'),
};

function valid(node: unknown, depth = 0, budget = { n: 0 }): node is DomNode {
 if (!node || typeof node !== 'object' || ++budget.n > 20_000 || depth > 80) return false;
 const n = node as Record<string, unknown>;
 if (n.kind === 'text') return Object.keys(n).length === 2 && typeof n.text === 'string' && n.text.length <= 4096;
 if (n.kind !== 'element' || typeof n.tag !== 'string' || !TAGS.has(n.tag) || !n.attrs || typeof n.attrs !== 'object' || Array.isArray(n.attrs) || !Array.isArray(n.children)) return false;
 if (Object.keys(n).length !== 4 || n.children.length > 10_000) return false;
 for (const [name, value] of Object.entries(n.attrs)) if (!ATTRS.has(name) || typeof value !== 'string' || value.length > 4096) {
  // Links are fixed in the static document; the script never writes URL attributes.
  if (name !== 'href' || n.tag !== 'a' || typeof value !== 'string' || !SAFE_LINKS.has(value)) return false;
 }
 const attrs = n.attrs as Record<string, string>;
 const tag = n.tag as string;
 if (Object.entries(attrs as Record<string,string>).some(([name,value]) =>
  ['data-advisor-epoch','data-plan','data-billing','data-add-ons','data-add-on-credits'].includes(name) && tag !== 'form' ||
  name === 'value' && (tag !== 'option' || !['unsure','free','pro','pro_plus','pro_max','power','reset','consumer_prepaid','enterprise_postpaid','none','some'].includes(value)) ||
  name === 'type' && !(tag === 'input' && value === 'text' || tag === 'button' && ['submit','button'].includes(value)) ||
  name === 'name' && (!['input','select'].includes(tag) || !['plan','billing','addOns','addOnCredits'].includes(value)) ||
  name === 'for' && (tag !== 'label' || !['advisor-plan','advisor-billing','advisor-add-ons','advisor-credits'].includes(value)) ||
  name === 'aria-invalid' && (!['input','select'].includes(tag) || !['true','false'].includes(value)))) return false;
 if (Object.hasOwn(attrs, 'data-chart-point') && (!['circle', 'polygon'].includes(n.tag) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(attrs['data-chart-point']!))) return false;
 if (Object.hasOwn(attrs, 'tabindex') && (!['circle', 'polygon'].includes(n.tag) || !['0', '-1'].includes(attrs.tabindex!))) return false;
 if (Object.hasOwn(attrs, 'aria-live') && (!['dd','p'].includes(n.tag) || attrs['aria-live'] !== 'polite')) return false;
 if (Object.hasOwn(attrs, 'aria-atomic') && (n.tag !== 'dd' || attrs['aria-atomic'] !== 'true')) return false;
 if (Object.hasOwn(attrs, 'data-hint') && (tag !== 'button' || attrs.id !== 'advisor-confirm' || !['free','pro','pro_plus','pro_max','power'].includes(attrs['data-hint']!))) return false;
 if (Object.hasOwn(attrs, 'hidden') && (HIDDEN_IDS[attrs.id ?? ''] !== n.tag || attrs.hidden !== '')) return false;
 if (n.tag === 'canvas' && (attrs.id !== 'recap-canvas' || attrs.width !== String(CARD_WIDTH) || attrs.height !== String(CARD_HEIGHT) || n.children.length)) return false;
 return n.children.every(child => valid(child, depth + 1, budget));
}

function anchors(node: Node): Element[] {
 const found: Element[] = [];
 for (const child of Array.from(node.childNodes)) {
  if (child.nodeType === Node.ELEMENT_NODE && (child as Element).localName === 'a') found.push(child as Element);
  found.push(...anchors(child));
 }
 return found;
}

function create(node: DomNode, svg: boolean, links: Element[]): Node {
 if (node.kind === 'text') return document.createTextNode(node.text);
 if (node.tag === 'a') {
  const index = links.findIndex(link => link.getAttribute('href') === node.attrs.href);
  if (index < 0) throw new Error('DASHBOARD_ANCHOR');
  const anchor = links.splice(index, 1)[0]!;
  update(anchor, node, false, links);
  return anchor;
 }
 const inSvg = svg || node.tag === 'svg';
 const factories = inSvg ? SVG_ELEMENTS : HTML_ELEMENTS;
 if (!Object.hasOwn(factories, node.tag)) throw new Error('DASHBOARD_TAG');
 const element = factories[node.tag]!();
 for (const [name, value] of Object.entries(node.attrs)) element.setAttribute(name, value);
 for (const child of node.children) element.appendChild(create(child, inSvg, links));
 return element;
}

function update(element: Element, next: DomElement, svg: boolean, links: Element[]): void {
 if (next.tag === 'a' && element.getAttribute('href') !== next.attrs.href) throw new Error('DASHBOARD_LINK_CHANGED');
 for (const attr of Array.from(element.attributes)) if (attr.name !== 'open' && attr.name !== 'href' && !Object.hasOwn(next.attrs, attr.name)) element.removeAttribute(attr.name);
 for (const [name, value] of Object.entries(next.attrs)) {
  if (name !== 'href' && element.getAttribute(name) !== value) element.setAttribute(name, value);
 }
 reconcile(element, next.children, svg || next.tag === 'svg', links);
}

function reconcile(parent: Node, wanted: DomNode[], svg: boolean, links: Element[]): void {
 for (let i = 0; i < wanted.length; i++) {
  const next = wanted[i]!, old = parent.childNodes[i];
  if (!old) { parent.appendChild(create(next, svg, links)); continue; }
  if (next.kind === 'text') {
   if (old.nodeType !== Node.TEXT_NODE) parent.insertBefore(create(next, svg, links), old);
   else if (old.textContent !== next.text) old.textContent = next.text;
   continue;
  }
  if (old.nodeType !== Node.ELEMENT_NODE || (old as Element).localName !== next.tag) { parent.insertBefore(create(next, svg, links), old); continue; }
  const element = old as Element;
  update(element, next, svg, links);
 }
 while (parent.childNodes.length > wanted.length) parent.removeChild(parent.lastChild!);
}

const points = (): Element[] => Array.from(document.querySelectorAll('[data-chart-point]'));
const tooltip = (): Element | null => document.querySelector('#chart-tooltip');
let selectedAt: string | null = null, hoveredAt: string | null = null;
function point(target: EventTarget | null): Element | null {
 let node = target as Element | null;
 while (node && node !== document.querySelector('main')) {
  if (node.getAttribute?.('data-chart-point') !== null && node.getAttribute?.('data-chart-point') !== undefined) return node;
  node = node.parentNode as Element | null;
 }
 return null;
}
function show(p: Element): void {
 const tip = tooltip(); if (!tip) return;
 tip.textContent = p.getAttribute('aria-label') ?? '';
 tip.removeAttribute('hidden');
}
function hide(): void { tooltip()?.setAttribute('hidden', ''); }
function select(p: Element, focus: boolean): void {
 selectedAt = p.getAttribute('data-chart-point');
 for (const item of points()) item.setAttribute('tabindex', item === p ? '0' : '-1');
 if (focus) (p as HTMLElement).focus();
 show(p);
}
window.addEventListener('focusin', event => {
 const p = point(event.target); if (p) select(p, false);
});
window.addEventListener('focusout', event => {
 if (point(event.target) && !point(event.relatedTarget) && event.relatedTarget !== tooltip() && !hoveredAt) hide();
});
window.addEventListener('pointerover', event => {
 const p = point(event.target); if (p) { hoveredAt = p.getAttribute('data-chart-point'); show(p); }
});
window.addEventListener('pointerout', event => {
 const frame = tooltip()?.parentNode;
 if (!frame || !event.target || !frame.contains(event.target as Node)) return;
 if (event.relatedTarget && frame.contains(event.relatedTarget as Node)) return;
 hoveredAt = null;
 if (!point(document.activeElement)) hide();
});
window.addEventListener('keydown', event => {
 if (event.key === 'Escape' && tooltip()?.getAttribute('hidden') === null) {
  hoveredAt = null; hide(); event.preventDefault(); return;
 }
 const p = point(event.target); if (!p) return;
 const list = points(), index = list.indexOf(p);
 if (index < 0) return;
 const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? Math.min(index + 1, list.length - 1)
  : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? Math.max(index - 1, 0)
  : event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : -1;
 if (next < 0) return;
 event.preventDefault(); select(list[next]!, true);
});

type AdvisorDraft={plan:string;billing:string;addOns:string;addOnCredits:string};
let advisorDraft:AdvisorDraft|null=null, advisorTicket:number|null=null, advisorPending=false;
let advisorHostEpoch:number|null=null, advisorAwaitingEpoch:number|null=null, advisorEditVersion=0, advisorSavedVersion=0, advisorSubmittedVersion=0, advisorSubmissionUnresolved=false;
let advisorTimer:ReturnType<typeof setTimeout>|undefined;
const advisorForm=()=>document.querySelector('#advisor-form') as HTMLFormElement|null;
const advisorEpoch=():number=>Math.max(advisorHostEpoch??0,Number(advisorForm()?.getAttribute('data-advisor-epoch')));
function advisorFields(form:HTMLFormElement):AdvisorDraft {
 const value=(name:string)=>(form.elements.namedItem(name) as HTMLInputElement|HTMLSelectElement|null)?.value??'';
 return {plan:value('plan'),billing:value('billing'),addOns:value('addOns'),addOnCredits:value('addOnCredits')};
}
function applyAdvisor(form:HTMLFormElement, draft:AdvisorDraft):void {
 for(const [name,value] of Object.entries(draft)) {
  const field=form.elements.namedItem(name) as HTMLInputElement|HTMLSelectElement|null;
  if(field)field.value=value;
 }
}
// Each answer has its own error line (aria-describedby), so the message sits next to the field that needs attention.
const FIELD_ERRORS: Record<string, [string, string]> = {
 plan: ['advisor-plan-error', 'Choose a plan, or Not sure.'], billing: ['advisor-billing-error', 'Choose an account type, or Not sure.'],
 addOns: ['advisor-add-ons-error', 'Choose an option, or Not sure.'], addOnCredits: ['advisor-credits-error', 'Enter a number of credits, for example 250.'],
};
function advisorStatus(text:string,fields:string[]=[]):void {
 const form=advisorForm();if(!form)return;
 // The status line sits outside the disclosure so it stays visible; a message about the answers also keeps the disclosure open.
 const status=document.querySelector('#advisor-status');
 if(status)status.textContent=text;
 if(text)document.querySelector('#advisor-change')?.setAttribute('open','');
 for(const [name,[errorId,message]] of Object.entries(FIELD_ERRORS)) {
  const field=form.elements.namedItem(name) as Element|null,error=form.querySelector(`#${errorId}`);
  const invalid=fields.includes(name);
  if(error)error.textContent=invalid?message:'';
  if(!field)continue;
  if(invalid){field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby',errorId);}
  else {field.removeAttribute('aria-invalid');field.removeAttribute('aria-describedby');}
 }
}
function syncAdvisor():void {
 const form=advisorForm();if(!form)return;
 // Confirm / Change / Choose plan are inert without this form and script, so they are revealed only here.
 for(const id of ['advisor-confirm','advisor-change-open'])document.querySelector(`#${id}`)?.removeAttribute('hidden');
 const next=reconcileAdvisorDraft({hasDraft:advisorDraft!==null,ticket:advisorTicket,awaitingEpoch:advisorAwaitingEpoch,editVersion:advisorEditVersion,savedVersion:advisorSavedVersion,modelEpoch:Number(form.getAttribute('data-advisor-epoch')),hostEpoch:advisorHostEpoch});
 advisorAwaitingEpoch=next.awaitingEpoch;
 if(!next.keepDraft)advisorDraft=null;
 if(advisorDraft){
  applyAdvisor(form,advisorDraft);
  if(next.stale){advisorStatus('These answers changed or were reopened elsewhere; review and submit again.');form.querySelector('#advisor-review-again')?.removeAttribute('hidden');}
 }else{
  applyAdvisor(form,{plan:form.getAttribute('data-plan')??'unsure',billing:form.getAttribute('data-billing')??'unsure',addOns:form.getAttribute('data-add-ons')??'unsure',addOnCredits:form.getAttribute('data-add-on-credits')??''});
  advisorTicket=next.epoch;
 }
}
window.addEventListener('input',event=>{const form=advisorForm();if(form&&event.isTrusted&&form.contains(event.target as Node)){if(!advisorDraft)advisorTicket=advisorEpoch();advisorDraft=advisorFields(form);advisorEditVersion++;}});
window.addEventListener('change',event=>{const form=advisorForm();if(form&&event.isTrusted&&form.contains(event.target as Node)){if(!advisorDraft)advisorTicket=advisorEpoch();advisorDraft=advisorFields(form);advisorEditVersion++;}});
window.addEventListener('click',event=>{
 const form=advisorForm();if(!form||!event.isTrusted||event.target!==form.querySelector('#advisor-review-again'))return;
 advisorTicket=advisorEpoch();form.querySelector('#advisor-review-again')?.setAttribute('hidden','');advisorStatus('Review your answers, then submit again.');
});
function submitAdvisor(form:HTMLFormElement):void {
 if(advisorPending)return;
 if(advisorTicket!==advisorEpoch()){advisorStatus('Your answers changed elsewhere; review and submit again.');form.querySelector('#advisor-review-again')?.removeAttribute('hidden');return;}
 const draft=advisorFields(form);advisorDraft=draft;if(!advisorSubmissionUnresolved){advisorSubmittedVersion=advisorEditVersion;advisorSubmissionUnresolved=true;}advisorPending=true;advisorStatus('Reviewing Cost Advisor answers…');
 advisorTimer=setTimeout(()=>{if(advisorPending){advisorPending=false;advisorStatus('The review has not finished. Try again later.');}},15000);
 vscode.postMessage({type:'advisorSubmit',ticket:advisorTicket, ...draft});
}
window.addEventListener('submit',event=>{
 const form=advisorForm();if(!form||event.target!==form)return;
 event.preventDefault();if(!event.isTrusted)return;
 submitAdvisor(form);
});
// "Confirm" answers the form with the plan the page assumed (and the answers already in the form) through the same validated submit;
// "Change" / "Choose plan" only opens the form. Neither sends a new kind of message.
const ADVISOR_PLANS=['free','pro','pro_plus','pro_max','power'];
window.addEventListener('click',event=>{
 const form=advisorForm(),target=event.target as Element|null;
 if(!form||!event.isTrusted||!target?.getAttribute)return;
 const id=target.getAttribute('id');
 const select=form.elements.namedItem('plan') as HTMLSelectElement|null;
 if(id==='advisor-confirm'){
  const plan=target.getAttribute('data-hint');
  if(!select||!plan||!ADVISOR_PLANS.includes(plan))return;
  // Unlike an edit, Confirm keeps the ticket of the answers the page showed, so a stale page is refused by the submit check.
  select.value=plan;advisorDraft=advisorFields(form);advisorEditVersion++;
  submitAdvisor(form);
 }else if(id==='advisor-change-open'){
  document.querySelector('#advisor-change')?.setAttribute('open','');
  select?.focus();
 }
});

// Recap card and CSV export. The static page already holds the card's text; this only reveals the buttons, draws the same text on the canvas
// (brand colours, fixed size) and sends the fixed action messages from trusted clicks. Nothing here sets markup, a link or an image source.
const el = (id: string): Element | null => document.querySelector(`#${id}`);
const TOOL_BUTTONS = ['recap-share', 'recap-save', 'recap-copy', 'recap-dismiss', 'export-csv'];
const STATUS_OF: Record<ActionName, string> = { exportCsv: 'export-status', copyRecapText: 'recap-status', saveRecapImage: 'recap-status', shareRecap: 'recap-status', dismissRecap: 'export-status' };
const statuses = new Map<string, string>(), inFlight = new Set<string>(), flightTimers = new Map<string, ReturnType<typeof setTimeout>>();
let drawnCanvas: Element | null = null, drawnKey = '';
function say(id: string, text: string): void { statuses.set(id, text); const node = el(id); if (node && node.textContent !== text) node.textContent = text; }
type Ctx = CanvasRenderingContext2D;
const FAMILY = 'system-ui, -apple-system, "Segoe UI", sans-serif';
function rounded(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
 ctx.beginPath(); ctx.moveTo(x + r, y);
 ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
 ctx.closePath();
}
const dot = (ctx: Ctx, x: number, y: number, r: number) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); };
/** The largest font size from `sizes` at which `text` fits `width`. */
function fit(ctx: Ctx, text: string, width: number, weight: number, sizes: number[]): number {
 for (const size of sizes) { ctx.font = `${weight} ${size}px ${FAMILY}`; if (ctx.measureText(text).width <= width) return size; }
 return sizes.at(-1)!;
}
/**
 * Bobert as on the icon (a 120-unit box scaled by `s`): his face is a gauge whose needle shows the share of the limit used, and his eyes the
 * persona's mood. Drawn from fixed shapes only.
 */
function drawBobert(ctx: Ctx, x: number, y: number, s: number, fraction: number, mood: Mood): void {
 ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.lineCap = 'round';
 ctx.strokeStyle = BOBERT.body; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(60, 34); ctx.lineTo(60, 20); ctx.stroke();
 ctx.fillStyle = BOBERT.accent; dot(ctx, 60, 17, 5);
 ctx.fillStyle = BOBERT.body; rounded(ctx, 16, 54, 6, 20, 3); ctx.fill(); rounded(ctx, 98, 54, 6, 20, 3); ctx.fill(); rounded(ctx, 22, 34, 76, 62, 16); ctx.fill();
 ctx.fillStyle = BOBERT.face; rounded(ctx, 30, 42, 60, 46, 10); ctx.fill();
 ctx.strokeStyle = BOBERT.body; ctx.fillStyle = BOBERT.body; ctx.lineWidth = 3.2;
 const eye = (ex: number, kind: 'happy' | 'wide' | 'shut' | 'calm') => {
  ctx.beginPath();
  if (kind === 'happy') { ctx.arc(ex, 57, 5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
  else if (kind === 'shut') { ctx.moveTo(ex - 5, 55); ctx.lineTo(ex + 5, 55); ctx.stroke(); }
  else if (kind === 'wide') { dot(ctx, ex, 54, 5.5); ctx.fillStyle = BOBERT.face; dot(ctx, ex + 1.5, 52.5, 1.8); ctx.fillStyle = BOBERT.body; }
  else dot(ctx, ex, 54, 4);
 };
 eye(46, mood === 'wink' ? 'happy' : mood); eye(74, mood === 'wink' ? 'shut' : mood);
 const f = Math.min(1, Math.max(0, fraction)), needle = Math.PI * (1 + f);
 ctx.lineWidth = 4; ctx.strokeStyle = BOBERT.track; ctx.beginPath(); ctx.arc(60, 80, 16, Math.PI, 2 * Math.PI); ctx.stroke();
 ctx.strokeStyle = BOBERT.body; ctx.beginPath(); ctx.arc(60, 80, 16, Math.PI, needle); ctx.stroke();
 ctx.lineWidth = 1.6;
 for (let i = 0; i <= 4; i++) { const t = Math.PI * (1 + i / 4); ctx.beginPath(); ctx.moveTo(60 + 20.5 * Math.cos(t), 80 + 20.5 * Math.sin(t)); ctx.lineTo(60 + 23 * Math.cos(t), 80 + 23 * Math.sin(t)); ctx.stroke(); }
 ctx.strokeStyle = BOBERT.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(60, 80); ctx.lineTo(60 + 12 * Math.cos(needle), 80 + 12 * Math.sin(needle)); ctx.stroke();
 ctx.fillStyle = BOBERT.accent; dot(ctx, 60, 80, 2.6);
 ctx.restore();
}
interface ShareCard { ended: string; persona: string; quip: string; big: string; subline: string; highlights: [string, string][]; footer: boolean }
function paint(ctx: Ctx, card: ShareCard): void {
 const pad = 56, persona = personaByTitle(card.persona), mood: Mood = persona?.mood ?? 'calm';
 ctx.fillStyle = BRAND.background; ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
 ctx.fillStyle = BOBERT.glow; dot(ctx, 244, 392, 196);
 ctx.textBaseline = 'top';
 // Bobert's speech bubble (only for a known persona) and Bobert himself on the left.
 if (persona) {
  ctx.font = `600 26px ${FAMILY}`;
  const bubble = wrapText(card.quip, 332, text => ctx.measureText(text).width).slice(0, 3), h = bubble.length * 34 + 36;
  ctx.fillStyle = BOBERT.bubble; rounded(ctx, 60, 44, 380, h, 22); ctx.fill();
  ctx.beginPath(); ctx.moveTo(130, 44 + h - 1); ctx.lineTo(170, 44 + h - 1); ctx.lineTo(138, 44 + h + 28); ctx.closePath(); ctx.fill();
  ctx.fillStyle = BRAND.background; bubble.forEach((line, i) => ctx.fillText(line, 84, 62 + i * 34));
 }
 const percent = /^(\d+)%$/.exec(card.big);
 drawBobert(ctx, 40, persona ? 180 : 120, 3.4, percent ? Number(percent[1]) / 100 : 0, mood);
 // The right column: when, who, the big figure and up to three observed highlights.
 const x = 500, width = CARD_WIDTH - pad - x;
 ctx.font = `700 20px ${FAMILY}`; ctx.fillStyle = BRAND.accent;
 ctx.fillText((card.ended ? `My Kiro cycle · ended ${card.ended} (UTC)` : 'My Kiro cycle').toUpperCase(), x, 72);
 if (persona) { fit(ctx, persona.title, width, 800, [64, 56, 48, 40]); ctx.fillStyle = BRAND.title; ctx.fillText(persona.title, x, 104); }
 const bigSize = fit(ctx, card.big, width * 0.55, 800, [120, 104, 88, 72]);
 ctx.fillStyle = BOBERT.body; ctx.fillText(card.big, x, 196 + (120 - bigSize) * 0.6);
 const bigWidth = ctx.measureText(card.big).width;
 ctx.font = `500 28px ${FAMILY}`; ctx.fillStyle = BRAND.text;
 wrapText(card.subline, width - bigWidth - 20, text => ctx.measureText(text).width).slice(0, 3).forEach((line, i) => ctx.fillText(line, x + bigWidth + 20, 232 + i * 36));
 let left = x;
 for (const [label, value] of card.highlights.slice(0, MAX_HIGHLIGHTS)) {
  ctx.font = `700 24px ${FAMILY}`; const valueWidth = ctx.measureText(value).width;
  ctx.font = `400 20px ${FAMILY}`; const labelWidth = ctx.measureText(label).width;
  const w = Math.max(valueWidth, labelWidth) + 40;
  if (left + w > CARD_WIDTH - pad) break; // a tile that does not fit is left out rather than cut
  ctx.fillStyle = BOBERT.tileEdge; rounded(ctx, left, 370, w, 78, 16); ctx.fill();
  ctx.fillStyle = BOBERT.tile; rounded(ctx, left + 1.5, 371.5, w - 3, 75, 15); ctx.fill();
  ctx.fillStyle = BRAND.muted; ctx.fillText(label, left + 20, 382);
  ctx.font = `700 24px ${FAMILY}`; ctx.fillStyle = BRAND.title; ctx.fillText(value, left + 20, 410);
  left += w + 16;
 }
 if (!card.footer) return;
 // Branded footer: an accent rule, "Bobert · free credit tracker for Kiro" on the left and the search hint on the right (left-aligned below it if it does not fit).
 const y = CARD_HEIGHT - 70;
 ctx.fillStyle = BRAND.accent; ctx.fillRect(pad, y - 18, CARD_WIDTH - 2 * pad, 2);
 ctx.font = `700 26px ${FAMILY}`; ctx.fillText(CARD_FOOTER.brand, pad, y);
 const brandWidth = ctx.measureText(CARD_FOOTER.brand).width;
 ctx.font = `400 22px ${FAMILY}`; ctx.fillStyle = BRAND.muted; ctx.fillText(CARD_FOOTER.tagline, pad + brandWidth, y + 3);
 const used = brandWidth + ctx.measureText(CARD_FOOTER.tagline).width, hint = ctx.measureText(CARD_FOOTER.hint).width;
 if (used + 32 + hint <= CARD_WIDTH - 2 * pad) ctx.fillText(CARD_FOOTER.hint, CARD_WIDTH - pad - hint, y + 3);
 else ctx.fillText(CARD_FOOTER.hint, pad, y + 30);
}
const text = (id: string) => el(id)?.textContent ?? '';
/** The share card as the static page states it; the page is its text alternative, so the image never says more than the text. */
function readCard(): ShareCard {
 const lines = Array.from(el('recap-lines')?.childNodes ?? []).map(node => node.textContent ?? '').filter(Boolean);
 const highlights: [string, string][] = [];
 for (const row of Array.from(el('recap-highlights')?.childNodes ?? [])) {
  const [dt, dd] = Array.from(row.childNodes);
  if (dt && dd) highlights.push([dt.textContent ?? '', dd.textContent ?? '']);
 }
 return { ended: /^Cycle that ended (.+?) \(UTC\)\./.exec(text('recap-period'))?.[1] ?? '', persona: text('recap-persona'), quip: text('recap-quip'), big: text('recap-big'), subline: text('recap-subline'), highlights, footer: cardLayout(lines).footer };
}
function drawCard(): void {
 const canvas = el('recap-canvas') as HTMLCanvasElement | null, figure = el('recap-preview');
 if (!canvas || !figure || typeof canvas.getContext !== 'function') return;
 const card = readCard(), key = JSON.stringify(card);
 if (canvas !== drawnCanvas || key !== drawnKey) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return; // without a canvas the text above remains the card
  paint(ctx, card);
  drawnCanvas = canvas; drawnKey = key;
 }
 figure.removeAttribute('hidden');
}
function syncTools(): void {
 for (const id of TOOL_BUTTONS) el(id)?.removeAttribute('hidden');
 if (!el('recap-card')) { statuses.delete('recap-status'); drawnCanvas = null; }
 for (const [id, text] of statuses) { const node = el(id); if (node && node.textContent !== text) node.textContent = text; }
 try { drawCard(); } catch { /* the static text is the card */ }
}
async function deflate(raw: Uint8Array): Promise<Uint8Array> {
 if (typeof CompressionStream !== 'function') throw new Error('NO_COMPRESSION');
 return new Uint8Array(await new Response(new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
}
function finish(name: ActionName): void { inFlight.delete(name); const timer = flightTimers.get(name); if (timer) clearTimeout(timer); flightTimers.delete(name); }
function request(name: ActionName, working: string, build: () => Promise<object> | object): void {
 if (inFlight.has(name)) return;
 inFlight.add(name);
 flightTimers.set(name, setTimeout(() => { if (inFlight.has(name)) { finish(name); say(STATUS_OF[name], ACTION_TEXT.unavailable); } }, 300000)); // a save dialog can stay open for a long time
 say(STATUS_OF[name], working);
 Promise.resolve().then(build).then(message => vscode.postMessage(message)).catch((error: unknown) => { finish(name); say(STATUS_OF[name], ACTION_TEXT[error instanceof Error && error.message === 'NO_IMAGE_CLIPBOARD' ? 'image_unsupported' : 'failed']); });
}
async function cardPng(): Promise<Uint8Array> {
 const canvas = el('recap-canvas') as HTMLCanvasElement | null, ctx = canvas?.getContext('2d', { willReadFrequently: true });
 if (!canvas || !ctx) throw new Error('NO_CANVAS');
 drawCard();
 return encodePng(ctx.getImageData(0, 0, CARD_WIDTH, CARD_HEIGHT).data, deflate);
}
async function cardMessage(): Promise<object> {
 return { type: 'saveRecapImage', png: toBase64(await cardPng()) };
}
// Share: the image goes straight onto the clipboard from this page (the editor grants webviews clipboard-write; the native share sheet is
// not available to a webview), so it can be pasted into any app. Only then is the extension told, so it can offer the fixed next steps.
async function shareMessage(): Promise<object> {
 const clipboard = (globalThis as { navigator?: { clipboard?: { write?: (items: unknown[]) => Promise<void> } } }).navigator?.clipboard;
 const Item = (globalThis as { ClipboardItem?: new (items: Record<string, Promise<Blob>>) => unknown }).ClipboardItem;
 if (typeof clipboard?.write !== 'function' || typeof Item !== 'function') throw new Error('NO_IMAGE_CLIPBOARD');
 // The write starts within the click and the item resolves to the PNG, so the click's user activation is still current.
 const png = cardPng();
 try { await clipboard.write([new Item({ 'image/png': png.then(bytes => new Blob([bytes as BlobPart], { type: 'image/png' })) })]); } catch { await png; throw new Error('NO_IMAGE_CLIPBOARD'); }
 return { type: 'shareRecap' };
}
window.addEventListener('click', event => {
 if (!event.isTrusted) return;
 const id = (event.target as Element | null)?.getAttribute?.('id');
 if (id === 'recap-copy') request('copyRecapText', 'Copying…', () => ({ type: 'copyRecapText' }));
 else if (id === 'recap-dismiss') request('dismissRecap', 'Dismissing…', () => ({ type: 'dismissRecap' }));
 else if (id === 'export-csv') request('exportCsv', 'Choose where to save the CSV file…', () => ({ type: 'exportCsv' }));
 else if (id === 'recap-save') request('saveRecapImage', 'Choose where to save the image…', cardMessage);
 else if (id === 'recap-share') request('shareRecap', 'Copying the image…', shareMessage);
});
// The dismissed card is gone, so focus moves to the next visible control in reading order: the Cost Advisor form's summary, else the Advanced details summary.
const firstSummary = (details: Node | null | undefined): HTMLElement | null => {
 const first = details?.childNodes[0];
 return first?.nodeType === Node.ELEMENT_NODE && (first as Element).localName === 'summary' ? first as HTMLElement : null;
};
function focusAfterRecap(): void {
 (firstSummary(el('advisor-change')) ?? firstSummary(el('advanced-details')?.childNodes[0]))?.focus?.();
}
function actionResult(message: { action?: unknown; code?: unknown }): void {
 const name = ACTION_NAMES.find(n => n === message.action), code = ACTION_CODES.find((c): c is ActionCode => c === message.code);
 if (!name || !code || !inFlight.has(name)) return;
 finish(name);
 say(STATUS_OF[name], ACTION_TEXT[code]);
 if (name === 'dismissRecap' && code === 'dismissed') focusAfterRecap();
}

window.addEventListener('message', event => {
 const message = event.data as { type?: unknown; schema?: unknown; version?: unknown; model?: unknown; status?: unknown; fields?: unknown; epoch?: unknown; reason?: unknown } | null;
 if (message?.type === 'actionResult') { actionResult(message as { action?: unknown; code?: unknown }); return; }
 if(message?.type==='advisorResult') {
  advisorPending=false;if(advisorTimer)clearTimeout(advisorTimer);advisorTimer=undefined;
  if(Number.isSafeInteger(message.epoch)&&(message.epoch as number)>=0)advisorHostEpoch=message.epoch as number;
  if(message.status==='ok'){advisorSubmissionUnresolved=false;advisorAwaitingEpoch=advisorHostEpoch;advisorTicket=advisorHostEpoch;advisorSavedVersion=advisorSubmittedVersion;advisorForm()?.querySelector('#advisor-review-again')?.setAttribute('hidden','');advisorStatus('Cost Advisor review saved for this session.');syncAdvisor();}
  else if(message.status==='stale'){advisorSubmissionUnresolved=false;advisorStatus('Your answers changed elsewhere; review and submit again.');advisorForm()?.querySelector('#advisor-review-again')?.removeAttribute('hidden');}
  else if(message.status==='invalid'){const fields=message.reason==='busy'?[]:Array.isArray(message.fields)?message.fields.filter((x):x is string=>['plan','billing','addOns','addOnCredits'].includes(x)):['plan','billing','addOns','addOnCredits'];if(fields.length)advisorSubmissionUnresolved=false;advisorStatus(message.reason==='busy'?'A Cost Advisor review is still running. Try again later.':fields.length?'Check your Cost Advisor answers and submit again.':'Please wait two seconds and submit again.',fields);}
  return;
 }
 if (!message || message.type !== 'model' || message.schema !== 1 || !Number.isSafeInteger(message.version) || (message.version as number) < 1 || !valid(message.model)) return;
 const model = message.model as DomElement;
 if (model.tag !== 'main') return;
 const main = document.querySelector('main');
 const reserve = document.querySelector('#cg-link-reserve');
 if (!main || !reserve) return;
 const x = window.scrollX, y = window.scrollY;
 const focused = document.activeElement;
 const focusedAt = point(focused)?.getAttribute('data-chart-point') ?? null;
 const tipOpen = tooltip()?.getAttribute('hidden') === null;
 // The disclosure's open state is the user's; a model carries none, so a re-created element is reopened from what was seen before.
 const advisorWasOpen = document.querySelector('#advisor-change')?.getAttribute('open') != null;
 const wasLive = document.documentElement.getAttribute('data-cg-live') !== null;
 try {
  const links = [...anchors(main), ...anchors(reserve)];
  if (links.some(link => !SAFE_LINKS.has(link.getAttribute('href') ?? ''))) return;
  for (const link of anchors(main)) reserve.appendChild(link);
  reconcile(main, model.children, false, links);
  syncAdvisor();
  syncTools();
  document.documentElement.setAttribute('data-cg-live', ''); // the page now follows live models: the stylesheet swaps the command-link fallback for the inline form
  if (advisorWasOpen) document.querySelector('#advisor-change')?.setAttribute('open', '');
  // The fallback link is hidden from now on: focus moves to the form's summary instead of a hidden element.
  const lostLink = !wasLive && focused?.localName === 'a' && focused.getAttribute('href') === 'command:bobert.costAdvisor';
  if (lostLink) { const summary = document.querySelector('#advisor-change')?.childNodes[0]; if (summary?.nodeType === Node.ELEMENT_NODE && (summary as Element).localName === 'summary') (summary as HTMLElement).focus(); }
  const plotted = points();
  const selected = plotted.find(p => p.getAttribute('data-chart-point') === (focusedAt ?? selectedAt)) ?? plotted[0];
  if (selected) {
   selectedAt = selected.getAttribute('data-chart-point');
   for (const item of plotted) item.setAttribute('tabindex', item === selected ? '0' : '-1');
   if (focusedAt) (selected as HTMLElement).focus();
  }
  if (tipOpen) {
   const shown = plotted.find(p => p.getAttribute('data-chart-point') === (hoveredAt ?? focusedAt ?? selectedAt));
   if (shown) show(shown); else hide();
  }
  if (!lostLink && focused?.localName === 'a' && main.contains(focused)) (focused as HTMLElement).focus();
  window.scrollTo(x, y);
  vscode.postMessage({ type: 'ack', version: message.version });
 } catch { /* The host's 5-second timer restores a fresh static document. */ }
});
syncAdvisor();
syncTools();
if (Number.isSafeInteger(load) && load > 0) vscode.postMessage({ type: 'ready', load });
