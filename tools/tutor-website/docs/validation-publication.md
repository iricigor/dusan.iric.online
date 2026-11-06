# Validation, releases and publication

[Generator quick start and contract index](../README.md).

## Pull request validation

The **Validate tutors** workflow first makes a lightweight, paginated API check
of **all files in the PR**, including previous filenames for renames. Validation
and generation run only if that list contains `tools/tutor-website/**`,
`.github/agents/tutor-*.agent.md`, or `.github/workflows/validate-tutors.yml`.
This checks the complete PR, not just its latest commit, and avoids the
300-file limit of GitHub's native workflow path filters.
Unrelated PRs skip the build and release jobs. Manual dispatch explicitly
requests validation and generation without creating a release.
It checks the tutor definitions and runs the Node test suite, including real
offline Chrome coverage on the hosted runner.
The comment-script regression tests also use Bash (Git Bash on Windows).

Node runs separate test files concurrently. The browser suite also runs up to
two independent tests concurrently, each with its own Chrome process, profile,
downloads and temporary HTML files. `TUTOR_BROWSER_CONCURRENCY` sets this
positive-integer limit (default `2`, explicitly set in CI); it is not a tutor
count. Use `1` for serial diagnosis or compare `2` and `3` on the same machine
before increasing the limit.

The responsive width/theme matrix finishes finite animations after the native
tab transition is ready, then awaits their completion before inspecting layout.
This also settles animated drawer cleanup rather than relying on a 300 ms
transition as an incidental delay. The optimization is test-only and is restored
even if a layout check fails. Dedicated native/fallback animation, rapid-tab
selection and reduced-motion checks still use real animation behavior. No
responsive combinations or assertions are skipped.

### Validation timing baseline

Measurements for this optimization on Windows with Node **26.5.1**, installed
Edge, no screenshot capture, and the complete suite:

| Configuration | Full-suite duration | Result |
| --- | --- | --- |
| Unchanged suite, serial browser tests | 165.1 s | 111 passed, none skipped |
| Optimized animations, one browser worker | 80.5 s | 112 passed, none skipped |
| Optimized animations, two browser workers (two final runs) | 54.5 s / 50.2 s | 112 passed each, none skipped |
| Optimized animations, three browser workers (two final runs) | 51.3 s / 51.6 s | 112 passed each, none skipped |

The additional test verifies restoration after a responsive-layout failure.
Two and three workers have overlapping timings; two avoids extra browser load
without a consistent speed penalty. Earlier concurrency trials exposed startup
file-lock, pointer-paint and shutdown races that were fixed in the test harness
before these final runs. These local measurements are not a hosted-runner
guarantee: the original GitHub Actions run
[42229880882](https://github.com/iricigor/dusan.iric.online/actions/runs/42229880882)
used Node 22 and Chrome and recorded **156.5 s** for the test suite.
The optimized hosted run
[42235012412](https://github.com/iricigor/dusan.iric.online/actions/runs/42235012412)
recorded **53.9 s**, with all **112 tests passing** and none skipped: about
**66% less test time**. The complete `validate` job fell from **164 s to 62 s**.
Both hosted runs used Node 22 and Chrome; runner variability still applies.

### Prepared example artifacts

After validation, it discovers both current defaults through `capabilities`,
copies their JSON into the runner's temporary directory, and uses the guarded
shared builder to generate `history.html` and `maths.html`. Download the
separate **history-example** and **maths-example** artifacts from the workflow
run (their names end with the run-attempt number). Each ZIP contains one
standalone HTML file. A separate, checkout-free reporting job posts a **new**
PR comment on every run/attempt, with both download links and the validation-run
link; it never updates an earlier comment. Failed validation posts a failure
notice instead of broken download links. Reporting requires PR comment
permissions, which GitHub withholds from fork pull-request tokens by default.
Downloads require GitHub sign-in and are retained for up to 14 days. Reruns or
artifact deletion can invalidate earlier links; use the newest comment.
This is deterministic
generation from the prepared datasets, not an AI authoring session. It never
commits generated files or publishes them to `site`.

## Automatic tutor releases

Merging a relevant PR into `main` automatically creates a GitHub release tagged
**`tutor-pr-<PR number>`**, for example `tutor-pr-45`. Relevance uses the same
complete PR file list described above; unrelated merges and PRs closed without
merging do not build or release tutor examples. The `tutor-` prefix separates
this release family from conventions such as `gems-v1.0.0`; GitHub still shows
all families on one Releases page.

The merge workflow validates and builds the **actual merged commit**, not the
PR head or an unrelated newer `main`. A separate job downloads those exact
validated artifacts and creates the release at that commit with **history.html**
and **maths.html** as raw HTML assets. Downloads do not require unpacking a ZIP
and are not subject to the Actions artifact retention limit. Automatic tutor
releases use PR-based tags rather than guessing semantic-version increments,
and `--latest=false` avoids replacing the repository's overall latest release.

The merge trigger is `pull_request_target: closed`, guarded by `merged == true`.
Its path check has read-only PR access; validation checks out only the approved
merge commit with read-only contents permissions and no persisted credentials.
Only the checkout-free release job receives `contents: write`. Artifact IDs
connect the jobs, so rerunning only a failed release job still selects the
original validated pages. Reruns reuse the same release and replace only the
two named example assets with `--clobber`; a release already targeting a
different commit causes an explicit failure instead.

Publishing an unrelated or manually created release does not trigger tutor
builds. The workflow does not commit generated pages or deploy them to `site`.
PR download comments remain exclusive to the pre-merge PR validation runs.

## Local review and publication

The website helper opens the actual generated file locally for technical review.
Check the three shared tabs, name validation,
original text, glossary, progressively reduced step/hint reveals,
all content, narrow layout, light/dark themes and offline operation. For both
subjects, play all quiz modes through feedback/results and storage warnings.
The browser test uses installed Edge/Chrome (or `TUTOR_BROWSER_PATH`) and Node's
built-in WebSocket/CDP, with no browser/package downloads. It skips explicitly
when no supported local browser exists; report that limitation and review
manually rather than pretending the browser check passed. The test fixtures
do not replace inspection of the actual draft. Verify within-level random
selection without repeats, increasing difficulty, correct/partial/incorrect
answers, explicit continuation, subject timing/duration behavior and
popover dismissal/focus. Return technical results and explicit failures or
unexercised checks to the caller. Return language and educational problems
to the subject tutor rather than silently changing the lesson.

`tests/browser.test.js` orchestrates ordered scenarios in `tests/browser` with
the CDP lifecycle/interaction helper in `tests/helpers/browser.js`. Within the
cross-subject integration test, those scenarios share one browser/page and
result history; do not run them independently or in parallel. Other browser
tests are isolated and may overlap within the configured worker limit.
The fake DOM/clock harness in `tests/helpers/runtime.js` uses the same runtime
assembly as generated pages. Build coverage remains discoverable through
`tests/*.test.js`, divided into capabilities/defaults, rendering/validation and
guarded filesystem suites. Set `TUTOR_SCREENSHOT_DIRECTORY` to an absolute
session-artifact directory to capture representative offline surfaces. Each
browser writes into its own `tutor-browser-*` subdirectory so parallel tests
cannot overwrite one another's screenshots.

The subject tutor reviews the actual rendered educational content, Czech
language, original preservation, explanations, difficulty and worked solutions.
The common helper provides guidance only, not build/browser coordination.

Drafts remain in session artifacts. Give the user the absolute HTML path and
request review/explicit approval. Only after approval may the calling subject
workflow copy HTML to `site`, update its index and open a publication PR.
Tooling PR approval is not approval of generated teaching material.
