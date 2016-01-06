'use strict';

let netns = require('../lib/netns');
let util = require('../lib/util');

describe('getUnusedNNS', () => {
    describe('in clean state', () => {
        before(() => util.exec('node dev/cleanup.js'));

        it('should start counter with 0', () => netns.getUnusedNNS().then(
            nns => {
                nns.name.should.equal('ot0');
            }
        ));

        it('should start network pool with .1.0', () => netns.getUnusedNNS().then(
            nns => {
                nns.network.should.equal('169.254.1.0');
            }
        ));
    });

    describe('when one network exists', () => {
        before(() => netns.getUnusedNNS().then(netns.setupNNS));
        after(() => util.exec('node dev/cleanup.js'));

        it('should continue counter with 1', () => netns.getUnusedNNS().then(
            nns => {
                nns.name.should.equal('ot1');
            }
        ));

        it('should continue network pool with .1.4', () => netns.getUnusedNNS().then(
            nns => {
                nns.network.should.equal('169.254.1.4');
            }
        ));
    });

    describe('when 2 networks exists', () => {
        before(() => netns.getUnusedNNS()
            .then(netns.setupNNS)
            .then(netns.getUnusedNNS)
            .then(netns.setupNNS));
        after(() => util.exec('node dev/cleanup.js'));

        it('should continue counter with 2', () => netns.getUnusedNNS().then(
            nns => {
                nns.name.should.equal('ot2');
            }
        ));

        it('should continue network pool with .1.8', () => netns.getUnusedNNS().then(
            nns => {
                nns.network.should.equal('169.254.1.8');
            }
        ));
    });
});

describe('setupNNS', () => {
    before(() => util.exec('node dev/cleanup.js'));
    afterEach(() => util.exec('node dev/cleanup.js'));

    it('should create a network namespace', () => netns.setupNNS(getNNSParams()).then(
        () => util.exec('ip netns show').then(list => {
            list.should.containEql('ot99');
        })
    ));

    describe('network namespace', () => {
        it('should access physical interface', () => netns.setupNNS(getNNSParams()).then(
            () => util.exec('ip route get 8.8.8.8')
        ).then(
            output => util.exec(`ip netns exec ot99 ping -c 1 ${output.split('via ')[1].split(' ')[0]}`)
        ).then(
            output => output.should.containEql('1 received')
        ));
    });

    function getNNSParams() {
        let n = 99;
        return {
            name: `ot${n}`,
            vethDefault: `veth_ot${n}`,
            vethNNS: 'veth0',
            netmask: 30,
            network: '169.254.1.252',
            ipDefault: '169.254.1.253',
            ipNNS: '169.254.1.254',
            broadcast: '169.254.1.255'
        };
    }
});

