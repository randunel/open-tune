'use strict';

let fs = require('fs');
let net = require('net');
let path = require('path');

module.exports = function constructor(opts) {
    let dir = opts.dir;
    let name = opts.name;

    return Object.freeze({
        init: init,
        wait: wait,
    });

    function init() {
        return new Promise((resolve, reject) => {
            let caller = _getCallerPath();
            fs.writeFile(caller, _getCallerSource(), {mode: '0777'}, err => {
                if (err) {
                    return reject(err);
                }
                resolve({
                    caller
                });
            });
        });
    }

    function _getCallerPath() {
        return path.join(dir, name + '.sh');
    }

    function wait() {
        return new Promise((resolve, reject) => {
            let server = net.createServer({
                allowHalfOpen: false
            }, client => {
                let message = '';
                client.on('end', () => {
                    server.close();
                    _cleanup();
                    resolve(JSON.parse(message));
                });
                client.on('data', data => message += data);
            });
            server.on('error', reject);
            server.listen(_getListenerPath());
        }).catch(err => {
            return _cleanup().then(() => {
                return Promise.reject(err);
            });
        });
    }

    function _cleanup() {
        return new Promise(resolve => {
            fs.unlink(_getCallerPath(), function(err) {
                err && console.error(err);
                resolve();
            });
        });
    }

    function _getListenerPath() {
        return path.join(dir, name + '.sock');
    }

    function _getCallerSource() {
        return `#!/usr/local/bin/node
        'use strict';
        let client = require('net').connect('${_getListenerPath()}', () => {
            client.write(JSON.stringify(process.env));
            client.end();
        });
        `;
    }
};

