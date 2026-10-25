# Internal tutor website generator

Requires Node.js 22+. No npm packages, Python, AI keys, runtime network, or
external page assets. `tutor-website` remains internal-only; subject tutors own
educational content, Czech-language review, local review and publication approval.
Never change `gems` for this workflow.

## Discover, author, hand off

From the repository root in PowerShell:

```powershell
node tools\tutor-website\build.js capabilities history
node tools\tutor-website\build.js capabilities maths
node tools\tutor-website\build.js build "C:\session-artifacts\handoff.json"
node --test tools\history-tutor\tests\*.test.js tools\tutor-website\tests\*.test.js
```

`capabilities` returns absolute schema, validator, documentation and builder
paths, version, timing policy, generation/assessment status and limitations.
Unsupported subjects/operations fail with a nonzero exit code, not a fallback.
Maths has no starter lesson yet (`examplePath: null`, #32); the structural test
fixture is not teaching material. The authoritative contracts are:

| Subject | Contract | Output now |
|---|---|---|
| History | `tools\history-tutor\lesson.schema.json`, version 1 unchanged | Original text, learning, complete existing quiz and session results |
| Maths | `tools\tutor-website\maths.schema.json`, version 1 | Worked examples, glossary, practice tasks, hints and revealed solutions |

**Boundary with #31:** maths subject tutoring, answer evaluation, task sampling,
scoring, grades and stored results are not implemented here. Maths pages clearly
disclose this and have no answer-submission controls or success-shaped quiz.
They are usable learning/practice pages, not completed playable quizzes.
Do not promise automatic mathematical checking. #31 adds it against this
contract; #32 adds reviewed starter lessons.

The calling agent sends this JSON object (use actual absolute session paths):

```json
{
  "operation": "build",
  "subject": "maths",
  "artifactDirectory": "C:\\session-artifacts",
  "inputPath": "C:\\session-artifacts\\lesson.json",
  "outputPath": "C:\\session-artifacts\\lesson.html",
  "overwriteApproved": false
}
```

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

A successful build returns actual absolute input/output paths plus generation
and assessment status and limitations. This confirms generation, not educational
or language approval. Return stderr/exit failures to the caller; do not silently
repair educational content, report a failed build as success, or change schemas
for a routine lesson request.

## History compatibility

Existing history JSON, direct `tools\history-tutor\build.js` command, exported
build/render functions and published example remain compatible. The common
serializer/asset assembler and CSS are shared; history's runtime and template
remain unchanged. The guarded internal builder produces the identical HTML.
The legacy direct builder retains its documented approved-publication behavior;
the new internal handoff never writes to the repository.

History still uses its original question mix/checking and base-point grades.
Only fully correct answers strictly before **15000 ms** earn its mandatory speed
bonus. No maths runtime includes a timer, countdown, speed indicator or bonus.

## Maths v1 content contract

All strings are **plain text**, not HTML, Markdown, executable expressions or
templates. JSON is safely embedded and rendered through text nodes. Write all
headings, prompts, hints, solutions, glossary text and audience text in Czech.
`language` must be `cs-CZ`; this is a declaration, not a language detector.
The subject tutor must check the actual language, age-appropriate teaching,
mathematical accuracy and that **every tested concept is taught**. The validator
cannot prove those educational properties.

Top-level keys are exactly `version: 1`, `subject: "maths"`, `language: "cs-CZ"`,
`id` (stable lowercase kebab-case), `topic`, `audience`, `glossary`, `examples`,
and `exercises`. Unknown keys, including history original/source/year fields or
timing settings, are rejected. There are no required history sources or original
text. Glossary entries use `{ "term", "definition", "forms": [] }`, just like
history; ambiguous forms and duplicate terms are rejected.

`examples` contains exactly four objects in this order:

1. `kind: "simple"` — simple worked example.
2. `kind: "complex"` — more complex worked example.
3. `kind: "everyday"` — familiar everyday word problem.
4. `kind: "challenge"` — challenging example with its solution.

Each also has `heading`, `prompt`, `hint`, `steps` (one or more objects with
`calculation` and child-friendly `explanation`), and `answer` (display text).
The child can reveal hints, each worked step, and the result independently.
Calculations are displayed as text; no symbolic algebra is evaluated.

`exercises` is a pool of 10–100 unique tasks with at least **2 easy, 5 medium,
3 hard**. IDs and prompts must be unique ignoring case and surrounding space.
Each task contains `id`, `difficulty`, `prompt`, `steps`, and `explanation`.
Each step has `prompt`, `hint`, typed `answer`, and `solution` (worked explanation).

| Difficulty | Teaching shape | Required steps | #31 base/accuracy scoring contract |
|---|---|---:|---|
| `easy` | Group of four short calculations | 4 | 10/4 per correct calculation, +1 if all four correct |
| `medium` | Everyday word problem | 1 | 20 |
| `hard` | Word problem with three dependent calculations | 3 | 30/3 per correct step |

The renderer labels easy calculations 1a–1d and hard steps separately and
reveals each solution independently. All task data is preserved for #31.
Planned quiz modes sample **without replacement**: easy 1/1/1, medium 1/2/2,
hard 2/5/3. The true attainable maxima including easy accuracy bonuses are
**61, 111, 212**. Grades retain history's 80/60/40/20% thresholds but use these
attainable maxima, not history's speed-excluded denominator.
No scoring or task-selection setting is supplied by lesson authors.

### Typed expected answers and #31 comparison boundary

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

#31 must compare exact rational values, not use floating-point epsilon, spelling
normalization, approximate-year credit, or `eval`. Integer answers require whole
number notation; fraction answers accept equivalent integer fractions with a
nonzero denominator (sign normalized); decimal answers accept a single comma
or point. Trim surrounding whitespace; reject mixed separators, expressions,
trailing text, ambiguous grouping, empty or malformed answers. Length answers
require an explicit supported unit and exact conversion: 1 km = 1000 m,
1 m = 10 dm = 100 cm = 1000 mm. Equivalent supported units are valid; missing
units, wrong dimensions or unknown units are invalid. Algebra/interactive
geometry and other answer formats are unsupported, not silently misgraded.
These are handoff requirements for #31, **not claims of current evaluation**.
Results must stay per-lesson/session-local and storage failures must be visible.

## Local review and publication

Open the returned file locally. Check navigation, glossary, step/hint reveals,
all content, narrow layout, light/dark themes and offline operation. For history,
also play all quiz modes through feedback/results and storage warnings.
The browser test uses installed Edge/Chrome (or `TUTOR_BROWSER_PATH`) and Node's
built-in WebSocket/CDP, with no browser/package downloads. It skips explicitly
when no supported local browser exists; report that limitation and review
manually rather than pretending the browser check passed.

Drafts remain in session artifacts. Give the user the absolute HTML path and
request review/explicit approval. Only after approval may the calling subject
workflow copy HTML to `site`, update its index and open a publication PR.
Tooling PR approval is not approval of generated teaching material.
