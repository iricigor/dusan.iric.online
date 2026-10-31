'use strict';

const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const fs = require('node:fs');
const path = require('node:path');
const { validateLesson } = require('../../validate.js');
const { renderLesson } = require('../../build.js');

async function checkExport({ client, evaluate, capture, downloads, subject, lesson }) {
    for (const [width, theme] of [320, 1600].flatMap(width => ['light', 'dark'].map(theme => [width, theme]))) {
        await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        await evaluate(`(() => {
            if ((getComputedStyle(document.documentElement).colorScheme === 'dark') !== ${theme === 'dark'})
                document.getElementById('theme').click();
        })()`);
        const exportLayout = await evaluate(`(() => {
            const tools = document.getElementById('quiz-tools');
            const cog = tools.querySelector('summary');
            const tabs = document.querySelector('[role="tablist"]').getBoundingClientRect();
            const restingOpacity = getComputedStyle(cog).opacity;
            const initiallyClosed = !tools.open;
            cog.click();
            document.getAnimations().forEach(animation => animation.finish());
            const trigger = cog.getBoundingClientRect();
            const content = document.getElementById('quiz-tools-panel');
            const panel = content.getBoundingClientRect();
            const download = document.getElementById('quiz-export');
            const description = document.getElementById(download.getAttribute('aria-describedby'));
            const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
            const valid = initiallyClosed && tools.open && cog.getAttribute('aria-label') === 'Nástroje kvízu' &&
                !!cog.querySelector('svg[aria-hidden="true"]') &&
                tools.parentElement.className === 'tab-bar' && !tools.closest('[role="tablist"]') &&
                !document.getElementById('setup').contains(tools) && Number(restingOpacity) <= .7 &&
                trigger.left >= tabs.right && trigger.width >= 44 && trigger.height >= 44 &&
                panel.left >= 0 && panel.right <= innerWidth && panel.bottom <= innerHeight &&
                panel.width <= Math.min(14 * rootFontSize, innerWidth - 2 * rootFontSize) &&
                panel.height <= 80 &&
                download.getBoundingClientRect().height >= 44 && download.textContent === 'Stáhnout lekci (JSON)' &&
                download.title.includes('Celá lekce') &&
                description.classList.contains('visually-hidden') && description.textContent.includes('správných odpovědí') &&
                !content.querySelector('p:not([hidden])') &&
                document.documentElement.scrollWidth <= innerWidth;
            return { valid, initiallyClosed, open: tools.open, restingOpacity,
                focused: document.activeElement.id, hovered: cog.matches(':hover'),
                trigger: trigger.toJSON(), tabs: tabs.toJSON(), panel: panel.toJSON(),
                download: download.getBoundingClientRect().toJSON(),
                viewport: [innerWidth, innerHeight], scrollWidth: document.documentElement.scrollWidth };
        })()`);
        assert.equal(exportLayout.valid, true,
            `${subject}/${width}/${theme}: compact, accessible, viewport-safe export action: ${JSON.stringify(exportLayout)}`);
        await capture(`${subject}-quiz-tools-${width}-${theme}`);
        assert.equal(await evaluate(`(() => {
            document.getElementById('quiz-tools-panel').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            return document.getElementById('quiz-tools').open;
        })()`), true, 'clicking inside the panel does not dismiss it');
        const outside = await evaluate(`(() => {
            const bounds = document.getElementById('player').getBoundingClientRect();
            return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
        })()`);
        await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...outside, button: 'left', clickCount: 1 });
        await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...outside, button: 'left', clickCount: 1 });
        assert.equal(await evaluate(`!document.getElementById('quiz-tools').open &&
            document.activeElement === document.getElementById('player')`), true, 'outside click closes without stealing input focus');
    }
    await evaluate(`document.querySelector('#quiz-tools summary').focus()`);
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    assert.equal(await evaluate(`document.getElementById('quiz-tools').open`), true, `${subject}: quiz cog supports keyboard disclosure`);
    await evaluate(`document.getElementById('quiz-export').focus()`);
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    assert.equal(await evaluate(`!document.getElementById('quiz-tools').open &&
        document.activeElement === document.querySelector('#quiz-tools summary')`), true, 'Escape closes export and restores cog focus');
    await evaluate(`document.querySelector('#quiz-tools summary').click(); document.getElementById('quiz-export').focus()`);
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    assert.deepEqual(await evaluate(`({
        closed: !document.getElementById('quiz-tools').open,
        focused: document.activeElement.id
    })`), { closed: true, focused: 'quiz' }, 'tabbing out dismisses export and preserves the next normal tab stop');
    await evaluate(`document.querySelector('#quiz-tools summary').click()`);
    assert.equal(await evaluate(`(() => {
        const create = URL.createObjectURL;
        URL.createObjectURL = () => { throw new Error('Simulated export failure'); };
        document.getElementById('quiz-export').click();
        URL.createObjectURL = create;
        return document.getElementById('quiz-tools').open && !document.getElementById('export-error').hidden &&
            document.getElementById('export-error').textContent.includes('nepodařilo');
    })()`), true, `${subject}: export failure is visible`);
    const downloadPath = path.join(downloads, `${lesson.id}-lekce.json`);
    if (fs.existsSync(downloadPath)) fs.unlinkSync(downloadPath);
    await evaluate(`document.getElementById('quiz-export').click()`);
    for (let attempt = 0; attempt < 100 && !fs.existsSync(downloadPath); attempt++) await delay(20);
    assert.ok(fs.existsSync(downloadPath), `${subject}: JSON download completes offline`);
    const exported = JSON.parse(fs.readFileSync(downloadPath, 'utf8'));
    assert.deepEqual(exported, lesson);
    assert.equal(validateLesson(subject, exported), exported);
    assert.equal(renderLesson(subject, exported), renderLesson(subject, lesson));
    assert.equal(await evaluate(`!document.getElementById('quiz-tools').open &&
        document.activeElement === document.querySelector('#quiz-tools summary') &&
        document.getElementById('export-error').hidden &&
        !document.getElementById('setup').hidden && document.getElementById('game').hidden`), true);
}

module.exports = { checkExport };
