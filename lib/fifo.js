'use strict';

let fs = require('fs');
let net = require('net');
let path = require('path');

let fifo = (opts) => {
    let name = opts.name;
    let dir = opts.dir;

    return new Promise((resolve, reject) => {
        let caller = getCallerPath();
        fs.writeFile(caller, getCallerSourceCode(), {mode: '0777'}, err => {
            if (err) {
                return reject(err);
            }
            resolve({
                caller,
                wait
            });
        });
    });

    function wait() {
        return new Promise((resolve, reject) => {
            let server = net.createServer({
                allowHalfOpen: false
            }, client => {
                let message = '';
                client.on('end', () => {
                    server.close();
                    cleanup();
                    resolve(JSON.parse(message));
                });
                client.on('data', data => message += data);
            });
            server.on('error', reject);
            server.listen(getListenerPath());
        }).catch(err => {
            return cleanup().then(() => {
                return Promise.reject(err);
            });
        });
    }

    function getCallerPath() {
        return path.join(dir, name + '.sh');
    }

    function getCallerSourceCode() {
        return `#!/usr/local/bin/node
        'use strict';
        let client = require('net').connect('${getListenerPath()}', () => {
        client.write(JSON.stringify(process.env));
        client.end();
        });
        `;
    }

    function getListenerPath() {
        return path.join(dir, name + '.sock');
    }

    function cleanup() {
        return new Promise(resolve => {
            fs.unlink(getCallerPath(), function(err) {
                err && console.error(err);
                resolve();
            });
        });
    }
};

module.exports = Object.freeze(fifo);

