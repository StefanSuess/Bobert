import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPOSITORY, attestationArgs, checkSums, selectRun } from '../../scripts/release/candidate-acceptance.ts';

const sha = 'a'.repeat(40);
const raw = (id: number, over: Record<string, unknown> = {}) => ({ id, path: '.github/workflows/ci.yml', event: 'push', head_branch: 'main', head_sha: sha, status: 'completed', conclusion: 'success', run_number: id, run_attempt: 1, ...over });

test('selectRun uses the trusted-run selection of the release workflow and fails closed on a newer unsuccessful run', () => {
  assert.equal(selectRun([raw(1), raw(3), raw(2)], sha), 3);
  assert.equal(selectRun([raw(1, { path: '.github/workflows/ci.yml@refs/heads/main' })], sha), 1);
  assert.throws(() => selectRun([raw(1), raw(2, { conclusion: 'failure' })], sha), /^PromotionPolicyError: CI_RUN_UNSUCCESSFUL$/);
  assert.throws(() => selectRun([raw(1), raw(2, { status: 'in_progress', conclusion: null })], sha), /^PromotionPolicyError: CI_RUN_UNSUCCESSFUL$/);
  assert.throws(() => selectRun([raw(1, { event: 'pull_request' })], sha), /^PromotionPolicyError: CI_RUN_UNTRUSTED$/);
  assert.throws(() => selectRun([raw(1, { head_branch: 'feat/x' }), raw(2, { head_sha: 'b'.repeat(40) }), raw(3, { path: '.github/workflows/other.yml' })], sha), /^PromotionPolicyError: CI_RUN_NOT_FOUND$/);
  assert.throws(() => selectRun([], sha), /^PromotionPolicyError: CI_RUN_NOT_FOUND$/);
  assert.throws(() => selectRun([null, 'x', 7], sha), /^PromotionPolicyError: CI_RUN_NOT_FOUND$/);
});

test('the repository is fixed', () => {
  assert.equal(REPOSITORY, 'StefanSuess/Bobert');
});

const hash = 'c'.repeat(64);
const name = 'bobert-v1.2.0-aaaaaaaaaaaa-candidate.vsix';

test('checkSums accepts exactly one matching line', () => {
  assert.equal(checkSums(`${hash}  ${name}\n`, name, hash), true);
  assert.equal(checkSums(`${hash}  ${name}`, name, hash), true);
  assert.equal(checkSums(`${hash}  ${name}\n`, name, 'd'.repeat(64)), false);
  assert.equal(checkSums(`${hash}  other.vsix\n`, name, hash), false);
  assert.equal(checkSums(`${hash} ${name}\n`, name, hash), false);
  assert.equal(checkSums(`${hash.toUpperCase()}  ${name}\n`, name, hash), false);
  assert.equal(checkSums(`${hash.slice(1)}  ${name}\n`, name, hash.slice(1)), false);
  assert.equal(checkSums(`${hash}  ${name}\n${hash}  ${name}\n`, name, hash), false);
  assert.equal(checkSums(`${hash}  ${name}\n${'d'.repeat(64)}  other.vsix\n`, name, hash), false);
  assert.equal(checkSums('', name, hash), false);
});

test('attestationArgs equals the flags of the release workflow verify step', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8');
  const start = workflow.indexOf('gh attestation verify');
  assert.ok(start >= 0);
  const step = workflow.slice(start, workflow.indexOf('>/dev/null', start)).replace(/\\\n/g, ' ');
  // Resolve the workflow's shell variables to the values the tool uses.
  const repo = 'synthetic-owner/synthetic-repo', file = 'synthetic.vsix';
  const resolved = step.replaceAll('"release/promotion-bundle/bobert-v${VERSION}.vsix"', file).replaceAll('"$GITHUB_REPOSITORY/.github/workflows/ci.yml"', `${repo}/.github/workflows/ci.yml`)
    .replaceAll('"$GITHUB_REPOSITORY"', repo).replaceAll('"$SOURCE_SHA"', sha);
  assert.deepEqual(resolved.trim().split(/\s+/).slice(1), attestationArgs(file, repo, sha));
});
