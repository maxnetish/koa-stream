# Fork of koa-stream
Bind with Koa2. 

Helper to stream files, buffers or any read stream with range requests using koa2.
This can be used with `video` tags, and other resource using the `Range` header.
E.g. you can serve files from mongo grid fs bucket with `Range` for examle 

The implementation follows [RFC 7233](https://tools.ietf.org/html/rfc7233).
With exception of `If-range` header support.

## Usage
```
// response file
app.use(stream.middlewareFactory({
        resolveFilepath: async (ctx) => {filepath, headers?: {[key: string]: string}},
        root: '/path/to',
        allowDownload: true
}));

// response Buffer
app.use(stream.middlewareFactory({
        resolveBuffer: async (ctx) => ({buffer: testBuffer, contentType: contentType, headers?: {[key: string]: string}}),
        allowDownload: true
}));

// response from any stream
app.use(stream.middlewareFactory({
        resolveStream: async (ctx, {start, end}) => Stream,
        resolveStreamMetadata: async (ctx) => ({length: number, contentType: string, headers?: {[key: string]: string}})
        allowDownload: true
}));
```

### Options
* `resolveFilepath`: to get filepath and custom response headers to download
* `resolveBuffer`: to get Buffer and custom response headers to download
* `resolveStream`: to provide stream with given range (range can be omitted, you should provide whole stream in this case)
* `resolveStreamMetadata`: to provide stream length and content type and custom response headers
* `root`: the directory from which file paths will be resolved
* `allowDownload`: allow to reponse whole file/buffer/stream instead of part it if not `Range` header is provided

One of 
* `resolveFilepath`
* `resolveBuffer`
* `resolveStream, resolveStreamMetadata` 

is required.

