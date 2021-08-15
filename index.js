const { prefix, token } = require('./config.json');
const { Client, Message, TextChannel, DMChannel, NewsChannel } = require('discord.js');
const client = new Client();
const { TriviaSession, TriviaQuestion } = require('./trivia.js');
const { Poll } = require('./poll.js');
const Util = require('./util.js');
const ytdl = require('ytdl-core');
require('@tensorflow/tfjs');
const mobilenet = require('@tensorflow-models/mobilenet');
const { createCanvas, loadImage } = require('canvas')

let model;
mobilenet.load().then((md) => { model = md });

const commands = {
    'poll': { params: 1, requiredParams: 1, helpMsg: `Usage: ${prefix}poll [timer] [option1], [option2], [option3], ...` },
    'trivia': { params: 3, helpMsg: `Usage: ${prefix}trivia [category (optional)] [difficulty (optional)] [type (optional)]` },
    'id': { helpMsg: `Usage: ${prefix}id` },
    'avatar': { helpMsg: `Usage: ${prefix}avatar` },
    'random': { params: 2, requiredParams: 2, helpMsg: `Usage: ${prefix}random [number] [number]` },
    // 'clear': { helpMsg: `Usage: ${prefix}clear` },
    'play': { params: 1, requiredParams: 1, helpMsg: `Usage: ${prefix}play [YouTube URL]` },
    'help': { params: 1, requiredParams: 1, helpMsg: `Usage: ${prefix}help [command]` },
    'whatis': { params: 1 }
}

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
    let split = [];
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
        rest: str.substring(currentStart, str.length)
    }
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
                const options = rest.split(',').map((option) => option.trim());
                startPoll(message.channel, timer, options);
            }
            break;
        case 'trivia':
            if (trivia && params.length >= 1 && message.channel.id === trivia.channel.id) {
                if (!trivia.active && params[0] === 'continue') {
                    trivia.loadQuestions().then(() => {
                        trivia.start();
                    }).catch((error) => {
                        console.error(error);
                        channel.send('[Error] Failed to get trivia questions.');
                    });
                    break
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
            let min = parseInt(params[0]);
            let max = parseInt(params[1]);
            min = isNaN(min) ? 0 : min;
            max = isNaN(max) ? min + 1 : max;
            if (max < min) {
                const temp = max;
                max = min;
                min = temp;
            }
            message.channel.send(`Roll [${min},${max}]: ${Util.random(min, max)}`);
            break;
        // case 'clear':
        //     if (message.member.hasPermission('ADMINISTRATOR')) {
        //         message.channel.bulkDelete(100, true).catch(console.error);
        //     }
        //     break;
        case 'play':
            playMusic(message, params[0]);
            break;
        case 'help':
            const helpCommandOptions = commands[params[0]];
            if (!helpCommandOptions) {
                message.channel.send(options.helpMsg);
            } else {
                message.channel.send(helpCommandOptions.helpMsg);
            }
            break;
        case 'whatis':
            if (model) {
                let url;
                if (params.length > 0) {
                    if (!params[0].startsWith('<@!') && !params[0].endsWith('>')) {
                        url = params[0];
                    } else if (message.mentions.members && message.mentions.members.size > 0) {
                        const firstMentioned = message.mentions.members.values().next();
                        if (!firstMentioned || !firstMentioned.value) return;
                        url = firstMentioned.value.user.displayAvatarURL({ format: 'png', dynamic: true });
                    }
                } else if (message.attachments.size > 0) {
                    const firstAttachment = message.attachments.values().next();
                    if (!firstAttachment || !firstAttachment.value || !firstAttachment.value.url) return;
                    url = firstAttachment.value.url;
                }
                if (!url) return;
                loadImage(url).then((img) => {
                    console.log('MobileNet: ' + url + ' (' + img.width + 'x' + img.height + ')');
                    const canvas = createCanvas(img.width > 4000 ? 4000 : img.width, img.height > 4000 ? 4000 : img.height);
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    return model.classify({ data: Uint8Array.from(imageData.data), width: canvas.width, height: canvas.height }).then(predictions => {
                        let predictionText = 'I think this is a...\n';
                        for (const { className, probability } of predictions) {
                            predictionText += '- ' + className + ': ' + Math.round(probability * 10000) / 100 + '%\n';
                        }
                        message.channel.send(predictionText);
                    });
                }).catch(err => {
                    console.error('Failed to load image:' + url + ' (' + typeof url + ')');
                    console.error(err);
                    message.channel.send(`I didn't receive a valid image URL or a specific user!`)
                });
            }
            break;
    }
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

/**
 * Play music from a website link.
 * @param {Message} message The message that was sent that activated this command
 * @param {string} link The url of the website
 */
function playMusic(message, link) {
    if (message.member.voice.channel) {
        if (ytdl.validateURL(link)) {
            message.member.voice.channel.join().then(connection => {
                const dispatcher = connection.play(ytdl(link, { filter: 'audioonly' }))
                    .catch(console.error);
                dispatcher.setVolume(0.5);
                dispatcher.on('finish', () => {
                    connection.disconnect();
                });
            });
        } else {
            message.channel.send('Invalid YouTube URL')
                .then(helpMsg => helpMsg.delete({ timeout: 5000 }));
        }
    } else {
        message.channel.send('Must be in a voice channel to use this command.')
            .then(helpMsg => helpMsg.delete({ timeout: 5000 }));
    }
}

client.login(token);
