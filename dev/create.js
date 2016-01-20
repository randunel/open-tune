'use strict';

let client = require('../').client;

let vpn = client(getIntegrationTestConfig());

vpn.create().then(
    data => {
        console.log(data);
    }
);

function getIntegrationTestConfig() {
    // TODO(me): grab params env
    return {
        workingDirectory: '/tmp',
        config: './client-anatoliy.ovpn'
    };
}

var signals = {
    'SIGINT': 2,
    'SIGTERM': 15
};

function shutdown(signal, value) {
    vpn.destroy().then(() => {
        process.exit(value);
    });
}

Object.keys(signals).forEach(function (signal) {
    process.on(signal, function () {
        shutdown(signal, signals[signal]);
    });
});
