/**
 * MV3-safe `setImmediate` shim.
 *
 * JSZip 仍会 side-effect import `setimmediate@1.x`，而该包为了兼容字符串回调会包含
 * `new Function(...)`。浏览器扩展不支持这类动态执行；当前运行时只需要函数回调调度，
 * 因此这里彻底替换成无 eval / Function 构造器的实现。
 */
const root = globalThis;
let nextHandle = 1;
const timersByHandle = new Map();

if (typeof root.setImmediate !== "function") {
  root.setImmediate = (callback, ...args) => {
    if (typeof callback !== "function") {
      throw new TypeError("setImmediate callback must be a function");
    }

    const handle = nextHandle;
    nextHandle += 1;

    const timer = root.setTimeout(() => {
      timersByHandle.delete(handle);
      callback(...args);
    }, 0);

    timersByHandle.set(handle, timer);
    return handle;
  };
}

if (typeof root.clearImmediate !== "function") {
  root.clearImmediate = (handle) => {
    const timer = timersByHandle.get(handle);
    if (timer === undefined) return;
    timersByHandle.delete(handle);
    root.clearTimeout(timer);
  };
}
