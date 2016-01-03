'use strict';

let uuid = require('uuid');
let util = require('./util.js');
let spawn = require('child_process').spawn;
let createFifo = require('./fifo.js');

const CONNECTION_TIMEOUT = 20000;

module.exports = function constructor(params) {
    let config = params.config;
    let id = uuid.v4();
    let netnsName = 'netnsName';
    let workingDirectory = params.workingDirectory || '/tmp';

    return Object.freeze({
        create: create
    });

    function create() {
        let fifoUp = createFifo({
            dir: workingDirectory,
            name: id + '_route-up'
        });
        _getLock()
            .then(fifoUp.init)
            .then(() => {
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
            util.throwAfterTimeout(new Error('Timeout'), CONNECTION_TIMEOUT)
        ]).then(_setupNetwork).catch(err => {
            console.error(err);
            throw err;
        });
    }

    function _setupNetwork(env) {
        console.log('env is', env, Object.keys(env));
        let device = env.dev;
        let mtu = env.tun_mtu; // jshint ignore: line
        let localIp = env.ifconfig_local; // jshint ignore: line
        let localNetmask = env.route_netmask_1; // jshint ignore: line
        //localNetmask = 32; // 255.255.255.255 === 32
        let vpnGateway = env.route_gateway_1; // jshint ignore: line
        console.log(`localIp ${localIp}, localNetmask ${localNetmask}, vpnGateway ${vpnGateway}`);
        return util.exec(`ip netns del ${netnsName}`).catch(err => {
            console.log('netns del err', err);
        }).then(
            () => util.exec(`ip netns add ${netnsName}`)
        ).then(
            () => util.exec(`ip netns list`)
        ).then(
            res => console.log('netns list is', res)
        ).then(
            () => util.exec(`ip link add veth_main type veth peer name veth_nns`)
        ).then(
            () => util.exec(`ip link set veth_nns netns ${netnsName}`)
        ).then(
            () => util.exec(`ip addr add 169.255.255.1/30 dev veth_main`)
        ).then(
            () => util.exec(`ip link set veth_main up`)
        ).then(
            () => util.exec(`ip netns exec ${netnsName} ip addr add 169.255.255.2/30 dev veth_nns`)
        ).then(
            () => util.exec(`ip netns exec ${netnsName} ip link set up dev veth_nns`)
        ).then(
            () => util.exec(`ip netns exec ${netnsName} iptables -t nat -A POSTROUTING -s 169.255.255.1 -j MASQUERADE`)
        ).then(
            () => util.exec(`ip netns exec ${netnsName} sysctl net.ipv4.ip_forward=1`)
        ).then(
            () => util.exec(`ip netns exec ${netnsName} sysctl net.ipv4.conf.veth_nns.forwarding=1`)
        ).then(
            () => util.exec(`ip link add link wlan0 dev mvl_main type macvlan`)
        ).then(
            () => util.exec(`ip link set dev mvl_main address 00:00:00:00:00:01`)
        ).then(
            () => util.exec(`ip link set mvl_main netns ${netnsName}`)
        ).then(
            //() => util.exec(`ip netns exec ${netnsName}`)
        ).then(
            () => util.exec(`ip netns exec ${netnsName} ip link set dev lo up`)
        ).then(
            () => util.exec(`ip link set dev ${device} up netns ${netnsName} mtu ${mtu}`)
        ).then(
            () => util.exec(`ip netns exec ${netnsName} ip addr add dev ${device} ${localIp}/${localNetmask} peer ${vpnGateway}`)
        ).then(
            () => util.exec(`ip netns exec ${netnsName} ip route add default via ${vpnGateway}`)
        ).then(
            () => util.exec(`echo asdqq`)
        ).catch(err => console.log('_setupNetwork caught', err) && err);
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

    function _getLock() {
        // TODO(ac): lock
        return Promise.resolve();
    }

    //function _disableIPFiltering(deviceName) {
    //    return new Promise((resolve, reject) => {
    //        fs.appendFile('/proc/sys/net/ipv4/conf/' + deviceName + '/rp_filter', '0', function(err) {
    //            if (err) {
    //                reject(err);
    //            } else {
    //                resolve();
    //            }
    //        });
    //    });
    //}

};

