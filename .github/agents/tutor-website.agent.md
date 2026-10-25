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

For `subject: history`, the existing version 1 contract is defined by
`tools\history-tutor\lesson.schema.json` and `tools\history-tutor\validate.js`.
Read both and `tools\history-tutor\examples\defenestrace.json` before advising on
or building a lesson. The legacy builder is `tools\history-tutor\build.js`.
Both subjects use `tools\tutor-website\template.html` and
`tools\tutor-website\runtime.js`; history assessment lives in
`tools\history-tutor\app.js` and shared styles in `tools\history-tutor\styles.css`.

For `subject: maths`, read `tools\tutor-website\maths.schema.json`,
`tools\tutor-website\validate.js` and `tools\tutor-website\README.md`.
The maths version 2 contract requires `original` sections. The generator
supports progressively scaffolded learning/practice, exact typed answer
evaluation, untimed quizzes, partial scoring, grades and named per-lesson
browser-session results.
Symbolic algebra evaluation and interactive geometry are unsupported.
Starter teaching lessons are separate (#32). Disclose these limitations.
Never coerce maths into the history schema or invent another contract.
Any other unsupported subject or operation must receive an explicit explanation.

Subject tutors provide JSON only; this agent owns HTML generation. Always use
the shared Původní text, Učit se and Hrát si tabs and name/nickname-required
quiz flow. Maths practice is part of Učit se, not a fourth or replacement tab.
Do not create per-lesson or per-subject copies of the common quiz lifecycle.
Subject adapters may vary assessment rules, not shared functionality.
For topic-only requests, show the short Czech topic in Původní text.

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
Maths has no starter example yet; do not present
the structural test fixture as an educational lesson.

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
3. Run `node --test tools\history-tutor\tests\*.test.js tools\tutor-website\tests\*.test.js`.
   Return command failures and diagnostics explicitly. Do not report success
   when building or required checks failed.
4. Return the actual absolute input/output paths, commands and their results,
   and any limitations. The subject tutor must still inspect the local page,
   exercise the three shared tabs, name validation, glossary, progressively
   reduced learning scaffolding and all subject quiz modes, and request the
   user's approval. Maths has no timing UI or speed bonus; history keeps its
   mandatory strict-before-15000ms bonus and existing scoring.

Do not write to `site`, change its index, commit, or open a PR. Publication is a
separate approved action owned by the calling workflow.
