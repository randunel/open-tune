'use strict';

// var should = require('should');
let client = require('../').client;
let util = require('../lib/util');

describe('openvpn client', function() {
    describe('create', () => {
        before(() => util.exec('node dev/cleanup.js'));
        afterEach(() => util.exec('node dev/cleanup.js'));

        it('should set up a working connection', () => {
            return client(getIntegrationTestConfig()).create().then(
                data => util.exec(`ip netns exec ${data.nns.name} ping -c 1 8.8.8.8`)
            ).then(
                res => res.should.containEql('1 packet')
            );
        });

        it('should allow default nns to use new connection ICMP', () => {
            return client(getIntegrationTestConfig()).create().then(
                data => util.exec(`ping -I ${data.nns.vethDefault} -c 1 8.8.8.8`)
            ).then(
                res => res.should.containEql('1 packet')
            );
        });

        it('should allow default nns to use new connection UDP', () => {
            return client(getIntegrationTestConfig()).create().then(
                data => util.exec(`traceroute -i ${data.nns.vethDefault} -n -w 1 -U 8.8.8.8`)
            ).then(
                res => res.should.containEql(' ms')
            );
        });

        it('should allow default nns to use new connection TCP', () => {
            return client(getIntegrationTestConfig()).create().then(
                data => util.exec(`traceroute -i ${data.nns.vethDefault} -n -w 1 -T 8.8.8.8`)
            ).then(
                res => res.should.containEql(' ms')
            );
        });
    });

    describe('destroy', () => {
        afterEach(() => util.exec('node dev/cleanup.js'));

        it('should destroy the netns', () => {
            let openvpn = client(getIntegrationTestConfig());
            return openvpn.create().then(
                data => openvpn.destroy().then(
                    () => util.exec(`ip netns list`)
                ).then(
                    list => list.should.not.containEql(data.nns.name)
                )
            );
        });

        it('should kill the openvpn process', () => {
            let openvpn = client(getIntegrationTestConfig());
            return openvpn.create().then(
                () => openvpn.destroy().then(
                    () => util.exec(`ps aux`)
                ).then(
                    list => list.should.not.containEql(openvpn.id)
                )
            );
        });
    });
});

function getIntegrationTestConfig() {
    // TODO(me): grab params env
    return {
        workingDirectory: '/tmp',
        config: '/home/mihai/.openvpn/lenovo.ovpn'
    };
}

