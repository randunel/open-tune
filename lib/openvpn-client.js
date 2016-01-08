'use strict';

let uuid = require('uuid');
let spawn = require('child_process').spawn;
let util = require('./util.js');
let createFifo = require('./fifo.js');
let netns = require('./netns.js');

const CONNECTION_TIMEOUT = 20000;

module.exports = function constructor(params) {
    let config = params.config;
    let id = uuid.v4();
    let workingDirectory = params.workingDirectory || '/tmp';
    let _destroy = () => Promise.reject(new Error('You need to connect first'));

    return Object.freeze({
        create,
        destroy,
        id
    });

    function destroy() {
        return _destroy();
    }

    function create() {
        let fifoUp = createFifo({
            dir: workingDirectory,
            name: id + '_route-up'
        });
        return fifoUp.init().then(opts => {
            let proc = spawn('openvpn', _makeParams({
                caller: opts.caller
            }));
            //proc.stderr.on('data', chunk => console.error(`${id} error: ${chunk.toString()}`));
            //proc.stdout.on('data', chunk => console.log(`${id}: ${chunk.toString()}`));
            //proc.stdout.on('end', () => console.log(`${id} exited.`));

            return Promise.race([
                fifoUp.wait(),
                util.throwAfterTimeout(new Error('Timeout waiting for openvpn startup'), CONNECTION_TIMEOUT)
            ]).then(_setupNetwork).then(nns => {
                _destroy = _getDisconnectMethod({
                    proc,
                    nns
                });
                return {
                    name: nns.name,
                    vethDefault: nns.vethDefault,
                    vethNNS: nns.vethNNS,
                    netmask: nns.netmask,
                    network: nns.network,
                    ipDefault: nns.ipDefault,
                    ipNNS: nns.ipNNS,
                    broadcast: nns.broadcast
                };
            });
        });
    }

    function _getDisconnectMethod(params) {
        let proc = params.proc;
        let nns = params.nns;
        return function() {
            proc.kill('SIGHUP');
            proc.on('error', () => util.exec(`kill -9 ${proc.pid}`));
            return netns.destroy(nns);
        };
    }

    function _setupNetwork(env) {
        let device = env.dev;
        let mtu = env.tun_mtu; // jshint ignore: line
        let localIp = env.ifconfig_local; // jshint ignore: line
        let localNetmask = env.route_netmask_1; // jshint ignore: line
        let vpnGateway = env.route_gateway_1; // jshint ignore: line

        return netns.getUnusedNNS().then(
            nns => netns.setupNNS(nns).then(
                () => util.exec(`ip link set dev ${device} up netns ${nns.name} mtu ${mtu}`)
            ).then(
                () => util.exec(`ip netns exec ${nns.name} ip addr add dev ${device} ${localIp}/${localNetmask} peer ${vpnGateway}`)
            ).then(
                () => util.exec(`ip netns exec ${nns.name} ip route add default via ${vpnGateway}`)
            ).then(
                () => nns
            )
        );
    }

    function _makeParams(opts) {
        let commandParams = [
            '--script-security', 2,
            '--topology', 'subnet',
            '--ifconfig-noexec',
            '--route-noexec',
            '--route-up', opts.caller,
        ];
        if (config) {
            commandParams.push('--config');
            commandParams.push(config);
        }
        return commandParams;
    }
};

