import { checkTarget, defaultFolder, writeAtomically } from './file-target.ts';
import { buildCsv } from './csv-export.ts';
import { decodeCardPng } from './recap-png.ts';
import type { ActionCode } from './recap-actions.ts';
import type { StoredSnapshot } from '../store.ts';
import { join } from 'node:path';

// Vscode-free orchestration of the two file writes: validate the payload, ask for a location through the injected save dialog, guard the
// location and write atomically. The editor glue supplies the dialog and the protected folders; every outcome is a fixed code.
export const PNG_FILE = 'bobert-cycle-recap.png';
export const CSV_FILE = 'bobert-credit-history.csv';
export interface SaveDeps {
 /** Shows the editor's save dialog at the default path; undefined when cancelled. */
 dialog(defaultPath: string, filter: { name: string; extension: string }): Promise<{ scheme: string; fsPath: string } | undefined>;
 /** Bobert storage, Kiro source roots and Kiro data folders, read when the save happens. */
 protectedPaths(): string[];
 /** Folder offered first; defaults to Downloads, then the home folder. */
 folder?(): string;
}

/** A save outcome; `path` is the written file, only for the editor glue to reveal it, and never leaves the extension. */
export type SaveResult = { code: ActionCode; path?: string };
async function save(deps: SaveDeps, fileName: string, filter: { name: string; extension: string }, data: Uint8Array | string): Promise<SaveResult> {
 const picked = await deps.dialog(join(deps.folder?.() ?? defaultFolder(), fileName), filter);
 if (!picked) return { code: 'cancelled' };
 if (picked.scheme !== 'file' || typeof picked.fsPath !== 'string') return { code: 'refused_target' };
 const roots = deps.protectedPaths();
 const checked = checkTarget(picked.fsPath, roots);
 if (!checked.ok) return { code: 'refused_target' };
 const written = await writeAtomically(checked, data, roots);
 return written === 'saved' ? { code: 'saved', path: checked.path } : { code: written === 'write_failed' ? 'failed' : 'refused_target' };
}
/** The image is checked first, so nobody is asked where to save something that would be refused. */
export async function saveRecapImageFile(deps: SaveDeps, png: unknown): Promise<SaveResult> {
 const bytes = decodeCardPng(png);
 return bytes ? save(deps, PNG_FILE, { name: 'PNG image', extension: 'png' }, bytes) : { code: 'invalid_image' };
}
export async function saveRecapImage(deps: SaveDeps, png: unknown): Promise<ActionCode> {
 return (await saveRecapImageFile(deps, png)).code;
}
export async function exportCsv(deps: SaveDeps, snapshots: readonly StoredSnapshot[]): Promise<ActionCode> {
 const csv = buildCsv(snapshots);
 return csv.ok ? (await save(deps, CSV_FILE, { name: 'CSV file', extension: 'csv' }, csv.csv)).code : csv.code;
}
