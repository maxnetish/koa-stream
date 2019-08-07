'use strict';

const assert = require('assert');
const resolvePath = require('resolve-path');
const path = require('path');
const mime = require('mime');
const fs = require('mz/fs');

const parseRange = function (range, totalLength) {
    if (typeof range === 'undefined' || range === null || range.length === 0) {
        return null;
    }

    let array = range.split(/bytes=([0-9]*)-([0-9]*)/);
    let result = {
        start: parseInt(array[1]),
        end: parseInt(array[2])
    };

    if (isNaN(result.end) || result.end < 0) {
        result.end = totalLength - 1;
    }

    if (isNaN(result.start) || result.start < 0) {
        result.start = 0;
    }

    result.totalLength = totalLength;

    return result;
};

function addHeaders(ctx, headers) {
    if (headers) {
        Object.keys(headers).forEach(h => ctx.set(h, headers[h]));
    }
}

const endRequest = function (ctx, size) {
    ctx.set('Content-Range', 'bytes */' + size);
    ctx.body = null;
    ctx.status = 416;
};

const sendFile = function (ctx, filepath, size, customHeaders) {
    ctx.set('Content-Type', mime.getType(filepath));
    ctx.set('Content-Length', size);
    ctx.set('Accept-Ranges', 'bytes');
    addHeaders(ctx, customHeaders);
    ctx.body = fs.createReadStream(filepath);
};

const sendBufferAtOnce = function (ctx, buffer, type, customHeaders) {
    ctx.set('Content-Type', type);
    ctx.set('Content-Length', buffer.length);
    addHeaders(ctx, customHeaders);
    ctx.body = buffer;
};

async function sendStreamAtOnce(ctx, options, {length, contentType}, customHeaders) {
    ctx.set('Content-Type', contentType);
    ctx.set('Content-Length', length);
    ctx.set('Accept-Ranges', 'bytes');
    addHeaders(ctx, customHeaders);
    // ask to open whole stream, without {start,end}
    const stream = await options.resolveStream(ctx);
    ctx.body = stream;
}

const streamRange = function (ctx, body, range, contentType, customHeaders) {
    ctx.set('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + range.totalLength);
    ctx.set('Content-Length', range.end - range.start + 1);
    ctx.set('Content-Type', contentType);
    ctx.set('Accept-Ranges', 'bytes');
    ctx.set('Cache-Control', 'no-cache');
    addHeaders(ctx, customHeaders);
    ctx.status = 206;
    ctx.body = body;
};

const handleFileStream = function (ctx, range, filepath) {
    let stream = fs.createReadStream(filepath, {start: range.start, end: range.end});
    let contentType = mime.getType(filepath);
    streamRange(ctx, stream, range, contentType);
};

async function handleStreamAny(ctx, range, contentType, options, customHeaders) {
    const stream = await options.resolveStream(ctx, {start: range.start, end: range.end});
    streamRange(ctx, stream, range, contentType, customHeaders);
}

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

async function handleRequest(ctx, filepath, options, customHeaders) {
    const stat = await getFileStat(filepath);
    if (!stat) {
        return;
    }

    let range = parseRange(ctx.headers.range, stat.size);

    if (range === null) {
        return options.allowDownload ? sendFile(ctx, filepath, stat.size, customHeaders) : null;
    }

    if (range.start >= stat.size || range.end >= stat.size) {
        return endRequest(ctx, stat.size);
    }

    handleFileStream(ctx, range, filepath, stat, customHeaders);
}

const handleBuffer = function (ctx, buffer, contentType, options, customHeaders) {
    let range = parseRange(ctx.headers.range, buffer.length);

    if (range === null) {
        return options.allowDownload ? sendBufferAtOnce(ctx, buffer, contentType, customHeaders) : null;
    }

    if (range.start >= buffer.length || range.end >= buffer.length) {
        return endRequest(ctx, buffer.length);
    }

    let bufferSlice = buffer.slice(range.start, range.end);
    streamRange(ctx, bufferSlice, range, contentType, customHeaders);
};

const decode = function (filepath) {
    // return filepath;
    try {
        return decodeURIComponent(filepath);
    } catch (err) {
        console.log(err);
        return -1;
    }
};

async function streamAny(ctx, options) {
    // take length of stream
    const {length, contentType, headers} = await options.resolveStreamMetadata(ctx);
    const range = parseRange(ctx.headers.range, length);

    if (range === null) {
        return options.allowDownload ? sendStreamAtOnce(ctx, options, {length, contentType}, headers) : null;
    }

    if (range.start >= length || range.end >= length) {
        return endRequest(ctx, length);
    }

    handleStreamAny(ctx, range, contentType, options, headers);
}

async function streamFile(ctx, options) {
    let {filepath, headers} = await options.resolveFilepath(ctx);
    assert(filepath, 'filepath required');
    let root = options.root ? path.normalize(path.resolve(options.root)) : '';
    filepath = filepath[0] === '/' ? filepath.slice(1) : filepath;
    filepath = decode(filepath);
    if (filepath === -1) {
        return ctx.throw(400, 'failed to decode');
    }
    filepath = resolvePath(root, filepath);
    return handleRequest(ctx, filepath, options, headers);
}

async function streamBuffer(ctx, options) {
    const {buffer, contentType, headers} = await options.resolveBuffer(ctx);
    assert(buffer instanceof Buffer, 'buffer required');
    return handleBuffer(ctx, buffer, contentType, options, headers);
}

/**
 *
 * resolveFilepath or resolveBuffer or (resolveStream ({start, end} can be undefined) with optional resolveStreamMetadata) required
 * @param options {
 *      resolveFilepath(ctx): Promise<{filepath: string, headers: {[key: string]: string}}>,
 *      resolveBuffer(ctx): Promise<{buffer:Buffer, contentType:string, headers: {[key: string]: string}}>,
 *      resolveStream(ctx, {start, end}): Promise<Stream>,
 *      resolveStreamMetadata(ctx): Promise<{length:number, contentType:string, headers: {[key: string]: string}}>,
 *      root: string,
 *      allowDownload: boolean
 *     } options
 * @returns {Function}
 */
function middlewareFactory(options) {
    options = options || {};
    return async function (ctx) {
        assert(ctx, 'koa context required');

        if (options.resolveFilepath) {
            await streamFile(ctx, options);
            return;
        }
        if (options.resolveBuffer) {
            await streamBuffer(ctx, options);
            return;
        }
        if (options.resolveStream && options.resolveStreamMetadata) {
            await streamAny(ctx, options);
            return;
        }

        ctx.throw(500, 'Cannot resolve filepath or buffer or stream from request');
    };
}

module.exports = {
    file: streamFile,
    buffer: streamBuffer,
    any: streamAny,
    serveWithRange: middlewareFactory,
};
