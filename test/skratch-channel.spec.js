const expect = require('chai').expect;
const sinon = require('sinon');
const { SkratchChannel, STATES } = require('../skratch-channel.js');

describe('creation', function () {
  const sk = new SkratchChannel('voice', 'text', 5);
  it('should set properties', function () {
    expect(sk.vid).to.equal('voice');
    expect(sk.tid).to.equal('text');
    expect(sk.timeout).to.equal(5);
    expect(sk.context.queue.length).to.equal(0);
  });
});

describe('states', function () {
  const sk = new SkratchChannel('voice', 'text', 5);
  it('should add a user from the empty state and advance to the many-users state', function () {
    sk.machine('addUser', { userId: 'user1' });
    expect(sk.context.queue.length).to.equal(1);
    expect(sk.context.queue[0]).to.equal('user1');
    expect(sk.currentState).to.equal(STATES.MANY_USERS);
  });
  it('should remove users and advance to the empty state', function () {
    sk.machine('removeUser', { userId: 'user1' });
    expect(sk.context.queue.length).to.equal(0);
    expect(sk.currentState).to.equal(STATES.EMPTY);
  });
  it('should not respond to the timer-fired event', function () {
    sk.machine('timerFired');
    expect(sk.currentState).to.equal(STATES.EMPTY);
  })
  it('should continue to add users in the many-users state', function () {
    sk.machine('addUser', { userId: 'user1' });
    sk.machine('addUser', { userId: 'user2' });
    expect(sk.context.queue.length).to.equal(2);
    expect(sk.currentState).to.equal(STATES.MANY_USERS);
  });
  it('should respond to the timer-fired event', function () {
    sk.machine('timerFired');
    expect(sk.context.queue.length).to.equal(1);
    expect(sk.currentState).to.equal(STATES.MANY_USERS);
    expect(sk.context.queue[0]).to.equal('user2');
  });
  it('should return to the empty state', function () {
    sk.machine('timerFired');
    expect(sk.context.queue.length).to.equal(0);
    expect(sk.currentState).to.equal(STATES.EMPTY);
  });
  it('should emit state-change events', function (done) {
    sk.once('state-change', function (currentState, context) {
      console.log('state-change', currentState);
      expect(currentState).to.equal(sk.currentState);
      expect(context).to.equal(sk.context);
      done();
    });
    sk.machine('addUser', { userId: 'user1' });
  });
});

