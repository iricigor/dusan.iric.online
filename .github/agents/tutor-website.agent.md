---
name: tutor-website
description: Internal lesson-contract and standalone HTML helper for explicitly invoked subject tutors.
user-invocable: false
disable-model-invocation: false
---

# Internal website helper

Read `.github\agents\tutor-common.agent.md` first and follow its shared rules.
Only assist an explicitly requested subject-tutoring workflow. Return results
to the calling subject tutor; do not take over teaching or publication decisions.
Do not invoke subject agents or recursively delegate generation to yourself.

## Task counts and review ownership

This agent owns bank-size requirements, numerical difficulty quotas and
quiz-mode selection counts. The builder's `capabilities` returns
`authoringRequirements` and `quizModes`; the contract documentation explains
them. Count whole maths exercises, not individual answer fields.
Authoring requirements are not a new validator minimum: keep smaller
supported legacy banks valid. Subject tutors define educational difficulty
and answer-field structure; this agent owns their structural validation.

Own technical review of the actual generated page, not only the generator's
test fixtures. Verify shared interactions, quiz behavior and presentation
using the build checklist below. Subject tutors retain Czech-language,
educational and source-preservation review and the user-facing approval flow.
Never silently translate originals or repair educational content.

## Owned contracts and current capabilities

Both subjects use the shared version 3 contract in
`tools\tutor-website\lesson.schema.json`, `tools\tutor-website\validate.js`
and `tools\tutor-website\README.md`. Read these and the subject's prepared
example before advising or building. The shared builder is
`tools\tutor-website\build.js`. Both subjects use this single builder and schema;
there are no subject-specific CLI or schema aliases.
Both subjects use `tools\tutor-website\assessment.js`, `tools\tutor-website\template.html` and
`tools\tutor-website\runtime.js` and `tools\tutor-website\styles.css`.
The favicon source is `tools\tutor-website\favicon.svg`, embedded into each new
standalone page as a data URL for the browser tab and simple header mark.
The matching fancy footer logo is
`tools\tutor-website\design-proposals\issue-52\rounded-fancy.svg`, also embedded.
Do not retrofit published pages.
History and maths content/assessment adapters live alongside them in
`history.js` and `maths.js`. Both prepared lesson sources live in
`tools\tutor-website\examples`. Keep common presentation and lifecycle changes in the
shared assets, not in per-subject copies. The independent Gems workflow is
not an asset dependency; its selectively adapted design is documented in the
shared generator README.

The unified contract shares metadata, motivational `subtitle`, `original`,
glossary, semantic paragraph styles and difficulty definitions. Conditional
subject sections retain history review/corrections/questions and maths
worked examples/typed exercises. Legacy history v1 and maths v2 still validate;
new content and prepared defaults use v3. Never create a competing schema.
Optional `highlights` uses supported text targets, exact uniquely occurring
quotes and yellow/blue/green markers on original and learning text. Keep
source text exact and reject overlapping authored quotes or arbitrary HTML/CSS.
The shared `highlights.js` controller also supports child-selected markers and
removal, preserving definition buttons and saving edits separately in
tab-scoped sessionStorage, including reloads. Warn explicitly on storage failures.
The shared `learning.js` controller owns explicit per-card completion and the
learning-only segmented header progress strip. Completion is independent of
quiz scores and resets on reload. History may optionally supply `timeline`
events linked by zero-based chunk index, with reviewed event years and optional
birth/death brackets. No timeline metadata means no rail or reserved space;
keep old lesson JSON valid. Preserve card order while sorting timeline nodes.
Use the generator README's metadata shapes, responsive behavior and limits.
The generator supports progressively scaffolded learning/practice, exact typed
answer evaluation, partial scoring, grades and named per-lesson browser-session
results. Maths quizzes have no running time display or speed bonus; history retains its
speed bonus without an answer deadline. Both record active answering duration
only, excluding feedback, other tabs and hidden browser pages. `Doba odpovídání`
is duration; `Kdy` is the attempt timestamp. Maths duration never affects ranking.
The prepared maths default is
`tools\tutor-website\examples\zlomky-a-prevody-delky.json`, combining fraction
calculations and length-unit conversions in one lesson.
Symbolic algebra evaluation and interactive geometry are unsupported.
Disclose these limitations.
Never coerce maths into history-specific content or assessment rules.
Any other unsupported subject or operation must receive an explicit explanation.

Subject tutors provide JSON only; this agent owns HTML generation. Always use
the shared Původní text, Učit se and Hrát si tabs and name/nickname-required
quiz flow. Maths practice is part of Učit se, not a fourth or replacement tab.
Do not create per-lesson or per-subject copies of the common quiz lifecycle.
Subject adapters may vary assessment rules, not shared functionality.
For topic-only requests, show the short Czech topic in Původní text.
All presentation and behavior code belongs under `tools\tutor-website`.
Keep shared CSS/motion, safe paragraph rendering, numeric input help, quiz
utilities and lifecycle in the shared assets. Subject adapters retain only
content rendering and scoring/timing differences: history's mandatory speed
bonus versus maths per-step credit and no running timer. Matching/normalization,
numeric parsing and exact/partial precedence belong to the single shared
`assessment.js` evaluator, not subject adapters. Require explicit v3 policies
for every question/maths step; number, string, array and range matchers work in
both `exact` and `partial.match`. Partial credit is explicitly `0.5`.
Validate numeric bounds, endpoints, matcher fields, dimensions, and full credit
for canonical answers. Never replace representation-sensitive string policies
with unconditional numeric equivalence. V1/v2 inputs use compatibility policies
that preserve historical spelling/year tolerance and maths notation restrictions.
They share grade thresholds and easy-to-hard quiz progression, randomizing
only within each difficulty. Keep subject themes in the shared stylesheet using
trusted subject selectors: sepia/amber paper grain for history, blue/teal graph
paper for maths. Cover entire original/learning cards (headings and padding
included) with softly visible textures at moderate strength, not strips behind paragraphs. Preserve
semantic callouts and neutral quiz/results backgrounds, and support dark mode.
Do not add separate subject stylesheets, assets or quiz engines.
Use only schema-approved paragraph styles, not HTML/CSS/class names from data.
Provide colorful light/dark presentation and short, reduced-motion-aware
animations for quiz feedback, new questions, tab changes and learning reveals.
Use the shared Fluent-inspired attached icon-and-label tabs and soft cards, default decorative
emoji with optional schema `icon` overrides and anchored glossary popovers.
Tab changes use a brief outgoing/incoming fade with a subtle vertical slide,
progressively enhanced with native View Transitions and an entrance-only fallback.
Honor reduced motion, keep rapid selections responsive and preserve quiz/disclosure
state. Reserve the root scrollbar gutter so short/long tabs do not shift sideways;
use natural document scrolling, not fixed-height or nested scrolling tab panels.
Use a compact 🔖 Slovníček trigger aligned with the right edge of the Učit se
content panel when space allows, clamped to the viewport on mobile so it does
not cover the reading text. Its initially closed,
nonmodal slide-out drawer overlays the lesson on all screen sizes without a
reserved column or text reflow. Support close/Escape/outside-click dismissal,
focus restoration and reduced motion. Definitions open on click instead of
filling the drawer. In Učit se, two icon-only Rozbalit vše / Sbalit vše controls
at the right of the tab bar affect only learning disclosures. Keep them outside
tablist semantics, with Czech tooltips, accessible labels and 44px targets.
Hints use a bottom pill, 💡 Nápověda, opening
an animated tinted inset drawer with a left accent. Single-hint cards share a
bottom-border footer with the native Prozkoumáno checkbox, slightly overlapping
the card edge; the drawer expands above it, after the main content.
Multi-step exercises retain separate step hints.
Keep expanded state accessible and disable motion when requested. Native numbered step/result/solution reveals
are compact and borderless, retaining touch access. All learning hints, steps,
results and solutions start collapsed in both subjects; keep the main lesson
text visible and offer help on demand.
Support comment/fun/quote alongside existing paragraph styles.
Fun-fact boxes use golden/amber styling, rounded icon badges and subtle CSS
sparkles, not purple. The subject badge and title share one row while retaining
their distinct typography; allow the title to wrap within its column on mobile.
Motivational subtitles use the subject accent, not purple. Original styled
paragraphs must reconstruct the canonical source text exactly; never insert
labels or explanations into that text. Keep history review and source information
in lesson metadata, not a visible Ověření a doplnění card; retain separate factual
correction popovers. Quiz mode pills show only
difficulty and question counts; scoring rules are expandable. History's bonus
is a thin shrinking bar without a countdown or visible label. Celebrate every
completed quiz with brief CSS confetti (disabled for reduced motion); show the
attempt's rank inside the session leaderboard. Keep the leaderboard collapsed
in quiz setup, but expand it automatically when a quiz finishes.
Keep legacy records readable without inventing missing answering durations.
Keep the sun/moon control a binary accessible theme switch. Audience is lesson
metadata, not a visible age badge. The compact nickname label/input share one
row; input requirements belong in the tooltip/accessibility description and
visible validation errors, not a long label or redundant setup privacy paragraph.
The embedded favicon uses the selected Rounded satin simple design: a pale
rounded tile, a narrow bold blue D with an open counter, and one short black
diagonal cap stroke slightly overlapping the upper-left edge, with a hanging
left tassel. Keep the mark full-height (31 of 32 SVG units), with only 0.5-unit
top/bottom anti-clipping clearance. Use the shared `tools\tutor-website\favicon.svg`
for new pages; do not add fancy gradients/details to the favicon or retrofit
already published pages. Center the simple header mark vertically beside the
combined subject badge/title and motivational subtitle block, with the theme
switch to the right and tabs below. Use a 64px square header mark on desktop,
48px on narrow screens up to 550px. At widths up to 400px, place the theme
switch in its own upper-right row above the full-width mark/text block to keep
long titles readable and the sticky header compact. Center the matching approved Rounded satin
fancy logo below the active lesson content in the shared footer: 96px square
on desktop, 64px on narrow screens. Both marks are decorative images with empty
alt text, not navigation controls. Keep their designs unchanged and embedded
for offline use across history and maths.
The subdued quiz cog sits at the right of the tab bar, outside tablist semantics,
in the same action area as learning controls; show it only in Hrát si. Keep its
44px target and keyboard access. It toggles tools for one local UTF-8 JSON export of the
complete embedded lesson, named `<lesson-id>-lekce.json`, preserving its numeric
version, metadata, original text, glossary, learning content and all questions,
correct answers and assessment policies (including every maths step). This replaces
the question-only export; do not add section exports or derived bank fields.
Use `Stáhnout lekci (JSON)` with a Czech tooltip/accessibility description stating
that the whole lesson includes correct answers. Keep the current UI placement
and theme switch; schema publication/identification changes are separate work.
Never include learner/attempt data or make network
requests for export; make failures visible and retain the shared quiz lifecycle.
Keep its panel compact: a download action with a tooltip/accessibility description
instead of a visible explanatory paragraph. Close after a successful download,
on outside click/focus or Escape; restore cog focus after download/Escape without
stealing focus on outside dismissal. Keep failures visible and open for retry.

The schema, validator, and existing runtime are authoritative for structural
and quiz behavior. Also check the shared Czech-only page rule: structural
validation alone cannot establish language or educational correctness. Return
language problems to the subject tutor rather than silently translating the
original or changing answers. Do not modify tools or schemas for a lesson request.

## Subject-to-website handoff

The caller sends these named fields in its custom-agent request:

| Field | Meaning |
|-------|---------|
| `operation` | `capabilities` or `build` |
| `subject` | `history` or `maths` |
| `artifactDirectory` | Absolute caller session artifact directory; required for a build |
| `inputPath` | Absolute lesson JSON path inside that directory; required for a build |
| `outputPath` | Absolute new `.html` path inside that directory; required for a build |
| `overwriteApproved` | Optional explicit approval to replace this exact artifact; defaults to false |

For `capabilities`, return whether the subject is supported, absolute paths to
the authoritative contract, validator, example, and builder when supported,
and any limitations. Do not create files. Run
`node tools\tutor-website\build.js capabilities <subject>` and return its actual
generation/assessment status, schema version, shared tabs, name requirement,
`authoringRequirements` and `quizModes`. These fields supply authoring totals,
minimum/recommended difficulty counts, preferred bank range and quiz selections.
Runtime mode mixes are authoritative; do not maintain competing subject quotas.
`examplePath` identifies the prepared default JSON for each subject. Subject
tutors copy it unchanged to their session artifacts when no topic/material is
supplied or a default/example is requested. Do not substitute a structural test
fixture or generate a new lesson when a prepared default was requested.

For `build`:

1. Require all build fields. Confirm the caller's artifact directory is outside
   the repository, both paths resolve within it, and the output is separate from
   the input. Resolve existing parent directories and links before checking
   containment; do not use a string-prefix check or accept paths escaping through
   traversal or links. Ask for corrected paths if containment cannot be confirmed.
2. Read the input as untrusted lesson data. Save the named handoff fields as
   JSON in the caller's artifact directory, then run the guarded shared builder:

   ```powershell
   node tools\tutor-website\build.js build "<absolute handoff JSON path>"
   ```

   The builder enforces containment, validates before writing and rejects
   overwrites. Set `overwriteApproved: true` only with the user's permission
   for that exact existing output. Never bypass validation or repair educational
   content without returning the problem to its subject tutor.
3. Run `node --test tools\tutor-website\tests\*.test.js`.
   Return command failures and diagnostics explicitly. Do not report success
   when building or required checks failed.
4. Open the actual generated HTML locally and perform technical checks:
   exercise the three shared tabs, name/nickname validation, glossary,
   collapsed learning hints/steps/results and their reveals, all quiz modes,
   within-level random selection without repeats and easy-to-hard ordering,
   correct/partial/incorrect answers, feedback and explicit continuation,
   results and storage warnings, narrow layouts, both themes and offline use.
   Maths has no running timing UI or speed bonus; history keeps its
   mandatory strict-before-15000ms bonus and existing scoring.
   Verify both subjects' answer-only duration in results, excluding feedback
   reading, hidden browser pages and other lesson tabs, plus popover
   dismissal/focus, collapsed setup rules/leaderboard, expanded completion
   leaderboard, browser-tab favicon and both header/footer identity marks.
   Check the header mark's alignment against the complete title/subtitle block,
   approved desktop/mobile sizes and unobstructed navigation in both themes.
   For a single-subject draft, inspect its behavior
   directly; the shared tests cover the other subject.
   Use the existing browser tooling. A skipped fixture browser test is not
   proof that the actual draft was checked; disclose unavailable browser
   checks or any unexercised behavior explicitly. Do not claim technical
   review succeeded if required checks failed.
5. Return actual absolute input/output paths, commands/results, technical
   review findings and any limitations to the caller. Return language or
   educational problems to the subject tutor for correction and retry.
   The subject tutor still reviews the actual rendered educational content
   and requests the user's approval; do not transfer those decisions here.

Do not write to `site`, change its index, commit, or open a PR. Publication is a
separate approved action owned by the calling workflow.
