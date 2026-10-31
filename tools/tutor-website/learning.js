'use strict';

function initializeLearning(lesson, document) {
    const $ = id => document.getElementById(id);
    const node = (tag, text, className) => {
        const element = document.createElement(tag);
        if (text !== undefined) element.textContent = text;
        if (className) element.className = className;
        return element;
    };
    const cards = [...$('learning-content').querySelectorAll('[data-learning-card]')];
    const explored = new Set();
    const segments = [];
    const controls = [];
    const timelineNodes = [];
    const sync = () => {
        cards.forEach((card, index) => {
            const complete = explored.has(card.id);
            card.dataset.explored = String(complete);
            segments[index].dataset.explored = String(complete);
            controls[index].setAttribute('aria-pressed', String(complete));
            controls[index].textContent = complete ? '✓ Prozkoumáno' : '○ Označit jako prozkoumané';
        });
        $('learning-counter').textContent = `${explored.size}/${cards.length} Prozkoumáno`;
        $('learning-segments').setAttribute('aria-valuenow', String(explored.size));
    };
    $('learning-segments').setAttribute('aria-valuemax', String(cards.length));
    cards.forEach(card => {
        const hints = [...card.children].filter(child => child.classList.contains('hint'));
        if (hints.length === 1) {
            const prompt = hints[0].querySelector('.hint-prompt');
            hints[0].before(prompt);
            card.append(hints[0]);
        }
        const control = node('button', undefined, 'explored-control');
        control.type = 'button';
        control.setAttribute('aria-label', `Prozkoumáno: ${card.querySelector('h2').textContent}`);
        control.addEventListener('click', () => {
            if (explored.has(card.id)) explored.delete(card.id);
            else explored.add(card.id);
            sync();
        });
        const footer = node('div', undefined, 'learning-card-footer');
        footer.append(control);
        card.append(footer);
        controls.push(control);
        const segment = node('span', undefined, 'learning-segment');
        segment.setAttribute('aria-hidden', 'true');
        $('learning-segments').append(segment);
        segments.push(segment);
    });
    sync();
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const offset = () => {
        const top = $('page-header').getBoundingClientRect().height + 16;
        $('learning').style.setProperty('--learning-offset', `${top}px`);
        return top;
    };
    if (lesson.timeline?.length) {
        $('learning').classList.add('has-timeline');
        const aside = node('aside', undefined, 'learning-timeline');
        const details = node('details');
        details.id = 'timeline-details';
        details.append(node('summary', 'Časová osa'));
        const track = node('nav', undefined, 'timeline-track');
        track.setAttribute('aria-label', 'Časová osa');
        const years = [...new Set(lesson.timeline.flatMap(event =>
            [event.year, ...(event.lifespan ? [event.lifespan.birth, event.lifespan.death] : [])]))].sort((a, b) => a - b);
        const rows = new Map();
        years.forEach((year, index) => {
            const row = node('div', undefined, 'timeline-year');
            row.style.gridRow = String(index + 1);
            row.dataset.year = String(year);
            row.append(node('span', String(year), 'timeline-date'));
            track.append(row);
            rows.set(year, row);
        });
        lesson.timeline.forEach((event, index) => {
            const card = $(`learning-chunk-${event.chunk}`);
            const control = node('button', `${event.year}: ${event.label}`, 'timeline-node');
            control.type = 'button';
            control.setAttribute('aria-controls', card.id);
            control.addEventListener('click', () => {
                const top = offset();
                card.style.scrollMarginTop = `${top}px`;
                card.focus({ preventScroll: true });
                card.scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
                setActive(card.id);
            });
            rows.get(event.year).append(control);
            timelineNodes.push({ card, control });
            if (event.lifespan) {
                const bracket = node('span', undefined, 'timeline-lifespan');
                bracket.style.gridRow = `${years.indexOf(event.lifespan.birth) + 1} / ${years.indexOf(event.lifespan.death) + 2}`;
                bracket.style.marginLeft = `${index % 4 * 4}px`;
                bracket.setAttribute('role', 'img');
                bracket.setAttribute('aria-label', `${event.label}: ${event.lifespan.birth}–${event.lifespan.death}`);
                track.append(bracket);
            }
        });
        details.append(track);
        aside.append(details);
        $('learning').append(aside);
        const mobile = matchMedia('(max-width: 760px)');
        details.open = !mobile.matches;
        mobile.addEventListener('change', event => { details.open = !event.matches; });
    }
    function setActive(id) {
        timelineNodes.forEach(({ card, control }) => {
            const active = card.id === id;
            if (active) control.setAttribute('aria-current', 'step');
            else control.removeAttribute('aria-current');
            card.dataset.timelineActive = String(active);
        });
    }
    const onScroll = () => {
        if ($('learning').hidden || !timelineNodes.length) return;
        const top = offset();
        const ordered = cards.filter(card => timelineNodes.some(entry => entry.card === card));
        setActive((ordered.find(card => card.getBoundingClientRect().bottom > top) || ordered.at(-1)).id);
    };
    document.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return { setTab(name) {
        $('learning-progress').hidden = name !== 'learning';
        if (name === 'learning') onScroll();
    } };
}
