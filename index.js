// skratch-bot

const Discord = require('discord.js');
const client = new Discord.Client();
const {token, prefix} = require('./creds.json');
const SkratchChannel = require('./skratch-channel.js');

const help = [[
  ['help', 'this list of useful commands'],
  ['skratchenable', '<#voicechannelid> <#textchannelid> timeout in minutes : enables a voice and text channel for skratchin\''],
  ['skratchdisable','<#voicechannelid> <#textchannelid> disables skratchin\' for the desired channel pair'],
  ['igotnext', 'get in line to scratch'],
  ['forfeit', 'give up and go home. Let\'s the next person in line go.'],
]];

function helpText() {
  return help.reduce((msg, val) => {
    msg += val.join(':');
    return msg;
  }, '');
}

// in-memory list of voice channels
const skratchChannels = [];

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
  return channel;
}

function deleteSkratchChannel(id) {
  const channel = getSkratchChannel(id);
  if (channel) {
    // kill it!
    channel.kill();
    skratchChannels = skratchChannels.filter(s => s.vid !== id);
  }
  return channel;
}

const commands = new Map([
  ['help', (msg) => {
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

      // listen for events
      newChannel.on('timerStarted',(vid, timeLimit, nextUser) => {
        const next = client.users.cache.get(nextUser);
        client.channels.cache.get(textChannelId).send(`${next} you're up! You have ${timeLimit} minutes!`);
      });

      newChannel.on('nextUser', (vid, nextUserId, previousUserId) => {
        const nextUser = client.users.cache.get(nextUserId);
        const prevUser = client.users.cache.get(previousUserId);
        console.log('nextUser event', 'nextUser: ',nextUser, "previousUser", prevUser);
        if (nextUser && prevUser && nextUser.id !== prevUser.id) {
          client.channels.cache.get(textChannelId).send(`${nextUser}, you're up! Nice work ${prevUser}!`);
        } else if (prevUser && !nextUser) {
          // unmute all users
          const vChannel = client.channels.cache.get(voiceChannelId);
          console.log('un-muteing all voice channel members', vChannel);
          return vChannel.members.forEach(m => m.voice.setMute(false, 'no more queue.'));
        }
        // if user is not in voice channel, skip them!
        console.log('should we skip user?', nextUser);
        // problem: nextUser.voice is undefined. I'm not sure yet where to get it from.
        // maybe add admin option to forfeit user, or send message and collect votes via emoji?
        // ...
        // if (next && next.voice.channel === null) {
        //   client.channels.cache.get(textChannelId).send(`${next}, you're getting skipped cuz you're not in the channel!`);
        //   skratchChannel.forfeitUser(next.id);
        // } else if (next && next.voice.channel) {
        //   // if they are in the channel, mute everyone else
        //   const vChannel = client.channels.cache.get(voiceChannelId);

        //   // vChannel.members.filter(m => m.id !== next.id).forEach(m => m.voice.setMute(true, 'not your turn'));
        //   // // unmute the next user
        //   // next.voice.setMute(false, 'your turn!');
        // }
      });

      newChannel.on('forfeitedUser', (userId) => {
        const user = client.users.cache.get(userId);
        client.channels.cache.get(textChannelId).send(`${user} was skipped because they were not in the skratch channel.`);
      });

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
    channel.joinQueue(msg.author.id);
    client.channels.cache.get(channel.tid).send(`${msg.author.username} was added to the queue at position ${channel.queue.length}.`);
  }],
  [`forfeit`, message => {
    const msg = /** @type {Discord.Message} */ (message);
    console.log('forfeit command', msg);
    // find the skratch channel
    if (!msg.member.voice.channel) {
      return msg.channel.send(`${msg.member}, you are not in line.`);
    }
    const channel = getSkratchChannel(msg.member.voice.channel.id);
    if (!channel) {
      return msg.channel.send(`${msg.member}, I can't find the channel!`);
    }
    channel.forfeitUser(msg.member.id);
  }],
  ['queue', message => {
    const msg = /** @type {Discord.Message} */ (message);
    console.log('queue command');
    const channel = getSkratchChannelByTextId(msg.channel.id);
    if (!channel) {
     return msg.channel.send(`this channel is not skratch enabled!`);
    }
    return msg.channel.send(`the queue length is ${channel.queue.length}.`);
  }],
  ['debug', message => {
    const msg = /** @type {Discord.Message} */ (message);
    // console.log('message', msg.member.voice.channel.members.forEach(m => m.voice.setMute(false, 'not your turn')));
    console.log('client.users.cache', client.users.cache.get(msg.member.id));
  }],
  ['fixmutes', message => {
    const msg = /** @type {Discord.Message} */ (message);
    console.log('unmuting all?');
    // TODO: unmute all channel users
  }],
  ['whosup', message => {
    const msg = /** @type {Discord.Message} */ (message);
    // send current user...
    // ...
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
  // TODO:
  // if the user is leaving the room, AND is the currentUser,
  // skip the channel to the next user.
  // ...
  console.log('voiceStateUpdate', oldState, newState);
  // determine if joining or leaving and if voice channel is skratchenabled
  // if joining, msg the user and tell them how it works
  // ...
  // if leaving, check to see if the
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
