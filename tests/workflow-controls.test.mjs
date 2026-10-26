import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');

function job(name, source = workflow) {
  const start = source.indexOf(`  ${name}:\n`);
  assert.notEqual(start, -1, `missing ${name} job`);
  const remainder = source.slice(start + 1);
  const next = remainder.search(/^  [a-z][a-z0-9-]*:\n/m);
  return next === -1 ? source.slice(start) : source.slice(start, start + 1 + next);
}

test('repository code runs with read-only contents permission', () => {
  const preJobs = workflow.slice(0, workflow.indexOf('jobs:\n'));
  assert.match(preJobs, /permissions:\n  contents: read/);
  assert.doesNotMatch(preJobs, /(?:pages|id-token|pull-requests|actions): write/);

  for (const name of ['quality', 'browser']) {
    assert.doesNotMatch(job(name), /(?:contents|pages|id-token|pull-requests|actions): write/);
  }
});

test('quality gate uses a clean install, audit, and supported Node matrix', () => {
  const quality = job('quality');
  assert.match(quality, /node-version: \[22, 24, 26\]/);
  assert.match(quality, /run: npm ci/);
  assert.match(quality, /run: npm audit --audit-level=high/);
  assert.match(quality, /run: npm test/);
  assert.match(quality, /run: npm run build/);
  assert.doesNotMatch(quality, /npm install(?:\s|$)/);
});

test('pull requests run browser gates but cannot publish a Pages artifact', () => {
  const browser = job('browser');
  assert.match(browser, /needs: quality/);
  assert.match(browser, /https:\/\/archive\.ubuntu\.com\/ubuntu/);
  assert.match(browser, /npx playwright install --with-deps chromium/);
  assert.match(browser, /run: npm run test:a11y/);
  assert.match(browser, /name: Robust PIR clean-baseline mutation gate\n        run: npm run test:mutations/);
  assert.match(
    browser,
    /name: Package the tested site for Pages\n        if: github\.event_name != 'pull_request'/
  );
});

test('deployment authority exists only in the deploy job', () => {
  const deploy = job('deploy');
  assert.match(deploy, /if: github\.event_name != 'pull_request'/);
  assert.match(deploy, /needs: browser/);
  assert.match(deploy, /permissions:\n      pages: write\n      id-token: write/);
  assert.doesNotMatch(deploy, /actions\/checkout|npm (?:ci|install)|run: npm/);
});

test('main deployments are not cancelled by a newer run', () => {
  assert.match(workflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
});

function assertDependabotAutomation(source) {
  const merge = job('dependabot-auto-merge', source);
  assert.match(merge, /needs: \[quality, browser\]/);
  assert.doesNotMatch(merge, /actions\/checkout|npm (?:ci|install)|npm run/);
  assert.match(merge, /update-type == 'version-update:semver-minor'/);
  assert.match(merge, /update-type == 'version-update:semver-patch'/);
  assert.match(merge, /Leave major updates for human review/);
  assert.match(merge, /Reject an unrecognized Dependabot update type/);
  assert.match(merge, /::error::gate passed/);
  assert.match(merge, /::error::Dependabot merged, but the Pages deployment dispatch failed/);
  assert.match(merge, /exit 1/);
  assert.doesNotMatch(merge, /\|\|\s*(?:echo|true)|exit 0/);

  const mergeCommand = merge.indexOf('if gh pr merge --squash --delete-branch "$PR_URL"; then');
  const flagSet = merge.indexOf('merged=1', mergeCommand);
  const failedMergeGuard = merge.indexOf('if [ -z "$merged" ]; then', flagSet);
  const dispatch = merge.indexOf('gh workflow run pages.yml', failedMergeGuard);
  assert.ok(mergeCommand >= 0, 'merge command must select its success path directly');
  assert.ok(flagSet > mergeCommand, 'merge success must set a flag from the command exit status');
  assert.ok(failedMergeGuard > flagSet, 'failed merge must terminate before any dispatch');
  assert.ok(dispatch > failedMergeGuard, 'dispatch must run only after the merge flag is checked');

  const dispatchRationale = [
    '# A merge made with GITHUB_TOKEN raises no push event -- GitHub suppresses',
    '# them so workflows cannot retrigger themselves -- so deploy would never run',
    '# and the site would keep serving the previous build. Ask for it explicitly;',
    '# a workflow_dispatch through the API is not suppressed. The dispatched run',
    '# is the same gate-then-deploy pipeline, so a bad merge still ships nothing.',
  ].join('\n          ');
  assert.ok(merge.includes(`${dispatchRationale}\n          gh workflow run pages.yml`),
    'canonical no-push rationale must sit directly above the fail-closed dispatch');
  const dispatchFailureBlock = [
    'gh workflow run pages.yml --repo "$GITHUB_REPOSITORY" --ref main || {',
    '  echo "::error::Dependabot merged, but the Pages deployment dispatch failed"',
    '  exit 1',
    '}',
  ].join('\n          ');
  assert.ok(merge.includes(dispatchFailureBlock),
    'a failed deployment dispatch must emit an error and fail the job');
}

test('Dependabot automation is gated, version-limited, and fail-closed', () => {
  assertDependabotAutomation(workflow);
});

test('Dependabot controls reject lost merge state, masked dispatch, and missing rationale', () => {
  const mutants = [
    ['lost merge-result flag', workflow.replace('              merged=1\n', '')],
    ['successful exit after a failed dispatch', workflow.replace(
      '            echo "::error::Dependabot merged, but the Pages deployment dispatch failed"\n'
        + '            exit 1\n',
      '            echo "::warning::Pages deployment dispatch failed"\n'
        + '            exit 0\n',
    )],
    ['missing canonical rationale', workflow.replace(
      '          # A merge made with GITHUB_TOKEN raises no push event -- GitHub suppresses\n'
        + '          # them so workflows cannot retrigger themselves -- so deploy would never run\n'
        + '          # and the site would keep serving the previous build. Ask for it explicitly;\n'
        + '          # a workflow_dispatch through the API is not suppressed. The dispatched run\n'
        + '          # is the same gate-then-deploy pipeline, so a bad merge still ships nothing.\n',
      '',
    )],
  ];

  for (const [label, mutant] of mutants) {
    assert.notEqual(mutant, workflow, `${label} mutation must change the workflow`);
    assert.throws(() => assertDependabotAutomation(mutant), assert.AssertionError, label);
  }
});
