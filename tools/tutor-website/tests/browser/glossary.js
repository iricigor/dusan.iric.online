'use strict';

const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');

async function checkGlossary({ client, evaluate, capture, subject }) {
    await client.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    });
    assert.equal(await evaluate(`(async () => {
        const count = window.tabTransitions.length;
        await window.switchTutorTab('quiz');
        const noAnimation = document.getElementById('quiz').getAnimations().length === 0;
        await window.switchTutorTab('learning');
        return noAnimation && window.tabTransitions.length === count &&
            !document.getElementById('learning').hidden;
    })()`), true, `${subject}: reduced motion switches immediately without native or fallback animations`);
    assert.deepEqual(await evaluate(`(() => {
        const feedback = document.getElementById('feedback');
        feedback.classList.add('failure');
        const animation = getComputedStyle(feedback).animationName;
        const transition = getComputedStyle(document.getElementById('theme')).transitionDuration;
        const drawerTransition = getComputedStyle(document.getElementById('glossary-drawer')).transitionDuration;
        feedback.classList.remove('failure');
        return { animation, transition, drawerTransition };
    })()`), { animation: 'none', transition: '0s', drawerTransition: '0s' }, `${subject}: reduced motion`);
    const bookmark = await evaluate(`(() => {
        const bounds = document.getElementById('glossary-toggle').getBoundingClientRect();
        return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2, top: bounds.top };
    })()`);
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bookmark.x, y: bookmark.y });
    assert.equal(await evaluate('document.getElementById("glossary-toggle").getBoundingClientRect().top'),
        bookmark.top, `${subject}: reduced-motion hover does not move the bookmark`);
    await client.send('Emulation.setEmulatedMedia', { features: [] });
    assert.equal(await evaluate(`(async () => {
        await window.switchTutorTab('learning');
        const glossary = document.getElementById('glossary-drawer');
        document.getElementById('glossary-toggle').click();
        document.querySelector('#glossary button').click();
        const open = document.getElementById('definition').matches(':popover-open');
        document.getElementById('definition-close').click();
        return glossary.matches(':popover-open') && open && !!document.getElementById('definition-text').textContent;
    })()`), true);
    assert.equal(await evaluate('document.activeElement === document.querySelector("#glossary button")'), true);
    await evaluate(`document.querySelector('#glossary button').click()`);
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    assert.equal(await evaluate(`!document.getElementById('definition').matches(':popover-open') &&
        document.getElementById('glossary-drawer').matches(':popover-open') &&
        document.activeElement === document.querySelector('#glossary button')`), true, `${subject}: first Escape closes definition, not drawer`);
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    assert.equal(await evaluate(`!document.getElementById('glossary-drawer').matches(':popover-open') &&
        document.activeElement === document.getElementById('glossary-toggle')`), true, `${subject}: second Escape closes drawer and restores focus`);
    await evaluate(`document.getElementById('glossary-toggle').click()`);
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 2, y: 895, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 2, y: 895, button: 'left', clickCount: 1 });
    assert.equal(await evaluate(`!document.getElementById('glossary-drawer').matches(':popover-open')`), true, `${subject}: drawer dismisses on outside click`);
    assert.equal(await evaluate(`(() => {
        document.getElementById('glossary-toggle').click();
        document.getElementById('expand-learning').focus();
        return !document.getElementById('glossary-drawer').matches(':popover-open') &&
            document.activeElement === document.getElementById('expand-learning');
    })()`), true, `${subject}: leaving nonmodal drawer preserves unobscured keyboard focus`);
    await evaluate(`document.getElementById('expand-learning').click()`);
    for (const width of [320, 1600]) {
        await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        assert.equal(await evaluate(`(async () => {
            const trigger = document.querySelector('#learning-content .term');
            trigger.scrollIntoView({ block: 'center' });
            trigger.click();
            document.getAnimations().forEach(animation => animation.finish());
            const panel = document.getElementById('definition');
            const bounds = panel.getBoundingClientRect();
            return panel.matches(':popover-open') && bounds.left >= 0 && bounds.right <= innerWidth &&
                bounds.top >= 0 && bounds.bottom <= innerHeight &&
                trigger.getAttribute('aria-expanded') === 'true' &&
                document.activeElement === document.getElementById('definition-close');
        })()`), true, `${subject}/${width}: anchored glossary fits viewport`);
        await capture(`${subject}-popover-${width}`);
        await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await delay(50);
        assert.equal(await evaluate(`!document.getElementById('definition').matches(':popover-open') &&
            document.activeElement.classList.contains('term') &&
            document.activeElement.getAttribute('aria-expanded') === 'false'`), true, `${subject}: Escape restores focus`);
        await evaluate(`document.activeElement.click()`);
        await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 2, y: 895, button: 'left', clickCount: 1 });
        await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 2, y: 895, button: 'left', clickCount: 1 });
        await delay(50);
        assert.equal(await evaluate(`!document.getElementById('definition').matches(':popover-open') &&
            document.querySelector('#learning-content .term').getAttribute('aria-expanded') === 'false'`), true, `${subject}: light dismiss`);
    }
    await evaluate(`(() => {
        [...document.querySelectorAll('#learning-content details')].forEach((item, index) => {
            item.open = window.initialLearningOpen[index];
        });
        [...document.querySelectorAll('#learning-content .hint-toggle')].forEach((item, index) => {
            if ((item.getAttribute('aria-expanded') === 'true') !== window.initialHintOpen[index]) item.click();
        });
    })()`);
    assert.equal(await evaluate(`(async () => {
        document.getElementById('glossary-toggle').click();
        document.querySelector('#glossary button').click();
        await window.switchTutorTab('quiz');
        return !document.getElementById('definition').matches(':popover-open') &&
            !document.getElementById('glossary-drawer').matches(':popover-open') &&
            document.getElementById('glossary-toggle').hidden &&
            !document.getElementById('scoring-rules').open && !document.getElementById('leaderboard').open &&
            [...document.querySelectorAll('[data-mode]')].every(mode => !/bod/.test(mode.textContent)) &&
            [...document.querySelectorAll('#original-content h2, #learning-content article h2')]
                .every(title => title.querySelector('.card-icon[aria-hidden="true"]'));
    })()`), true, `${subject}: quiet setup and decorative card icons`);
}

module.exports = { checkGlossary };
