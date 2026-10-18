let appData = null;
let currentQuiz = {
    playerName: '',
    difficulty: '',
    questions: [],
    currentIndex: 0,
    score: 0,
    startTime: null,
    answersLog: []
};

const czechNames = ["Jakub", "Jan", "Tomáš", "Matyáš", "Filip", "Eliška", "Anna", "Adéla", "Tereza", "Viktorie"];

document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        themeToggle.textContent = newTheme === 'dark' ? '☀️' : '🌓';
    });

    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
        });
    });

    const randomPlaceholderName = czechNames[Math.floor(Math.random() * czechNames.length)];
    const nameInputEl = document.getElementById('player-name');
    if (nameInputEl) {
        nameInputEl.placeholder = `např. ${randomPlaceholderName}`;
    }

    loadData(window.DEFAULT_EDU_PAYLOAD || getSamplePayload());

    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'modal-overlay') closeModal();
    });

    document.querySelectorAll('.diff-btn').forEach(btn => {
        btn.addEventListener('click', () => startQuiz(btn.dataset.diff));
    });

    document.getElementById('restart-quiz-btn').addEventListener('click', resetQuizScreen);
    renderLeaderboard();
});

function loadData(data) {
    appData = data;
    document.title = data.topic;
    document.querySelector('.nav-brand h1').textContent = data.topic;
    document.querySelector('.audience-badge').textContent = `Pro žáky: ${data.target_audience}`;

    renderOriginalText();
    renderLearnTab();
}

function renderOriginalText() {
    const container = document.getElementById('original-text-container');
    let fullHtml = '';
    
    const originalTab = appData.tabs.find(t => t.id === 'original');
    if (originalTab && originalTab.content) {
        originalTab.content.forEach(section => {
            fullHtml += `<h3>${section.heading}</h3><p style="margin-bottom: 1.5rem;">${section.text}</p>`;
        });
    }
    container.innerHTML = fullHtml;
}

function renderLearnTab() {
    const learningTab = appData.tabs.find(t => t.id === 'learning');
    const originalTab = appData.tabs.find(t => t.id === 'original');

    const chunksContainer = document.getElementById('chunks-container');
    chunksContainer.innerHTML = '';
    if (learningTab && learningTab.chunks) {
        learningTab.chunks.forEach((chunk, index) => {
            const item = document.createElement('div');
            item.className = 'chunk-item';
            const sentenceText = chunk.sentences.join(' ');
            item.innerHTML = `
                <div>
                    <p>${sentenceText}</p>
                    <div class="hint-box" id="hint-${index}">💡 <strong>Vysvětlení:</strong> ${chunk.explanation}</div>
                </div>
                <button class="hint-btn" onclick="toggleHint(${index})" title="Zobrazit vysvětlení">💡</button>
            `;
            chunksContainer.appendChild(item);
        });
    }

    const keyTermsContainer = document.getElementById('keyterms-container');
    keyTermsContainer.innerHTML = '';
    if (originalTab && originalTab.glossary) {
        Object.entries(originalTab.glossary).forEach(([term, definition]) => {
            const btn = document.createElement('button');
            btn.className = 'keyterm-badge';
            btn.textContent = term;
            btn.onclick = () => openModal(term, definition);
            keyTermsContainer.appendChild(btn);
        });
    }
}

function toggleHint(id) {
    const hintBox = document.getElementById(`hint-${id}`);
    hintBox.classList.toggle('visible');
}

function openModal(title, body) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').textContent = body;
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

function startQuiz(difficulty) {
    const nameInput = document.getElementById('player-name').value.trim();
    const placeholderText = document.getElementById('player-name').placeholder.replace('např. ', '');

    if (!nameInput || nameInput.length < 3) {
        alert('Jméno musí mít alespoň 3 písmena.');
        return;
    }
    if (nameInput.toLowerCase() === placeholderText.toLowerCase()) {
        alert('Prosím zadej své vlastní jméno (ukázkové jméno nelze použít).');
        return;
    }

    currentQuiz.playerName = nameInput.charAt(0).toUpperCase() + nameInput.slice(1);
    currentQuiz.difficulty = difficulty;
    currentQuiz.currentIndex = 0;
    currentQuiz.score = 0;
    currentQuiz.startTime = Date.now();
    currentQuiz.answersLog = [];

    currentQuiz.questions = selectQuestions(difficulty);

    document.getElementById('quiz-setup').classList.add('hidden');
    document.getElementById('quiz-gameplay').classList.remove('hidden');
    document.getElementById('quiz-results').classList.add('hidden');

    loadQuestion();
}

function selectQuestions(difficulty) {
    const quizTab = appData.tabs.find(t => t.id === 'quiz');
    if (!quizTab || !quizTab.levels) return [];

    let countEasy = 1, countMed = 1, countHard = 1;
    if (difficulty === 'Easy') { countEasy = 1; countMed = 1; countHard = 1; }
    else if (difficulty === 'Medium') { countEasy = 2; countMed = 2; countHard = 1; }
    else if (difficulty === 'Hard') { countEasy = 3; countMed = 5; countHard = 2; }

    const getQuestionsByLevel = (lvlName) => {
        const lvlObj = quizTab.levels.find(l => l.level === lvlName);
        return lvlObj ? lvlObj.questions : [];
    };

    const easyPool = getQuestionsByLevel('easy');
    const medPool = getQuestionsByLevel('medium');
    const hardPool = getQuestionsByLevel('hard');

    const selected = [
        ...getRandomSubarray(easyPool, countEasy),
        ...getRandomSubarray(medPool, countMed),
        ...getRandomSubarray(hardPool, countHard)
    ];
    return shuffleArray(selected);
}

function getRandomSubarray(arr, size) {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, size);
}

function shuffleArray(arr) {
    return arr.sort(() => 0.5 - Math.random());
}

function loadQuestion() {
    if (currentQuiz.currentIndex >= currentQuiz.questions.length) {
        finishQuiz();
        return;
    }

    const q = currentQuiz.questions[currentQuiz.currentIndex];
    const totalQ = currentQuiz.questions.length;
    document.getElementById('question-progress').textContent = `Otázka ${currentQuiz.currentIndex + 1} / ${totalQ}`;
    document.getElementById('score-display').textContent = `Skóre: ${currentQuiz.score} b`;
    document.getElementById('question-text').textContent = q.question;

    const ansContainer = document.getElementById('answers-container');
    ansContainer.innerHTML = '';

    if (q.options && q.options.length > 0) {
        q.options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.className = 'answer-option';
            btn.textContent = opt;
            btn.onclick = () => evaluateAnswer(idx, q);
            ansContainer.appendChild(btn);
        });
    } else {
        const wrapper = document.createElement('div');
        wrapper.className = 'open-answer-container';
        wrapper.innerHTML = `
            <input type="text" id="open-answer-input" placeholder="Zadej odpověď..." autocomplete="off">
            <button class="primary-btn" id="submit-open-btn">Odpovědět</button>
        `;
        ansContainer.appendChild(wrapper);
        document.getElementById('submit-open-btn').onclick = () => {
            const val = document.getElementById('open-answer-input').value;
            evaluateAnswer(val, q);
        };
        document.getElementById('open-answer-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const val = document.getElementById('open-answer-input').value;
                evaluateAnswer(val, q);
            }
        });
    }
}

function normalizeString(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function evaluateAnswer(userAnswerIndexOrText, question) {
    let pointsAwarded = 0;
    let isCorrect = false;
    const basePoints = currentQuiz.difficulty === 'Easy' ? 10 : currentQuiz.difficulty === 'Medium' ? 20 : 30;

    let userAnsDisplay = '';
    let correctAnsDisplay = question.options && question.options.length > 0 
        ? question.options[question.answer] 
        : (question.correctAnswer || (question.options ? question.options[question.answer] : ''));

    if (typeof userAnswerIndexOrText === 'number') {
        userAnsDisplay = question.options[userAnswerIndexOrText];
        if (userAnswerIndexOrText === question.answer) {
            isCorrect = true;
            pointsAwarded = basePoints;
        }
    } else {
        userAnsDisplay = userAnswerIndexOrText;
        const normUser = normalizeString(userAnswerIndexOrText);
        const normCorrect = normalizeString(correctAnsDisplay);
        if (normUser === normCorrect) {
            isCorrect = true;
            pointsAwarded = basePoints;
        } else {
            const userNum = parseInt(userAnswerIndexOrText, 10);
            const correctNum = parseInt(correctAnsDisplay, 10);
            if (!isNaN(userNum) && !isNaN(correctNum)) {
                const diff = Math.abs(userNum - correctNum);
                if (diff > 0 && diff <= 10) {
                    isCorrect = true;
                    pointsAwarded = Math.round(basePoints * 0.5);
                }
            }
        }
    }

    currentQuiz.score += pointsAwarded;
    currentQuiz.answersLog.push({
        question: question.question,
        userAnswer: userAnsDisplay,
        correctAnswer: correctAnsDisplay,
        points: pointsAwarded,
        isCorrect: isCorrect
    });

    const activeCard = document.getElementById('question-container');
    if (isCorrect) {
        activeCard.classList.add('bounce', 'success-flash');
        setTimeout(() => {
            activeCard.classList.remove('bounce', 'success-flash');
            currentQuiz.currentIndex++;
            loadQuestion();
        }, 600);
    } else {
        activeCard.classList.add('shake');
        setTimeout(() => {
            activeCard.classList.remove('shake');
            activeCard.classList.add('fade-out');
            setTimeout(() => {
                activeCard.classList.remove('fade-out');
                currentQuiz.currentIndex++;
                loadQuestion();
            }, 500);
        }, 400);
    }
}

function finishQuiz() {
    const duration = Math.round((Date.now() - currentQuiz.startTime) / 1000);
    const maxPossibleScore = currentQuiz.questions.reduce((acc, q) => acc + (currentQuiz.difficulty === 'Easy' ? 10 : currentQuiz.difficulty === 'Medium' ? 20 : 30), 0);
    const percentage = maxPossibleScore > 0 ? (currentQuiz.score / maxPossibleScore) * 100 : 0;

    let mark = '5';
    if (percentage >= 80) mark = '1';
    else if (percentage >= 70) mark = '1-';
    else if (percentage >= 60) mark = '2';
    else if (percentage >= 50) mark = '2-';
    else if (percentage >= 40) mark = '3';
    else if (percentage >= 30) mark = '3-';
    else if (percentage >= 20) mark = '4';
    else if (percentage >= 10) mark = '4-';

    const resultRecord = {
        name: currentQuiz.playerName,
        difficulty: currentQuiz.difficulty,
        score: currentQuiz.score,
        maxScore: maxPossibleScore,
        mark: mark,
        timeCompleted: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        duration: duration
    };

    saveToLeaderboard(resultRecord);

    document.getElementById('quiz-gameplay').classList.add('hidden');
    document.getElementById('quiz-results').classList.remove('hidden');

    const summaryContainer = document.getElementById('result-summary');
    summaryContainer.innerHTML = '<h3>Rekapitulace odpovědí:</h3><ul style="margin-left: 1.5rem; margin-top: 0.5rem; line-height: 1.6;">';
    currentQuiz.answersLog.forEach(log => {
        summaryContainer.innerHTML += `<li style="margin-bottom: 0.75rem;"><strong>${log.question}</strong><br>Tvá odpověď: <span style="color: ${log.isCorrect ? 'var(--accent)' : 'var(--danger)'};">${log.userAnswer}</span> | Správně: ${log.correctAnswer} (${log.points} b)</li>`;
    });
    summaryContainer.innerHTML += '</ul>';

    document.getElementById('result-grade-banner').textContent = `Skóre: ${currentQuiz.score} b | Známka: ${mark}`;
}

function saveToLeaderboard(record) {
    let lb = JSON.parse(sessionStorage.getItem('dusan_leaderboard') || '[]');
    lb.push(record);
    lb.sort((a, b) => b.score - a.score || a.duration - b.duration);
    sessionStorage.setItem('dusan_leaderboard', JSON.stringify(lb));
    renderLeaderboard();
}

function renderLeaderboard() {
    const lbContainer = document.getElementById('leaderboard-list');
    const lb = JSON.parse(sessionStorage.getItem('dusan_leaderboard') || '[]');
    if (lb.length === 0) {
        lbContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.95rem;">Zatím žádné záznamy v síni slávy.</p>';
        return;
    }

    let html = `
        <table class="leaderboard-table">
            <thead>
                <tr>
                    <th>Čas</th>
                    <th>Hráč</th>
                    <th>Obtížnost</th>
                    <th>Body</th>
                    <th>Známka</th>
                </tr>
            </thead>
            <tbody>
    `;
    lb.forEach(row => {
        html += `
            <tr>
                <td>${row.timeCompleted}</td>
                <td>${row.name}</td>
                <td>${row.difficulty}</td>
                <td>${row.score} b</td>
                <td><strong>${row.mark}</strong></td>
            </tr>
        `;
    });
    html += '</tbody></table>';
    lbContainer.innerHTML = html;
}

function resetQuizScreen() {
    document.getElementById('quiz-results').classList.add('hidden');
    document.getElementById('quiz-setup').classList.remove('hidden');
    renderLeaderboard();
}

function getSamplePayload() {
    return window.DEFAULT_EDU_PAYLOAD || {
        "topic": "Vláda Habsburků v českých zemích a stavovské povstání",
        "target_audience": "10-year-old non-native Czech speakers",
        "tabs": []
    };
}