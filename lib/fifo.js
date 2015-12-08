'use strict';

var fs = require('fs');
var path = require('path');
var util = require('./util.js');

module.exports = function constructor(opts) {
    var deferredInit = Promise.defer();
    var dir = opts.dir;
    var id = opts.id;

    return Object.freeze({
        init: init,
        getCallerPath: () => getCallerPath(),
        wait: wait,
    });

    function init() {
        fs.writeFile(getCallerPath(), _getCallerSource(), {mode: '0777'}, err => {
            if (err) {
                return deferredInit.reject(err);
            }
            deferredInit.resolve();
        });
        return deferredInit.promise;
    }

    function getCallerPath() {
        return path.join(dir, id + '.sh');
    }

    function wait() {
        return deferredInit.promise.then(() => {
            return new Promise((resolve, reject) => {
                let fifoPath = _getPipePath();
                util.run('mkfifo', [fifoPath]).then(() => {
                    let stream = fs.createReadStream(fifoPath);
                    var res = '';
                    stream.on('data', chunk => {
                        res += chunk.toString();
                    });
                    stream.on('end', () => {
                        stream.close(() => {
                            _cleanup().then(() => resolve(JSON.parse(res)));
                        });
                    });


                })
                .catch(err => {
                    _cleanup().then(() => reject(err));
                });
            });
        });
    }

    function _cleanup() {
        return new Promise(resolve => {
            // return resolve();
            fs.unlink(getCallerPath(), function(err) {
                console.error(err);
                fs.unlink(_getPipePath(), function(err) {
                    console.error(err);
                    resolve();
                });
            });
        });
    }

    function _getPipePath() {
        return path.join(dir, id + '.fifo');
    }

    function _getCallerSource() {
        return '#!/usr/local/bin/node\n' +
            'var s = require(\'fs\').createWriteStream(\'' + _getPipePath() + '\', {flags: \'r+\'}); s.write(JSON.stringify(process.env), function() { s.close(); });\n';
    }

};

