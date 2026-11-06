# Internal tutor website generator

Requires Node.js 22+. No npm packages, Python, AI keys, runtime network, or
external page assets. `tutor-website` remains internal-only; subject tutors own
educational content, Czech-language review, rendered educational review and
publication approval. The website helper owns technical review of generated pages.
Never change `gems` for this workflow.

## Quick start

From the repository root in PowerShell:

```powershell
node tools\tutor-website\build.js capabilities history
node tools\tutor-website\build.js capabilities maths
node tools\tutor-website\build.js build "C:\session-artifacts\handoff.json"
node --test tools\tutor-website\tests\*.test.js
```

Read the linked contracts before authoring or reviewing a lesson. `capabilities.contractPath` remains this index; schema, builder and CLI paths are unchanged.

## Discover, author, hand off

See [Authoring and build handoff](docs/authoring.md#discover-author-hand-off).

### Website-owned task counts

See [Authoring and build handoff](docs/authoring.md#website-owned-task-counts).

### Prepared defaults

See [Authoring and build handoff](docs/authoring.md#prepared-defaults).

### Build handoff

See [Authoring and build handoff](docs/authoring.md#build-handoff).

## History authoring and quiz rules

See [Authoring and build handoff](docs/authoring.md#history-authoring-and-quiz-rules).

### Existing lesson data

See [Authoring and build handoff](docs/authoring.md#existing-lesson-data).

## Shared page and quiz ownership

See [Shared page behavior and ownership](docs/page-behavior.md#shared-page-and-quiz-ownership).

### What stays separate, and why

See [Shared page behavior and ownership](docs/page-behavior.md#what-stays-separate-and-why).

### Motivation, semantic paragraphs and motion

See [Shared page behavior and ownership](docs/page-behavior.md#motivation-semantic-paragraphs-and-motion).

### Learning progress and optional history timeline

See [Shared page behavior and ownership](docs/page-behavior.md#learning-progress-and-optional-history-timeline).

### Authored and child-added inline highlighting

See [Shared page behavior and ownership](docs/page-behavior.md#authored-and-child-added-inline-highlighting).

### Icons, glossary and standalone branding

See [Shared page behavior and ownership](docs/page-behavior.md#icons-glossary-and-standalone-branding).

### Completion, local ranking and answer duration

See [Shared page behavior and ownership](docs/page-behavior.md#completion-local-ranking-and-answer-duration).

### Printable tests and practice sheets

See [Shared page behavior and ownership](docs/page-behavior.md#printable-tests-and-practice-sheets).

### Selective Gems integration

See [Shared page behavior and ownership](docs/page-behavior.md#selective-gems-integration).

## Shared v3 content contract and maths section

The same schema now also defines progressive maths v4; history remains v3.

See [Shared content contract](docs/content-contract.md#shared-v3-content-contract-and-maths-section).

### Shared full/partial answer policies

See [Assessment and answer formats](docs/assessment.md#shared-fullpartial-answer-policies).

### Legacy assessment compatibility

See [Assessment and answer formats](docs/assessment.md#legacy-assessment-compatibility).

### Typed answers and exact comparison

See [Assessment and answer formats](docs/assessment.md#typed-answers-and-exact-comparison).

## Pull request validation

See [Validation, releases and publication](docs/validation-publication.md#pull-request-validation).

## Automatic tutor releases

See [Validation, releases and publication](docs/validation-publication.md#automatic-tutor-releases).

## Local review and publication

See [Validation, releases and publication](docs/validation-publication.md#local-review-and-publication).
