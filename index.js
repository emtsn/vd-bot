const { prefix, token } = require('./config.json');
const { Client, Message, TextChannel, DMChannel, NewsChannel } = require('discord.js');
const client = new Client();
const { TriviaSession, TriviaQuestion } = require('./trivia.js');
const { Poll } = require('./poll.js');
const Util = require('./util.js');

const commands = {
    'poll': { params: 1, requiredParams: 1, helpMsg: `Usage: ${prefix}poll [timer] [option1], [option2], [option3], ...` },
    'trivia': { params: 3, helpMsg: `Usage: ${prefix}trivia [category (optional)] [difficulty (optional)] [type (optional)]` },
    'id': { helpMsg: `Usage: ${prefix}id` },
    'avatar': { helpMsg: `Usage: ${prefix}avatar` },
    'random': { params: 2, requiredParams: 2, helpMsg: `Usage: ${prefix}random [number] [number]` },
    // 'clear': { helpMsg: `Usage: ${prefix}clear` },
    'help': { params: 1, requiredParams: 1, helpMsg: `Usage: ${prefix}help [command]` },
};

// TODO: handle multiple channels, servers, trivia, poll at a time
/** @type {TriviaSession} */
let trivia;
/** @type {Poll} */
let poll;

client.once('ready', () => {
    console.log('Ready!');
});

client.on('messageReactionAdd', (messageReaction, user) => {
    console.log('Reaction of ' + messageReaction + ' by ' + user);
});

client.on('message', message => {
    console.log('[' + Util.dateTimeFormat(message.createdAt) + '] ' + message.content);
    if (message.guild && message.author.id !== client.user.id) {
        if (message.content.startsWith(prefix)) {
            let firstSplit = message.content.indexOf(' ');
            if (firstSplit < 0) firstSplit = message.content.length;
            const command = message.content.substring(prefix.length, firstSplit).toLowerCase();
            const notcommand = message.content.substring(firstSplit + 1, message.content.length);
            const options = commands[command];
            if (!options) return;
            const { split, rest } = splitString(notcommand, options.params);
            if (options.requiredSplit && split.length < options.requiredParams) {
                if (options.helpMsg) message.channel.send(options.helpMsg);
                return;
            }
            runCommand(message, command, options, split, rest);
        } else if (trivia && trivia.active && trivia.channel.id === message.channel.id) {
            trivia.answerQuestion(message);
        }
    }
});

/**
 * Splits the string by space, limited by limit, and returns the split and the remaining rest of the string
 * @param {string} str
 * @param {number?} limit
 * @returns {{ split: string[], rest: string }}
 */
function splitString(str, limit = null) {
    let currentStart = 0;
    const split = [];
    for (let i = 0; i <= str.length; i++) {
        if ((i === str.length || str[i] === ' ') && i > currentStart) {
            split.push(str.substring(currentStart, i));
            currentStart = i + 1;
            if (limit != null && split.length >= limit) {
                break;
            }
        }
    }
    return {
        split,
        rest: str.substring(currentStart, str.length),
    };
}

/**
 * Run a bot command
 * @param {Message} message The Message that was sent that activated this command
 * @param {string} command The string of the command name
 * @param {{ params: number?, requiredParams: number?, helpMsg: string? }} options The options for the command
 * @param {string[]} params The array of string of the parameters
 * @param {string} rest The string of the rest of the message with the command + parameters removed
 */
function runCommand(message, command, options, params, rest) {
    console.log(command + '(' + params.join(', ') + (rest ? ' : ' + rest : '') + ')');
    switch (command) {
        case 'poll':
            if ((!poll || !poll.active) && rest) {
                let timer = parseInt(params[0]);
                if (isNaN(timer)) timer = 0;
                startPoll(message.channel, timer, rest.split(',').map((option) => option.trim()));
            }
            break;
        case 'trivia':
            if (trivia && params.length >= 1 && message.channel.id === trivia.channel.id) {
                if (!trivia.active && params[0] === 'continue') {
                    trivia.loadQuestions().then(() => {
                        trivia.start();
                    }).catch((error) => {
                        console.error(error);
                        message.channel.send('[Error] Failed to get trivia questions.');
                    });
                    break;
                } else if (trivia.active && params[0] === 'stop') {
                    trivia.stop();
                    message.channel.send('Stopping Trivia...').then((msg) => {
                        trivia.showAnswer();
                        trivia.showScores();
                        msg.delete();
                    });
                    break;
                }
            }
            if (!trivia || !trivia.active) {
                const category = params.length >= 1 ? params[0] : '-1';
                if (category === 'categories') {
                    TriviaSession.showCategories(message.channel);
                    break;
                }
                const difficulty = params.length >= 2 && TriviaQuestion.difficulties.includes(params[1].toLowerCase()) ? params[1] : 'any';
                const type = params.length >= 3 && TriviaQuestion.questionTypes.includes(params[2].toLowerCase()) ? params[2] : 'any';
                startTrivia(message.channel, 10, category, difficulty, type);
            }
            break;
        case 'id':
            message.channel.send(`id: ${message.author.id}`);
            break;
        case 'avatar':
            message.channel.send(message.author.displayAvatarURL({ format: 'png', dynamic: true }));
            break;
        case 'random':
            rollRandom(message.channel, parseInt(params[0]), parseInt(params[1]));
            break;
        // case 'clear':
        //     if (message.member.hasPermission('ADMINISTRATOR')) {
        //         message.channel.bulkDelete(100, true).catch(console.error);
        //     }
        //     break;
        case 'help':
            if (!commands[params[0]]) {
                message.channel.send(options.helpMsg);
            } else {
                message.channel.send(commands[params[0]].helpMsg);
            }
            break;
    }
}

/**
 * Roll a number between min and max
 * - Will flip min and max if min is greater than max
 * @param {TextChannel | DMChannel | NewsChannel} channel The channel the result will be posted
 * @param {number} min Minimum value (default: 0)
 * @param {number} max Maximum value (default: min + 1)
 */
function rollRandom(channel, min, max) {
    min = isNaN(min) ? 0 : min;
    max = isNaN(max) ? min + 1 : max;
    if (max < min) {
        const temp = max;
        max = min;
        min = temp;
    }
    channel.send(`Roll [${min},${max}]: ${Util.random(min, max)}`);
}

/**
 * Start a poll
 * @param {TextChannel | DMChannel | NewsChannel} channel The channel where the poll will be active on
 * @param {number} timer The number of seconds that the poll will be open for
 * @param {string[]} options Options that the users will be polling on
 */
function startPoll(channel, timer, options) {
    poll = new Poll(channel, timer, options, client.user.id);
    poll.start();
}

/**
 * Start the trivia session
 * @param {TextChannel | DMChannel | NewsChannel} channel Channel that the trivia session will occur in
 * @param {number} numQ Number of questions in the trivia session
 * @param {string} category Category of the trivia questions
 * @param {string} difficulty Difficulty of the trivia questions
 * @param {string} type Type of the trivia questions
 */
function startTrivia(channel, numQ, category, difficulty, type) {
    const timer = 20;
    trivia = new TriviaSession(channel, timer, numQ, category, difficulty, type);
    trivia.loadQuestions().then(() => {
        trivia.start();
    }).catch((error) => {
        console.error(error);
        channel.send('[Error] Failed to get trivia questions.');
    });
}

client.login(token);
