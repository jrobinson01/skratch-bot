const EventEmitter = require('events');
import { machine, state } from 'fn-machine';

const STATES = {
  EMPTY: 'empty',
  MANY_USERS: 'many-users',
};

const EVENTS = {
  USER_SWITCH: 'user-switch',
}


class SkratchChannel extends EventEmitter {

  constructor(vid, tid, timeout = 5) {
    super();
    this.vid = vid;
    this.tid = tid;
    this.timeout = parseFloat(timeout);
    this.context = {
      queue: [],
    };
    this.initMachine();
    // start timer
    this.resume();
  }

  initMachine() {
    this.machine = machine([
      state(STATES.EMPTY, {
        addUser(detail, context) {
          const queue = context.queue.concat([detail.userId]);
          return {
            state: STATES.MANY_USERS,
            context: { ...context, ...{ queue } }
          }
        }
      }),
      state(STATES.MANY_USERS, {
        addUser(detail, context) {
          const queue = context.queue.concat([detail.userId]);
          return {
            state: STATES.MANY_USERS,
            context: { ...context, ...{ queue } }
          }
        },
        removeUser(detail, context) {
          const queue = context.queue.filter(u => u !== detail.userId);
          const newContext = { ...context, ...{ queue } };
          if (queue.length === 0) {
            return {
              state: STATES.EMPTY,
              context: newContext,
            }
          }
          return {
            state: STATES.MANY_USERS,
            context: newContext,
          }
        },
        timerFired(detail, context) {
          // when the timer fires, 
          // remove the first user from the queue.
          // advance to the empty, one-user or many-users state
          const queue = context.queue.slice(1);
          const newContext = { ...context, ...{ queue } };
          if (queue.length === 0) {
            return {
              state: STATES.EMPTY,
              context: newContext,
            }
          }
          return {
            state: STATES.MANY_USERS,
            context: { ...newContext, ...{ event: EVENTS.USER_SWITCH } },
          }
        }
      }, (context) => {
        return { ...context, ...{ event: undefined } };
      }),
    ], STATES.EMPTY, this.context, (newState) => {
      this.context = newState.context;
      this.currentState = newState.state;
      this.emit('state-change', this.currentState, this.context);
      if (this.context.event) {
        this.emit(this.context.event, this.context.queue);
      }
    });
  }

  addUser(userId) {
    if (userId) {
      this.machine('addUser', { userId });
    }
  }

  removeUser(userId) {
    if (userId) {
      this.machine('removeUser', { userId });
    }
  }

  pause() {
    clearInterval(this.timer);
  }

  resume() {
    // set timer
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.machine('timerFired');
    }, this.timeout * 60 * 1000);
  }

  setTimer(timeout) {
    this.timeout = parseFloat(timeout);
    this.resume();
  }

}

module.exports.SkratchChannel = SkratchChannel;
module.exports.STATES = STATES;
