# Internal tutor website generator

Requires Node.js 22+. No npm packages, Python, AI keys, runtime network, or
external page assets. `tutor-website` remains internal-only; subject tutors own
educational content, Czech-language review, rendered educational review and
publication approval. The website helper owns technical review of generated pages.
Never change `gems` for this workflow.

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
documented below, including all full-credit name variants in `acceptedAnswers`.
Only fully correct answers strictly before **15000 ms** earn the mandatory
double-points speed bonus. Late answers remain available; incorrect and partial
answers never earn a bonus. Grades use base points only, with 80/60/40/20 percent
boundaries. The leaderboard sorts total points first, then shorter active answering duration.
The speed deadline continues while another lesson tab/browser page is shown;
it is separate from the answer-duration measurement described below.
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

## Shared page and quiz ownership

Subject tutors request the website agent's capabilities/schema and return
schema-valid JSON only. They do not write HTML, fork quiz code, choose a
different navigation structure or implement their own answer parser.
The website agent validates that JSON and builds standalone HTML.

All browser assets are owned by `tools\tutor-website`: `template.html` is the
single shell, `styles.css` is the single stylesheet, and `runtime.js` implements navigation,
glossary, themes, name validation, answer submission/locking, explicit next-step
progression, running score/progress, results and session-storage warnings for both subjects.
`history.js` and `maths.js` are adapters for content, answer formats,
sampling and assessment rules, not independent quiz applications.
`page.js` embeds the common assets and only the selected subject adapter.
Both prepared lesson sources live in `examples`, and the shared agent-profile
suite lives in `tests\agents.test.js`. History generation, scoring and runtime
tests also live here, alongside the maths and shared tests. Import history
assessment helpers directly from `history.js`. There is no separate
history-tutor tool directory, legacy CLI implementation, or subject schema alias.

### What stays separate, and why

| Owner/surface | Shared or separate | Reason |
|---|---|---|
| `tutor-common` | Shared teaching and workflow policy, including motivation, explicit answer credit, increasing difficulty, source handling, defaults and approval boundaries | Read/search guidance only; it does not execute builds or browser checks |
| `tutor-website` helper and capabilities | Bank size, numerical difficulty quotas, quiz-mode counts, generation and technical review of actual drafts | Subject tutors consume requirements and retain educational review; fixture tests alone do not prove draft behavior |
| `tutor-website` schema and validator | One v3 contract, shared metadata/original/glossary/styles; conditional subject sections | One authoritative definition avoids drift without requiring fictional dates/sources in maths or numeric steps in history |
| Template, CSS, runtime, assessment and utilities | Shared, entirely in this directory | Color, animation, callouts, navigation, names, numeric/unit parsing, string normalization, exact/partial matching, feedback/progression, grades, results and storage warnings must behave consistently |
| `history.js` | Separate content/scoring adapter in this directory | Factual chunks, mandatory speed bonus, base-only grades and duration tie-breaking are history rules; declared aliases and year ranges use the shared evaluator |
| `maths.js` | Separate content/scoring adapter in this directory | Worked steps, independent per-step points, accuracy points and no timing are maths rules; parsing and declared representation/value policies use the shared evaluator |
| Subject agent profiles and prepared JSON | Separate educational content and easy/medium/hard teaching definitions | Historical verification, first-mention biographies and mathematical solution authoring need different expertise; numerical bank quotas belong to website capabilities |
| Legacy lesson data/grading | Supported in the shared schema and evaluator | Existing saved JSON can be rebuilt without preserving obsolete commands or schema paths |
| Published HTML and `gems` | Unchanged, independent snapshots/workflow | Tooling changes do not approve publication or changes to Gemini |

Adapters have no separate stylesheets, page templates, name gates, storage
implementations or quiz controllers. Shared mode mixes, shuffle and grade
thresholds are defined once in `runtime.js`. Every quiz selects randomly
without replacement within a level, then presents easy → medium → hard.
There is no final cross-level shuffle. The history year guarantee remains.

### Motivation, semantic paragraphs and motion

The factual `topic` remains the page title. Required v3 `subtitle` is a short
Czech invitation to learn, e.g. “Objevuj nové souvislosti, krok za krokem!”
Legacy lessons without it receive a shared encouraging subtitle on the page,
without mutating their JSON. Never pressure a learner to be fast or perfect.

Use `original[].style` to decorate a source section while preserving `text`
verbatim, including correction quotes and whitespace. Generated maths examples
and history learning chunks may add an optional `paragraphs` array:

```json
{
  "paragraphs": [
    { "style": "note", "text": "Různé zápisy mohou mít stejnou hodnotu." },
    { "style": "example", "text": "7/4 = 1 3/4 = 1,75." },
    { "style": "tip", "text": "Nejprve zkus vlastní postup." },
    { "style": "warning", "text": "Jmenovatel nesmí být nula." }
  ]
}
```

Allowed styles are `plain`, `note`, `example`, `tip`, `warning`, `comment`, `fun`
(fun fact) and `quote` (quotation). Labels are Czech
text, not color alone; source labels sit outside the preserved source paragraph.
All values remain inert plain text with glossary support in teaching notes.
No author-supplied HTML, CSS, class names or scripts are accepted.
Original sections may also supply `paragraphs` to style existing paragraphs
individually, for example a final `quote`. Their `text` values joined with exactly
`\n\n` must equal the section's canonical `text`; the validator rejects changes,
omissions or inserted explanations. Correction quotes must fit within one styled
paragraph. Quotations use semantic blockquotes, and original paragraph styling
adds no visible label inside source text. Existing sections without `paragraphs`
remain supported. Never place generated notes inside preserved source text.

Shared Fluent-inspired attached icon-and-label tabs, soft elevated cards and
theme-aware accents establish hierarchy without a UI library. The active tab
joins the content panel; all three tabs share a 12rem desktop width and shrink
equally on smaller screens. Tab/tabpanel semantics, a single tab stop and
Left/Right/Home/End navigation support keyboard users.
Tab switches crossfade the outgoing/incoming main panel with a subtle vertical
slide over 300ms using native View Transitions where available. Other browsers
receive an entrance-only fade/slide without delaying activation. Rapid selections
replace pending transitions rather than queueing outdated tabs. Reduced motion
disables both paths. A stable root scrollbar gutter (always-reserved scrollbar
fallback on older browsers) prevents sideways jumps between short and long tabs;
the document scrolls naturally without fixed-height or nested scrolling panels.
The binary sun/moon
switch exposes its current dark-mode state and follows system-theme changes
until explicitly toggled. Audience remains authoring metadata, not a visible
age badge. Mode pills use stronger theme-aware colored fills and show
only difficulty (with green/yellow/red emoji) and question counts. All scoring
rules sit in a native expandable disclosure.
The short `Přezdívka` label and input share a row, including on mobile.
The three-letter/60-character requirements appear in a native tooltip and an
accessible field description; validation errors stay visible. The redundant
privacy paragraph is omitted from setup; session-local storage remains unchanged.
In Učit se, two icon-only `Rozbalit vše` / `Sbalit vše` controls sit at the right
of the tab bar, outside tablist semantics, with Czech tooltips, accessible labels
and 44px targets. They affect only learning
hints, steps, answers and explanations, never the glossary or quiz disclosures.
Individual disclosures remain independently operable. Hints share a small
`Nápověda 💡` button floated inside the top-right of its prompt paragraph,
with text wrapping around it. The button exposes its expanded state and controls
an explanation below the entire paragraph. Native step/result/solution reveals
retain descriptive labels in compact, borderless numbered lists; touch targets
remain 44px on coarse pointers. All hints, steps, results and solutions start
collapsed in both subjects; the main lesson text stays visible.

The subject badge and lesson title share one row, retaining distinct badge
and heading typography. Long titles wrap within their column on narrow screens.
Motivational subtitles use the subject accent, not purple. The simple identity
mark sits to the left, vertically centered against the combined title/subtitle
block; the theme switch stays to the right and tabs remain below.
Trusted subject selectors in the one shared stylesheet provide sepia/amber
history accents and blue/teal maths accents. Softly visible CSS-only paper grain or
graph-paper backgrounds cover entire original/learning cards, including headings
and padding, in both themes; paragraphs remain transparent, not separate strips.
Card tints are midway between the original pale and stronger palettes; pattern
opacity is 8.5%, halfway between the earlier 5% and 12% treatments.
Fun facts use warm golden/amber boxes, rounded icon badges and CSS-only sparkles.
Other semantic callouts retain their own styling. Quiz/results
backgrounds remain neutral; no lesson-supplied CSS or external assets are used.

A subdued, smaller cog at the right of the tab bar toggles native quiz tools
only in Hrát si, in the same action area as learning expand/collapse controls.
It remains keyboard-accessible with a 44px target and brightens on focus/hover.
`Stáhnout JSON` downloads the complete question bank locally as UTF-8 JSON,
including correct answers, without starting a quiz or reading learner records.
The export has `subject`, `lessonId`, `topic`, `summary` and `questions`.
`summary.totalQuestions` counts history questions or whole maths exercises;
`summary.byDifficulty` contains `easy`, `medium` and `hard` counts.
History entries preserve question data and add a `correctAnswers` array;
maths exercises preserve typed step answers/assessment and add a formatted
`correctAnswer` to each step. No attempt, nickname or student answers are exported.
The compact panel contains just the download action; its explanation is in a
tooltip and accessible description. It closes after successfully starting a
download, on outside click/focus, Escape or its cog. Download/Escape restore cog
focus; outside dismissal does not steal focus. Failures keep the panel open with
a visible alert and retry action.

Brief animations cover new questions/answer controls,
feedback, results, tabs, glossary popovers and opened learning hints. They never
auto-advance, change timing/scoring or obscure answers. Reduced-motion preference
disables animations, transitions and hover movement across both subjects.

### Icons, glossary and standalone branding

Optional `icon` is a nonblank plain-text string of at most 32 characters, intended
for a short emoji such as `🏰`, `⚖️` or `📐`. It is supported on `original[]`,
`chunks[]`, `examples[]`, `questions[]`, `exercises[]` and `glossary[]`. Defaults
decorate cards and glossary headings when omitted; existing JSON needs no
migration. Original section text is unchanged. Emoji are decorative and hidden
from assistive technology; meaningful headings and difficulty labels remain text.
Icons use safe text nodes, never HTML, CSS, classes or asset URLs.

The learning view keeps its full reading width. A compact right-edge
`🔖 Slovníček` tab, aligned with the right edge of the learning content panel
rather than the browser edge on wide screens, opens an initially closed slide-out drawer over the lesson
on desktop and mobile, without reserving a column or shifting the text.
The bookmark sits just outside the panel when space allows and clamps to the
viewport on mobile, clear of the paragraph text.
The drawer is a nonmodal native manual popover with dialog semantics: opening
focuses its close button; closing or Escape restores the bookmark trigger.
Outside clicks, moving keyboard focus back to the lesson and changing views
also dismiss it, so the nonmodal overlay never obscures the newly focused content. With a definition
open, Escape closes the definition first, then the drawer on a second press.
The drawer scrolls independently, fits the viewport and respects reduced motion.
Only term buttons are shown, not a wall of definitions. Definitions open
beside the trigger in a viewport-constrained native popover, usable by mouse,
touch and keyboard. Escape, outside click, the close button or changing views
dismiss it; explicit close/Escape returns focus to the trigger.
The runtime requires a modern browser with the native Popover API.

`favicon.svg` uses the selected **03 / Rounded satin** simple design from
`design-proposals\issue-52`: a pale rounded tile, narrow bold blue vector D
with an open counter, and a short black diagonal cap stroke slightly overlapping
its upper-left edge with a hanging left tassel. The mark spans 31 of 32 SVG
units vertically, leaving only 0.5-unit top/bottom anti-clipping clearance
(a quarter pixel at 16px). It contains no gradients or fine logo details.
`page.js` embeds it as a data URL for both the browser-tab favicon and the
header mark in every new standalone page. The header mark is 64px square on
desktop and 48px on narrow screens (up to 550px). The matching approved
`design-proposals\issue-52\rounded-fancy.svg` is embedded as a centered footer
mark below the active lesson content: 96px square on desktop and 64px on narrow
screens. Both webpage images are decorative (`alt=""`), not navigation controls.
Both subjects use the same shared template, stylesheet and assets: no font,
network request or external asset is required. Do not regenerate or retrofit
already published HTML. The independent Gems workflow remains unchanged.

### Completion, local ranking and answer duration

Every completion receives an encouraging summary, points/grade and a brief,
nonblocking CSS confetti burst. Reduced-motion users get the same summary
without confetti. Answer explanations remain available in a disclosure; the
learner still explicitly advances after every question. The session leaderboard
is collapsed in quiz setup, expands automatically at completion, and can still
be manually collapsed. Restarting closes it again. The latest attempt's position
stays inside it rather than emphasized in the main completion summary.

Both subjects save `answerDurationMs`: the sum of active question-answering
intervals, stopped on submission and restarted when the next question is shown.
Feedback reading (including the final feedback), other lesson tabs and hidden
browser pages are excluded. No duration ticks or countdown is shown during maths.
Results label duration **Doba odpovídání** and the attempt timestamp **Kdy**,
including a local date and time for new attempts.

History retains its points-first, shorter-duration tie-break, using precise
answer duration for new results and the original total duration for legacy
results. Maths ordering remains points-only. The legacy history `duration`
field is retained in seconds for compatibility; new records derive it from
active answering time. Old history/maths records without `answerDurationMs`
remain valid and display “Nezaznamenáno” in the answering-duration column, not a
made-up value. Invalid new duration fields produce the existing visible storage
warning and never overwrite the original stored data.

### Selective Gems integration

The independent `gems\dusan-edu-webpage` workflow is not a runtime dependency.
Its `SKILL.md` assembles JavaScript from the line-based `app.js.json`; its
readable `app.js` currently matches that representation. The packaging script
enforces parity and excludes `app.js` from the ZIP. Neither representation,
the package archive nor existing published lessons is changed by this integration.

| Gems detail | Shared generator decision |
|---|---|
| Wide desktop shell and learning/glossary columns | A 1120px maximum shared shell and a bookmark-triggered overlay glossary drawer, with no reserved column; original text fills its card's inner width |
| Subject/audience badges and prominent active tabs | Subject badge retained, audience badge omitted; attached icon-and-label tabs use selected states, keyboard navigation and labelled panels |
| Difficulty cards, on-demand hints and grade banner | Adapted in the common CSS; inline hint buttons expose expanded state and control explanations; all learning help starts collapsed |
| Question progress and running score | Shared status header and labelled native progress bar; counts submitted tasks and sums adapter-awarded points, including history bonuses and maths partial credit |
| “Síň slávy” results | Label adopted, retaining named, per-subject/per-lesson session-local records and visible storage failures |
| Glossary modal, themes and success/failure animations | Shared anchored native popovers, system-theme support and reduced-motion-aware feedback instead of duplicate implementations |
| Gems quiz engine, schema, DOM and HTML-string rendering | Not imported; existing contracts, safe text nodes, sampling and assessment adapters remain authoritative |
| Placeholder-name rejection and automatic feedback progression | Not imported; valid names/nicknames are not rejected for matching an example, and the learner explicitly continues after feedback |

Stored quiz-result namespaces, score maxima, grade thresholds and speed-bonus rules
are unchanged by v3. Answer-only duration is additive for both subjects.
New lessons declare their acceptance policies explicitly;
legacy lesson grading and stored result values are not rewritten.

Every page has exactly **Původní text → Učit se → Hrát si**. Original material
is displayed separately from generated explanations. A topic-only request
needs only its short Czech wording in the original tab, not an invented passage.
Both quizzes require a name or nickname containing at least three Unicode
letters, at most 60 characters. It is entered in the browser, never embedded
in lesson JSON, and shown in the session-local results table.

Maths examples and exercises share Učit se. All four worked examples initially
leave hints, steps and results collapsed. Independent practice follows, ordered
easy, medium, hard, with hints and solutions collapsed.
All hints, steps and solutions remain available on demand.

## Shared v3 content contract and maths section

All strings are **plain text**, not HTML, Markdown, executable expressions or
templates. JSON is safely embedded and rendered through text nodes. Write all
headings, prompts, hints, solutions, glossary text and audience text in Czech.
`language` must be `cs-CZ`; this is a declaration, not a language detector.
The subject tutor must check the actual language, age-appropriate teaching,
mathematical accuracy and that **every tested concept is taught**. The validator
cannot prove those educational properties.

Maths top-level keys are `version: 3`, `subject: "maths"`, `language: "cs-CZ"`,
`id` (stable lowercase kebab-case), `topic`, `subtitle`, `audience`, `original`, `glossary`,
`examples`, and `exercises`. `original` is a nonempty array of plain-text
`{ "heading", "text", "style", "paragraphs" }` sections (`style` and `paragraphs`
optional; styled paragraphs must preserve the source exactly). Unknown keys, including history source/year fields or
timing settings, are rejected. History sources and history-specific review
metadata are not part of the maths section. Version 1 maths JSON must be explicitly updated to v3
with the actual original material; the builder never invents missing source text.
Glossary entries use `{ "term", "definition", "forms": [] }`, just like
history; ambiguous forms and duplicate terms are rejected.

`examples` contains exactly four objects in this order:

1. `kind: "simple"` — simple worked example.
2. `kind: "complex"` — more complex worked example.
3. `kind: "everyday"` — familiar everyday word problem.
4. `kind: "challenge"` — challenging example with its solution.

Each also has `heading`, `prompt`, `hint`, optional styled `paragraphs`, `steps` (one or more objects with
`calculation` and child-friendly `explanation`), and `answer` (display text).
The child can reveal hints, each worked step, and the result independently.
Calculations are displayed as text; no symbolic algebra is evaluated.

Author `exercises` using capabilities' website-owned task counts, counting whole
tasks rather than individual steps. Educational difficulty and connected-step
design belong to the maths tutor profile. IDs and prompts must be unique
ignoring case and surrounding space.
Each task contains `id`, `difficulty`, `prompt`, `steps`, and `explanation`.
Each step has `prompt`, `hint`, typed canonical `answer`, `assessment`, and
`solution` (worked explanation). History questions also require `assessment`.
Canonical answers remain the display/solution source and must receive full
credit under their policy; inconsistent declarations fail validation.

| Difficulty | Teaching shape | Required steps | Base/accuracy scoring |
|---|---|---:|---|
| `easy` | Group of four short calculations | 4 | 10/4 per correct calculation, +1 if all four correct |
| `medium` | Everyday word problem | 1 | 20 |
| `hard` | Word problem with three dependent calculations | 3 | 30/3 per correct step |

The renderer labels easy calculations 1a–1d and hard steps separately and
reveals each solution independently. Quiz modes sample **without replacement**:
easy 1/1/1, medium 1/2/2, hard 2/5/3.
The true attainable maxima including easy accuracy bonuses are
**61, 111, 212**. Grades retain history's 80/60/40/20% thresholds but use these
attainable maxima, not history's speed-excluded denominator.
No scoring or task-selection setting is supplied by lesson authors.

### Shared full/partial answer policies

`assessment.js` is the single parser and matcher for both subjects. Every v3
question/step declares `assessment.input` (`number`, `text` or `length`), an
`exact` full-credit matcher and, optionally, `partial: { match, credit: 0.5 }`.
Half credit is the only supported partial fraction, explicitly declared rather
than inferred from subject or value similarity. An unmatched valid answer earns
zero; invalid input earns zero with a specific Czech diagnostic.

Both credit categories accept the same tagged matcher shapes:

| Type | Example | Meaning |
|---|---|---|
| Number | `{ "type": "number", "value": "1620" }` | Exact rational value; accepts equivalent supported notation |
| String | `{ "type": "string", "value": "1/2" }` | Literal representation, trimmed and NFC-normalized, with no implicit case/spelling or numeric equivalence |
| Array | `{ "type": "array", "items": [{ "type": "string", "value": "Komenský" }, { "type": "string", "value": "Jan Komenský" }] }` | Any listed alternative matches; not a multi-part learner response |
| Range | `{ "type": "range", "min": "1615", "max": "1625", "includeMin": true, "includeMax": true }` | Exact numeric interval with explicit endpoint inclusion |

Numeric matcher values/bounds are bounded strings, never binary floating-point
JSON numbers: the `number` tag selects numeric semantics. They use the numeric
notation described below (stored decimal points, not commas). Arrays contain
1–20 distinct atomic number/string/range matchers, not nested arrays.
String matchers can explicitly request `normalization: "czech"` for historical
case/diacritic/i-y tolerance in text input only; `literal` is the default.
No regex, expressions, scripts, unknown fields or arbitrary match programs.
All matcher values have a maximum of 80 characters. Range bounds must be valid,
ordered and nonempty; equal bounds are allowed only if both ends are included.

```json
{
  "input": "number",
  "exact": { "type": "number", "value": "1620" },
  "partial": {
    "credit": 0.5,
    "match": {
      "type": "range",
      "min": "1615",
      "max": "1625",
      "includeMin": true,
      "includeMax": true
    }
  }
}
```

`1620` earns full credit **before** considering the overlapping partial interval.
`1618`, `1615` and `1625` earn half; `1614` and `1626` earn zero. Awards are never
added. No other tolerance is guessed.

```json
{
  "input": "number",
  "exact": { "type": "string", "value": "1/2" },
  "partial": { "credit": 0.5, "match": { "type": "string", "value": "3/6" } }
}
```

For this simplification policy, `1/2` earns full credit, `3/6` half, and unlisted
`2/4` or `0.5` zero. The raw representation is preserved while independently
checking that it is a valid number. `1/0` is invalid, not a valid string match.
To accept all equivalent values, instead declare `exact: { "type": "number",
"value": "1/2" }`; that deliberately gives `3/6` full credit. Never combine that
broad full-credit matcher with `3/6` partial and expect partial to override it.
Task wording must explain any required notation.

For `input: "length"`, declare `unit` alongside `exact`; number/range matchers
use that unit after exact conversion of the supplied length. String matchers
still compare the original unit-bearing representation. Bare numbers and
unsupported units are invalid. Maths input/dimensions must agree with the typed
canonical answer. History choice policies use `input: "number"` to match the
selected zero-based option index; text/year policies use the same engine.
History `acceptedAnswers` lists full-credit canonical forms, not partial ones.

A partial match earns half of the question/step's normal points. It earns no
history speed bonus and does not satisfy maths' all-fully-correct accuracy
bonus. An easy calculation can earn **1.25** points, so maths records now accept
quarter points; maxima and grade thresholds stay unchanged. Feedback and
results show partial status, the canonical correct answer, explanation and
actual awarded points; the learner still explicitly continues.

### Legacy assessment compatibility

V1 history and v2 maths JSON must not declare `assessment`; opt into v3 explicitly
to change policy. Compatibility helpers in the same shared evaluator preserve
legacy history spelling normalization, digit-only marked years and automatic
half credit strictly less than ten years away. They preserve legacy maths
integer-only, fraction-only and decimal notation restrictions and exact unit
conversion, with no new partial credit. Stored results are not rewritten.
Legacy pages get the common motivational subtitle if none was supplied.

### Typed answers and exact comparison

Expected values are bounded **strings**, never floating-point JSON numbers,
code, regular expressions or accepted-answer programs:

```json
{ "format": "integer", "value": "-12" }
{ "format": "fraction", "numerator": "2", "denominator": "4" }
{ "format": "decimal", "value": "0.125" }
{ "format": "length", "value": "1.5", "unit": "m" }
```

These are alternative answer objects, not a single JSON document. Integer
parts/numerators/denominators have at most 12 digits; decimals have at most 12
fractional digits. Stored values use a decimal point, no leading plus, exponent,
thousands separator or redundant leading zeros. Denominators are positive and
nonzero; length values are nonnegative. Units are exactly `mm`, `cm`, `dm`, `m`,
`km`. Irrelevant answer keys are rejected. The display uses Czech decimal commas.
Prefer integer numerical results when suitable. For a non-integer numerical
answer, use `decimal` so the child can type a comma or a dot; never require
one particular decimal separator. Explicit fraction and length tasks retain
their respective formats.

Choose the answer dimension from what the learner is asked to enter, not just
the topic. If the question specifies the target unit ("convert 2 km to metres",
"how many centimetres?"), use an integer/decimal answer with `input: "number"`;
the answer is `2000`, not `2000 m`. Do not require the learner to repeat the
given unit or accept another unit in place of performing the requested
conversion. Reserve `format: "length"` and `input: "length"` for prompts
explicitly asking for an answer including a unit. Those fields are labelled
"včetně jednotky"; other numeric fields take numbers only. Keep units in worked
calculations and explanations regardless of the input format.

The runtime compares exact rational values using bounded BigInt arithmetic, not
floating-point epsilon, spelling normalization, approximate-year credit, or
`eval`. Integer, fraction and decimal expected formats describe the canonical
answer. The declared policy decides credit, not this display format.
V3 number input accepts whole numbers, decimals with comma or point,
fractions and mixed numbers; number matchers compare values exactly:
**7/4 = 1 3/4 = 1.75**, **0.5 = 1/2**, **3 = 3.0 = 6/2**.
Value matchers need not enumerate infinitely many equivalent fractions.
String matchers deliberately do not apply value equivalence.
Trim surrounding whitespace; reject mixed separators, expressions,
trailing text, ambiguous grouping, empty or malformed answers. Length answers
require an explicit supported unit and exact conversion: 1 km = 1000 m,
1 m = 10 dm = 100 cm = 1000 mm. Equivalent supported units are valid; missing
units, wrong dimensions or unknown units are invalid. Algebra/interactive
geometry and other answer formats are unsupported, not silently misgraded.
User input permits at most 12 integer digits and 12 fractional digits, with
optional minus but no plus, exponent, thousands grouping or redundant leading
zeros. Fraction numerators and denominators are signed integers of at most
12 digits; whitespace around `/` is allowed. A denominator of zero is invalid;
negative denominators are normalized by exact cross multiplication. Decimal
notation is accepted across all three numeric formats. Mixed numbers use a
whole part followed by a proper positive fraction (`1 3/4`); a leading minus
applies to the whole value (`-1 3/4 = -7/4`). Zero denominators, signed mixed
fraction parts and improper mixed parts (`1 4/4`) are rejected. There is no implicit
rounding: `0.333333333333` is not `1/3`. Length answers accept whole or decimal
nonnegative values, optionally spaced from a lowercase unit (`150cm` and
`150 cm` both work); fractions as length values and uppercase units are invalid.
The page explains these formats and reports missing, malformed or unsupported
units explicitly. A supported but numerically wrong conversion earns zero.

Submitting locks every field for that task. Each missing, malformed or incorrect
step earns zero independently; partial steps earn their declared half credit
and other correct steps retain their points. Hard
steps are compared with their own expected values, not a propagated earlier
mistake. Feedback includes each entry, the correct typed answer, worked step,
whole-task explanation and points. Nothing advances until the child chooses
the next task. Results repeat all feedback and show a Czech grade. Grades use
the exact score, not the rounded display percentage.

Maths results store run id, entered name/nickname, mode, score, attainable
maximum, grade, local date/time and active `answerDurationMs` under
`maths-tutor:v2:<lesson-id>` in `sessionStorage`. Older named results without
answer duration remain readable. Duration never affects maths ranking. Old anonymous
v1 results remain untouched under their old key and are not migrated to a
fabricated player name. Results remain per-subject, per-lesson and session-local,
never transmitted. Read errors or corrupt records
show a Czech warning and leave the original storage untouched; new runs remain
in memory. Write failures warn that new results will not survive reload.
A later successful save includes all in-memory results and clears that warning.

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

The subject tutor reviews the actual rendered educational content, Czech
language, original preservation, explanations, difficulty and worked solutions.
The common helper provides guidance only, not build/browser coordination.

Drafts remain in session artifacts. Give the user the absolute HTML path and
request review/explicit approval. Only after approval may the calling subject
workflow copy HTML to `site`, update its index and open a publication PR.
Tooling PR approval is not approval of generated teaching material.
