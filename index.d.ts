// Definitions by: maxnetish

import {Context, Middleware} from 'koa';
import {Stream} from "stream";

export interface StreamBaseOptions {
    allowDownload?: boolean;
}

export interface StreamFileOptions extends StreamBaseOptions {
    resolveFilepath(ctx: Context): Promise<StreamFileInfo> | StreamFileInfo;
    root?: string;
}

export interface StreamFileInfo {
    filepath: string;
    headers?: {[key: string]: string}
}

export interface StreamBufferOptions extends StreamBaseOptions {
    resolveBuffer(ctx: Context): Promise<StreamBufferInfo> | StreamBufferInfo;
}

export interface StreamBufferInfo {
    buffer: Buffer;
    contentType: string;
    headers?: {[key: string]: string};
}

export interface StreamRange {
    start: number;
    end: number;
}

export interface StreamAnyMetadata {
    length: number;
    contentType: string;
    headers?: {[key: string]: string};
}

export interface StreamAnyOptions extends StreamBaseOptions {
    resolveStream(ctx: Context, range?: StreamRange): Promise<Stream> | Stream;
    resolveStreamMetadata(ctx: Context): Promise<StreamAnyMetadata> | StreamAnyMetadata;
}

export function file(ctx: Context, options: StreamFileOptions): Promise<void>
export function buffer(ctx: Context, options: StreamBufferOptions): Promise<void>
export function any(ctx: Context, options: StreamAnyOptions): Promise<void>
export function serveWithRange(options: StreamFileOptions | StreamBufferOptions | StreamAnyOptions): Middleware
