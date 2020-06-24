const expect = require('chai').expect;
const sinon = require('sinon');
const SkratchChannel = require('../skratch-channel.js');

describe('creation', function() {
  const sk = new SkratchChannel('voice', 'text', 5);
  it('should set properties', function() {
    expect(sk.vid).to.equal('voice');
    expect(sk.tid).to.equal('text');
    expect(sk.timeLimit).to.equal(5);
    expect(sk.queue.length).to.equal(0);
  });
});

describe('joining the queue', function() {
  it('')
});

