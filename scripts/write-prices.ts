// Writes data/prices.json from the reviewed catalog and model table built into this version. Run after a maintainer has updated
// src/cost/catalog.ts and src/session/models.ts: `node --disable-warning=ExperimentalWarning scripts/write-prices.ts`.
import { writeFileSync, mkdirSync } from 'node:fs';
import { builtInPriceFile } from '../src/session/price-data.ts';
import { isMain } from './is-main.ts';
if (isMain(import.meta.url)) { mkdirSync('data', { recursive: true }); writeFileSync('data/prices.json', `${JSON.stringify(builtInPriceFile(), null, 1)}\n`); }
