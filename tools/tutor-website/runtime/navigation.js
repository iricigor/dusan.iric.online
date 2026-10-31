'use strict';

function initializeTutorNavigation(context, quiz) {
    const { $, closeGlossary, closeQuizTools } = context;
    const { pauseAnswerClock, resumeAnswerClock, abandonQuiz } = quiz;
    const tabs = [...document.querySelectorAll('[data-tab]')];
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let requestedTab = tabs[0];
    let pendingTab = null;
    let tabTransition;
    let tabEntrance;
    reducedMotion.addEventListener('change', event => {
        if (event.matches) {
            tabTransition?.skipTransition();
            tabEntrance?.cancel();
        }
    });
    const activateTab = tab => {
        if (tab === requestedTab) return true;
        if (quiz.isActive()) {
            if ($('quiz-leave-dialog').open) return false;
            pauseAnswerClock();
            closeGlossary(false);
            closeQuizTools();
            pendingTab = tab;
            $('quiz-leave-dialog').showModal();
            $('quiz-stay').focus({ preventScroll: true });
            return false;
        }
        requestedTab = tab;
        tabTransition?.skipTransition();
        tabEntrance?.cancel();
        const update = () => {
            if (tab !== requestedTab) return;
            closeGlossary(false);
            $('glossary-toggle').hidden = tab.dataset.tab !== 'learning';
            $('learning-controls').hidden = tab.dataset.tab !== 'learning';
            $('quiz-tools').hidden = tab.dataset.tab !== 'quiz';
            if ($('quiz-tools').hidden) $('quiz-tools').open = false;
            pauseAnswerClock();
            tabs.forEach(other => {
                const active = other === tab;
                other.setAttribute('aria-selected', String(active));
                other.tabIndex = active ? 0 : -1;
                $(other.dataset.tab).hidden = !active;
            });
            resumeAnswerClock();
        };
        if (typeof document.startViewTransition === 'function' && !reducedMotion.matches) {
            tabTransition = document.startViewTransition(update);
            tabTransition.ready.catch(error => {
                if (error.name !== 'AbortError') console.error('Animaci přepnutí záložky se nepodařilo spustit.', error);
            });
        } else {
            update();
            const panel = $(tab.dataset.tab);
            if (!reducedMotion.matches && typeof panel.animate === 'function') {
                tabEntrance = panel.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
                    { duration: 300, easing: 'ease-out' });
            }
        }
        return true;
    };
    const stayInQuiz = () => {
        if (!pendingTab) return;
        pendingTab = null;
        $('quiz-leave-dialog').close();
        resumeAnswerClock();
        requestedTab.focus({ preventScroll: true });
    };
    $('quiz-stay').addEventListener('click', stayInQuiz);
    $('quiz-leave-dialog').addEventListener('cancel', event => {
        event.preventDefault();
        stayInQuiz();
    });
    $('quiz-leave').addEventListener('click', () => {
        if (!pendingTab) return;
        const tab = pendingTab;
        pendingTab = null;
        $('quiz-leave-dialog').close();
        abandonQuiz();
        if (activateTab(tab)) tab.focus({ preventScroll: true });
    });
    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => activateTab(tab));
        tab.addEventListener('keydown', event => {
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            const target = {
                ArrowRight: (index + 1) % tabs.length,
                ArrowLeft: (index + tabs.length - 1) % tabs.length,
                Home: 0,
                End: tabs.length - 1
            }[event.key];
            if (target === undefined) return;
            event.preventDefault();
            if (activateTab(tabs[target])) tabs[target].focus();
        });
    });
    const systemTheme = matchMedia('(prefers-color-scheme: dark)');
    const isDark = () => document.documentElement.dataset.theme === 'dark' ||
        (!document.documentElement.dataset.theme && systemTheme.matches);
    const syncTheme = () => $('theme').setAttribute('aria-checked', String(isDark()));
    syncTheme();
    systemTheme.addEventListener('change', syncTheme);
    $('theme').addEventListener('click', () => {
        document.documentElement.dataset.theme = isDark() ? 'light' : 'dark';
        syncTheme();
    });
}
