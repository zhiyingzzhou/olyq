/**
 * 给 JSZip 浏览器构建使用的 MV3-safe `readable-stream` / `stream` shim。
 *
 * JSZip 只会通过 `readable-stream.Readable` 探测 Node stream 输出是否可用。Olyq 浏览器扩展
 * 只使用 Blob / Uint8Array 归档 API，暴露 Node stream 既没有必要，也会让 Vite 把 Node `stream`
 * 外部化进扩展页面产物。这里明确不提供 `Readable`，让 `support.nodestream` 固定为 false。
 */
"use strict";

module.exports = Object.freeze({
  Readable: undefined,
  Writable: undefined,
  Duplex: undefined,
  Transform: undefined,
  PassThrough: undefined,
});
