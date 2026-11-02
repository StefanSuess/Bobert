// Pure and browser-safe (no Node or editor API): the fixed recap-card format shared by the dashboard script that draws and encodes the card
// and by the extension's strict PNG validator. The card has one fixed size and one fixed PNG shape, so anything else is refused.
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;
export const PNG_BIT_DEPTH = 8;
export const PNG_COLOR_TYPE = 6; // RGBA, 8 bits per channel
/** Decompressed size of the card: one filter byte plus four bytes per pixel, for every row. */
export const CARD_RAW_SIZE = CARD_HEIGHT * (1 + CARD_WIDTH * 4);
/** The only message allowed to exceed the usual 4 KB string cap: 2 MB of base64 text. */
export const MAX_PNG_BASE64 = 2 * 1024 * 1024;

// Brand colours (navy tile of the icon, light text). Every text colour keeps at least 4.5:1 against the background (checked in tests).
export const BRAND = { background: '#0b2545', title: '#ffffff', text: '#e6edf7', muted: '#b8c7de', accent: '#7fd1ff' } as const;
export const MIN_CONTRAST = 4.5;
// The fixed share line: the last line of the copied text, and on the image a branded footer instead of a body line. Only shown when support
// prompts are on (`bobert.supportPrompts`); without it the card carries no Bobert branding at all.
export const RECAP_LINK_TEXT = 'Made with Bobert, the free credit tracker for Kiro: https://open-vsx.org/extension/StefanSuess/bobert';
export const CARD_FOOTER = { brand: 'Bobert', tagline: ' · free credit tracker for Kiro', hint: 'Search “Bobert” in Kiro’s Extensions view' } as const;
// The share card's persona: a fixed title, Bobert's line and his mood, chosen only from observed facts (see `persona` in recap.ts).
// The page draws Bobert from the persona it finds in the static text, so a title outside this table draws no persona at all.
export type Mood = 'happy' | 'wide' | 'wink' | 'calm';
export const PERSONAS = {
 full_throttle: { title: 'Full-Throttle Builder', quip: 'Every credit put to work. We shipped hard.', mood: 'wide' },
 precision: { title: 'Precision Lander', quip: 'Right up to the reset. Textbook landing.', mood: 'happy' },
 steady: { title: 'Steady Pilot', quip: 'Smooth cruise, credits to spare.', mood: 'happy' },
 saver: { title: 'Credit Saver', quip: 'Fewer credits, same code. Beep boop.', mood: 'wink' },
 explorer: { title: 'Credit Explorer', quip: 'Too few updates to call the landing. Still beeping.', mood: 'calm' },
} as const satisfies Record<string, { title: string; quip: string; mood: Mood }>;
export type PersonaKey = keyof typeof PERSONAS;
export const personaByTitle = (title: string): (typeof PERSONAS)[PersonaKey] | undefined => Object.values(PERSONAS).find(p => p.title === title);
/** At most this many highlight tiles on the image; the dashboard text lists the same ones. */
export const MAX_HIGHLIGHTS = 3;
/** Bobert's palette, from the icon (assets/branding/source/bobert-icon.svg). */
export const BOBERT = { body: '#2dd4bf', face: '#0f1b2d', accent: '#f59e0b', bubble: '#ffffff', track: '#1d6b6a', glow: '#0d2b4e', tile: '#14365f', tileEdge: '#2c5a8a' } as const;
/** The card's body lines and whether the branded footer is drawn: the share line, when it is the last line, becomes the footer. */
export function cardLayout(lines: readonly string[]): { body: string[]; footer: boolean } {
 const footer = lines.at(-1) === RECAP_LINK_TEXT;
 return { body: footer ? lines.slice(0, -1) : [...lines], footer };
}
function luminance(hex: string): number {
 const channel = (i: number) => { const v = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
 return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
/** WCAG contrast ratio of two `#rrggbb` colours. */
export function contrastRatio(a: string, b: string): number {
 const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
 return (hi + 0.05) / (lo + 0.05);
}

/** Greedy word wrap; a word wider than the line is split by characters. `measure` returns the drawn width of a string. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
 const lines: string[] = [];
 let line = '';
 for (const word of text.split(/\s+/).filter(Boolean)) {
  const attempt = line ? `${line} ${word}` : word;
  if (measure(attempt) <= maxWidth) { line = attempt; continue; }
  if (line) { lines.push(line); line = ''; }
  let rest = word;
  while (measure(rest) > maxWidth && rest.length > 1) {
   let cut = rest.length - 1;
   while (cut > 1 && measure(rest.slice(0, cut)) > maxWidth) cut--;
   lines.push(rest.slice(0, cut)); rest = rest.slice(cut);
  }
  line = rest;
 }
 if (line) lines.push(line);
 return lines;
}

const CRC_TABLE = (() => {
 const table = new Uint32Array(256);
 for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
 return table;
})();
export function crc32(...parts: Uint8Array[]): number {
 let c = 0xffffffff;
 for (const bytes of parts) for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
 return (c ^ 0xffffffff) >>> 0;
}
export const PNG_SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const ascii = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0));
function chunk(type: string, data: Uint8Array): Uint8Array {
 const out = new Uint8Array(12 + data.length), view = new DataView(out.buffer);
 const name = ascii(type);
 view.setUint32(0, data.length);
 out.set(name, 4); out.set(data, 8);
 view.setUint32(8 + data.length, crc32(name, data));
 return out;
}
/**
 * Encodes the card's RGBA pixels as the one PNG shape the extension accepts: IHDR, a single IDAT, IEND; no filtering, no ancillary chunks.
 * `deflate` must return a zlib stream (RFC 1950), for example from CompressionStream('deflate').
 */
export async function encodePng(rgba: Uint8Array | Uint8ClampedArray, deflate: (raw: Uint8Array) => Promise<Uint8Array>): Promise<Uint8Array> {
 if (rgba.length !== CARD_WIDTH * CARD_HEIGHT * 4) throw new Error('PNG_SIZE');
 const stride = CARD_WIDTH * 4, raw = new Uint8Array(CARD_RAW_SIZE);
 for (let y = 0; y < CARD_HEIGHT; y++) raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1); // filter byte 0 is already in place
 const header = new Uint8Array(13), hv = new DataView(header.buffer);
 hv.setUint32(0, CARD_WIDTH); hv.setUint32(4, CARD_HEIGHT);
 header[8] = PNG_BIT_DEPTH; header[9] = PNG_COLOR_TYPE; // compression, filter and interlace stay 0
 const parts = [PNG_SIGNATURE, chunk('IHDR', header), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0))];
 const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
 let at = 0;
 for (const p of parts) { out.set(p, at); at += p.length; }
 return out;
}
export function toBase64(bytes: Uint8Array): string {
 let binary = '';
 for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
 return btoa(binary);
}

// Logos for the recap card's post buttons (kept in this file, which is on the release classifier's app list), embedded as fixed constants so nothing is loaded at run time, each unchanged from the network's own
// source: LinkedIn's "in" logo from its brand kit (brand.linkedin.com/downloads, LI-In-Bug.png scaled to 56×48 with metadata removed),
// Bluesky's butterfly from its brand assets (bsky.social/about/support/icons) and the X mark as x.com itself embeds it. The page filters accept
// exactly these values; colours come from the stylesheet.
export const LINKEDIN_LOGO_SRC = 'data:image/png;base64,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';
export const BLUESKY_LOGO = { viewBox: '0 0 568 501', d: 'M123.121 33.6637C188.241 82.5526 258.281 181.681 284 234.873C309.719 181.681 379.759 82.5526 444.879 33.6637C491.866 -1.61183 568 -28.9064 568 57.9464C568 75.2916 558.055 203.659 552.222 224.501C531.947 296.954 458.067 315.434 392.347 304.249C507.222 323.8 536.444 388.56 473.333 453.32C353.473 576.312 301.061 422.461 287.631 383.039C285.169 375.812 284.017 372.431 284 375.306C283.983 372.431 282.831 375.812 280.369 383.039C266.939 422.461 214.527 576.312 94.6667 453.32C31.5556 388.56 60.7778 323.8 175.653 304.249C109.933 315.434 36.0535 296.954 15.7778 224.501C9.94525 203.659 0 75.2916 0 57.9464C0 -28.9064 76.1345 -1.61183 123.121 33.6637Z' } as const;
export const X_LOGO = { viewBox: '0 0 480 490', d: 'M285.38 207.711L462.954 1.5H420.874L266.687 180.55L143.538 1.5H1.50003L187.726 272.256L1.50003 488.5H43.5818L206.408 299.417L336.462 488.5H478.5L285.37 207.711H285.38ZM227.743 274.641L208.875 247.68L58.7444 33.147H123.379L244.536 206.282L263.405 233.243L420.894 458.292H356.259L227.743 274.652V274.641Z' } as const;
