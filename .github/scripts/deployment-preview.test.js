'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const workflow = fs.readFileSync(path.join(__dirname, '..', 'workflows', 'azure-static-web-apps.yml'), 'utf8').replace(/\r\n/g, '\n');
const script = workflow.match(/        run: \|\n([\s\S]+)$/)[1].replace(/^ {10}/gm, '');
const bash = process.platform === 'win32'
    ? path.join(process.env.ProgramFiles, 'Git', 'bin', 'bash.exe')
    : 'bash';
const siteUrl = 'https://example.azurestaticapps.net/';
const botComment = (id, body) => ({ id, body, user: { login: 'github-actions[bot]' } });

function run(files, comments = [], overrides = {}) {
    return spawnSync(bash, ['--noprofile', '--norc', '-e', '-o', 'pipefail'], {
        input: `
gh() {
  if [[ "$2" == "--paginate" ]]; then
    if [[ "$3" == *"/files?"* ]]; then
      printf "%s" "$FILES"
    else
      printf "%s" "$COMMENTS"
    fi
  else
    printf "%s\\0" "$@"
    return "$WRITE_STATUS"
  fi
}
if [[ -n "\${JQ_BINARY:-}" ]]; then jq() { "$JQ_BINARY" --binary "$@"; }; fi
${process.platform === 'win32' ? 'python3() { python "$@"; }' : ''}
${script}`,
        env: {
            ...process.env,
            GITHUB_REPOSITORY: 'owner/repo',
            PR_NUMBER: '45',
            STATIC_WEB_APP_URL: siteUrl,
            FILES: JSON.stringify(files),
            COMMENTS: JSON.stringify(comments),
            WRITE_STATUS: '0',
            ...overrides
        },
        encoding: 'utf8'
    });
}

function writes(files, comments = []) {
    const result = run(files, comments);
    assert.equal(result.status, 0, result.error?.message || result.stderr);
    return result.stdout.split('\0').slice(0, -1);
}

test('deployment leaves PR comments to the combined preview step', () => {
    assert.doesNotMatch(workflow, /repo_token:/);
    assert.match(workflow, /name: Comment on deployment preview\n        if: github.event_name == 'pull_request'/);
});

test('one changed file creates one comment with both links and an encoded file path', () => {
    const args = writes([
        { filename: 'site/history/a lesson #1.html', status: 'added' },
        { filename: 'site/i/index.html', status: 'modified' },
        { filename: 'site/old.html', status: 'removed' },
        { filename: 'README.md', status: 'modified' }
    ]);
    assert.deepEqual(args.slice(0, 5), ['api', '--method', 'POST', 'repos/owner/repo/issues/45/comments', '-f']);
    assert.equal(args.length, 6);
    assert.equal(args[5], `body=<!-- deployment-preview -->\n[Open the stage site](${siteUrl})\n\n[Open the changed file preview](${siteUrl}history/a%20lesson%20%231.html)`);
});

test('zero or multiple preview files keep the stage link and remove the direct link on update', () => {
    for (const files of [[], [
        { filename: 'site/a.html', status: 'modified' },
        { filename: 'site/b.html', status: 'added' }
    ]]) {
        const args = writes(files, [botComment(12, '<!-- deployment-preview -->\nOld links')]);
        assert.deepEqual(args.slice(0, 5), ['api', '--method', 'PATCH', 'repos/owner/repo/issues/comments/12', '-f']);
        assert.equal(args.length, 6);
        assert.equal(args[5], `body=<!-- deployment-preview -->\n[Open the stage site](${siteUrl})`);
    }
});

test('legacy preview comments are consolidated without touching other comments', () => {
    const args = writes([], [
        botComment(10, 'Azure Static Web Apps: Your stage site is ready! Visit it here: https://old.example'),
        botComment(11, 'Unrelated validation result'),
        botComment(12, '<!-- single-file-preview -->\nOld direct link'),
        { id: 13, body: '<!-- single-file-preview -->', user: { login: 'reviewer' } }
    ]);
    assert.equal(args[2], 'PATCH');
    assert.equal(args[3], 'repos/owner/repo/issues/comments/12');
    assert.deepEqual(args.slice(6), ['api', '--method', 'DELETE', 'repos/owner/repo/issues/comments/10']);
});

test('missing deployment URLs and failed updates do not delete existing comments', () => {
    const comments = [botComment(10, '<!-- deployment-preview -->'), botComment(12, '<!-- single-file-preview -->')];
    const missing = run([], comments, { STATIC_WEB_APP_URL: '' });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /did not provide a preview URL/);
    assert.equal(missing.stdout, '');
    const failed = run([], comments, { WRITE_STATUS: '23' });
    assert.equal(failed.status, 23);
    assert.doesNotMatch(failed.stdout, /DELETE/);
});
