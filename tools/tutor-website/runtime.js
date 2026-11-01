'use strict';

const tutorQuiz = {
    MODES: { easy: [1, 1, 1], medium: [1, 2, 2], hard: [2, 5, 3] },
    POINTS: { easy: 10, medium: 20, hard: 30 },
    shuffle(items, random = Math.random) {
        const result = [...items];
        for (let index = result.length - 1; index > 0; index--) {
            const other = Math.floor(random() * (index + 1));
            [result[index], result[other]] = [result[other], result[index]];
        }
        return result;
    },
    grade(total, maximum) {
        return total >= maximum * 80 / 100 ? 1 : total >= maximum * 60 / 100 ? 2 :
            total >= maximum * 40 / 100 ? 3 : total >= maximum * 20 / 100 ? 4 : 5;
    },
    formatDuration(milliseconds) {
        if (milliseconds < 1000) return 'méně než 1 s';
        const seconds = Math.round(milliseconds / 1000);
        return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
    }
};

if (typeof module !== 'undefined') module.exports = tutorQuiz;

function initializeTutor(lesson, subject) {
    const context = {
        ...initializeTutorLearning(lesson, subject),
        points: value => String(value).replace('.', ',')
    };
    let quiz;
    // Register navigation before quiz setup; handlers resolve the controller on interaction.
    initializeTutorNavigation(context, {
        isActive: () => quiz.isActive(),
        pauseAnswerClock: () => quiz.pauseAnswerClock(),
        resumeAnswerClock: () => quiz.resumeAnswerClock(),
        abandonQuiz: () => quiz.abandonQuiz()
    });
    quiz = initializeTutorQuiz(lesson, subject, context);
    initializeTutorPrinting(lesson, subject, context, quiz);
}
