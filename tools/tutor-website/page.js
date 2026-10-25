'use strict';

const fs = require('node:fs');
const path = require('node:path');

function renderPage(lesson, templatePath, appPath) {
    const escapeHtml = text => text.replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
    const replacements = {
        TITLE: escapeHtml(lesson.topic),
        STYLES: fs.readFileSync(path.join(__dirname, '..', 'history-tutor', 'styles.css'), 'utf8'),
        DATA: JSON.stringify(lesson).replace(/[<>&\u2028\u2029]/g,
            char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`),
        APP: fs.readFileSync(appPath, 'utf8')
    };
    return fs.readFileSync(templatePath, 'utf8')
        .replace(/@@(TITLE|STYLES|DATA|APP)@@/g, (_, key) => replacements[key]);
}

module.exports = { renderPage };
