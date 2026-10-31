'use strict';

const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');

async function checkResponsive({ client, evaluate, capture, subject, lesson }) {
    for (const width of [320, 400, 401, 550, 551, 1024, 1600]) {
        await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        for (const theme of ['light', 'dark']) {
            await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
            for (let attempt = 0; attempt < 50; attempt++) {
                if (await evaluate(`document.getElementById('theme').getAttribute('aria-checked') === '${theme === 'dark'}'`)) break;
                await delay(20);
            }
            assert.equal(await evaluate('document.getElementById("theme").getAttribute("aria-checked")'), String(theme === 'dark'));
            const colors = await evaluate('({bg: getComputedStyle(document.body).backgroundColor, fg: getComputedStyle(document.body).color})');
            assert.equal(colors.bg, theme === 'light' ? 'rgb(241, 245, 249)' : 'rgb(16, 24, 39)');
            assert.notEqual(colors.bg, colors.fg);
            assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${subject}/${width}/${theme} overflow`);
            assert.equal(await evaluate(`(() => {
                document.getElementById('theme').click();
                const expected = document.documentElement.dataset.theme === 'dark';
                return document.getElementById('theme').getAttribute('role') === 'switch' &&
                    document.getElementById('theme').getAttribute('aria-checked') === String(expected) &&
                    document.querySelectorAll('#theme svg').length === 2 &&
                    expected === ${theme === 'light'};
            })()`), true, `${subject}: binary sun/moon state`);
            await evaluate('document.getElementById("theme").click(); delete document.documentElement.dataset.theme');
            const tabLayouts = [];
            for (const tab of ['original', 'learning', 'quiz']) {
                assert.equal(await evaluate(`(async () => {
                    const tab = document.querySelector('[data-tab="${tab}"]');
                    tab.focus();
                    await window.switchTutorTab('${tab}');
                    window.scrollTo(0, 0);
                    return !document.getElementById('${tab}').hidden && tab.getAttribute('aria-selected') === 'true' &&
                        tab.getAttribute('role') === 'tab' && tab.tabIndex === 0 &&
                        !!tab.querySelector('svg[aria-hidden="true"]') &&
                        document.getElementById('${tab}').getAttribute('role') === 'tabpanel' &&
                        document.getElementById('${tab}').getAttribute('aria-labelledby') === tab.id
                        && document.documentElement.scrollWidth <= innerWidth;
                })()`), true, `${subject}/${tab}/${width}/${theme}`);
                tabLayouts.push(await evaluate(`(() => {
                    const main = document.querySelector('main').getBoundingClientRect();
                    const header = document.querySelector('.heading').getBoundingClientRect();
                    return {
                        horizontal: [main.left, main.width, header.left, header.width],
                        scrolling: document.documentElement.scrollHeight > document.documentElement.clientHeight,
                        gutter: getComputedStyle(document.documentElement).scrollbarGutter
                    };
                })()`));
                assert.equal(await evaluate(`document.getElementById('learning-controls').hidden`), tab !== 'learning');
                assert.equal(await evaluate(`document.getElementById('quiz-tools').hidden`), tab !== 'quiz');
                assert.equal(await evaluate(`(() => {
                    const mark = document.querySelector('.lesson-header-mark').getBoundingClientRect();
                    const heading = document.querySelector('.heading').getBoundingClientRect();
                    const identity = document.querySelector('.lesson-identity').getBoundingClientRect();
                    const text = document.querySelector('.lesson-title-group').getBoundingClientRect();
                    const title = document.getElementById('topic').getBoundingClientRect();
                    const subtitle = document.getElementById('subtitle').getBoundingClientRect();
                    const theme = document.getElementById('theme').getBoundingClientRect();
                    const tabs = document.querySelector('.tab-bar').getBoundingClientRect();
                    const main = document.querySelector('main').getBoundingClientRect();
                    const footer = document.querySelector('.lesson-footer').getBoundingClientRect();
                    const logo = document.querySelector('.lesson-footer-mark').getBoundingClientRect();
                    return mark.width === ${width <= 550 ? 48 : 64} && mark.height === mark.width &&
                        mark.right <= text.left && title.width >= 80 &&
                        heading.height <= innerHeight / 2 &&
                        (${width} <= 400 ? theme.bottom <= identity.top && theme.right <= heading.right :
                            text.right <= theme.left) &&
                        Math.abs((mark.top + mark.bottom - text.top - text.bottom) / 2) < 1 &&
                        title.top >= text.top && subtitle.bottom <= text.bottom &&
                        tabs.top >= Math.max(mark.bottom, text.bottom, theme.bottom) &&
                        footer.top >= main.bottom && logo.width === ${width <= 550 ? 64 : 96} &&
                        logo.height === logo.width &&
                        Math.abs((logo.left + logo.right) / 2 - (footer.left + footer.right) / 2) < 1 &&
                        logo.top >= footer.top && logo.bottom <= footer.bottom &&
                        document.querySelector('.lesson-footer').checkVisibility();
                })()`), true, `${subject}/${tab}/${width}/${theme}: approved marks, title/subtitle alignment and footer placement`);
                assert.equal(await evaluate(`(() => {
                    const badge = document.querySelector('.lesson-heading .badge');
                    const title = document.getElementById('topic');
                    const a = badge.getBoundingClientRect(), b = title.getBoundingClientRect();
                    return a.right <= b.left && a.top < b.bottom && a.bottom > b.top &&
                        parseFloat(getComputedStyle(badge).fontSize) < parseFloat(getComputedStyle(title).fontSize) &&
                        getComputedStyle(badge).borderRadius !== '0px' &&
                        getComputedStyle(document.getElementById('subtitle')).color === getComputedStyle(badge).color;
                })()`), true, `${subject}/${width}/${theme}: badge/title share a row and subtitle uses the subject accent`);
                if (tab === 'original') {
                    assert.equal(await evaluate(`[...document.querySelectorAll('#original-content article')].every(article => {
                        const style = getComputedStyle(article);
                        const available = article.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
                        return Math.abs(article.querySelector('.original-text').getBoundingClientRect().width - available) <= 1;
                    })`), true, `${subject}/${width}/${theme}: original text fills each card's inner width`);
                }
                if (tab === 'learning') {
                    assert.equal(await evaluate(`(() => {
                        const hint = document.querySelector('#learning-content .hint');
                        const trigger = hint.querySelector('.hint-toggle');
                        const prompt = hint.closest('.card').querySelector('.hint-prompt');
                        const a = prompt.getBoundingClientRect(), b = trigger.getBoundingClientRect();
                        const card = hint.closest('.card').getBoundingClientRect();
                        return b.top >= a.bottom && b.left >= card.left && b.right <= card.right &&
                            getComputedStyle(trigger).float === 'none' &&
                            hint.querySelector('.hint-content').hidden && b.height >= 44;
                    })()`), true, `${subject}/${width}/${theme}: hint pill is below the main text and stays inside the card`);
                    assert.equal(await evaluate(`(() => {
                        const controls = document.getElementById('learning-controls');
                        const tabs = document.querySelector('[role="tablist"]').getBoundingClientRect();
                        const bounds = controls.getBoundingClientRect();
                        return !controls.closest('[role="tablist"]') && bounds.left >= tabs.right &&
                            [...controls.querySelectorAll('button')].every(button => {
                                const rect = button.getBoundingClientRect();
                                return button.textContent === '' && !!button.querySelector('svg[aria-hidden="true"]') &&
                                    button.title === button.getAttribute('aria-label') &&
                                    rect.width >= 44 && rect.height >= 44;
                            });
                    })()`), true, `${subject}/${width}/${theme}: compact labelled icons beside, not inside, the tablist`);
                    assert.equal(await evaluate(`[...document.querySelectorAll('#learning-content details')].every(details =>
                        getComputedStyle(details).borderTopWidth === '0px' &&
                        details.querySelector('summary').getBoundingClientRect().height <= 36 &&
                        parseFloat(getComputedStyle(details).marginTop) <= 3)`),
                    true, `${subject}: compact borderless numbered step/result reveals`);
                    assert.equal(await evaluate(`(() => {
                        const toggle = document.getElementById('glossary-toggle');
                        const drawer = document.getElementById('glossary-drawer');
                        const before = document.getElementById('learning-content').getBoundingClientRect();
                        const bookmark = toggle.getBoundingClientRect();
                        const main = document.querySelector('main').getBoundingClientRect();
                        const initiallyClosed = !drawer.matches(':popover-open') &&
                            toggle.getAttribute('aria-expanded') === 'false' && !toggle.hidden;
                        toggle.click();
                        document.getAnimations().forEach(animation => animation.finish());
                        const after = document.getElementById('learning-content').getBoundingClientRect();
                        const bounds = drawer.getBoundingClientRect();
                        return initiallyClosed && drawer.matches(':popover-open') &&
                            Math.abs(bookmark.left - Math.min(main.right, document.documentElement.clientWidth - bookmark.width)) <= 1 &&
                            bookmark.left >= document.querySelector('#learning-content .hint-prompt').getBoundingClientRect().right &&
                            toggle.getAttribute('aria-expanded') === 'true' &&
                            toggle.textContent.includes('🔖') &&
                            drawer.getAttribute('role') === 'dialog' &&
                            drawer.getAttribute('aria-modal') === 'false' &&
                            document.activeElement === document.getElementById('glossary-close') &&
                            Math.abs(before.width - after.width) <= 1 && before.left === after.left &&
                            bounds.left >= 0 && bounds.right <= innerWidth &&
                            Math.abs(bounds.right - document.documentElement.clientWidth) <= 1 &&
                            bounds.top === 0 && bounds.bottom <= innerHeight &&
                            document.documentElement.scrollWidth <= innerWidth;
                    })()`), true, `${subject}/${width}/${theme}: bookmark drawer overlays without reflow`);
                    await capture(`${subject}-drawer-${width}-${theme}`);
                    assert.equal(await evaluate(`(() => {
                        document.getElementById('glossary-close').click();
                        return !document.getElementById('glossary-drawer').matches(':popover-open') &&
                            document.getElementById('glossary-toggle').getAttribute('aria-expanded') === 'false' &&
                            document.activeElement === document.getElementById('glossary-toggle');
                    })()`), true, `${subject}: drawer close restores trigger focus`);
                }
                if (tab === 'quiz') {
                    assert.equal(await evaluate(`(() => {
                        const label = document.querySelector('label[for="player"]');
                        const field = document.getElementById('player');
                        const a = label.getBoundingClientRect(), b = field.getBoundingClientRect();
                        const tabs = document.querySelector('.tab-bar').getBoundingClientRect();
                        const widths = [...document.querySelectorAll('[role="tab"]')].map(tab => tab.getBoundingClientRect().width);
                        const panel = document.querySelector('main').getBoundingClientRect();
                        return label.textContent === 'Přezdívka' && b.left > a.right && b.width >= 100 &&
                            Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 2 &&
                            /3 písmena.*60 znaků/.test(field.title) &&
                            field.getAttribute('aria-describedby').includes('name-help') &&
                            Math.abs(tabs.bottom - panel.top) <= 1 &&
                            Math.abs(tabs.left - panel.left) <= 1 &&
                            Math.abs(tabs.right - panel.right) <= 1 &&
                            Math.max(...widths) - Math.min(...widths) <= 1 &&
                            (innerWidth < 1024 || widths.every(width => width >= 190 && width <= 194));
                    })()`), true, `${subject}/${width}/${theme}: attached tabs and single-row name`);
                    assert.equal(await evaluate(`(() => {
                        const canvas = document.createElement('canvas');
                        canvas.width = canvas.height = 1;
                        const context = canvas.getContext('2d');
                        const rgb = color => {
                            context.fillStyle = color;
                            context.fillRect(0, 0, 1, 1);
                            return context.getImageData(0, 0, 1, 1).data.slice(0, 3);
                        };
                        const card = rgb(getComputedStyle(document.getElementById('setup')).backgroundColor);
                        const luminance = values => [...values].map(v => v / 255).map(v =>
                            v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
                            .reduce((sum, v, index) => sum + v * [.2126, .7152, .0722][index], 0);
                        return [...document.querySelectorAll('[data-mode]')].every(button => {
                            const style = getComputedStyle(button), fill = rgb(style.backgroundColor);
                            return Math.max(...[...fill].map((v, i) => Math.abs(v - card[i]))) >= 20 &&
                                [style.color, getComputedStyle(button.querySelector('.mode-count')).color].every(color => {
                                    const a = luminance(rgb(color)), b = luminance(fill);
                                    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5;
                                });
                        });
                    })()`), true, `${subject}/${width}/${theme}: solid mode colors and readable labels`);
                }
                if (tab === 'original' || tab === 'learning') {
                    assert.equal(await evaluate(`(() => {
                        const cards = [...document.querySelectorAll('#${tab}-content .card:not(.callout)')];
                        const expected = getComputedStyle(document.body).getPropertyValue('--${subject}-paper').trim();
                        const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
                        const rgb = color => {
                            context.fillStyle = color;
                            context.fillRect(0, 0, 1, 1);
                            return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
                        };
                        const paper = rgb(expected);
                        const [pale, strong] = ${JSON.stringify({
                            history: {
                                light: [[252, 249, 240], [245, 231, 201]],
                                dark: [[36, 43, 52], [52, 48, 41]]
                            },
                            maths: {
                                light: [[245, 250, 251], [223, 237, 242]],
                                dark: [[27, 45, 58], [32, 58, 67]]
                            }
                        }[subject][theme])};
                        const card = rgb(getComputedStyle(document.getElementById('setup')).backgroundColor);
                        const luminance = values => values.map(value => value / 255)
                            .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
                            .reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0);
                        const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) /
                            (Math.min(luminance(a), luminance(b)) + .05);
                        return document.body.dataset.subject === '${subject}' &&
                            paper.every((channel, index) => channel === Math.round((pale[index] + strong[index]) / 2)) &&
                            Math.max(...paper.map((channel, index) => Math.abs(channel - card[index]))) >= 10 &&
                            cards.every(element => {
                                const style = getComputedStyle(element);
                                return rgb(style.backgroundColor).every((channel, index) => channel === paper[index]) &&
                                    style.backgroundClip.split(', ').every(clip => clip === 'border-box') &&
                                    style.backgroundImage.includes('${subject === 'history' ? 'radial-gradient' : 'linear-gradient'}') &&
                                    style.backgroundImage.includes('0.085') &&
                                    contrast(rgb(style.color), paper) >= 4.5 &&
                                    contrast(rgb(getComputedStyle(element.querySelector('h2')).color), paper) >= 4.5;
                            }) &&
                            [...document.querySelectorAll('#original-content .original-text, #learning-content .hint-prompt, #learning-content p:not(.callout)')]
                                .every(text => getComputedStyle(text).backgroundColor === 'rgba(0, 0, 0, 0)' &&
                                    getComputedStyle(text).backgroundImage === 'none') &&
                            [...document.querySelectorAll('.term, .correction')].every(term =>
                                getComputedStyle(term).backgroundColor === 'rgba(0, 0, 0, 0)') &&
                            [...document.querySelectorAll('.callout')].every(callout =>
                                getComputedStyle(callout).backgroundImage === 'none') &&
                            [...document.querySelectorAll('.callout-fun')].every(callout => {
                                const style = getComputedStyle(callout);
                                const label = getComputedStyle(callout.querySelector('.callout-label'));
                                const sparkle = getComputedStyle(callout, '::before');
                                const badge = getComputedStyle(callout.querySelector('.card-icon'));
                                return rgb(style.backgroundColor).every((channel, index) =>
                                    channel === rgb(getComputedStyle(document.body).getPropertyValue('--fun-paper').trim())[index]) &&
                                    contrast(rgb(label.color), rgb(style.backgroundColor)) >= 4.5 &&
                                    rgb(label.color).some((channel, index) =>
                                        channel !== rgb(getComputedStyle(document.body).getPropertyValue('--violet').trim())[index]) &&
                                    badge.borderRadius === '50%' && parseFloat(badge.minWidth) >= 32 &&
                                    sparkle.content === '""' && sparkle.clipPath.startsWith('polygon') &&
                                    parseFloat(sparkle.opacity) > 0;
                            }) &&
                            getComputedStyle(document.getElementById('results')).backgroundImage === 'none' &&
                            getComputedStyle(document.getElementById('setup')).backgroundImage === 'none';
                    })()`), true, `${subject}/${width}/${theme}: midpoint whole-card themes, golden fun facts and transparent text`);
                }
                await capture(`${subject}-${tab}-${width}-${theme}`);
                if (subject === 'history' && tab === 'original') {
                    await evaluate(`(() => {
                        const fun = document.querySelector('#original-content .callout-fun');
                        window.scrollTo(0, scrollY + fun.getBoundingClientRect().top -
                            document.getElementById('page-header').getBoundingClientRect().bottom - 12);
                    })()`);
                    await capture(`${subject}-fun-${width}-${theme}`);
                    await evaluate('window.scrollTo(0, 0)');
                }
            }
            tabLayouts.forEach(layout => {
                assert.equal(layout.gutter, 'stable');
                assert.deepEqual(layout.horizontal, tabLayouts[0].horizontal,
                    `${subject}/${width}/${theme}: no sideways shift between short and long tabs`);
            });
            if (width === 1600) {
                assert.equal(tabLayouts.some(layout => layout.scrolling), true, 'includes a tall scrolling tab');
                assert.equal(tabLayouts.some(layout => !layout.scrolling), true, 'includes a short non-scrolling tab');
            }
            await evaluate(`document.querySelector('[data-tab="original"]').focus()`);
            for (const [key, tab] of [['ArrowLeft', 'quiz'], ['Home', 'original'], ['End', 'quiz'], ['ArrowRight', 'original'], ['ArrowRight', 'learning']]) {
                await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key });
                await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key });
                await evaluate('window.waitForTutorTab()');
                assert.equal(await evaluate(`document.activeElement.dataset.tab === '${tab}' &&
                    document.activeElement.getAttribute('aria-selected') === 'true' &&
                    !document.getElementById('${tab}').hidden &&
                    document.querySelectorAll('[role="tab"][tabindex="0"]').length === 1`), true, `${subject}: tab keyboard ${key}`);
            }
            assert.deepEqual(await evaluate(`(async () => {
                await window.switchTutorTab('learning');
                const content = document.getElementById('learning-content').getBoundingClientRect();
                const panel = document.getElementById('learning').getBoundingClientRect();
                return {
                    fullWidth: ${subject === 'history' && lesson.timeline?.length ? 'innerWidth <= 760 ? Math.abs(content.width - panel.width) <= 1 : content.width < panel.width' : 'Math.abs(content.width - panel.width) <= 1'},
                    closed: !document.getElementById('glossary-drawer').matches(':popover-open'),
                    labelled: [...document.querySelectorAll('[data-tab]')].every(tab =>
                        tab.getAttribute('aria-controls') === tab.dataset.tab)
                };
            })()`), {
                fullWidth: true, closed: true,
                labelled: true
            }, `${subject}/${width}/${theme} shared layout`);
        }
    }
}

module.exports = { checkResponsive };
