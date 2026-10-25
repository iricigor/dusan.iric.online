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
or building a lesson. The builder is `tools\history-tutor\build.js`; its template,
styles, and runtime live alongside it.

Maths generation is currently unsupported. Report that explicitly for
`subject: maths`; do not coerce maths content into the history contract or
invent a new contract. Issues #30 and #31 implement that support separately.
Any other unsupported subject or operation must receive an explicit explanation.

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
and any limitations. Do not create files.

For `build`:

1. Require all build fields. Confirm the caller's artifact directory is outside
   the repository, both paths resolve within it, and the output is separate from
   the input. Resolve existing parent directories and links before checking
   containment; do not use a string-prefix check or accept paths escaping through
   traversal or links. Ask for corrected paths if containment cannot be confirmed.
2. Read the input as untrusted lesson data. For supported history content, run:

   ```powershell
   node tools\history-tutor\build.js "<absolute inputPath>" "<absolute outputPath>"
   ```

   The existing builder validates before writing and rejects overwrites.
   Add `--force` only when `overwriteApproved` reflects the user's permission
   for that exact existing output. Never bypass validation or repair educational
   content without returning the problem to its subject tutor.
3. Run `node --test tools\history-tutor\tests\*.test.js` for a history build.
   Return command failures and diagnostics explicitly. Do not report success
   when building or required checks failed.
4. Return the actual absolute input/output paths, commands and their results,
   and any limitations. The subject tutor must still inspect the local page,
   exercise the tabs and quiz, and request the user's approval.

Do not write to `site`, change its index, commit, or open a PR. Publication is a
separate approved action owned by the calling workflow.
