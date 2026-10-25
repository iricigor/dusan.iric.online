'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const workflow = fs.readFileSync(path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'validate-tutors.yml'), 'utf8').replace(/\r\n/g, '\n');
const commentJob = workflow.slice(workflow.indexOf('\n  comment:'));
const script = commentJob.match(/        run: \|\n([\s\S]+)$/)[1].replace(/^ {10}/gm, '');
const bash = process.platform === 'win32'
    ? path.join(process.env.ProgramFiles, 'Git', 'bin', 'bash.exe')
    : 'bash';
const environment = {
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_NUMBER: '7',
    GITHUB_RUN_ATTEMPT: '1',
    PR_NUMBER: '45',
    VALIDATION_RESULT: 'success',
    HISTORY_URL: 'https://github.com/owner/repo/actions/runs/123/artifacts/10',
    MATHS_URL: 'https://github.com/owner/repo/actions/runs/123/artifacts/11'
};

function comment(overrides = {}) {
    const result = spawnSync(bash, ['--noprofile', '--norc', '-e', '-o', 'pipefail'], {
        input: 'gh() { printf "%s\\0" "$@"; }\n' + script,
        env: { ...process.env, ...environment, ...overrides },
        encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.error?.message || result.stderr);
    const args = result.stdout.split('\0');
    assert.deepEqual(args.slice(0, 6), ['pr', 'comment', '45', '--repo', 'owner/repo', '--body']);
    assert.equal(args.length, 8);
    return args[6];
}

test('CI uploads separate, attempt-specific HTML archives and isolates PR write permissions', () => {
    assert.match(workflow, /name: history-example-\$\{\{ github.run_attempt \}\}/);
    assert.match(workflow, /name: maths-example-\$\{\{ github.run_attempt \}\}/);
    for (const subject of ['history', 'maths']) {
        assert.ok(workflow.includes(`path: \${{ runner.temp }}/tutor-default-pages/${subject}.html`));
    }
    const validationJob = workflow.slice(0, workflow.indexOf('\n  comment:'));
    assert.doesNotMatch(validationJob, /pull-requests: write/);
    assert.match(commentJob, /if: always\(\) && github.event_name == 'pull_request'/);
    assert.match(commentJob, /pull-requests: write/);
    assert.doesNotMatch(commentJob, /actions\/checkout/);
});

test('every successful run or attempt creates a new PR comment with both download links', () => {
    for (const attempt of ['1', '2']) {
        const body = comment({ GITHUB_RUN_ATTEMPT: attempt });
        assert.ok(body.includes(`[Download history.html (ZIP)](${environment.HISTORY_URL})`));
        assert.ok(body.includes(`[Download maths.html (ZIP)](${environment.MATHS_URL})`));
        assert.ok(body.includes(`/actions/runs/123/attempts/${attempt}`));
        assert.ok(body.includes(`run 7, attempt ${attempt}`));
        assert.match(body, /expire after 14 days/);
        assert.doesNotMatch(body, /unavailable/);
    }
});

test('failed, cancelled or incomplete builds post an explicit notice rather than broken downloads', () => {
    for (const overrides of [
        { VALIDATION_RESULT: 'failure', HISTORY_URL: '', MATHS_URL: '' },
        { VALIDATION_RESULT: 'cancelled', MATHS_URL: '' },
        { MATHS_URL: '' }
    ]) {
        const body = comment(overrides);
        assert.match(body, /a complete pair of downloads is unavailable/);
        assert.doesNotMatch(body, /Download .*\.html/);
        assert.match(body, /View this validation run/);
    }
});
