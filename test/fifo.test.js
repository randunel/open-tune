'use strict';

var should = require('should');
var createFifo = require('../lib/fifo.js');
var util = require('../lib/util.js');

describe('fifo', function() {

    it('should work', function() {
        let fifo = createFifo({
            dir: '/tmp',
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

