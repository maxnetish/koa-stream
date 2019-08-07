'use strict';

const request = require('supertest');
const Koa = require('koa');
const path = require('path');
const assert = require('assert');
const fs = require('mz/fs');

const stream = require('..');

const testBuffer = Buffer.from([1, 2, 3, 4, 5]);

async function getFileStat(filepath) {
    try {
        const stats = await fs.stat(filepath);
        if (stats.isDirectory()) {
            return false;
        }
        return stats;
    } catch (err) {
        const notfound = ['ENOENT', 'ENAMETOOLONG', 'ENOTDIR'];
        if (notfound.indexOf(err.code) !== -1) {
            return false;
        }
        err.status = 500;
        throw err;
    }
}

const makeRequestForAnyStream = function (filepath, options) {
    let app = new Koa();
    options = options || {};

    app.use(stream.serveWithRange(Object.assign(options, {
        resolveStream: (ctx, reqRange) => {
            if (reqRange) {
                return fs.createReadStream(filepath, reqRange);
            }
            return fs.createReadStream(filepath);
        },
        resolveStreamMetadata: async () => {
            const stat = await getFileStat(filepath);
            return {
                length: stat.size,
                contentType: 'application/octet-stream'
            };
        }
    })));

    let req = request(app.listen())
        .get('/');
    if (options.range) {
        req.set('Range', 'bytes=' + options.range.start + '-' + options.range.end);
    }
    return req;
};

const makeRequest = function (filepath, options) {
    let app = new Koa();
    options = options || {};

    app.use(stream.serveWithRange(Object.assign(options, {
        resolveFilepath: () => ({filepath}),
    })));

    // app.use(function* () {
    //     yield stream.file(this, filepath, options);
    // });

    let req = request(app.listen())
        .get('/');
    if (options.range) {
        req.set('Range', 'bytes=' + options.range.start + '-' + options.range.end);
    }
    return req;
};

const makeRequestForBuffer = function (options) {
    let app = new Koa();
    options = options || {};

    let contentType = 'application/octet-stream';

    app.use(stream.serveWithRange(Object.assign(options, {
        resolveBuffer: () => ({buffer: testBuffer, contentType: contentType}),
    })));

    // app.use(function* () {
    //     stream.buffer(this, testBuffer, contentType, options);
    // });

    let req = request(app.listen())
        .get('/');
    if (options.range) {
        req.set('Range', 'bytes=' + options.range.start + '-' + options.range.end);
    }
    return req;
};

describe('stream file', function () {
    context('with no root', function () {
        context('with absolute path', function () {
            it('should return 404 or 400 (on windows)', function (done) {
                makeRequest(path.join(__dirname, 'fixtures', 'file.txt'))
                    .expect(400, done);
            });
        });
        context('with relative path', function () {
            it('should download file', function (done) {
                makeRequest(path.join('test', 'fixtures', 'file.txt'), {allowDownload: true})
                    .expect(200)
                    .expect('0123456789', done);
            });
        });

        context('with path containing ..', function () {
            it('should return 403', function (done) {
                makeRequest(path.join('..', 'leaves', 'package.json'), {allowDownload: true})
                    .expect(403, done);
            });
        });
    });

    context('with root', function () {
        it('should use provided root', function (done) {
            makeRequest('file.txt', {root: path.join(__dirname, 'fixtures'), allowDownload: true})
                .expect(200)
                .expect('0123456789', done);
        });
    });

    context('with directory', function () {
        it('should return 404', function (done) {
            makeRequest(path.join('test', 'fixtures'), {allowDownload: true})
                .expect(404, done);
        });
    });

    context('with no range', function () {
        context('when download not allowed', function () {
            it('should return 404', function (done) {
                makeRequest(path.join('test', 'fixtures', 'file.txt'))
                    .expect(404, done);
            });
        });
        context('when download allowed', function () {
            it('should download file', function (done) {
                makeRequest(path.join('test', 'fixtures', 'file.txt'), {allowDownload: true})
                    .expect(200)
                    .expect('0123456789', done);
            });
        });
    });

    context('with range', function () {
        context('when range is correct', function () {
            it('should return partial response', function (done) {
                makeRequest(path.join('test', 'fixtures', 'file.txt'), {range: {start: 1, end: 3}})
                    .expect(206)
                    .expect('123', done);
            });
        });
        context('when start is incorrect', function () {
            it('should default to 0', function (done) {
                makeRequest(path.join('test', 'fixtures', 'file.txt'), {range: {start: -1, end: 3}})
                    .expect(206)
                    .expect('01', done);
            });
        });

        context('when range is too large', function () {
            it('should return 416', function (done) {
                makeRequest(path.join('test', 'fixtures', 'file.txt'), {range: {start: 5, end: 100}})
                    .expect(416, done);
            });
        });
    });

    context('with encoded path', function () {
        context('if path is correctly encoded', function () {
            it('should return file', function (done) {
                makeRequest('test%2Ffixtures%2Ffile.txt', {allowDownload: true})
                    .expect(200)
                    .expect('0123456789', done);
            });
        });
        context('if it fails decoding', function () {
            it('should return 400', function (done) {
                makeRequest('test%2Zfixtures%2Ffile.txt', {allowDownload: true})
                    .expect(400, done);
            });
        });
    });
});

describe('stream buffer', function () {
    context('with no range', function () {
        context('when download not allowed', function () {
            it('should return 404', function (done) {
                makeRequestForBuffer()
                    .expect(404, done);
            });
        });

        context('when download allowed', function () {
            it('should fetch the entire buffer', function () {
                return makeRequestForBuffer({allowDownload: true})
                    .expect(200)
                    .then(response => {
                        assert(response.body, testBuffer.toString());
                    });
            });
        });
    });

    context('with range', function () {
        context('when range is correct', function () {
            it('should return partial response', function () {
                return makeRequestForBuffer({range: {start: 1, end: 3}})
                    .expect(206)
                    .then(response => {
                        assert(response.body, testBuffer.slice(1, 3).toString());
                    });
            });
        });

        context('when start is incorrect', function () {
            it('should default to 0', function () {
                return makeRequestForBuffer({range: {start: -1, end: 3}})
                    .expect(206)
                    .then(response => {
                        assert(response.body, testBuffer.slice(0, 1).toString());
                    });
            });
        });

        context('when range is too large', function () {
            it('should return 416', function (done) {
                makeRequestForBuffer({range: {start: 5, end: 100}})
                    .expect(416, done);
            });
        });
    });
});

describe('stream any', function () {
    context('with no range', function () {
        context('when download not allowed', function () {
            it('should return 404', function (done) {
                makeRequestForAnyStream(path.join('test', 'fixtures', 'file.txt'))
                    .expect(404, done);
            });
        });

        context('when download allowed', function () {
            it('should fetch the entire stream', function () {
                return makeRequestForAnyStream(path.join('test', 'fixtures', 'file.txt'), {allowDownload: true})
                    .expect(200)
                    .then(response => {
                        assert(response.body, '0123456789');
                    });
            });
        });
    });

    context('with range', function () {
        context('when range is correct', function () {
            it('should return partial response', function () {
                return makeRequestForAnyStream(path.join('test', 'fixtures', 'file.txt'), {range: {start: 1, end: 3}})
                    .expect(206)
                    .then(response => {
                        assert(response.body, '12');
                    });
            });
        });

        context('when start is incorrect', function () {
            it('should default to 0', function () {
                return makeRequestForAnyStream(path.join('test', 'fixtures', 'file.txt'), {range: {start: -1, end: 3}})
                    .expect(206)
                    .then(response => {
                        assert(response.body, '0');
                    });
            });
        });

        context('when range is too large', function () {
            it('should return 416', function (done) {
                makeRequestForAnyStream(path.join('test', 'fixtures', 'file.txt'), {range: {start: 5, end: 100}})
                    .expect(416, done);
            });
        });
    });
});
