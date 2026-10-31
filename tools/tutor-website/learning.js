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
    let timeline;
    let activeCardId;
    let selectedTimelineRow;
    const sync = () => {
        cards.forEach((card, index) => {
            const complete = explored.has(card.id);
            card.dataset.explored = String(complete);
            segments[index].dataset.explored = String(complete);
            segments[index].setAttribute('aria-label', `${card.querySelector('h2').textContent}: ${complete ? 'prozkoumáno' : 'neprozkoumáno'}`);
            controls[index].checked = complete;
        });
        $('learning-counter').textContent = `${explored.size}/${cards.length} Prozkoumáno`;
        $('learning-counter').setAttribute('aria-valuenow', String(explored.size));
        $('learning-counter').setAttribute('aria-valuetext', $('learning-counter').textContent);
        const fraction = cards.length ? explored.size / cards.length : 0;
        $('learning-segments').style.setProperty('--completion-intensity', `${30 + 70 * fraction}%`);
    };
    $('learning-counter').setAttribute('aria-valuemax', String(cards.length));
    cards.forEach(card => {
        card.tabIndex = -1;
        const footer = node('div', undefined, 'learning-card-footer');
        const hints = [...card.children].filter(child => child.classList.contains('hint'));
        if (hints.length === 1) {
            const prompt = hints[0].querySelector('.hint-prompt');
            hints[0].before(prompt);
            card.append(hints[0]);
            footer.append(hints[0].querySelector('.hint-toggle'));
        }
        const control = node('input');
        control.type = 'checkbox';
        control.setAttribute('aria-label', `Prozkoumáno: ${card.querySelector('h2').textContent}`);
        control.addEventListener('change', () => {
            if (control.checked) explored.add(card.id);
            else explored.delete(card.id);
            sync();
        });
        const label = node('label', undefined, 'explored-control');
        label.append(control, node('span', 'Prozkoumáno'));
        footer.append(label);
        card.append(footer);
        controls.push(control);
        const segment = node('button', undefined, 'learning-segment');
        segment.type = 'button';
        segment.setAttribute('aria-controls', card.id);
        segment.setAttribute('title', card.querySelector('h2').textContent);
        segment.addEventListener('click', () => focusCard(card));
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
    const focusCard = (card, row) => {
        selectedTimelineRow = row;
        card.style.scrollMarginTop = `${offset()}px`;
        card.focus({ preventScroll: true });
        card.scrollIntoView({ block: 'start', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
        setActive(card.id, row);
    };
    if (lesson.timeline?.length) {
        $('learning').classList.add('has-timeline');
        const aside = node('aside', undefined, 'learning-timeline');
        aside.setAttribute('aria-label', 'Časová osa');
        const details = node('details');
        details.id = 'timeline-details';
        const summary = node('summary');
        summary.setAttribute('aria-label', 'Časová osa');
        summary.setAttribute('aria-controls', 'timeline-track');
        summary.setAttribute('title', 'Rozbalit nebo sbalit časovou osu');
        summary.append(node('span', 'Časová osa', 'timeline-title'));
        details.append(summary);
        const track = node('nav', undefined, 'timeline-track');
        track.id = 'timeline-track';
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
        lesson.timeline.forEach(event => {
            const card = $(`learning-chunk-${event.chunk}`);
            const control = node('button', event.label, 'timeline-node');
            control.type = 'button';
            const label = `${event.year}: ${event.label}${event.lifespan ? `; život: ${event.lifespan.birth}–${event.lifespan.death}` : ''}`;
            control.setAttribute('aria-label', label);
            control.setAttribute('title', label);
            control.setAttribute('aria-controls', card.id);
            control.addEventListener('click', () => focusCard(card, control.parentElement));
            rows.get(event.year).append(control);
            timelineNodes.push({ card, control });
        });
        rows.forEach((row, year) => {
            const entries = timelineNodes.filter(({ control }) => control.parentElement === row);
            if (!entries.length) return;
            const yearControl = node('button', String(year), 'timeline-date timeline-year-link');
            yearControl.type = 'button';
            const label = entries.map(({ control }) => control.getAttribute('aria-label')).join('; ');
            yearControl.setAttribute('aria-label', label);
            yearControl.setAttribute('title', label);
            yearControl.addEventListener('click', () => {
                if (entries.length === 1) entries[0].control.click();
                else {
                    details.open = true;
                    entries[0].control.focus({ preventScroll: true });
                }
            });
            row.append(yearControl);
        });
        aside.append(details, track);
        $('learning').append(aside);
        const mobile = matchMedia('(max-width: 760px)');
        timeline = { aside, track, mobile };
        details.open = !mobile.matches;
        mobile.addEventListener('change', event => { details.open = !event.matches; });
        details.addEventListener('toggle', () => {
            if (activeCardId) setActive(activeCardId, document.activeElement?.closest('.timeline-year'), true);
        });
    }
    function setActive(id, preferredRow, force = false) {
        const changed = activeCardId !== id;
        activeCardId = id;
        segments.forEach((segment, index) => {
            if (cards[index].id === id) segment.setAttribute('aria-current', 'step');
            else segment.removeAttribute('aria-current');
        });
        timelineNodes.forEach(({ card, control }) => {
            const active = card.id === id;
            if (active) control.setAttribute('aria-current', 'step');
            else control.removeAttribute('aria-current');
            card.dataset.timelineActive = String(active);
        });
        if (!changed && !preferredRow && !force) return;
        const segment = segments[cards.findIndex(card => card.id === id)];
        if (segment?.checkVisibility()) {
            const bar = $('learning-segments');
            const bounds = segment.getBoundingClientRect();
            const left = bar.getBoundingClientRect().left;
            const right = left + bar.clientWidth;
            const delta = bounds.left < left ? bounds.left - left : bounds.right > right ? bounds.right - right : 0;
            if (delta) bar.scrollBy({ left: delta, behavior: 'instant' });
        }
        if (!timeline?.track.checkVisibility()) return;
        const selectedRow = preferredRow || (timelineNodes.some(entry =>
            entry.card.id === id && entry.control.parentElement === selectedTimelineRow) ? selectedTimelineRow : undefined);
        const rows = selectedRow ? [selectedRow] :
            [...new Set(timelineNodes.filter(entry => entry.card.id === id).map(entry => entry.control.parentElement))];
        if (!rows.length) return;
        const scroller = timeline.mobile.matches ? timeline.track : timeline.aside;
        const scrollerTop = scroller.getBoundingClientRect().top + scroller.clientTop;
        const viewTop = scrollerTop + (timeline.mobile.matches ? 0 : $('timeline-details').getBoundingClientRect().height);
        const viewBottom = scrollerTop + scroller.clientHeight;
        const bounds = rows.map(row => row.getBoundingClientRect());
        let top = Math.min(...bounds.map(row => row.top));
        let bottom = Math.max(...bounds.map(row => row.bottom));
        if (bottom - top > viewBottom - viewTop) {
            top = bounds[0].top;
            bottom = bounds[0].bottom;
        }
        const delta = top < viewTop ? top - viewTop : bottom > viewBottom ? bottom - viewBottom : 0;
        if (delta) scroller.scrollBy({ top: delta < 0 ? Math.floor(delta) : Math.ceil(delta), behavior: 'instant' });
    }
    const onScroll = (force = false) => {
        if ($('learning').hidden || !cards.length) return;
        const top = offset();
        setActive((cards.find(card => card.getBoundingClientRect().bottom > top) || cards.at(-1)).id, undefined, force);
    };
    document.addEventListener('scroll', () => onScroll(), { passive: true });
    window.addEventListener('resize', () => onScroll(true));
    return { setTab(name) {
        $('learning-progress').hidden = name !== 'learning';
        if (name === 'learning') onScroll(true);
    } };
}
