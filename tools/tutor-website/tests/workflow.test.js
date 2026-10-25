'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const workflow = fs.readFileSync(path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'validate-tutors.yml'), 'utf8').replace(/\r\n/g, '\n');
function job(name) {
    const jobs = workflow.slice(workflow.indexOf('\njobs:\n'));
    const start = jobs.indexOf(`\n  ${name}:\n`);
    assert.notEqual(start, -1, `Missing ${name} job`);
    return jobs.slice(start + 1).split(/\n(?=  [a-z-]+:\n)/)[0];
}
const commentJob = job('comment');
const releaseJob = job('release');
const changesJob = job('changes');
const script = text => text.match(/        run: \|\n([\s\S]+)$/)[1].replace(/^ {10}/gm, '');
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
    MERGE_SHA: '0123456789abcdef0123456789abcdef01234567',
    API_OUTPUT: '',
    API_STATUS: '0',
    VALIDATION_RESULT: 'success',
    HISTORY_URL: 'https://github.com/owner/repo/actions/runs/123/artifacts/10',
    MATHS_URL: 'https://github.com/owner/repo/actions/runs/123/artifacts/11'
};

function runJob(jobText, overrides = {}) {
    return spawnSync(bash, ['--noprofile', '--norc', '-e', '-o', 'pipefail'], {
        input: 'gh() { if [[ "$1" == "api" ]]; then printf "%s" "$API_OUTPUT"; return "$API_STATUS"; else printf "%s\\0" "$@"; fi; }\n' + script(jobText),
        env: { ...process.env, ...environment, ...overrides },
        encoding: 'utf8'
    });
}

function githubArguments(jobText, overrides = {}) {
    const result = runJob(jobText, overrides);
    assert.equal(result.status, 0, result.error?.message || result.stderr);
    return result.stdout.split('\0').slice(0, -1);
}

function comment(overrides = {}) {
    const args = githubArguments(commentJob, overrides);
    assert.deepEqual(args.slice(0, 6), ['pr', 'comment', '45', '--repo', 'owner/repo', '--body']);
    assert.equal(args.length, 7);
    return args[6];
}

test('CI uploads separate, attempt-specific HTML archives and isolates PR write permissions', () => {
    assert.match(workflow, /name: history-example-\$\{\{ github.run_attempt \}\}/);
    assert.match(workflow, /name: maths-example-\$\{\{ github.run_attempt \}\}/);
    for (const subject of ['history', 'maths']) {
        assert.ok(workflow.includes(`path: \${{ runner.temp }}/tutor-default-pages/${subject}.html`));
    }
    const validationJob = job('validate');
    assert.doesNotMatch(validationJob, /(?:contents|pull-requests): write/);
    assert.match(validationJob, /needs: changes/);
    assert.match(validationJob, /if: needs.changes.outputs.changed == 'true'/);
    assert.match(commentJob, /if: always\(\) && github.event_name == 'pull_request'/);
    assert.match(commentJob, /pull-requests: write/);
    assert.doesNotMatch(commentJob, /actions\/checkout/);
    assert.ok(commentJob.includes("needs.changes.outputs.changed == 'true'"));
});

test('only relevant merged PRs release validated raw HTML at the actual merge commit', () => {
    assert.match(workflow, /pull_request_target:\n    branches:\n      - main\n    types:\n      - closed/);
    assert.doesNotMatch(workflow.split('\njobs:')[0], /\n  release:|\n    paths:/);
    assert.match(releaseJob, /needs: validate/);
    assert.match(releaseJob, /if: github.event_name == 'pull_request_target' && github.event.pull_request.merged == true/);
    assert.match(changesJob, /if: github.event_name != 'pull_request_target' \|\| github.event.pull_request.merged == true/);
    assert.match(job('validate'), /ref: \$\{\{ github.event_name == 'pull_request_target' && github.event.pull_request.merge_commit_sha \|\| github.sha \}\}/);
    assert.match(job('validate'), /persist-credentials: false/);
    assert.match(releaseJob, /contents: write/);
    assert.match(releaseJob, /actions\/download-artifact@v4/);
    assert.ok(releaseJob.includes('artifact-ids: ${{ needs.validate.outputs.history-id }},${{ needs.validate.outputs.maths-id }}'));
    for (const subject of ['history', 'maths']) {
        assert.ok(job('validate').includes(`${subject}-id: \${{ steps.${subject}.outputs.artifact-id }}`));
    }
    assert.match(releaseJob, /merge-multiple: true/);
    assert.doesNotMatch(releaseJob, /actions\/checkout|node --test|build\.js|run_attempt/);
    const args = githubArguments(releaseJob, { RUNNER_TEMP: '/tmp/runner directory' });
    assert.deepEqual(args.slice(0, 9), [
        'release', 'create', '--repo', 'owner/repo', '--target', environment.MERGE_SHA,
        '--title', 'Tutor examples - PR #45', '--notes'
    ]);
    assert.match(args[9], /merged PR #45/);
    assert.deepEqual(args.slice(10), [
        '--latest=false', '--', 'tutor-pr-45',
        '/tmp/runner directory/tutor-release-pages/history.html',
        '/tmp/runner directory/tutor-release-pages/maths.html'
    ]);
});

test('reruns update the same tutor release but refuse an existing release for a different commit', () => {
    assert.deepEqual(githubArguments(releaseJob, {
        API_OUTPUT: environment.MERGE_SHA, RUNNER_TEMP: '/tmp/runner'
    }), [
        'release', 'upload', '--repo', 'owner/repo', '--clobber', '--', 'tutor-pr-45',
        '/tmp/runner/tutor-release-pages/history.html', '/tmp/runner/tutor-release-pages/maths.html'
    ]);
    const conflict = runJob(releaseJob, { API_OUTPUT: 'different-commit' });
    assert.equal(conflict.status, 1);
    assert.match(conflict.stderr, /different commit; refusing/);
    assert.equal(conflict.stdout, '');
    const apiError = runJob(releaseJob, { API_STATUS: '23' });
    assert.equal(apiError.status, 23);
    assert.equal(apiError.stdout, '');
});

test('change detection checks every PR file including old rename paths and skips unrelated changes', t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-workflow-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const output = path.join(directory, 'outputs');
    assert.match(changesJob, /gh api --paginate/);
    assert.ok(changesJob.includes('(.previous_filename // empty)'));
    const unrelated = Array.from({ length: 350 }, (_, index) => `site/page-${index}.html`);
    for (const [files, expected] of [
        [[], false],
        [unrelated, false],
        [[...unrelated, 'tools/tutor-website/styles.css'], true],
        [['.github/agents/tutor-common.agent.md'], true],
        [['.github/workflows/validate-tutors.yml'], true],
        [['gems/renamed.js', 'tools/tutor-website/old.js'], true],
        [['tools/unrelated/file.js', '.github/agents/unrelated.agent.md'], false]
    ]) {
        fs.writeFileSync(output, '');
        githubArguments(changesJob, {
            GITHUB_EVENT_NAME: 'pull_request', GITHUB_OUTPUT: output, API_OUTPUT: files.join('\n')
        });
        assert.equal(fs.readFileSync(output, 'utf8').trim(), `changed=${expected}`);
    }
    fs.writeFileSync(output, '');
    githubArguments(changesJob, { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_OUTPUT: output, API_STATUS: '23' });
    assert.equal(fs.readFileSync(output, 'utf8').trim(), 'changed=true');
    fs.writeFileSync(output, '');
    const apiError = runJob(changesJob, { GITHUB_EVENT_NAME: 'pull_request', GITHUB_OUTPUT: output, API_STATUS: '23' });
    assert.equal(apiError.status, 23);
    assert.equal(fs.readFileSync(output, 'utf8'), '');
});

test('every successful run or attempt creates a new PR comment with both download links', () => {
    for (const attempt of ['1', '2']) {
        const body = comment({ GITHUB_RUN_ATTEMPT: attempt });
        assert.ok(body.includes(`[Download history.html (ZIP)](${environment.HISTORY_URL})`));
        assert.ok(body.includes(`[Download maths.html (ZIP)](${environment.MATHS_URL})`));
        assert.ok(body.includes(`/actions/runs/123/attempts/${attempt}`));
        assert.ok(body.includes(`run 7, attempt ${attempt}`));
        assert.match(body, /retention is up to 14 days/);
        assert.match(body, /use the newest comment/);
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
