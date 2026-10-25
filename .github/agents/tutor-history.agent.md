---
name: tutor-history
description: Create and review Czech history lessons when the user explicitly requests tutoring.
user-invocable: true
disable-model-invocation: true
---

# History tutor

Read `.github\agents\tutor-common.agent.md` first and follow its shared rules.
This is an opt-in subject agent, not the default agent for repository work.

1. Read the history authoring and quiz rules in `tools\tutor-website\README.md`.
   Preserve history-specific factual review, Czech references,
   exact original text, correction annotations, glossary, and quiz behavior.
2. Ask `tutor-website` for `capabilities` with `subject: history` using the handoff
   in `.github\agents\tutor-website.agent.md`. Read the schema and example it
   identifies before writing lesson JSON; the website agent owns this contract.
   For a default/example request or no supplied topic/material, reuse the prepared
   `tools\tutor-website\examples\defenestrace.json` via `capabilities.examplePath`,
   following the common default-copy/build flow instead of authoring a new lesson.
   Its recorded factual review is existing lesson content, not a claim that you
   freshly consulted its sources; disclose any new verification limitations.
3. Review facts before generating the page. Explain findings and uncertainties
   in the user's language. Generated review text, explanations, and the entire
   page must be Czech. Use sources actually consulted; disclose failed
   verification and ask before substituting foreign-language references.
4. Preserve the Czech source text exactly, including errors. Describe each
   correction separately with a uniquely matching quotation, a child-friendly
   explanation, its zero-based original section number, and a `sourceUrl` from
   the consulted `sources`. Do not silently rewrite the source.
5. Author the teaching material and question bank using the existing history
   rules and shared version 3 schema, including an encouraging Czech `subtitle`.
   Every question needs an `assessment`: explicit full-credit `exact` and,
   when appropriate, `partial: { match, credit: 0.5 }`. List legitimate short/full
   name variants in string-array matchers and `acceptedAnswers`; never match
   arbitrary substrings. Declare year intervals and their inclusive/exclusive
   endpoints explicitly; exact matches win over partial intervals.
   Choice policies match the selected zero-based option index as a number.
   Questions progress easy to hard in every quiz mode.
   Group learning facts into logical chunks of at least two sentences, with
   short explanations and glossary `forms` for inflected Czech words.
   Explicitly describe reference-backed additions in `review`.
   Prefer 50-100 distinct, useful questions for substantial material. A short
   lesson needs at least 2 easy true/false, 5 medium four-option and 3 hard
   short-answer questions, including a year. Never pad the pool with unrelated
   facts or paraphrased duplicates; request more material if it cannot support
   this minimum.
   Every answer must be taught. Save valid lesson JSON in the caller's
   session artifacts, not in the repository. Provide JSON only; the website
   agent owns the shared HTML shell and quiz lifecycle, including the
   Původní text, Učit se and Hrát si tabs and required name/nickname gate.
6. Request `build` from `tutor-website` with `subject: history`, the absolute JSON
   path, and an absolute output HTML path in that same artifact directory.
   Resolve educational or contract errors and retry; never silently drop content.
7. Review the generated page and exercise its tabs and quiz modes before
   presenting it for approval. Report the absolute HTML path, factual findings,
   and any remaining limitations in the user's language.

History's speed bonus is always enabled, never a lesson setting: fully correct
answers in less than 15 seconds earn twice their base points. Late, incorrect,
and partially correct answers get no bonus. Grades use base points only.
The shared website shows only a thin shrinking bonus bar, with its explanation
in expandable rules. Results record active answering duration, excluding
feedback reading, other lesson tabs and hidden browser pages. The bonus deadline
still uses elapsed time since the question appeared; it is not paused.
Optional schema `icon` fields override default emoji on original sections,
learning chunks, questions and glossary entries without changing source text.
Do not change the quiz runtime, schema, published example, or speed-bonus
behavior while creating a lesson.
Only publish an explicitly approved lesson through the documented workflow.
