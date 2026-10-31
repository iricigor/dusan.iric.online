'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createQrSvg } = require('./qr.js');

function renderPage(lesson, subject, publicationUrl) {
    if (!['history', 'maths'].includes(subject)) throw new Error(`Unsupported subject: ${subject}`);
    const escapeHtml = text => text.replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
    const replacements = {
        TITLE: escapeHtml(lesson.topic),
        FAVICON: encodeURIComponent(fs.readFileSync(path.join(__dirname, 'favicon.svg'), 'utf8')).replace(/'/g, '%27'),
        WEBPAGE_LOGO: encodeURIComponent(fs.readFileSync(path.join(__dirname, 'design-proposals', 'issue-52', 'rounded-fancy.svg'), 'utf8')).replace(/'/g, '%27'),
        SUBJECT: subject === 'history' ? 'Dějepis' : 'Matematika',
        SUBJECT_ID: subject,
        TIMING: subject === 'history' ? '<div id="bonus" aria-hidden="true"><div id="bonus-bar"></div></div>' : '',
        SHARE: `<aside class="lesson-share" aria-label="Odkaz na lekci"><div><p>Otevři si tuto lekci na jiném zařízení naskenováním QR kódu nebo kliknutím na odkaz:</p><a href="${escapeHtml(publicationUrl)}">${escapeHtml(publicationUrl)}</a></div>${createQrSvg(publicationUrl)}</aside>`,
        STYLES: fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8'),
        DATA: JSON.stringify(lesson).replace(/[<>&\u2028\u2029]/g,
            char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`),
        APP: fs.readFileSync(path.join(__dirname, 'assessment.js'), 'utf8') + '\n' +
            fs.readFileSync(path.join(__dirname, 'runtime.js'), 'utf8') + '\n' +
            fs.readFileSync(path.join(__dirname, `${subject}.js`), 'utf8')
    };
    return fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8')
        .replace(/@@(TITLE|FAVICON|WEBPAGE_LOGO|SUBJECT|SUBJECT_ID|TIMING|SHARE|STYLES|DATA|APP)@@/g, (_, key) => replacements[key]);
}

module.exports = { renderPage };
