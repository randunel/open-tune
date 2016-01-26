'use strict';

var should = require('should');
var createFifo = require('../lib/fifo.js');
var util = require('../lib/util.js');

describe('fifo', () => {
    it('should cleanup', () => {
        createFifo({
            dir: '/tmp',
            name: 'test-fifo'
        })
            .then(res => {
                util.exec(res.caller);
                return res
                    .wait()
                    .then(() => util.exec('ls /tmp'))
                    .then(list => list.should.not.containEql('test-fifo.sh'));
            });
    });

    it('should work', () => {
        let opts = {env: {hello: 'world'}};
        createFifo({
            dir: '/tmp',
            name: 'test-fifo'
        })
            .then(res => {
                util.exec(res.caller, opts);
                return res
                    .wait()
                    .then(data => should.exist(data.hello) && data.hello.should.equal('world'));
            });
    });
});

