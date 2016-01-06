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
    let netnsName;
    let workingDirectory = params.workingDirectory || '/tmp';

    return Object.freeze({
        create: create
    });

    function create() {
        let fifoUp = createFifo({
            dir: workingDirectory,
            name: id + '_route-up'
        });
        fifoUp.init().then(() => {
            console.log('runnin openvpn');
            let proc = spawn('openvpn', _makeParams({
                routeUp: fifoUp
            }));
            proc.stderr.on('data', chunk => {
                console.error('openvpn.error:', chunk.toString());
            });
            proc.stdout.on('data', chunk => {
                console.log('openvpn.log:', chunk.toString());
            });
            proc.stdout.on('end', () => {
                // this is the point where openvpn terminates
                console.log(`${id} exited.`);
            });
        });

        return Promise.race([
            fifoUp.wait(),
            util.throwAfterTimeout(new Error('fifoUp timeout'), CONNECTION_TIMEOUT)
        ]).then(_setupNetwork).catch(err => {
            console.error(err);
            throw err;
        });
    }

    function _setupNetwork(env) {
        let device = env.dev;
        let mtu = env.tun_mtu; // jshint ignore: line
        let localIp = env.ifconfig_local; // jshint ignore: line
        let localNetmask = env.route_netmask_1; // jshint ignore: line
        let vpnGateway = env.route_gateway_1; // jshint ignore: line
        console.log(`localIp ${localIp}, localNetmask ${localNetmask}, vpnGateway ${vpnGateway}`);

        return netns.getUnusedNNS().then(netnsData => {
            netnsName = netnsData.name;
            return netnsData;
        }).then(netns.setupNNS).then(
            () => util.exec(`ip link set dev ${device} up netns ${netnsName} mtu ${mtu}`)
        ).then(
            () => util.exec(`ip netns exec ${netnsName} ip addr add dev ${device} ${localIp}/${localNetmask} peer ${vpnGateway}`)
        ).then(
            () => util.exec(`ip netns exec ${netnsName} ip route add default via ${vpnGateway}`)
        );
    }

    function _makeParams(opts) {
        let commandParams = [
            '--script-security', 2,
            '--topology', 'subnet',
            '--ifconfig-noexec',
            '--route-noexec',
            '--route-up', opts.routeUp.getCallerPath(),
        ];
        if (config) {
            commandParams.push('--config');
            commandParams.push(config);
        }
        console.log(commandParams.join(' '));
        return commandParams;
    }
};

