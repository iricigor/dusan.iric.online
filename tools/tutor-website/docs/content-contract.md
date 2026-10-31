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

Read [assessment policies and exact answer formats](assessment.md) for
full/partial credit, canonical typed answers and legacy compatibility.
