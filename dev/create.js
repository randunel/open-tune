'use strict';

let client = require('../').client;

client('./openvpn-config.ovpn')
    .then(ot => {
        console.log('Should be connected', ot);

        var signals = {
            'SIGINT': 2,
            'SIGTERM': 15
        };

        Object.keys(signals).forEach(signal =>
            process.on(signal, () => shutdown(signal, signals[signal]))
        );

        function shutdown(signal, value) {
            ot.destroy().then(() => {
                process.exit(value);
            });
        }
    })
    .catch(err => {
        console.error(err);
    });

