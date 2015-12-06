'use strict';

var uuid = require('uuid');
var fs = require('fs');
var path = require('path');
var util = require('./util.js');
var spawn = require('child_process').spawn;

const CONNECTION_TIMEOUT = 10000;

module.exports = function constructor(params) {
    let config = params.config;
    let id = uuid.v4();
    let workingDirectory;

    return Object.freeze({
        create: create
    });

    function create() {
        return _getLock()
            .then(_prepareWorkDirectory)
            .then(() => {
            var proc = spawn('openvpn', _makeParams());
            proc.stdout.on('end', () => {
                // this is the point where openvpn terminates
                console.log(`${id} exited.`);
            });
            Promise.race([
                _waitForConnection(),
                util.throwAfterTimeout(new Error('Timeout'), CONNECTION_TIMEOUT)
            ]).then(() => {
                console.log('hello connection');
            }).catch(err => {
                console.error(err);
                throw err;
            });
        });
    }

    function _makeParams() {
        var commandParams = [
            '--script-security', 2,
            '--route-up', _getFifoCallerPath(),
        ];
        if (config) {
            commandParams.push('--config');
            commandParams.push(config);
        }
        return commandParams;
    }

    function _waitForConnection() {
        return new Promise((resolve, reject) => {
            let fifoPath = _getFifoPath();
            util.run('mkfifo', [fifoPath]).then(() => {
                let stream = fs.createReadStream(fifoPath, function(err) {
                    if (err) {
                        return reject(err);
                    }
                });
                stream.on('end', cleanupAndResolve);
            })
            .catch(() => {
                cleanup().then(reject);
            });

            function cleanupAndResolve() {
                cleanup().then(resolve);
            }

            function cleanup() {
                return new Promise(resolve => {
                    fs.unlink(_getFifoCallerPath(), function(err) {
                        console.error(err);
                        fs.unlink(fifoPath, function(err) {
                            console.error(err);
                            resolve();
                        });
                    });
                });
            }
        });
    }

    function _getFifoPath() {
        return path.join(workingDirectory, id + '.fifo');
    }

    function _getFifoCallerPath() {
        return path.join(workingDirectory, id + '.sh');
    }

    function _getFifoCaller() {
        return `echo >> ${_getFifoPath()}`;
    }

    function _prepareWorkDirectory() {
        // TODO(ac): implement me
        workingDirectory = '/tmp';
        return new Promise((resolve, reject) => {
            fs.writeFile(_getFifoCallerPath(), _getFifoCaller(), {mode: 700}, err => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });
    }

    function _getLock() {
        // TODO(ac): lock
        return Promise.resolve();
    }

};

