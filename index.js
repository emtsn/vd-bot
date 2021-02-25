const { prefix, token } = require('./config.json');
const Discord = require('discord.js');
const client = new Discord.Client();
const { TriviaSession, TriviaQuestion } = require('./trivia.js');
const { Poll } = require('./poll.js');
const Util = require('./util.js');
const fetch = require('node-fetch');
const ytdl = require('ytdl-core');

// TODO: handle multiple channels, servers, trivia, poll at a time
let trivia;
let poll;

client.once('ready', () => {
    console.log('Ready!');
});

client.on('messageReactionAdd', (messageReaction, user) => {
    console.log('Reaction of ' + messageReaction + ' by ' + user);
});

client.on('message', message => {
    console.log(message.content);
    if (message.guild && message.author.id !== client.user.id) {
        if (message.content.startsWith(prefix)) {
            const split = message.content.split(' ');
            const command = split[0].slice(prefix.length).toLowerCase();
            runCommand(message, command, split);
        } else if (trivia && trivia.active) {
            trivia.answerQuestion(message);
        }
    }
});

/**
 * Run a bot command
 * @param {Message} message The Message that was sent that activated this command
 * @param {string} command The string of the command name
 * @param {string[]} split An array of strings that is each word in the message content
 */
function runCommand(message, command, split) {
    switch (command) {
        case 'poll':
            if ((!poll || !poll.active) && split.length > 3) {
                let timer = parseInt(split[1]);
                if (isNaN(timer)) timer = 0;
                startPoll(message.channel, timer, split.slice(2, split.length));
            }
            break;
        case 'trivia':
            if (!trivia || !trivia.active) {
                const category = split.length >= 2 ? split[1] : -1;
                const difficulty = split.length >= 3 && TriviaQuestion.difficulties().includes(split[2].toLowerCase()) ? split[2] : 'any';
                const type = split.length >= 4 && TriviaQuestion.questionTypes().includes(split[3].toLowerCase()) ? split[3] : 'any';
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
            if (split.length === 3) {
                let min = parseInt(split[1]);
                let max = parseInt(split[2]);
                min = isNaN(min) ? 0 : min;
                max = isNaN(max) ? min + 1 : max;
                if (max < min) {
                    const temp = max;
                    max = min;
                    min = temp;
                }
                message.channel.send(`Roll [${min},${max}]: ${Util.random(min, max)}`);
            } else {
                message.channel.send(`Usage: ${prefix}random [number] [number]`);
            }
            break;
        // case 'clear':
        //     if (message.member.hasPermission('ADMINISTRATOR')) {
        //         message.channel.bulkDelete(100, true).catch(console.error);
        //     }
        //     break;
        case 'play':
            if (split.length === 2) {
                playMusic(message, split[1]);
            } else {
                message.channel.send(`Usage: ${prefix}play [YouTube URL]`);
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
    numQ = numQ > 50 ? 50 : numQ;
    numQ = numQ < 1 ? 1 : numQ;
    console.log(`trivia: ${numQ}, ${category}, ${difficulty}, ${type}`);
    let url = `https://opentdb.com/api.php?amount=${numQ}`;
    const timer = 20;
    if (category >= 9 && category <= 32) {
        url += `&category=${category}`;
    }
    if (TriviaQuestion.difficulties().indexOf(difficulty) > 0) {
        url += `&difficulty=${difficulty}`;
    }
    if (TriviaQuestion.questionTypes().indexOf(type) > 0) {
        url += `&type=${type}`;
    }
    // TODO: add token
    fetch(url)
        .then(result => result.json())
        .then(json => {
            const questions = [];
            try {
                const response = json['response_code'];
                if (response === 0) {
                    for (let i = 0; i < numQ; i++) {
                        questions.push(TriviaQuestion.fromJson(json.results[i]));
                    }
                } else if (response === 3 || response === 4) {
                    // TODO: get new token
                } else {
                    throw `Response error ${response}`;
                }
            } catch(error) {
                console.error(error);
                channel.send('[Error] Failed to get trivia questions.');
                return;
            }
            trivia = new TriviaSession(channel, timer, questions);
            trivia.start();
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
