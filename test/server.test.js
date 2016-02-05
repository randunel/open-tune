'use strict';

let should = require('should'); // jshint ignore: line
let dgram = require('dgram');
let server = require('../').server;
let client = require('../').client;
let util = require('../lib/util.js');

const pathCA = 'test-assets/root.crt';
const pathCERT = 'test-assets/server.crt';
const pathKEY = 'test-assets/server.key';
const pathDH = 'test-assets/dh1024.pem';
const pathClientCERT = 'test-assets/client.crt';
const pathClientKEY = 'test-assets/client.key';

describe('openvpn server', function() {
    // this.timeout(1000000);
    before(() => createServerCerts().then(createClientCerts));
    after(() => removeCerts());
    afterEach(() => util.exec('node dev/cleanup.js'));

    it('should accept client connections', () => server({pathCA, pathCERT, pathKEY, pathDH})
        .then(data => client({
            remote: `${data.nns.config.ipNNS} 1194`,
            proto: 'udp',
            dev: 'tun',
            ca: pathCA,
            cert: pathClientCERT,
            key: pathClientKEY
        })));

    it('should route clients', () => {
        let sv, cl, listen;
        return Promise.all([
            server({pathCA, pathCERT, pathKEY, pathDH})
                .then(_sv => (sv = _sv) && client({
                    remote: `${_sv.nns.config.ipNNS} 1194`,
                    proto: 'udp',
                    dev: 'tun',
                    ca: pathCA,
                    cert: pathClientCERT,
                    key: pathClientKEY
                }))
                .then(_cl => (cl = _cl) && console.log('got client', cl)),
            startListening()
                .then(_li => listen = _li)
        ])
            .then(() => {
                cl.nns.execNoWait(`nc -w1 -u ${listen.address} ${listen.port}`).stdin.write('asd\r\n');
            })
            // .then(() => new Promise(() => {}));
    });
});

function createServerCerts() {
    return util.exec('mkdir ./test-assets')
        .catch()
        .then(() => util.exec('../node_modules/.bin/2cca root', {cwd: './test-assets'}))
        .then(() => util.exec('../node_modules/.bin/2cca server', {cwd: './test-assets'}))
        .then(() => util.exec('../node_modules/.bin/2cca dh 1024', {cwd: './test-assets'}));
}

function createClientCerts() {
    return util.exec('../node_modules/.bin/2cca client', {cwd: './test-assets'});
}

function removeCerts() {
    return util.exec('rm -r ./test-assets');
}

function startListening() {
    return new Promise((resolve, reject) => {
        const listen = {
            port: 44044,
            address: '192.168.1.12'
        };
        const server = dgram.createSocket('udp4', resolve(listen));
        server.bind(listen);
        server.on('error', reject);
        server.on('message', (msg, rinfo) => {
            console.log(msg, rinfo);
        });
    });
}

