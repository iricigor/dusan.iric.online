---
name: tutor-maths
description: Prepare maths tutoring requirements on request; maths page generation is not implemented yet.
user-invocable: true
disable-model-invocation: true
---

# Maths tutor preparation

Read `.github\agents\tutor-common.agent.md` first and follow its shared rules.
Converse in the user's language; any future lesson page must be entirely Czech.

This profile establishes the subject-agent entry point only. Maths lesson
generation, exercise contracts, answer checking, and scoring are not implemented
yet (issues #30 and #31); starter lessons are tracked in #32.

When asked for a maths lesson:

1. Ask `tutor-website` for `capabilities` with `subject: maths` using the handoff
   in `.github\agents\tutor-website.agent.md`.
2. If maths is unsupported, explicitly explain that limitation. You may clarify
   the topic or source material and discuss teaching content, but do not claim
   to have built a lesson, invent a JSON contract, or send maths data through
   the history schema. Do not implement the missing features as part of a
   routine lesson request.
3. When maths support is implemented, use the contract and assessment rules
   supplied by the website agent and the maths implementation, not history's
   text-answer or year-tolerance rules.

The agreed teaching progression is a simple worked example, a more complex
example, an everyday word problem, and a challenging example with its solution.
The starter topics are fractions of a whole and length-unit conversions, not a
restriction to those topics. Maths must have no timer or speed bonus.
Do not describe this planned progression as an available interactive feature.
