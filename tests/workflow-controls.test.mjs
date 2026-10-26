import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');

function job(name) {
  const start = workflow.indexOf(`  ${name}:\n`);
  assert.notEqual(start, -1, `missing ${name} job`);
  const remainder = workflow.slice(start + 1);
  const next = remainder.search(/^  [a-z][a-z0-9-]*:\n/m);
  return next === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
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

test('Dependabot automation is gated, version-limited, and fail-closed', () => {
  const merge = job('dependabot-auto-merge');
  assert.match(merge, /needs: \[quality, browser\]/);
  assert.doesNotMatch(merge, /actions\/checkout|npm (?:ci|install)|npm run/);
  assert.match(merge, /update-type == 'version-update:semver-minor'/);
  assert.match(merge, /update-type == 'version-update:semver-patch'/);
  assert.match(merge, /Leave major updates for human review/);
  assert.match(merge, /Reject an unrecognized Dependabot update type/);
  assert.match(merge, /gh workflow run pages\.yml/);
  assert.match(merge, /::error::gate passed/);
  assert.match(merge, /exit 1/);
  assert.doesNotMatch(merge, /\|\|\s*(?:echo|true)|exit 0\s*#.*failed/);
});
