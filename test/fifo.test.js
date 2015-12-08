'use strict';

var should = require('should');
var makeFifo = require('../lib/fifo.js');
var util = require('../lib/util.js');

describe('fifo', function() {

    it('should work', function() {
        let fifo = makeFifo({
            dir: __dirname + '/../work/',
            id: 'test-fifo'
        });
        let opts = {env: {hello: 'world'}};
        fifo.init().then(() => util.run(fifo.getCallerPath(), [], opts));
        return fifo.wait()
            .then(data => {
                should.exist(data);
                data.hello.should.equal('world');
            });
    });

});

