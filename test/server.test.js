'use strict';

const should = require('should'); // jshint ignore: line
const dgram = require('dgram');
const server = require('../').server;
const client = require('../').client;
const util = require('../lib/util.js');

const pathCA = 'test-assets/root.crt';
const pathCERT = 'test-assets/server.crt';
const pathKEY = 'test-assets/server.key';
const pathDH = 'test-assets/dh1024.pem';
const pathClient1CERT = 'test-assets/client1.crt';
const pathClient1KEY = 'test-assets/client1.key';
const pathClient2CERT = 'test-assets/client2.crt';
const pathClient2KEY = 'test-assets/client2.key';

describe.only('openvpn server', function() {
    // this.timeout(1000000);
    before(() => createServerCerts().then(createClientCerts));
    after(() => removeCerts());
    afterEach(() => util.exec('node dev/cleanup.js'));

    it('should accept client connections', () => server({
        pathCA,
        pathCERT,
        pathKEY,
        pathDH,
        network: '10.11.12.0 255.255.255.0',
        port: 1194
    })
        .then(data => client({
            remote: `${data.nns.config.ipNNS} 1194`,
            proto: 'udp',
            dev: 'tun',
            ca: pathCA,
            cert: pathClient1CERT,
            key: pathClient1KEY
        })));

    it('should route clients', () => {
        let sv, cl, listen;
        return Promise.all([
            server({
                pathCA,
                pathCERT,
                pathKEY,
                pathDH,
                network: '10.11.12.0 255.255.255.0',
                port: 1194
            })
                .then(_sv => (sv = _sv) && client({
                    remote: `${_sv.nns.config.ipNNS} 1194`,
                    proto: 'udp',
                    dev: 'tun',
                    ca: pathCA,
                    cert: pathClient1CERT,
                    key: pathClient1KEY,
                    nns: {
                        noImmediateRouting: true
                    }
                }))
                .then(_cl => (cl = _cl)),
            startListening()
                .then(_li => listen = _li)
        ])
            .then(() => {
                cl.nns.execNoWait(`nc -w1 -u ${listen.address} ${listen.port}`).stdin.write('asd\r\n');
            })
            .then(() => listen.getPacketSource)
            .then(source => source.should.equal(sv.nns.config.ipNNS));
    });

    it('should let clients see each other', () => server({
        pathCA,
        pathCERT,
        pathKEY,
        pathDH,
        network: '10.11.12.0 255.255.255.0',
        port: 1194
    })
        .then(sv => {
            let cl1, cl2;
            return client({
                remote: `${sv.nns.config.ipNNS} 1194`,
                proto: 'udp',
                dev: 'tun',
                ca: pathCA,
                cert: pathClient1CERT,
                key: pathClient1KEY,
                nns: {
                    noImmediateRouting: true
                }
            })
                .then(_cl => (cl1 = _cl))
                .then(() => client({
                    remote: `${sv.nns.config.ipNNS} 1194`,
                    proto: 'udp',
                    dev: 'tun',
                    ca: pathCA,
                    cert: pathClient2CERT,
                    key: pathClient2KEY,
                    nns: {
                        noImmediateRouting: true
                    }
                }))
                .then(_cl => (cl2 = _cl))
                .then(() => cl1.nns.exec(`ping -c 1 ${cl2.config.ip}`))
                .then(output => output.should.match(/1\s(packets |)received/))
                .then(() => cl2.nns.exec(`ping -c 1 ${cl1.config.ip}`))
                .then(output => output.should.match(/1\s(packets |)received/));
        }));
});

function createServerCerts() {
    return util.exec('mkdir ./test-assets')
        .then(() => util.exec('../node_modules/.bin/2cca dh 1024', {cwd: './test-assets'}))
        .then(() => util.exec('../node_modules/.bin/2cca root', {cwd: './test-assets'}))
        .then(() => util.exec('../node_modules/.bin/2cca server', {cwd: './test-assets'}))
        .catch(() => {});
}

function createClientCerts() {
    return Promise.all([
        util.exec('../node_modules/.bin/2cca client CN=client1', {cwd: './test-assets'}),
        util.exec('../node_modules/.bin/2cca client CN=client2', {cwd: './test-assets'}),
    ]);
}

function removeCerts() {
    return util.exec('rm -r ./test-assets');
}

function startListening() {
    return new Promise((resolve, reject) => {
        let _resolve = Promise.reject(new Error('No packets received'));
        const listen = {
            port: 44044,
            address: '192.168.1.12',
            getPacketSource: new Promise(resolve => _resolve = resolve)
        };
        const server = dgram.createSocket('udp4', resolve(listen));
        server.bind(listen);
        server.on('error', reject);
        server.on('message', (msg, rinfo) => {
            _resolve(rinfo.address);
        });
    });
}

