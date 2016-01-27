'use strict';

var fs = require('fs');
var spawn = require('child_process').spawn;
let EventEmitter = require('events').EventEmitter;

exports.promiseTimeout = (timeout) => {
    return new Promise(resolve => setTimeout(resolve, timeout));
};

exports.throwAfterTimeout = (err, timeout) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => reject(err), timeout);
    });
};

exports.exec = function exec(cmd, options) {
    return new Promise((resolve, reject) => {
        let bin = cmd.split(' ').shift();
        let params = cmd.split(' ').slice(1);
        let child = spawn(bin, params, options);
        let res = new Buffer(0);
        let err = new Buffer(0);

        child.stdout.on('data', buf => res = Buffer.concat([res, buf], res.length + buf.length));
        child.stderr.on('data', buf => err = Buffer.concat([err, buf], err.length + buf.length));
        child.on('close', code => {
            return setImmediate(() => {
                // console.log(cmd, err.toString(), res.toString());
                // setImmediate is required because there are often still
                // pending write requests in both stdout and stderr at this point
                code ? reject(err.toString()) : resolve(res.toString());
            });
        });
        child.on('error', reject);
    });
};

exports.writeFile = function writeFile(path, data, options) {
    return new Promise((resolve, reject) => {
        fs.writeFile(path, data, options, err => {
            if (err) {
                return reject(err);
            }
            resolve();
        });
    });
};

exports.createLinesEmitter = function createLinesEmitter() {
    let remainder = '';
    let events = new EventEmitter();

    return Object.freeze({
        events,
        init
    });

    function init(dataEmitter) {
        dataEmitter.on('data', data => {
            remainder += data.toString();
            processRemainder();
        });
    }

    function processRemainder() {
        let lines = remainder.split('\r\n');
        remainder = lines.pop();
        lines.forEach(line => {
            events.emit('line', line);
        });
    }
};

