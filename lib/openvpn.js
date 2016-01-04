'use strict';

let uuid = require('uuid');
let util = require('./util.js');
let spawn = require('child_process').spawn;
let createFifo = require('./fifo.js');

const CONNECTION_TIMEOUT = 20000;

module.exports = function constructor(params) {
    let config = params.config;
    let id = uuid.v4();
    let netnsName = 'ovpn2';
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

    function _initNetworkNamespace() {
        let vethMain = `veth_${netnsName}`;
        let vethNNS = 'veth0';
        let ipMain = '169.0.0.1';
        let ipNNS = '169.255.255.1';
        return util.exec(`ip netns del ${netnsName}`).catch(err => {
            // Clean up network namespace in case it already exists. Start fresh.
            console.log('netns del err', err);
        }).then(
            // Create network namespace
            () => util.exec(`ip netns add ${netnsName}`)
        ).then(
            // Set up loopback interface. This step is optional, but some
            // programs may exhibit unexpected behaviour should one not exist
            () => util.exec(`ip netns exec ${netnsName} ip link set dev lo up`)
        ).then(
            // Set up a veth pair
            () => util.exec(`ip link add ${vethMain} type veth peer name ${vethNNS}`)
        ).then(
            // Move a veth endpoint to the network namespace
            () => util.exec(`ip link set ${vethNNS} netns ${netnsName}`)
        ).then(
            // Assign static ip address to veth outside namespace
            () => util.exec(`ip addr add ${ipMain}/32 dev ${vethMain}`)
        ).then(
            () => util.exec(`ip link set ${vethMain} up`)
        ).then(
            // Assign static ip address to veth inside network namespace
            () => util.exec(`ip netns exec ${netnsName} ip addr add ${ipNNS}/32 dev ${vethNNS}`)
        ).then(
            () => util.exec(`ip netns exec ${netnsName} ip link set up dev ${vethNNS}`)
        ).then(
            // Enable routing inside network namespace for packets from the outside
            () => util.exec(`ip netns exec ${netnsName} iptables -t nat -A POSTROUTING -s ${ipMain} -j MASQUERADE`)
        ).then(
            // Allow packets forwarding
            () => util.exec(`ip netns exec ${netnsName} sysctl net.ipv4.ip_forward=1`)
        ).then(
            () => util.exec(`ip netns exec ${netnsName} sysctl net.ipv4.conf.${vethNNS}.forwarding=1`)
        ).then(
            // Path from default to namespace address
            () => util.exec(`ip route add ${ipNNS}/32 dev ${vethMain}`)
        ).then(
            // Path from namespace to default
            () => util.exec(`ip netns exec ${netnsName} ip route add ${ipMain}/32 dev ${vethNNS}`)
        ).then(
            // Get default routes to the outside world.
            //
            // In order to allow programs running inside the network namespace
            // to access the real gateway and the local network, the route must
            // be set explicitly inside the nns
            () => util.exec(`ip route get 128.0.0.0/1`)
        ).then(
            route => {
                if (!route || route.indexOf('via') === -1) {
                    return;
                }
                let immediateGateway = route.split('via ')[1].split(' ')[0];
                if (!immediateGateway) {
                    console.error(`Could not extract gateway from ${route}.`);
                    return;
                }
                immediateGateway = immediateGateway.trim();
                return util.exec(`ip route show match ${immediateGateway}`).then(
                    route => {
                        let srcLine = route.split('\n').find(line => line.indexOf(' src ') > -1);
                        if (!srcLine) {
                            console.error(`Could not extract src from ${route}.`);
                            return;
                        }
                        let immediateNetwork = srcLine.trim().split(' ')[0];
                        // TODO: fix, this route doesn't do anything
                        return util.exec(`ip netns exec ${netnsName} ip route add ${immediateNetwork} dev ${vethNNS}`);
                    }
                );
            }
        );
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
        return _initNetworkNamespace().then(
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

