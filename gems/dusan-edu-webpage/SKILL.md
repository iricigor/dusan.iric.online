---
name: dusan-edu-webpage
description: Shared presentation engine that transforms structured educational data payloads into complete, self-contained, responsive, and interactive HTML/JS web applications. Always generates a downloadable standalone HTML file in the response. Use when the user requests generating interactive educational web applications combining template, css, js, and json.
---
# Dusan Edu Webpage Skill

This skill provides a modularized presentation engine that transforms structured educational JSON data payloads into complete, self-contained, responsive, and interactive HTML/JS web applications by combining `template.html`, `styles.css`, `app.js.json`, `schema.json`, and `sample.json`, and always returning a downloadable HTML file in the response.

## File Structure & Responsibilities
- **SKILL.md**: Basic skill description, trigger conditions, instructions, and changelog.
- **template.html**: HTML structure featuring Czech tab titles, a player name placeholder, and "Síň slávy".
- **styles.css**: Assembled compatibility stylesheet with unchanged wider responsive layouts, themes, animations and inline learning chunks.
- **styles/**: Maintainable CSS source in the fixed order `base.css`, `learning.css`, `quiz.css`, `effects-results.css`. Concatenate without separators to produce `styles.css`; preserve this order and its existing cascade.
- **app.js.json**: A JSON array containing the browser application JavaScript, with each array item representing one source line.
- **schema.json**: The static JSON input schema specification with generation rules for hard open-ended questions.
- **sample.json**: The sample content payload representing Habsburg rule and the Bohemian Revolt.

## HTML Assembly
- Inline the complete `styles.css` in a `<style>` element in place of the template's stylesheet link. It already contains all CSS fragments; never emit `@import` or external asset requests in the standalone HTML.
- Parse `app.js.json` as a JSON array of strings and join the strings with newline characters to reconstruct the JavaScript source.
- Wrap the reconstructed source in a `<script>` element and insert it immediately before `</body>` in the generated HTML. The template intentionally contains no embedded JavaScript.
- Always return the completed standalone HTML file in the response.

## Maintaining CSS and JavaScript

After editing CSS fragments, rebuild the compatibility stylesheet from this
skill directory:

```powershell
node -e "const fs = require('node:fs'); const path = require('node:path'); fs.writeFileSync('styles.css', Buffer.concat(['base.css', 'learning.css', 'quiz.css', 'effects-results.css'].map(name => fs.readFileSync(path.join('styles', name)))));"
```

The packaging script verifies CSS assembly as well as JavaScript/JSON equality
before packaging all CSS sources and `styles.css`; `app.js` remains excluded.
The JavaScript split from issue #69 is deferred: unchanged `app.js.json` is the
canonical packaged runtime, and splitting its readable `app.js` without changing
JSON would introduce a second maintainable implementation. Both remain untouched.
Do not hand-commit a rebuilt ZIP for this source refactor; the existing packaging
automation owns archive updates. The independent Gems workflow is unchanged.

## Changelog Rule & Modification Tracking
- **Mandatory Changelog Maintenance:** Whenever any skill file (`SKILL.md`, `template.html`, `styles.css`, `app.js.json`, `schema.json`, or `sample.json`) is modified, updated, or added, a corresponding entry **must** be appended to the Changelog section below detailing the exact changes made across all skill files.

---

## Changelog
- **2026-10-18**: Added `SKILL.md` to the `gems/dusan-edu-webpage` skill package.
- **2026-10-18**: Added global persistence confirmation, ensuring all skill files and the mandatory changelog tracking are packaged and committed.
- **2026-10-18**: Updated `SKILL.md` description and instructions to explicitly mandate that every execution **always generates a downloadable standalone HTML file in the response**, and added the mandatory Changelog requirement tracking modifications across all skill files.
- **2026-10-18**: Updated `styles.css` and learning chunk layout so sentences flow continuously on the same row rather than breaking lines. Expanded glossary / key terms in `sample.json` and added hard question formatting guidelines in `schema.json`.
- **2026-10-18**: Implemented strict player name validation in `app.js` requiring at least 3 letters and rejecting random placeholder names. Configured quiz hardness question counts (3 for easy, 5 for medium, 10 for hard). Updated leaderboard title to "Síň slávy" and populated 10 common Czech name placeholders.
- **2026-10-18**: Moved the complete `app.js` browser logic into an inline `<script>` in `template.html`, removed the external JavaScript file, and updated this skill's file descriptions and assembly instructions.
- **2026-10-18**: Restored the deleted `app.js` logic as the line-based `app.js.json` array, removed inline JavaScript from `template.html`, and documented how to reconstruct and insert the script when generating HTML.
- **2026-10-31**: Split CSS into ordered base/layout, learning, quiz and effects/results sources while retaining identical assembled `styles.css`; documented offline CSS assembly and added packaging parity verification. Deferred the JS split to preserve the unchanged canonical JSON runtime and existing package contract.
