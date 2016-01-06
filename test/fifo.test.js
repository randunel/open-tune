'use strict';

var should = require('should');
var createFifo = require('../lib/fifo.js');
var util = require('../lib/util.js');

describe('fifo', () => {
    it('should cleanup', () => {
        let fifo = createFifo({
            dir: '/tmp',
            name: 'test-fifo'
        });
        fifo.init().then(() => util.exec(fifo.getCallerPath()));
        return fifo.wait()
        .then(() => util.exec('ls /tmp'))
        .then(list => list.should.not.containEql('test-fifo.sh'));
    });

    it('should work', () => {
        let fifo = createFifo({
            dir: '/tmp',
            name: 'test-fifo'
        });
        let opts = {env: {hello: 'world'}};
        fifo.init().then(() => util.exec(fifo.getCallerPath(), opts));
        return fifo.wait().then(
            data => should.exist(data.hello) && data.hello.should.equal('world')
        );
    });
});

