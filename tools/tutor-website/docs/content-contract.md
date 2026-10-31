# Shared content contract

[Generator quick start and contract index](../README.md).

## Shared v3 content contract and maths section

All strings are **plain text**, not HTML, Markdown, executable expressions or
templates. JSON is safely embedded and rendered through text nodes. Write all
headings, prompts, hints, solutions, glossary text and audience text in Czech.
`language` must be `cs-CZ`; this is a declaration, not a language detector.
The subject tutor must check the actual language, age-appropriate teaching,
mathematical accuracy and that **every tested concept is taught**. The validator
cannot prove those educational properties.

New maths top-level keys are `version: 4`, `subject: "maths"`, `language: "cs-CZ"`,
`id` (stable lowercase kebab-case), `topic`, `subtitle`, `audience`, `original`, `glossary`,
`examples`, and `exercises`. `original` is a nonempty array of plain-text
`{ "heading", "text", "style", "paragraphs" }` sections (`style` and `paragraphs`
optional; styled paragraphs must preserve the source exactly). Unknown keys, including history source/year fields or
timing settings, are rejected. History sources and history-specific review
metadata are not part of the maths section. Version 1 maths JSON must be explicitly updated to a supported contract
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
Each v4 task contains `id`, `difficulty`, `type`, `prompt`, and `explanation`.
Choice tasks (`trueFalse` or `choice`) also contain `options`, zero-based integer
`answer`, `assessment`, `hint`, and `solution`, but no `steps`. Labels are plain
strings, including numbers, words, `=`, `<`, `>`, and `<>`. There are 2–6 unique
options and exactly one correct index. Yes/no options are exactly `["Ano", "Ne"]`.
Choice assessment uses `input: "number"` and one exact number matcher matching
the answer index; partial credit is forbidden. The shared choice UI submits
that index, not the displayed symbol or word.
Numerical tasks (`number`) contain `steps` but no choice fields.
Each step has `prompt`, `hint`, typed canonical `answer`, `assessment`, and
`solution` (worked explanation). History questions also require `assessment`.
Canonical answers remain the display/solution source and must receive full
credit under their policy; inconsistent declarations fail validation.

| Difficulty | Teaching shape | Required answers | Scoring |
|---|---|---:|---|
| `easy` | Yes/no understanding question, explaining why | 1 choice | 10 |
| `medium` | General choice or exactly one calculation, mathematically assigned, not a word problem | 1 choice or number | 20 |
| `hard` | Connected multi-step calculations; word problems allowed | 2–4 numbers | 30 divided equally between steps |

V4 numerical answers use integer, fraction or decimal canonical formats with
`input: "number"`. Units belong in prompts and worked solutions, not entries.
One-step equations such as `x + 20 = 200` expect the exact numerical value `180`;
learner expressions are never evaluated. Teach every tested concept and provide
meaningful hints and worked solutions. The validator checks structure, not
whether text really teaches the method, contains exactly one calculation, or
connects hard steps; those are mandatory educational-review checks.

Quiz modes sample **without replacement**, always easy → medium → hard.
There is no fourth difficulty and no accuracy or speed bonus.

| V4 quiz mode | Easy | Medium choice | Medium number | Hard | Maximum |
|---|---:|---:|---:|---:|---:|
| Easy (4 tasks) | 1 | 1 | 1 | 1 | 80 |
| Medium (6 tasks) | 2 | 1 | 1 | 2 | 120 |
| Hard (10 tasks) | 3 | 2 | 2 | 3 | 200 |

Grades retain history's 80/60/40/20% thresholds but use these attainable maxima.
No scoring or task-selection setting is supplied by lesson authors.

### Legacy maths v2/v3

Legacy lessons keep four independent easy calculations labelled 1a–1d
(2.5 points each plus 1 for all correct), one medium word-problem answer
(20 points), and three hard answers (10 points each).
Their mixes remain 1/1/1, 1/2/2, 2/5/3 and maxima 61, 111, 212.
V2 retains format-restricted assessment; v3 retains explicit policies.
No automatic migration or reinterpretation occurs. History v1/v3 remains unchanged.

Read [assessment policies and exact answer formats](assessment.md) for
full/partial credit, canonical typed answers and legacy compatibility.
