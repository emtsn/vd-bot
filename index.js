const { prefix, token } = require('./config.json');
const Discord = require('discord.js');
const client = new Discord.Client();
const { TriviaSession, TriviaQuestion } = require('./trivia.js');
const Util = require('./util.js');
const fetch = require('node-fetch');
const ytdl = require('ytdl-core');

const numberEmojis = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

const pollOptions = {
    ALLOW_MULTIVOTE: 0,
    LAST_VOTED: 1,
    SPLIT_VOTE: 2,
    RANDOMIZE_MULTIVOTE: 3,
};
Object.freeze(pollOptions);
const pollOption = pollOptions.LAST_VOTED;

// TODO: handle multiple channels, servers, trivia, poll at a time
let trivia;

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
            if (split.length > 3) {
                let timer = parseInt(split[1]);
                if (isNaN(timer)) timer = 0;
                initPoll(message.channel, timer, split.slice(2, split.length));
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
                if (max <= min) max = min + 1;
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
 * Initialize a poll
 * @param {TextChannel | DMChannel | NewsChannel} channel The channel where the poll will be active on
 * @param {number} timer The number of seconds that the poll will be open for
 * @param {string[]} options Options that the users will be polling on
 */
function initPoll(channel, timer, options) {
    const pollMsgHeader = `Poll (${timer} seconds):\n`;
    let pollMsgBody = '';
    for (let index = 0; index < options.length; index++) {
        pollMsgBody += `${(index + 1)}. ${options[index]}\n`;
    }
    channel.send(pollMsgHeader + 'Setting up poll...')
        .then(pollMsg => {
            for (let index = 0; index < options.length; index++) {
                if (index + 1 < numberEmojis.length) {
                    pollMsg.react(numberEmojis[index + 1])
                        .catch(console.error);
                }
            }
            if (options.length <= numberEmojis.length) {
                pollMsg.react(numberEmojis[options.length - 1])
                    .then(() => {
                        pollMsg.edit(pollMsgHeader + pollMsgBody);
                        startPoll(channel, timer, options, pollMsg);
                    })
                    .catch(console.error);
            }
        });
}

// TODO: move poll to poll.js
/**
 * Start the poll
 * @param {TextChannel | DMChannel | NewsChannel} channel The channel where the poll will be active on
 * @param {number} timer The number of seconds that the poll will be open for
 * @param {string[]} options Options that the users will be polling on
 * @param {Message} pollMsg The message that was sent to display the poll
 */
function startPoll(channel, timer, options, pollMsg) {
    const filter = (reaction) => {
        return numberEmojis.includes(reaction.emoji.name);
    };
    const collector = pollMsg.createReactionCollector(filter, { time: timer * 1000 });
    const userToVote = new Map();
    // TODO: add text input option to voting
    collector.on('collect', (reaction, user) => {
        const found = numberEmojis.indexOf(reaction.emoji.name);
        if (found >= 0) {
            channel.send(`${user} voted for ${options[found - 1]}`);
            if (userToVote.has(user)) {
                userToVote.get(user).push(found);
            } else {
                userToVote.set(user, [found]);
            }
        }
    });
    collector.on('end', () => {
        endPoll(channel, userToVote, options);
    });
}

/**
 * End the poll and show the results.
 * @param {TextChannel | DMChannel | NewsChannel} channel
 * @param {Map<User, Array>} userToVote
 * @param {string[]} options
 */
function endPoll(channel, userToVote, options) {
    console.log(userToVote);
    const emojiCounts = new Array(numberEmojis.length).fill(0);
    for (const [user, votes] of userToVote) {
        if (user.id !== client.user.id) {
            switch (pollOption) {
                case pollOptions.ALLOW_MULTIVOTE:
                    // vote goes to every option voted for
                    votes.forEach(v => {
                        emojiCounts[v]++;
                        console.log(`Add 1 to ${v}`);
                    });
                    break;
                case pollOptions.LAST_VOTED:
                    // vote goes to last option voted for
                    emojiCounts[votes[votes.length - 1]]++;
                    break;
                case pollOptions.SPLIT_VOTE:
                    // vote is split between every option voted for
                    votes.forEach(v => {
                        emojiCounts[v] += 1 / votes.length;
                        console.log(`Add ${1 / votes.length} to ${v}`);
                    });
                    break;
                case pollOptions.RANDOMIZE_MULTIVOTE:
                    // vote is randomized between every option voted for
                    emojiCounts[votes[Math.floor(Math.random() * votes.length)]]++;
                    break;
            }
        }
    }
    let greatest = emojiCounts[0];
    let indicesOfGreatest = [];
    for (let index = 1; index <= emojiCounts.length; index++) {
        if (emojiCounts[index] > greatest) {
            greatest = emojiCounts[index];
            indicesOfGreatest = [index];
        } else if (emojiCounts[index] === greatest) {
            indicesOfGreatest.push(index);
        }
    }
    if (greatest > 0) {
        let result = 'Result: ';
        for (let index = 0; index < indicesOfGreatest.length; index++) {
            // should always be true as 0 is never added to indicesOfGreatest
            if (indicesOfGreatest[index] > 0) {
                result += options[indicesOfGreatest[index] - 1];
                if (index < indicesOfGreatest.length - 1) {
                    result += ', ';
                }
            }
        }
        result += ` with ${Math.floor(greatest * 100) / 100} ${greatest === 1 ? 'vote' : 'votes'}`;
        channel.send(result);
    } else {
        channel.send('Not enough votes.');
    }
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
