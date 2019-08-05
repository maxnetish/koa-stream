# Fork of koa-stream
Bind with Koa2 

Helper to stream files and buffers with range requests using koa.
This can be used with `video` tags, and other resource using the `Range` header.

The implementation follows [RFC 7233](https://tools.ietf.org/html/rfc7233).
With exception of __If-range__ header support.

##Usage
```
app.use(stream.middlewareFactory({
        resolveFilepath: ctx => filepath,
        root: '/path/to',
        allowDownload: true
}));

app.use(stream.middlewareFactory({
        resolveBuffer: ctx => ({buffer: testBuffer, contentType: contentType}),
        allowDownload: true
}));
```

### Options
* `resolveFilepath`: to get filepath to download
* `resolveBuffer`: to get Buffer to stream
* `root`: the directory from which file paths will be resolved
* `allowDownload`: allow to return the file instead of streaming it if not `Range` header is provided


