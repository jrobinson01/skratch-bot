const EventEmitter = require('events');

const minQueueLength = 1;// set to 1 in production

class SkratchChannel extends EventEmitter {
  constructor(voiceChannelId, textChannelId, timeLimit = 5) {
    super();
    this.vid = voiceChannelId;
    this.tid = textChannelId;
    this.queue = [];
    this.timeLimit = parseFloat(timeLimit);// minutes
    this.timer = null;
    this.currentUser = null;
  }

  kill() {
    clearTimeout(this.timer);
    this.timer = null;
    this.emit('killed', this.vid, this.tid);
    this.removeAllListeners();
  }

  joinQueue(userId) {
    console.log('joinQueue called', userId);
    if (this.queue.includes(userId)) {
      // user already in the queue
      return null;
    }

    // add the user to the queue
    this.queue.push(userId);
    console.log('added user to queue:', userId, this.queue);
    // if the queue is empty, start the timer
    if (this.queue.length === 0) {
      this.startTimer();
    }    // dispatch an event
    this.emit('joined', this.vid, userId);
  }

  startTimer() {
    clearTimeout(this.timer);
    const next = this.queue[0];
    console.log('setting timer', next);
    this.timer = setTimeout(() => this.nextUser(), this.timeLimit * 60 * 1000);
    // dispatch an event
    this.emit('timerStarted', this.vid, this.timeLimit, next);
  }

  nextUser() {
    // if there's only one user in the queue, let them continue until there is a new user added.
    // if a new user is added, and a timer is not already running, start the timer.
    console.log('nextUser called', this.queue);
    // get the next user from the queue
    const next = this.queue.shift();

    // if there is a next user set the currentUser
    if (next) {
      this.currentUser = next;
      // dispatch event with previous and next user
      this.emit('nextUser', this.vid, next, this.currentUser);
    }
    // if there is still a queue, set the timer
    if (this.queue.length > 0) {
      console.log('restarting timer', this.queue);
      this.startTimer();
    } else {
      this.emit('queueEmpty', this.vid, this.queue, this.currentUser);
    }
  }

  forfeitUser(userId) {
    if (this.queue.includes(userId)) {
      this.queue = this.queue.filter(u => u !== userId);
      clearTimeout(this.timer);
      this.nextUser();
      this.emit('forfeitedUser', this.vid, userId);
    }
  }
}

module.exports = SkratchChannel;
