# Authoring and build handoff

[Generator quick start and contract index](../README.md).

## Discover, author, hand off

From the repository root in PowerShell:

```powershell
node tools\tutor-website\build.js capabilities history
node tools\tutor-website\build.js capabilities maths
node tools\tutor-website\build.js build "C:\session-artifacts\handoff.json"
node --test tools\tutor-website\tests\*.test.js
```

`capabilities` returns absolute schema, validator, documentation and builder
paths, version, timing policy, generation/assessment status, shared tabs,
the name requirement, passive answer-duration policy and limitations.
It also returns `authoringRequirements` and `quizModes`, the website-owned
task counts described below. Subject tutors define what makes a task easy,
medium or hard; they consume these counts rather than maintaining local quotas.
Unsupported subjects/operations fail with a nonzero exit code, not a fallback.
`examplePath` identifies prepared, reusable default lesson JSON for both subjects.
The structural test fixture is not teaching material. Both subjects use
**`tools\tutor-website\lesson.schema.json`, version 3**, and `validate.js`.
Common fields and definitions have one source; conditional subject sections
preserve their different teaching and assessment needs.

| Subject | Contract | Output now |
|---|---|---|
| History | Shared v3, history section | Original text, factual review/corrections, learning, quiz and session results |
| Maths | Shared v3, maths section | Original material, progressive worked examples/practice, exact checking, untimed quizzes, partial scoring and named session results |

Legacy history v1 and maths v2 JSON remain accepted without rewriting source
material. Compatibility is limited to lesson data and grading, not old tool
paths or APIs: use the shared builder and schema for both subjects.
New content and prepared defaults use v3 with
`subject`, `language: "cs-CZ"` and a nonblank motivational `subtitle`.
The schema can enforce presence, not whether wording is genuinely encouraging;
that review belongs to `tutor-common` and the subject tutor.

Maths assessment retains the established scoring rules; no author-supplied scoring
configuration is needed. Symbolic algebra and interactive geometry remain
unsupported.

### Website-owned task counts

`authoringRequirements` is guidance for new lesson authors, not an additional
structural validator rule. `minimumTasks` is 30 for either subject, counting
history questions or whole maths exercises (`taskUnit`), never maths answer
fields. `minimumByDifficulty` is easy 2, medium 5, hard 3, derived from the
largest selections in the shared runtime's `MODES`. The balanced
`recommendedByDifficulty` is 6/15/9.
For substantial history material, `preferredTaskRange` is 50–100; maths uses
30–100. Material must support useful distinct tasks: never pad to reach a count.
`minimumTasksEnforcedByValidator: false` distinguishes the new-authoring total
from structural validation; the validator still enforces sufficient tasks for every mode.
It continues accepting supported smaller legacy banks (at least 10 whole
tasks with the required difficulty mix), including unchanged v1/v2 data.

`quizModes` supplies named easy/medium/hard selection counts for each mode:
easy 1/1/1, medium 1/2/2, hard 2/5/3. These come from the runtime, not a
separate subject-profile configuration. Selection remains random without
replacement within each level and presents easy → medium → hard.
History's hard-mode year guarantee and subject scoring/timing are unchanged.

### Prepared defaults

When a subject tutor receives no topic/source material, or the user explicitly
asks for a default/example, it reuses `capabilities.examplePath`:

| Subject | Prepared source | Topic |
|---|---|---|
| History | `tools\tutor-website\examples\defenestrace.json` | Od defenestrace k Bílé hoře |
| Maths | `tools\tutor-website\examples\zlomky-a-prevody-delky.json` | Zlomky a převody jednotek délky |

These sources are prepared once, not synthesized on each default request.
History reuses the existing reviewed example. The maths default combines both
requested topics in **one** lesson: fraction calculations (including a fraction
of a whole) and length conversions across mm/cm/dm/m/km. It has four worked
examples and 30 tasks (6 easy/15 medium/9 hard), using integer, fraction and decimal
answers. Conversion answers are numbers in the unit specified by each question.
Several word problems
combine the two topics. All fixed-unit steps expect a number without a unit
suffix: converting 2 km to metres accepts and displays `2000`, not `2000 m`.
Worked calculations still show units. Comma and dot are accepted by value
matchers; equivalent numeric values are accepted when the declared policy
permits them. The fraction-simplification step deliberately gives `1/2` full
credit and `3/6` half credit.
Both topics stay together in this single default.

The tutor reads and copies the source JSON unchanged to a **new** file in its
session artifact directory, then uses the normal validated build handoff below.
Do not hand the repository source directly to `build`, overwrite it, regenerate
it, substitute test fixtures, or demand new material just to run a default.
Missing or incompatible prepared data is an explicit error, not a request to
silently author another default. Identify the chosen topic to the user.
Explicit custom topics/material still use normal authoring unless the user
explicitly chooses the default instead. Recorded history review is not a claim
of newly performed source verification.

Only reusable JSON is versioned here. Generated default HTML remains a local
draft; this does not publish or approve a lesson or change existing site pages.

### Build handoff

The calling agent sends this JSON object (use actual absolute session paths):

```json
{
  "operation": "build",
  "subject": "maths",
  "artifactDirectory": "C:\\session-artifacts",
  "inputPath": "C:\\session-artifacts\\lesson.json",
  "outputPath": "C:\\session-artifacts\\lesson.html",
  "publicationPath": "maths/zlomky.html",
  "overwriteApproved": false
}
```

`publicationPath` is optional and, when supplied, must be a relative `.html`
path under the deployed `site` root (for example, `test/defenestrace.html`,
not `site/test/defenestrace.html`). The default is
`test/<lesson.id>.html`, so published lessons are available under the `test/`
folder. This explicit override supports existing and future publication
folders without guessing from a local draft filename. The generator resolves the
path against `https://dusan.iric.online/`, URL-encodes each path segment, and
returns the resulting `publicationUrl`; the embedded QR code and visible link use
that same canonical URL, never the draft or preview path. The QR image is
generated into the standalone HTML and works offline; opening its destination
still requires connectivity.
The sharing block appears only on the original-text tab, beside its first
section on desktop and immediately below that section on narrow screens
(760px or less). Remaining original-text sections retain the full content width.

For agent discovery the request is `{ "operation": "capabilities", "subject":
"maths" }`; the CLI spelling above is equivalent. Read the returned contract
before authoring, then save lesson JSON and handoff JSON outside the repository.
For builds, every path is absolute, input/output resolve inside the caller's
artifact directory, and all draft paths stay outside the repository. Containment
checks resolve links/junctions, including existing parents of a new output.
Invalid JSON, invalid contracts, path escapes and unknown fields fail explicitly
before writing. Diagnostics include JSON locations where applicable. Existing
HTML is protected; set `overwriteApproved: true` only with explicit permission
to replace that exact file. Multiple-hard-link outputs are refused.

A successful build returns actual absolute input/output paths, the canonical
`publicationUrl`, generation and assessment status, and limitations. This confirms generation, not educational
or language approval. Return stderr/exit failures to the caller; do not silently
repair educational content, report a failed build as success, or change schemas
for a routine lesson request.

## History authoring and quiz rules

History tutoring is opt-in through `.github\agents\tutor-history.agent.md`,
which loads `tutor-common`. Subject tutors author JSON, never HTML. Inspect
attached images and confirm their transcription; ask about unreadable text.
Consult historical references before reviewing custom material, preserve the
source verbatim, and teach corrected facts. Review text, correction explanations,
source titles and linked references must be Czech. Disclose uncertain facts or
failed verification; ask before substituting foreign-language references.
Mark corrections with an exact, uniquely occurring quote, its zero-based original
section, explanation and listed source URL. Describe sourced additions in
`review`, use simple Czech, teach every quiz answer, and avoid duplicate padding.
At each person's first mention in authored teaching content, explain their
title/role, birth–death dates, father and, where relevant, reign dates and
territory. Verify the biography against consulted references and disclose
unknown/disputed/unverified details instead of guessing. For first mentions
in original source text, use separate glossary definitions with matching name
forms, never insert explanations into the preserved original.
Review and source information remain in the embedded lesson metadata, not a
visible Ověření a doplnění card. Exact-quote factual correction popovers remain.
Use the website-owned task counts returned by capabilities. History's
educational difficulty definitions remain in the history tutor profile.
The prepared bank contains 6 easy, 15 medium and 9 hard questions, with teaching
extended through the post-battle changes and the Thirty Years' War. Request
more material if the required useful questions cannot be supported; never pad
with paraphrased duplicates.
Legacy structural validation still accepts smaller existing banks.

For year questions with partial-credit intervals, describe error relative to
the correct answer, not absolute accepted endpoints in prompts or pre-answer
hints. For example, use “Napiš přesný rok. Odhad s odchylkou nejvýše 2 roky
získá polovinu bodů.” rather than an accepted-year range that reveals its
midpoint. Match the declared policy, including asymmetric or exclusive bounds:
use directional/strict-error wording when necessary. Exact answers and bounds
remain explicit in assessment JSON and may be discussed after submission.
This wording rule does not change assessment policies or preserved source text.

| Quiz mode | Easy: true/false | Medium: four options | Hard: short answer |
|---|---|---|---|
| Easy, 3 questions | 1 | 1 | 1 |
| Medium, 5 questions | 1 | 2 | 2 |
| Hard, 10 questions | 2 | 5 | 3 |

Sampling is without replacement within each difficulty. Every hard-mode run
includes a year question. Questions earn 10/20/30 base points by difficulty,
regardless of quiz mode. V3 questions declare full/partial answer matchers as
documented in [assessment policies](assessment.md#shared-fullpartial-answer-policies),
including all full-credit name variants in `acceptedAnswers`.
Only fully correct answers strictly before **15000 ms** earn the mandatory
double-points speed bonus. Late answers remain available; incorrect and partial
answers never earn a bonus. Grades use base points only, with 80/60/40/20 percent
boundaries. The leaderboard sorts total points first, then shorter active answering duration.
The speed deadline continues while a confirmation or another browser page is shown;
it is separate from the [answer-duration measurement](page-behavior.md#completion-local-ranking-and-answer-duration).
Maths never starts the shared controller's bonus timer and has no countdown,
running duration display, speed indicator or bonus.

### Existing lesson data

Existing history v1 and maths v2 JSON still use the shared builder and validator.
Previously published HTML remains unchanged until separately
approved publication; the published example retains its reviewed v1 data.
The reusable default adds v3 metadata and styled teaching notes, and now includes
all seven supplied original sections verbatim, including fun facts and the closing
quotation. Teaching and assessment still cover the selected uprising/White Mountain
material, not the entire expanded chapter. Its year ranges are now declared
explicitly; the 1620 question uses inclusive 1615–1625 for partial credit.
Published HTML is self-contained and does not depend on the generator. The
removed history CLI/validation wrappers and subject schema aliases are not
needed to display it. The sole build handoff never writes into the repository;
copy an approved artifact to `site` only through the publication workflow.
