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

exports.unlink = function unlink(path) {
    return new Promise((resolve, reject) => {
        fs.unlink(path, err => {
            if (err) {
                return reject(err);
            }
            resolve();
        });
    });
};

exports.removeFilesWithPrefix = function removeFilesWithPrefix(dir, prefix) {
    return new Promise((resolve, reject) => {
        fs.readdir(dir, (err, fileNames) => {
            if (err) {
                return reject(err);
            }
            Promise.all(fileNames
                .filter(fileName => fileName.indexOf(prefix) === 0)
                .map(fileName => exports.unlink(`${dir}/${fileName}`))).then(resolve);
        });
    });
};

exports.resolveObjectProps = function resolveObjectProps(obj) {
    return Promise.all(Object.keys(obj)
        .map(key => Promise.resolve(obj[key])
            .then(val => [key, val]))
    )
        .then(all => all.reduce((prev, curr) => (prev[curr[0]] = curr[1], prev), {}));
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
            processRemainder(dataEmitter);
        });
    }

    function processRemainder(dataEmitter) {
        let lines = remainder.split('\r\n');
        remainder = lines.pop();
        lines.forEach(line => {
            events.emit('line', line, dataEmitter);
        });
    }
};

exports.ipFromInt = function ipFromInt(n) {
    return `${(n >> 24) & 0xff}.${(n >> 16) & 0xff}.${(n >> 8) & 0xff}.${n & 0xff}`;
};

exports.intFromMask = function intFromMask(mask) {
    return -1 << (32 - mask);
};

exports.subnetFromIpMask = function subnetFromIpMask(ip, mask) {
    let ipGroups = ip.split('.');
    let maskGroups = mask.split('.');
    return ipGroups
        .map((part, ix) => Number(part) & Number(maskGroups[ix]))
        .join('.');
};

