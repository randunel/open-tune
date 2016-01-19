'use strict';

// var should = require('should');
let server = require('../').server;
let util = require('../lib/util');

describe.only('open-tune server', function() {
    before(() => util.exec('node dev/cleanup.js').then(
        () => util.exec(`cc -o /tmp/2cca ${__dirname}/../node_modules/2cca/2cca.c -lcrypto`)
    ).then(
        () => util.exec('/tmp/2cca root', {cwd: '/tmp'})
    ).then(
        () => util.exec('/tmp/2cca server', {cwd: '/tmp'})
    ).then(
        () => util.exec('/tmp/2cca dh 512', {cwd: '/tmp'})
    ));
    afterEach(() => util.exec('node dev/cleanup.js'));
    after(() => Promise.resolve().then(
        () => util.exec('rm /tmp/root.crt')
    ).then(
        () => util.exec('rm /tmp/root.key')
    ).then(
        () => util.exec('rm /tmp/server.crt')
    ).then(
        () => util.exec('rm /tmp/server.key')
    ).then(
        () => util.exec('rm /tmp/dh512.pem')
    ));

    it('should work', () => {
        let s = server({
            ca: '/tmp/root.crt',
            cert: '/tmp/server.crt',
            key: '/tmp/server.key',
            dh: '/tmp/dh512.pem',
            network: '10.11.12.0',
            netmask: '255.255.255.0'
        });
        return s.create().then(() => {
            console.log('created');
        });
    });
});

