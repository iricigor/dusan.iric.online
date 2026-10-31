# Tutor workflow approval

These rules apply when working with tutor agents, not to unrelated repository
work. Do not invoke tutor agents unless the user explicitly requests tutoring.
Leave the independent `gems` workflow unchanged.

Before starting any tutor work, always ask whether the user wants only a
generated webpage or also changes to the tutor agents. Wait for their answer
before generating a page or changing agents.

## Webpage only

- Follow the existing tutor workflow to generate and check a local draft.
  Keep draft JSON and HTML in the session artifact directory, outside the
  repository. Do not change agents, generators, schemas, or runtime code.
- Present the draft for review and wait for the user to explicitly confirm
  that it is good. Generating or viewing a page is not approval.
- Only after the user approves both the page and publication, add the approved
  page to the repository and create a pull request for publication to GitHub
  Pages. Do not commit a generated page, open a publishing PR, merge, or deploy
  before the corresponding user authorization.

## Agent changes

- First discuss the requested changes and agree with the user on what needs
  to be done. Do not implement changes during this discussion.
- After the scope is agreed, create a GitHub issue describing the agreed work
  and share its link with the user.
- Stop and wait for explicit confirmation to start working on that issue.
  Agreement on scope or creation of the issue is not authorization to implement.
- After receiving that confirmation, before starting code changes, create a
  draft pull request with a title starting with `WIP: `. Include `Closes #<issue>`
  in its description to mark that merging the pull request will close the agreed
  issue.
- If a webpage-only request needs agent or tooling changes, explain the
  limitation and follow this approval path instead of silently expanding scope.
