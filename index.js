// skratch-bot

const Discord = require('discord.js');
const client = new Discord.Client();
const { token, prefix } = require('./creds.json');
const { SkratchChannel, STATES } = require('./skratch-channel.js');
const fs = require('fs');
const dataPath = './data/channels.json';
// for now, we'll store all channels in a local JSON file

const help = [
  ['`!sbhelp`', 'this list of useful commands'],
  ['`!skratchenable <#voicechannelid> <#textchannelid> minutes`', 'enables a voice and text channel for skratchin\''],
  ['`!skratchdisable <#voicechannelid> <#textchannelid>`', 'disables skratchin\' for the desired channel pair.'],
  ['`!igotnext`', 'get in line to scratch'],
  ['`!forfeit`', 'give up and go home. Let\'s the next person in line go.'],
  ['`!queue`', 'list the current queue.'],
  ['`!nominate <#userid>`', 'add another user to the queue.'],
  ['`!whosup`', 'display the current active dj'],
  ['`!settimer minutes`', 'change the timer value in minutes.'],
];

function helpText() {
  return help.reduce((msg, val) => {
    msg += `${val.join(' : ')}\n`;
    return msg;
  }, 'Help:\n');
}

// in-memory list of voice channels
const storage = fs.readFileSync(dataPath, 'utf-8');
console.log('read data file', storage);

// restore channels
const skratchChannels = storage ? JSON.parse(storage).channels.map(val => new SkratchChannel(val.vid, val.tid, val.timeout)) : [];
skratchChannels.forEach(c => listenToSkratchChannel(c));

function saveChannels() {
  // save skratchChanels to file
  const channels = skratchChannels.map(ch => ({ vid: ch.vid, tid: ch.tid, timeout: ch.timeout }));
  console.log('saving channels', channels);
  fs.writeFileSync(dataPath, JSON.stringify({ channels }));
}

/**
 *
 * @param {string} id
 * @return {?SkratchChannel}
 */
function getSkratchChannel(id) {
  return skratchChannels.find(s => s.vid === id);
}

/**
 *
 * @param {string} id
 * @return {?SkratchChannel}
 */
function getSkratchChannelByTextId(tid) {
  return skratchChannels.find(s => s.tid === tid);
}

/**
 *
 * @param {string} id
 * @param {string} tid
 * @param {string} timeout
 * @return {?SkratchChannel}
 */
function createSkratchChannel(id, tid, timeout) {
  if (getSkratchChannel(id)) {
    // already exists!
    return null;
  }
  const channel = new SkratchChannel(id, tid, timeout);
  skratchChannels.push(channel);
  // write channel's list to file
  saveChannels();
  return channel;
}

function deleteSkratchChannel(id) {
  const channel = getSkratchChannel(id);
  if (channel) {
    // kill it!
    channel.kill();
    skratchChannels = skratchChannels.filter(s => s.vid !== id);
  }
  saveChannels();
}

function onUserJoinedChannel(userId, channelId) {
  console.log('user joined channel', userId);
  const skratchChannel = getSkratchChannel(channelId);
  // mute if not up
  if (skratchChannel.context.queue.length) {
    if (userId !== skratchChannel.context.queue[0]) {
      client.channels.cache.get(channelId).members.get(userId).voice.setMute(true, 'not up next!');
    } else {
      // this should never happen since users are removed from the queue if they leave,
      // but if the user is joining AND is up, unmute
      client.channels.cache.get(channelId).members.get(userId).voice.setMute(false, 'you\'re up!');
    }
  } else {
    // joined the room but there is no queue
    client.channels.cache.get(channelId).members.get(userId).voice.setMute(false, 'no queue!');
  }

}

function onUserLeftChannel(userId, channelId) {
  console.log('user left channel', userId);
  // unmute upon leaving (doesn't work, user not found)
  // client.channels.cache.get(channelId).members.get(userId).voice.setMute(false, 'left skratch channel');
  const skratchChannel = getSkratchChannel(channelId);
  // remove user from queue
  skratchChannel.removeUser(userId);
}

function listenToSkratchChannel(skratchChannel) {
  // listen for state-change events
  const voiceChannelId = skratchChannel.vid;
  const textChannelId = skratchChannel.tid;
  skratchChannel.on('state-change', (state, context) => {
    console.log('state change event:', state, context);
    if (state === STATES.EMPTY) {
      console.log('no users in queue. unmuting everyone');
      client.channels.cache.get(voiceChannelId).members.forEach(m => {
        m.voice.setMute(false, 'no queue')
      });
    } else if (state === STATES.MANY_USERS) {
      console.log('many users. toggling mutes!');
      // mute everyone except the first user in the queue
      client.channels.cache.get(voiceChannelId).members.forEach(m => {
        if (m.id === context.queue[0]) {
          m.voice.setMute(false, 'your turn')
        } else {
          m.voice.setMute(true, 'not your turn');
        }
      })
    }
  });

  skratchChannel.on('user-switch', (queue = []) => {
    console.log('user-switch', queue);
    // first item in the queue is the new user
    const newUser = client.users.cache.get(queue[0]);
    const skratchChannel = getSkratchChannelByTextId(textChannelId);
    if (newUser) {
      console.log('muting everyone except:', newUser);
      // mute everyone but the newUser?
      client.channels.cache.get(voiceChannelId).members.forEach(m => {
        if (m.id !== newUser.id) {
          m.voice.setMute(true, 'not your turn');
        }
      });
      // unmute newUser
      client.channels.cache.get(voiceChannelId).members.get(newUser.id).voice.setMute(false, `you're up`);

      if (queue.length === 1) {
        client.channels.cache.get(textChannelId).send(`${newUser} is last up!`);
      } else if (queue.length > 1) {
        const nextUser = client.users.cache.get(queue[1]);
        client.channels.cache.get(textChannelId).send(`${newUser} is up, ${nextUser} is next in line.`);
      } else {
        // this should never happen??
        client.channels.cache.get(textChannelId).send('the queue is empty!');
      }
    } else {
      console.log('no more users');
      // unmute everyone
      client.channels.cache.get(skratchChannel.vid).members.forEach(m => {
        m.voice.setMute(false, 'free for all');
      });
      client.channels.cache.get(textChannelId).send('the queue is empty!');
    }
  });
}

const commands = new Map([
  ['sbhelp', (msg) => {
    msg.channel.send(`${helpText()}`);
  }],
  [`skratchenable`, (message, voiceChannel = '', textChannel = '', timeout = 5) => {
    // setup a voice channel for skratchin'
    const msg = /** @type {Discord.Message} */ (message);
    if (msg.member.hasPermission(['ADMINISTRATOR'])) {

      // channels that are linked contain a bunch of junk like '<#724946134212280354>'
      const voiceChannelId = voiceChannel.replace(/[\<\#]|[\>]/gi, '');
      const textChannelId = textChannel.replace(/[\<\#]|[\>]/gi, '');
      console.log('enable command, channel', voiceChannelId, textChannelId);
      if (!voiceChannelId) {
        return msg.channel.send('you need to provide a voice channel id!');
      }
      if (!textChannelId) {
        return msg.channel.send('you need to provide a text channel id!');
      }

      // TODO: ensure this channelId is in the user's guild!!
      // ...
      const skratchChannel = getSkratchChannel(voiceChannelId);
      // already exists!
      if (skratchChannel) {
        return msg.channel.send(`${voiceChannel} is already enabled!`);
      }

      // doesn't exist, set it up
      const newChannel = createSkratchChannel(voiceChannelId, textChannelId, timeout);
      listenToSkratchChannel(newChannel);
      // relay a message saying we're ready!
      message.channel.send(`${voiceChannel} enabled for skratchin' with ${timeout} minute intervals. Notifications will be sent to ${textChannel}. To participate, send \`igotnext\` in ${textChannel}.`);
    }
  }],
  [`skratchdisable`, (message, voiceChannel = '') => {
    // disable a voice channel for skratchin'
    const msg = /** @type {Discord.Message} */ (message);
    if (msg.member.hasPermission(['ADMINISTRATOR'])) {
      console.log('disable command', voiceChannel);
      const channelId = voiceChannel.replace(/[\<\#]|[\>]/gi, '');
      if (channelId) {
        // TODO: ensure this channelId is in the user's guild!!
        // ...
        deleteSkratchChannel(channelId);
        // unmute all users
        client.channels.cache.get(channelId).members.forEach(m => {
          m.voice.setMute(false, 'skratch disabled');
        });
      }
    }
  }],
  [`igotnext`, message => {
    const msg = /** @type {Discord.Message} */ (message);
    console.log('igotnext command');
    const channel = getSkratchChannelByTextId(msg.channel.id);
    if (!channel) {
      return msg.channel.send('The scratch channel has not been enabled, or is not linked to this room! use `!skratchenable <#voicechannelid> <#textchannelid> timer`');
    }
    const voiceChannel = msg.member.voice.channel;
    if (!voiceChannel) {
      return msg.channel.send(`${msg.member}, you need to join the voice channel first!`);
    }
    const queue = channel.context.queue;
    if (queue.includes(msg.author.id)) {
      // user is already in the queue
      return msg.channel.send(`you're already in line at position ${queue.indexOf(msg.author.id) + 1}.`);
    }
    channel.addUser(msg.author.id);
    client.channels.cache.get(channel.tid).send(`${msg.author.username} was added to the queue at position ${channel.context.queue.length}.`);
  }],
  [`forfeit`, message => {
    const msg = /** @type {Discord.Message} */ (message);
    // find the skratch channel
    const channel = getSkratchChannel(msg.member.voice.channel.id);
    if (!channel) {
      return msg.channel.send(`${msg.member}, I can't find the channel!`);
    }
    channel.removeUser(msg.member.id);

    msg.channel.send(`${msg.author} has forfeited their spot.`);
  }],
  ['queue', message => {
    const msg = /** @type {Discord.Message} */ (message);
    console.log('queue command');
    const channel = getSkratchChannelByTextId(msg.channel.id);
    if (!channel) {
      return msg.channel.send(`this channel is not skratch enabled!`);
    }
    const users = channel.context.queue.map((m, index) => {
      return `${index + 1}. ${client.users.cache.get(m).username}\n`;
    })
    return msg.channel.send(`the queue: \n\r ${users}`);
  }],
  ['unmuteall', message => {
    const msg = /** @type {Discord.Message} */ (message);
    console.log('unmuting all?');
    // TODO: unmute all channel users
  }],
  ['whosup', message => {
    const msg = /** @type {Discord.Message} */ (message);
    const channel = getSkratchChannelByTextId(msg.channel.id);
    if (!channel) {
      msg.channel.send('there is no skratch channel associated with this text channel.');
    } else if (channel.context.queue.length > 0) {
      const nextUser = client.users.cache.get(channel.context.queue[0]);
      // send current user...
      msg.channel.send(`${nextUser} is up!`);
    } else if (channel.context.queue.length === 0) {
      msg.channel.send('the queue is empty!');
    }
  }],
  ['nominate', (message, userId) => {
    const msg = /** @type {Discord.Message} */ (message);
    // dirty, needs cleanup
    const channel = getSkratchChannelByTextId(msg.channel.id);
    const user = client.users.cache.get(userId);

    if (!user) {
      return msg.channel.send('that user doesn\'t exist!');
    }
    if (!channel) {
      return msg.channel.send('The scratch channel has not been enabled, or is not linked to this room! use `!skratchenable <#voicechannelid> <#textchannelid> timer`');
    }
    const members = client.channels.cache.get(channel.vid).members;
    const member = members.find(f => f.id === userId);
    if (!member) {
      return msg.channel.send(`${user.username}, needs to join the voice channel first!`);
    }
    const queue = channel.context.queue;
    if (queue.includes(userId)) {
      // user is already in the queue
      return msg.channel.send(`${user.username} is already in line at position ${queue.indexOf(userId) + 1}.`);
    }
    channel.addUser(userId);
    client.channels.cache.get(channel.tid).send(`${user} was added to the queue at position ${channel.context.queue.length}.`);
  }],
  ['settimer', (message, voiceChannelId, timeout = 5) => {
    console.log('settimer command??', voiceChannelId, timeout);
    const msg = /** @type {Discord.Message} */ (message);
    const channelId = voiceChannelId.replace(/[\<\#]|[\>]/gi, '');
    const channel = getSkratchChannel(channelId);
    // TODO: should be admin only?
    if (channel) {
      channel.setTimer(timeout);
      msg.channel.send(`timer changed to ${timeout} minutes.`);
    }
  }]
]);

// triggered for every message in every room on every server we've joined
client.on('message', msg => {
  // handle commands
  if (!msg.content.startsWith(prefix) || msg.author.bot) {
    return;
  }
  const args = msg.content.slice(prefix.length).split(/ +/);
  const cmdName = args.shift().toLowerCase();
  args.unshift(msg);
  const cmd = commands.get(cmdName);
  cmd && cmd(...args);
});

// triggered when a user's presence changes
client.on('presenceUpdate', (oldMember, newMember) => {
  // console.log('presence change', oldMember, newMember);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  console.log('voiceStateUpdate', 'old:', oldState.channelID, 'new', newState.channelID);
  const userJoined = Boolean(!oldState.channelID && newState.channelID);
  const userLeft = Boolean(oldState.channelID && !newState.channelID);
  console.log('userLeft', userLeft);
  console.log('userJoined', userJoined);
  if (userJoined) {
    // determine if they joined a channel we care about
    const skratchChannel = getSkratchChannel(newState.channelID);
    if (skratchChannel) {
      // are they the current user? If yes, unmute
      onUserJoinedChannel(newState.id, newState.channelID);
    }
  }
  if (userLeft) {
    // determine if they left a channel we care about
    const skratchChannel = getSkratchChannel(oldState.channelID);
    if (skratchChannel) {
      // server un-mute anyone leaving
      onUserLeftChannel(newState.id, oldState.channelID);
    }
  }
  // TODO:
  // if the user is leaving the room, AND is the current skratcher,
  // skip the channel to the next user.

  // if the user is joining the room, msg them and tell them
  // how to get in line.

  // if the user is leaving the room AND is in the queue,
  // remove them from the queue.

});

client.once('ready', () => {
  console.log('client is ready', client.user.tag);
});

client.login(token);


// commands
// /skratchenable ${voiceChannel} - setup a voice channel for skerratchin', sets time limit (requires persistent storage. could be a json file?)
// /skratchdisable ${voiceChannel} - disable skratch-bot for the given voice channel
// /igotnext - adds the current user to the queue for the channel
// /forfeit - cancel your session and let the next person go
// /fistbump /fresh - give praise (requires persistent storage)
// /boo /ahh - unhappy with current user's performance (requires persistent storage)
// /points {user} how many fistbumps does a user have overall (requires persistent storage)
// /time - how much time is left in the current user's session

// data structures
/**
 * @typedef {Object} SessionRoom
 * @property {Array<string>} queue
 * @property {number} remainingTime
 * @property {string} textChannel
 * @property {string} voiceChannel
 * @property {number} timeLimit
 */
