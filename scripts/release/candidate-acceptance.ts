// pnpm acceptance:candidate [demo:setup options]: downloads the CI release candidate of the current main head,
// verifies its checksum and attestation exactly as the release workflow does, and starts the synthetic demo with
// that VSIX. Design: docs/release-streamlining-proposal.md section 5. Reads only public CI data through the
// maintainer's `gh` sign-in; writes only into a new temporary folder and the demo folder. Failures print a fixed
// code, never tool output.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isMain } from '../is-main.ts';
import { type CiRun, selectTrustedCiRun } from './promotion-policy.ts';
import { baseTagOf, classifyRange } from './prepare-release.ts';

export const REPOSITORY = 'StefanSuess/Bobert';

/** Same trusted-run selection as the release workflow: a newer failed or unfinished run for the head fails closed. Throws a fixed policy code. */
export function selectRun(rawRuns: unknown[], headSha: string): number {
 const runs: CiRun[] = rawRuns.map(value => {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
   id: Number(raw.id), path: typeof raw.path === 'string' ? raw.path.split('@')[0] : '', event: typeof raw.event === 'string' ? raw.event : '',
   head_branch: typeof raw.head_branch === 'string' ? raw.head_branch : '', head_sha: typeof raw.head_sha === 'string' ? raw.head_sha : '',
   status: typeof raw.status === 'string' ? raw.status : '', conclusion: typeof raw.conclusion === 'string' ? raw.conclusion : null,
   run_number: Number(raw.run_number), run_attempt: Number(raw.run_attempt),
  };
 });
 return selectTrustedCiRun(runs, { mainSha: headSha, dispatchSha: headSha }).id;
}

/** The checksum file holds exactly one line `<sha256>  <file name>` and it matches the file. */
export function checkSums(sumsText: string, fileName: string, actualSha256: string): boolean {
 const lines = sumsText.split('\n').filter(line => line !== '');
 const match = lines.length === 1 ? /^([0-9a-f]{64}) {2}(.+)$/.exec(lines[0]) : null;
 return match !== null && match[2] === fileName && match[1] === actualSha256;
}

/** Same flags as the `gh attestation verify` step of .github/workflows/release.yml (a test compares them). */
export function attestationArgs(file: string, repo: string, sha: string): string[] {
 return ['attestation', 'verify', file, '--repo', repo, '--signer-workflow', `${repo}/.github/workflows/ci.yml`,
  '--source-ref', 'refs/heads/main', '--source-digest', sha, '--deny-self-hosted-runners', '--predicate-type', 'https://slsa.dev/provenance/v1'];
}

const CANDIDATE = /^bobert-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-([0-9a-f]{12})-candidate\.vsix$/;
const quiet = (command: string, args: string[]): string => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 });
const fail = (code: string): never => { throw new Error(code); };

function run(extra: string[]): void {
 let sha: string, id: number;
 try {
  quiet('git', ['fetch', '--tags', 'origin', 'main']);
  sha = quiet('git', ['rev-parse', 'origin/main']).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) return fail('CANDIDATE_RUN_NOT_FOUND');
  const listed = JSON.parse(quiet('gh', ['api', `repos/${REPOSITORY}/actions/workflows/ci.yml/runs?branch=main&head_sha=${sha}&per_page=100`])) as { workflow_runs?: unknown };
  if (!Array.isArray(listed.workflow_runs)) return fail('CANDIDATE_RUN_NOT_FOUND');
  id = selectRun(listed.workflow_runs, sha);
 } catch { return fail('CANDIDATE_RUN_NOT_FOUND'); }
 const dir = mkdtempSync(join(tmpdir(), 'bobert-candidate-'));
 let name: string, file: string, digest: string;
 try {
  quiet('gh', ['run', 'download', String(id), '--repo', REPOSITORY, '--name', 'release-candidate', '--dir', dir]);
  const entries = readdirSync(dir);
  const vsix = entries.filter(entry => CANDIDATE.test(entry));
  if (entries.length !== 3 || vsix.length !== 1 || !entries.includes('SHA256SUMS.txt') || !entries.includes('manifest-linux.json')) return fail('CANDIDATE_FILE_INVALID');
  name = vsix[0]; file = join(dir, name);
  if (CANDIDATE.exec(name)?.[4] !== sha.slice(0, 12)) return fail('CANDIDATE_FILE_INVALID');
  for (const entry of entries) if (!lstatSync(join(dir, entry)).isFile()) return fail('CANDIDATE_FILE_INVALID');
  digest = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (!checkSums(readFileSync(join(dir, 'SHA256SUMS.txt'), 'utf8'), name, digest)) return fail('CANDIDATE_CHECKSUM_MISMATCH');
 } catch (error) { return fail(error instanceof Error && /^CANDIDATE_[A-Z_]+$/.test(error.message) ? error.message : 'CANDIDATE_FILE_INVALID'); }
 try { quiet('gh', attestationArgs(file, REPOSITORY, sha)); } catch { return fail('CANDIDATE_ATTESTATION_FAILED'); }
 // Same classifier as release:prepare, for the range from the last release tag to exactly this candidate commit.
 let type = 'unknown_treat_as_system';
 try {
  const base = baseTagOf(process.cwd(), sha);
  if (base) type = classifyRange(process.cwd(), base, sha).kind;
 } catch { /* stays unknown_treat_as_system: an undeterminable type gets the system acceptance */ }
 console.log(`CANDIDATE_VERIFIED run ${id} file ${name} sha256 ${digest} RELEASE_TYPE ${type}`);
 // The demo is the maintainer's interactive step; its own output is shown as is (synthetic data only).
 execFileSync('pnpm', ['demo:setup', '--vsix', file, '--rich', '--install', '--open', ...extra], { stdio: 'inherit' });
}

if (isMain(import.meta.url)) {
 try { run(process.argv.slice(2)); } catch (error) {
  console.error(error instanceof Error && /^CANDIDATE_[A-Z_]+$/.test(error.message) ? error.message : 'CANDIDATE_ACCEPTANCE_FAILED');
  process.exitCode = 1;
 }
}
