---
name: dusan-edu-webpage
description: Shared presentation engine that transforms structured educational data payloads into complete, self-contained, responsive, and interactive HTML/JS web applications. Always generates a downloadable standalone HTML file in the response. Use when the user requests generating interactive educational web applications combining template, css, js, and json.
---
# Dusan Edu Webpage Skill

This skill provides a modularized presentation engine that transforms structured educational JSON data payloads into complete, self-contained, responsive, and interactive HTML/JS web applications by combining `template.html` (including its inline JavaScript), `styles.css`, `schema.json`, and `sample.json`, and always returning a downloadable HTML file in the response.

## File Structure & Responsibilities
- **SKILL.md**: Basic skill description, trigger conditions, instructions, and changelog.
- **template.html**: HTML structure and inline JavaScript featuring Czech tab titles, 10 random Czech name examples for quiz placeholder, and "Síň slávy".
- **styles.css**: Wider responsive layout containers (`max-width: 1600px`), themes (dark/light), animations (shake, bounce, success flash, fade-out), responsive styling, and inline sentence layout for learning chunks.
- **schema.json**: The static JSON input schema specification with generation rules for hard open-ended questions.
- **sample.json**: The sample content payload representing Habsburg rule and the Bohemian Revolt.

## Changelog Rule & Modification Tracking
- **Mandatory Changelog Maintenance:** Whenever any skill file (`SKILL.md`, `template.html`, `styles.css`, `schema.json`, or `sample.json`) is modified, updated, or added, a corresponding entry **must** be appended to the Changelog section below detailing the exact changes made across all skill files.

---

## Changelog
- **2026-10-18**: Added `SKILL.md` to the `gems/dusan-edu-webpage` skill package.
- **2026-10-18**: Added global persistence confirmation, ensuring all skill files and the mandatory changelog tracking are packaged and committed.
- **2026-10-18**: Updated `SKILL.md` description and instructions to explicitly mandate that every execution **always generates a downloadable standalone HTML file in the response**, and added the mandatory Changelog requirement tracking modifications across all skill files.
- **2026-10-18**: Updated `styles.css` and learning chunk layout so sentences flow continuously on the same row rather than breaking lines. Expanded glossary / key terms in `sample.json` and added hard question formatting guidelines in `schema.json`.
- **2026-10-18**: Implemented strict player name validation in `app.js` requiring at least 3 letters and rejecting random placeholder names. Configured quiz hardness question counts (3 for easy, 5 for medium, 10 for hard). Updated leaderboard title to "Síň slávy" and populated 10 common Czech name placeholders.
- **2026-10-18**: Moved the complete `app.js` browser logic into an inline `<script>` in `template.html`, removed the external JavaScript file, and updated this skill's file descriptions and assembly instructions.