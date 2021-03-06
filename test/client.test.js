'use strict';

var should = require('should'); // jshint ignore: line
let client = require('../').client;
let util = require('../lib/util');

describe('openvpn client', function() {
    describe('create', () => {
        before(() => util.exec('node dev/cleanup.js'));
        afterEach(() => util.exec('node dev/cleanup.js'));

        it('should set up a working connection', () => client(getConfigPath())
            .then(ot => util.exec(`ip netns exec ${ot.nns.config.name} ping -c 1 8.8.8.8`))
            .then(res => res.should.containEql('1 received')));

        it('should allow default nns to use new connection ICMP', () => client(getConfigPath())
            .then(ot => util.exec(`traceroute -i ${ot.nns.config.vethDefault} -n -w 1 -I 8.8.8.8`))
            .then(res => res.should.containEql(' ms')));

        it('should allow default nns to use new connection UDP', () => client(getConfigPath())
            .then(ot => util.exec(`traceroute -i ${ot.nns.config.vethDefault} -n -w 1 -U 8.8.8.8`))
            .then(res => res.should.containEql(' ms')));

        it('should allow default nns to use new connection TCP', () => client(getConfigPath())
            .then(ot => util.exec(`traceroute -i ${ot.nns.config.vethDefault} -n -w 1 -T 8.8.8.8`))
            .then(res => res.should.containEql(' ms')));

        it('should allow creation with certificates as params', () => client(require('./openvpn-cfg.js').pki)
            .then(ot => util.exec(`ip netns exec ${ot.nns.config.name} ping -c 1 8.8.8.8`))
            .then(res => res.should.containEql('1 received')));

        it('should allow login with userpass', () => client(require('./openvpn-cfg.js').userpass)
            .then(ot => util.exec(`ip netns exec ${ot.nns.config.name} ping -c 1 8.8.8.8`))
            .then(res => res.should.containEql('1 received')));
    });

    describe('destroy', () => {
        afterEach(() => util.exec('node dev/cleanup.js'));

        it('should destroy the netns', () => client(getConfigPath())
            .then(ot => ot.destroy()
                .then(() => util.exec(`ip netns list`))
                .then(list => list.should.not.containEql(ot.nns.name))));

        it('should kill the openvpn process', () => client(getConfigPath())
            .then(ot => ot.destroy()
                .then(() => util.exec(`ps aux`))
                .then(list => list.should.not.containEql(ot.id))));
    });
});

function getConfigPath() {
    let config = process.env.OPENVPN_CONFIG_PATH;
    if (!config) {
        throw new Error('Specify OPENVPN_CONFIG_PATH env variable to run tests');
    }
    return {config};
}

