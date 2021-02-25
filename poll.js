const numberEmojis = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const pollOptions = {
    ALLOW_MULTIVOTE: 0,
    LAST_VOTED: 1,
    SPLIT_VOTE: 2,
    RANDOMIZE_MULTIVOTE: 3,
};
Object.freeze(pollOptions);

class Poll {

    /**
     * Constructor for poll
     * @param {TextChannel | DMChannel | NewsChannel} channel
     * @param {number} timer
     * @param {string[]} options
     * @param {Snowflake} botId
     */
    constructor(channel, timer, options, botId) {
        this.channel = channel;
        this.timer = timer;
        this.options = options;
        this.pollOption = pollOptions.LAST_VOTED;
        this.invalidUsers = [botId];
        this.userToVote = new Map();
        this.active = false;
    }

    start() {
        this.active = true;
        this.userToVote.clear();
        this.setUpPoll().then((pollMsg) => this.run(pollMsg));
    }

    /**
     * Set up the poll message
     * @returns {Promise<Message>}
     */
    setUpPoll() {
        const pollMsgHeader = `Poll (${this.timer} seconds):\n`;
        let pollMsgBody = '';
        for (let index = 0; index < this.options.length; index++) {
            pollMsgBody += `${(index + 1)}. ${this.options[index]}\n`;
        }
        return this.channel.send(pollMsgHeader + 'Setting up poll...')
            .then(pollMsg => {
                const reactionPromises = [];
                for (let index = 1; index <= this.options.length; index++) {
                    if (index < numberEmojis.length) {
                        reactionPromises.push(pollMsg.react(numberEmojis[index]));
                    }
                }
                return Promise.all(reactionPromises)
                    .then(() => {
                        return pollMsg.edit(pollMsgHeader + pollMsgBody).then(() => {
                            return Promise.resolve(pollMsg);
                        });
                    });
            });
    }

    /**
     * Run the poll
     * @param {Message} pollMsg
     */
    run(pollMsg) {
        const filter = (reaction) => {
            return numberEmojis.includes(reaction.emoji.name);
        };
        const collector = pollMsg.createReactionCollector(filter, { time: this.timer * 1000 });
        // TODO: add text input option to voting
        collector.on('collect', (reaction, user) => {
            const found = numberEmojis.indexOf(reaction.emoji.name);
            if (found >= 0) {
                this.channel.send(`${user} voted for ${this.options[found - 1]}`);
                if (this.userToVote.has(user)) {
                    this.userToVote.get(user).push(found);
                } else {
                    this.userToVote.set(user, [found]);
                }
            }
        });
        collector.on('end', () => {
            this.showResult();
        });
    }

    /**
     * Show the end result
     */
    showResult() {
        console.log(this.userToVote);
        const emojiCounts = Poll.getVoteCounts(this.userToVote, this.pollOption, this.invalidUsers);
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
                    result += this.options[indicesOfGreatest[index] - 1];
                    if (index < indicesOfGreatest.length - 1) {
                        result += ', ';
                    }
                }
            }
            result += ` with ${Math.floor(greatest * 100) / 100} ${greatest === 1 ? 'vote' : 'votes'}`;
            this.channel.send(result);
        } else {
            this.channel.send('Not enough votes.');
        }
        this.active = false;
    }

    /**
     * Return the counts for each vote number
     * @param {Map<User, Array>} userToVote
     * @param {number} pollOption
     * @param {Snowflake[]} invalidUsers
     * @returns {number[]}
     */
    static getVoteCounts(userToVote, pollOption, invalidUsers) {
        const emojiCounts = Array(numberEmojis.length).fill(0);
        for (const [user, votes] of userToVote) {
            if (!invalidUsers.includes(user.id)) {
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
        return emojiCounts;
    }
}

module.exports = {
    Poll: Poll,
};