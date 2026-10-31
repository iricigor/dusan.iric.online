# Shared page behavior and ownership

[Generator quick start and contract index](../README.md).

## Shared page and quiz ownership

Subject tutors request the website agent's capabilities/schema and return
schema-valid JSON only. They do not write HTML, fork quiz code, choose a
different navigation structure or implement their own answer parser.
The website agent validates that JSON and builds standalone HTML.

All browser assets are owned by `tools\tutor-website`: `template.html` is the
single shell and `styles.css` is the single stylesheet. `runtime.js` retains
the exported quiz utilities and composes the controllers in `runtime`:
`learning.js` owns content/glossary/disclosures, `navigation.js` owns tabs/theme
and leave confirmation, `quiz.js` owns names/submission/progression/answer timing,
and `results.js` owns ranking/storage and warnings for both subjects.
`history.js` and `maths.js` are adapters for content, answer formats,
sampling and assessment rules, not independent quiz applications.
`page.js` embeds the common assets and only the selected subject adapter.
Its `readRuntimeSource(subject)` is also the VM test loader, so both use the same
ordered, inline source. Extracted files are not requested or loaded by the browser.
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

### Native name autocomplete

Future generated history and maths pages share the quiz name/nickname input
`id="player"`, `name="player-name"` and `autocomplete="on"`. This allows native
browser-saved form-history suggestions without a custom dropdown or
application-managed name storage. The label, name validation, 60-character
limit and quiz behavior are unchanged; existing published pages are not updated.

Suggestions depend on the browser, saved form history and browser settings.
These HTML attributes do not guarantee that the browser saves names on these
pages or displays suggestions on double-click.

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
On screens up to 400px wide, the theme switch has its own upper-right row so
the mark and text can use the full header width without squeezing long titles
into an excessively tall sticky header.
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
`Stáhnout lekci (JSON)` downloads the complete embedded lesson locally as UTF-8
JSON named `<lesson-id>-lekce.json`, without starting a quiz or reading learner
records. This single download replaces the question-bank-only export. It preserves
the supported numeric `version` and all original metadata, text, paragraph styles,
icons, glossary and subject-specific data: history sources/review/corrections,
learning chunks and questions, or maths worked examples and exercises. All
questions, canonical answers, assessment policies and solutions present in the
lesson are included unchanged; no derived question-bank fields are added.
The exported lesson validates and regenerates with the matching supported builder,
including legacy history v1 and maths v2. Shared runtime scoring/selection code is
not part of the lesson contract. No attempt, nickname or student answers are
exported. Exporting does not mutate lesson data or reset an active quiz.
Downloads require no network access; schema publication and `$schema`-based
identification are separate future work.
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
Feedback reading (including the final feedback), lesson-tab confirmation dialogs and hidden
browser pages are excluded. No duration ticks or countdown is shown during maths.
Results label duration **Doba odpovídání** and the attempt timestamp **Kdy**,
including a local date and time for new attempts.

While a quiz is active and unfinished, switching to another lesson tab opens a
modal dialog styled with the page's light/dark theme. Its Czech heading asks
“Pokračovat v kvízu?” and explains that switching discards that attempt's answers,
points and progress. The emphasized **Pokračovat v kvízu** button has initial
focus, so Enter stays in the quiz by default; Escape also cancels. Leaving
requires explicitly choosing **Ukončit kvíz a přepnout**. Canceling
keeps the selected tab, answers and progress intact and resumes answer-duration
measurement without restarting the history bonus deadline. Confirming stops the
quiz and its timer, returns quiz setup for the next visit and does not save the
abandoned attempt. Previously completed session results remain available.
Pointer activation and keyboard arrows/Home/End use the same confirmation;
selecting the already selected tab does not warn. No warning appears before
starting or after showing the completed results, including after restart.

The runtime registers `beforeunload` only for an unfinished quiz and removes it
on completion or abandonment. Browser navigation away, reload and tab/window
closure request the browser's native confirmation where supported; canceling
leaves the current quiz intact, while leaving loses the unfinished attempt.
Browsers control the wording, require prior user interaction, and may suppress
the prompt (especially on mobile or when a browser process is terminated).
Custom Czech text cannot be guaranteed for these browser prompts. This is an
accidental-loss guard, not autosave or a guarantee against every way of leaving.
Existing published HTML receives this behavior only when separately approved
for regeneration and publication.

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
