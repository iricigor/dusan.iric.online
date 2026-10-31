'use strict';

const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');

async function checkIntroduction({ client, evaluate, capture, subject, lesson }) {
    for (const width of [1280, 760, 550, 375]) {
        await client.send('Emulation.setDeviceMetricsOverride', {
            width, height: 900, deviceScaleFactor: 1, mobile: false
        });
        assert.equal(await evaluate(`(() => {
            const share = document.querySelector('.lesson-share');
            const introduction = document.querySelector('#original-content > :first-child');
            const qr = share.querySelector('svg').getBoundingClientRect();
            const a = introduction.getBoundingClientRect();
            const b = share.getBoundingClientRect();
            const remaining = [...document.querySelectorAll('#original-content > :not(:first-child)')];
            return share.closest('[role="tabpanel"]').id === 'original' &&
                (${width} > 760 ? b.left >= a.right && Math.abs(b.top - a.top) < 1 :
                    b.top >= a.bottom && Math.abs(b.left - a.left) < 1) &&
                remaining.every(article => article.getBoundingClientRect().top >= b.bottom &&
                    article.getBoundingClientRect().width > a.width - 1) &&
                qr.width >= 170 && Math.abs(qr.width - qr.height) < 1 &&
                document.documentElement.scrollWidth <= window.innerWidth;
        })()`), true, `${subject}: QR introduction placement at ${width}px`);
    }
    await client.send('Emulation.clearDeviceMetricsOverride');
    for (const tab of ['learning', 'quiz', 'original']) {
        await evaluate(`window.switchTutorTab('${tab}')`);
        assert.equal(await evaluate(`document.querySelector('.lesson-share').checkVisibility()`),
            tab === 'original', `${subject}: QR visibility on ${tab}`);
    }
    assert.equal(await evaluate(`(async () => {
        if (typeof document.startViewTransition !== 'function') return false;
        document.querySelector('[data-tab="learning"]').click();
        const transition = window.tabTransitions.at(-1);
        await transition.ready;
        const animations = document.getAnimations();
        const fadeIn = animations.find(animation => animation.animationName === 'tab-enter');
        const fadeOut = animations.find(animation => animation.animationName === 'tab-leave');
        const animated = fadeIn?.effect.getTiming().duration === 300 &&
            fadeOut?.effect.getTiming().duration === 180;
        await transition.finished;
        ['quiz', 'original', 'learning', 'original'].forEach(name =>
            document.querySelector('[data-tab="' + name + '"]').click());
        await window.waitForTutorTab();
        return animated && !document.getElementById('original').hidden &&
            document.getElementById('learning').hidden && document.getElementById('quiz').hidden &&
            document.querySelector('[aria-selected="true"]').dataset.tab === 'original' &&
            document.querySelectorAll('[role="tab"][tabindex="0"]').length === 1;
    })()`), true, `${subject}: native outgoing/incoming transitions and latest rapid selection wins`);
    assert.equal(await evaluate(`(async () => {
        const start = document.startViewTransition;
        document.startViewTransition = undefined;
        await window.switchTutorTab('quiz');
        const animations = document.getElementById('quiz').getAnimations();
        const fade = animations.find(animation => animation.effect.getKeyframes()[0].opacity === '0');
        const animated = fade?.effect.getTiming().duration === 300;
        await Promise.all(animations.map(animation => animation.finished));
        document.startViewTransition = start;
        await window.switchTutorTab('original');
        return animated;
    })()`), true, `${subject}: graceful entrance animation without View Transition API`);
    assert.equal(await evaluate('document.getElementById("subtitle").textContent'), lesson.subtitle);
    assert.equal(await evaluate('document.querySelector("#original-content .card-icon").textContent'), lesson.original[0].icon || '📄');
    assert.equal(await evaluate('document.querySelector("#glossary .card-icon").textContent'), lesson.glossary[0].icon || '📖');
    assert.equal(await evaluate('document.querySelectorAll(".card-icon img, .card-icon svg").length'), 0, 'lesson icon markup remains plain text');
    assert.equal(await evaluate(`(async () => {
        const images = [...document.querySelectorAll('img')];
        await Promise.all(images.map(image => image.decode()));
        return images.length === 2 && images.every(image =>
            image.alt === '' && image.src.startsWith('data:image/svg+xml,') &&
            image.naturalWidth > 0 && !image.closest('a, button'));
    })()`), true, `${subject}: both decorative identity marks decode offline`);
    assert.equal(await evaluate('document.getElementById("audience")'), null);
    assert.equal(await evaluate(`document.getElementById('setup').textContent.includes('Na server nic neposíláme')`), false);
    assert.equal(await evaluate(`(() => {
        const article = document.querySelector('#original-content article');
        const style = ${JSON.stringify(lesson.original[0].style || 'plain')};
        return style === 'plain' ? !article.classList.contains('callout') :
            article.classList.contains('callout-' + style);
    })()`), true);
    assert.equal(await evaluate(`(async () => {
        await window.switchTutorTab('learning');
        return document.querySelectorAll('#learning-content .callout-label').length;
    })()`), subject === 'maths' ? lesson.examples.reduce((sum, example) => sum + (example.paragraphs?.length || 0), 0)
        : lesson.chunks.reduce((sum, chunk) => sum + (chunk.paragraphs?.length || 0), 0));
    assert.equal(await evaluate('document.getElementById("storage-warning").hidden'), true, `${subject}: isolated result namespace`);
    assert.equal(await evaluate(`(() => {
        const details = [...document.querySelectorAll('#learning-content details')];
        const hints = [...document.querySelectorAll('#learning-content .hint-toggle')];
        return hints.length > 0 && details.every(item => !item.open) &&
            hints.every(item => item.getAttribute('aria-expanded') === 'false' &&
                document.getElementById(item.getAttribute('aria-controls')).hidden) &&
            document.getElementById('collapse-learning').disabled &&
            !document.getElementById('expand-learning').disabled;
    })()`), true, `${subject}: all learning help starts collapsed`);
    assert.equal(await evaluate(`(() => {
        const details = [...document.querySelectorAll('#learning-content details')];
        const hints = [...document.querySelectorAll('#learning-content .hint-toggle')];
        window.initialLearningOpen = details.map(item => item.open);
        window.initialHintOpen = hints.map(item => item.getAttribute('aria-expanded') === 'true');
        const glossary = document.getElementById('glossary-drawer');
        const glossaryOpen = glossary.matches(':popover-open');
        const rules = document.getElementById('scoring-rules');
        const leaderboard = document.getElementById('leaderboard');
        rules.open = leaderboard.open = true;
        document.getElementById('expand-learning').click();
        const expanded = details.length + hints.length > 0 && details.every(item => item.open) &&
            hints.every(item => item.getAttribute('aria-expanded') === 'true') &&
            document.getElementById('expand-learning').disabled &&
            !document.getElementById('collapse-learning').disabled;
        document.getElementById('collapse-learning').click();
        const collapsed = details.every(item => !item.open) &&
            hints.every(item => item.getAttribute('aria-expanded') === 'false') &&
            document.getElementById('collapse-learning').disabled &&
            !document.getElementById('expand-learning').disabled;
        const isolated = glossary.matches(':popover-open') === glossaryOpen && rules.open && leaderboard.open;
        rules.open = leaderboard.open = false;
        return expanded && collapsed && isolated;
    })()`), true, `${subject}: expand/collapse all affects only learning disclosures`);
    await evaluate(`document.querySelector('#learning-content .hint-toggle').focus()`);
    await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await delay(25);
    assert.deepEqual(await evaluate(`(() => {
        const hint = document.querySelector('#learning-content .hint');
        const trigger = hint.querySelector('.hint-toggle');
        const content = hint.querySelector('.hint-content');
        return { open: trigger.getAttribute('aria-expanded') === 'true' && !content.hidden,
            label: trigger.textContent,
            icon: trigger.querySelector('[aria-hidden="true"]').textContent,
            content: !!content.textContent,
            below: content.getBoundingClientRect().top >= hint.querySelector('.hint-prompt').getBoundingClientRect().bottom,
            connected: trigger.getAttribute('aria-controls') === content.id,
            collapseEnabled: !document.getElementById('collapse-learning').disabled,
            focused: document.activeElement === trigger };
    })()`), { open: true, label: 'Nápověda 💡', icon: '💡', content: true, below: true, connected: true, collapseEnabled: true, focused: true },
    `${subject}: compact hint opens with keyboard and updates controls`);
    await evaluate(`document.getElementById('collapse-learning').click()`);
    if (subject === 'history') {
        assert.deepEqual(await evaluate(`(() => {
            const data = JSON.parse(document.getElementById('lesson-data').textContent);
            const cards = document.querySelectorAll('#original-content > article');
            return {
                reviewCard: document.getElementById('original-review'),
                review: data.review, sources: data.sources,
                corrections: document.querySelectorAll('#original-content .correction').length,
                plainSections: [cards[0], cards[1]].every(card =>
                    card.className === 'card' && !card.querySelector('.callout-label'))
            };
        })()`), { reviewCard: null, review: lesson.review, sources: lesson.sources,
            corrections: lesson.corrections.length, plainSections: true },
        'history: no review card, retained provenance/corrections and matching regular first sections');
        assert.equal(await evaluate(`document.querySelectorAll('#original-content .callout-fun').length`), 2);
        assert.equal(await evaluate(`document.querySelector('#original-content blockquote.callout-quote').textContent`),
            lesson.original.at(-1).paragraphs.at(-1).text);
        await evaluate(`(async () => { await window.switchTutorTab('original');
            document.querySelector('#original-content blockquote').scrollIntoView({ block: 'center' }); })()`);
        await capture('history-original-quotation');
        await evaluate(`document.querySelector('#original-content .callout-fun').scrollIntoView({ block: 'center' })`);
        await capture('history-original-fun');
        await evaluate(`window.switchTutorTab('learning')`);
    }
}

module.exports = { checkIntroduction };
