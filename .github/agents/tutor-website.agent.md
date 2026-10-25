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
standalone page as a data URL. Do not retrofit published pages.
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
paper for maths. Restrict pale textures to original/learning text, preserve
semantic callouts and neutral quiz/results backgrounds, and support dark mode.
Do not add separate subject stylesheets, assets or quiz engines.
Use only schema-approved paragraph styles, not HTML/CSS/class names from data.
Provide colorful light/dark presentation and short, reduced-motion-aware
animations for quiz feedback, new questions, tab changes and learning reveals.
Use the shared Fluent-inspired attached icon-and-label tabs and soft cards, default decorative
emoji with optional schema `icon` overrides and anchored glossary popovers.
Use a compact right-edge 🔖 Slovníček trigger in Učit se. Its initially closed,
nonmodal slide-out drawer overlays the lesson on all screen sizes without a
reserved column or text reflow. Support close/Escape/outside-click dismissal,
focus restoration and reduced motion. Definitions open on click instead of
filling the drawer. In Učit se, two icon-only Rozbalit vše / Sbalit vše controls
at the right of the tab bar affect only learning disclosures. Keep them outside
tablist semantics, with Czech tooltips, accessible labels and 44px targets.
Hints use a compact Nápověda 💡 button floated inside the top-right of the
prompt paragraph, with text wrapping around it and explanation below.
Keep expanded state accessible. Native numbered step/result/solution reveals
are compact and borderless, retaining initial maths scaffolding and touch access.
Support comment/fun/quote alongside existing paragraph styles. Original styled
paragraphs must reconstruct the canonical source text exactly; never insert
labels or explanations into that text. Quiz mode pills show only
difficulty and question counts; scoring rules are expandable. History's bonus
is a thin shrinking bar without a countdown or visible label. Celebrate every
completed quiz with brief CSS confetti (disabled for reduced motion); show the
attempt's rank only inside the collapsed-by-default session leaderboard.
Keep legacy records readable without inventing missing answering durations.
Keep the sun/moon control a binary accessible theme switch. Audience is lesson
metadata, not a visible age badge. The compact nickname label/input share one
row; input requirements belong in the tooltip/accessibility description and
visible validation errors, not a long label or redundant setup privacy paragraph.
The embedded favicon uses a pale tile, a dominant blue D and a smaller black cap
tilted over the letter's upper-left edge.
The visible quiz-setup cog toggles tools for a local UTF-8 JSON export of the
complete question bank, with total/easy/medium/hard counts and correct answers
(including every maths step). Never include learner/attempt data or make network
requests for export; make failures visible and retain the shared quiz lifecycle.

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
generation/assessment status, schema version, shared tabs and name requirement.
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
4. Return the actual absolute input/output paths, commands and their results,
   and any limitations. The subject tutor must still inspect the local page,
   exercise the three shared tabs, name validation, glossary, progressively
   reduced learning scaffolding and all subject quiz modes, and request the
   user's approval. Maths has no running timing UI or speed bonus; history keeps its
   mandatory strict-before-15000ms bonus and existing scoring.
   Verify both subjects' answer-only duration in results, excluding feedback
   reading, plus popover dismissal/focus, collapsed rules/leaderboard and favicon.

Do not write to `site`, change its index, commit, or open a PR. Publication is a
separate approved action owned by the calling workflow.
