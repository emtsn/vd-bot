const { User } = require('discord.js');
const Util = require('./util.js');

const booleanAnswers = ['true', 'false', 't', 'f'];

class TriviaSession {
    /**
     * Constructor for TriviaSession
     * @param {TextChannel | DMChannel | NewsChannel} channel Channel that the trivia game is being played in
     * @param {number} timer Number of seconds to answer each question
     * @param {TriviaQuestion[]} questions Array of trivia questions
     */
    constructor(channel, timer, questions) {
        this.channel = channel;
        this.timer = timer;
        this.questions = questions;
        this.questNum = 0;
        /** @type {Map<User, number>} */
        this.userAnswer = new Map();
        /**
         * @typedef {{ correct: number, incorrect: number }} Score
         * @type {Map<User, Score>}
         */
        this.userScores = new Map();
        this.active = false;
    }

    /**
     * Start the trivia game
     */
    start() {
        this.active = true;
        this.userAnswer.clear();
        this.questNum = 0;
        this.showQuestion();
        this.interval = setInterval(() => {
            this.showAnswer();
            if (this.questNum >= this.questions.length - 1) {
                this.showScores();
                this.stop();
                return;
            }
            this.questNum++;
            this.showQuestion();
        }, this.timer * 1000);
    }

    /**
     * Stop the trivia game
     */
    stop() {
        clearInterval(this.interval);
        this.active = false;
    }

    /**
     * Show the current question.
     */
    showQuestion() {
        console.log(this.questions[this.questNum]);
        this.channel.send(this.questions[this.questNum].formatQuestion(this.questNum + 1));
    }

    /**
     * Show the answer to the current question and users who got the answer.
     */
    showAnswer() {
        this.channel.send(`Answer: ${this.questions[this.questNum].correctAns}`);
        let winners = '';
        for (const [user, answer] of this.userAnswer) {
            const currentScore = this.userScores.get(user);
            if (answer) {
                winners += `${user} `;
                if (currentScore) {
                    currentScore.correct++;
                } else {
                    this.userScores.set(user, { correct: 1, incorrect: 0 });
                }
            } else {
                if (currentScore) {
                    currentScore.incorrect++;
                } else {
                    this.userScores.set(user, { correct: 0, incorrect: 1 });
                }
            }
        }
        if (winners !== '') {
            this.channel.send(`${winners}got the answer.`);
        }
        this.userAnswer.clear();
    }

    /**
     * Send a message containing scores for questions so far
     */
    showScores() {
        let scoreMessage = 'Scores:\n'
        for (const [user, score] of this.userScores) {
            scoreMessage += user.toString() + ': ' + score.correct + ' point' + (score.correct === 1 ? '' : 's') + '\n';
        }
        this.channel.send(scoreMessage);
    }

    /**
     * Answer the current trivia question.
     * @param message The message that was used to answer the current trivia question
     */
    answerQuestion(message) {
        let check;
        try {
            check = this.questions[this.questNum].checkAns(message.content);
        } catch {
            return;
        }
        if (check) {
            console.log(`${message.author} got the correct answer`);
            this.userAnswer.set(message.author, true);
        } else {
            console.log(`${message.author} got the wrong answer`);
            this.userAnswer.set(message.author, false);
        }
    }

    static createTriviaURL(numQ, category, difficulty, type) {
        let url = `https://opentdb.com/api.php?amount=${numQ}`;
        if (category >= 9 && category <= 32) {
            url += `&category=${category}`;
        }
        if (TriviaQuestion.difficulties().indexOf(difficulty) > 0) {
            url += `&difficulty=${difficulty}`;
        }
        if (TriviaQuestion.questionTypes().indexOf(type) > 0) {
            url += `&type=${type}`;
        }
        return url;
    }
}

class TriviaQuestion {
    /**
     * Constructor for TriviaQuestion
     * @param {string} category
     * @param {string} ansType
     * @param {string} difficulty
     * @param {string} questionStr
     * @param {string} correctAns
     * @param {string[]} incorrectAns
     */
    constructor(category, ansType, difficulty, questionStr, correctAns, incorrectAns) {
        this.category = category;
        this.ansType = ansType;
        this.difficulty = difficulty;
        this.questionStr = questionStr;
        this.correctAns = correctAns;
        this.incorrectAns = incorrectAns;
        if (this.ansType === 'boolean') {
            this.answerList = ['True', 'False'];
        } else {
            this.answerList = this.incorrectAns.slice();
            this.answerList.splice(Util.random(0, this.incorrectAns.length - 1), 0, this.correctAns);
        }
    }

    /**
     * Create a TriviaQuestion from JSON.
     * @param jsonQuestion A JSON object containing a trivia question
     * @returns {TriviaQuestion} A TriviaQuestion object containing a trivia question
     */
    static fromJson(jsonQuestion) {
        // TODO: check if valid JSON object
        const icAnswers = new Array(jsonQuestion.length);
        for (let i = 0; i < jsonQuestion['incorrect_answers'].length; i++) {
            icAnswers[i] = Util.replaceHTML(jsonQuestion['incorrect_answers'][i].toString());
        }
        return new TriviaQuestion(
            jsonQuestion.category,
            jsonQuestion.type,
            jsonQuestion.difficulty,
            Util.replaceHTML(jsonQuestion.question.toString()),
            Util.replaceHTML(jsonQuestion['correct_answer'].toString()),
            icAnswers,
        );
    }

    static questionTypes() {
        return ['any', 'boolean', 'multiple'];
    }

    static difficulties() {
        return ['any', 'easy', 'medium', 'hard'];
    }

    /**
     * Returns the formatted message of the trivia question.
     * @param {number} number The question number in the trivia session
     * @returns {string} The formatted message of the trivia question
     */
    formatQuestion(number) {
        let formatStr = `Question ${number}: ${this.category} (${this.difficulty[0].toUpperCase() + this.difficulty.slice(1)})\n ${this.questionStr}`;
        for (let i = 0; i < this.answerList.length; i++) {
            formatStr += `\n ${i + 1}. ${this.answerList[i]}`;
        }
        return formatStr;
    }

    /**
     * Take the userAns and check if it is the correct answer. Throw an error if the answer is not one of the valid possible answers.
     * @param {string} userAns The answer to check
     * @returns {boolean} True if the answer is correct, false otherwise
     */
    checkAns(userAns) {
        userAns = userAns.replace(/\s/g, '').toLowerCase();
        const ansInt = parseInt(userAns);
        if (!isNaN(ansInt) && Util.isBetween(ansInt, 1, this.answerList.length)) {
            return this.answerList[ansInt - 1] === this.correctAns;
        } else if (this.ansType === 'boolean' && booleanAnswers.contains(userAns)) {
            return userAns === this.correctAns.toLowerCase() ||
                userAns === this.correctAns[0].toLowerCase();
        }
        throw 'Invalid answer';
    }
}

module.exports = {
    TriviaSession: TriviaSession,
    TriviaQuestion: TriviaQuestion,
};