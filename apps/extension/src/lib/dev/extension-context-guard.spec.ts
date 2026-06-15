/**
 * 说明：`extension-context-guard.spec` 基础能力模块。
 *
 * 职责：
 * - 承载 `extension-context-guard.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import {
  __extensionContextGuardTestUtils,
  installExtensionPageRuntimeGuard,
} from "./extension-context-guard";

/**
 * 构造可取消的 `unhandledrejection` 事件，供 runtime guard 回归测试复用。
 */
function createUnhandledRejectionEvent(reason: unknown) {
  const event = new Event('unhandledrejection', { cancelable: true }) as Event & { reason?: unknown }
  Object.defineProperty(event, 'reason', {
    configurable: true,
    enumerable: true,
    value: reason,
  })
  return event
}

describe("extension page runtime guard", () => {
  beforeEach(() => {
    __extensionContextGuardTestUtils.reset();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    __extensionContextGuardTestUtils.reset();
    window.sessionStorage.clear();
  });

  it("识别陈旧脚本抓取失败文案", () => {
    expect(
      __extensionContextGuardTestUtils.isStaleExtensionScriptFetchMessage(
        "An unknown error occurred when fetching the script.",
      ),
    ).toBe(true);
    expect(
      __extensionContextGuardTestUtils.isStaleExtensionScriptFetchMessage(
        "Failed to fetch dynamically imported module",
      ),
    ).toBe(true);
    expect(
      __extensionContextGuardTestUtils.isStaleExtensionScriptFetchMessage(
        "random network error",
      ),
    ).toBe(false);
    expect(
      __extensionContextGuardTestUtils.isBusinessNetworkFailureMessage(
        "Uncaught (in promise) TypeError: Failed to fetch",
      ),
    ).toBe(true);
    expect(
      __extensionContextGuardTestUtils.isBusinessNetworkFailureMessage(
        "Cannot connect to API: fetch failed",
      ),
    ).toBe(true);
    expect(
      __extensionContextGuardTestUtils.isBusinessNetworkFailureMessage(
        "AI_RetryError: Failed after 3 attempts. Last error: Service temporarily unavailable",
      ),
    ).toBe(true);
    expect(
      __extensionContextGuardTestUtils.isBusinessNetworkFailureMessage(
        "[chat] RetryError(APICallError) [object Object] AI_APICallError: Service temporarily unavailable",
      ),
    ).toBe(true);
    expect(
      __extensionContextGuardTestUtils.isBusinessNetworkFailureMessage(
        "Failed to fetch dynamically imported module",
      ),
    ).toBe(false);
  });

  it("扩展页脚本抓取失败时只自动 reload 一次", () => {
    let now = 1_000;
    const reload = vi.fn();

    installExtensionPageRuntimeGuard({
      location: { protocol: "chrome-extension:" },
      now: () => now,
      reload,
      sessionStorage: window.sessionStorage,
    });

    const firstEvent = new ErrorEvent("error", {
      cancelable: true,
      message: "An unknown error occurred when fetching the script.",
    });
    window.dispatchEvent(firstEvent);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(firstEvent.defaultPrevented).toBe(true);

    now = 2_000;
    const secondEvent = new ErrorEvent("error", {
      cancelable: true,
      message: "Failed to fetch dynamically imported module",
    });
    window.dispatchEvent(secondEvent);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(secondEvent.defaultPrevented).toBe(false);
  });

  it("非扩展页不触发自动 reload", () => {
    const reload = vi.fn();

    installExtensionPageRuntimeGuard({
      location: { protocol: "https:" },
      reload,
      sessionStorage: window.sessionStorage,
    });

    const event = new ErrorEvent("error", {
      cancelable: true,
      message: "Importing a module script failed.",
    });
    window.dispatchEvent(event);

    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("扩展页普通业务网络失败会被 prevent，但不会触发 reload", () => {
    const reload = vi.fn();
    const onRecoverableFailure = vi.fn();

    installExtensionPageRuntimeGuard({
      location: { protocol: "chrome-extension:" },
      reload,
      sessionStorage: window.sessionStorage,
      onRecoverableFailure,
    });

    const event = createUnhandledRejectionEvent(new TypeError("Failed to fetch"));
    window.dispatchEvent(event);

    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(onRecoverableFailure).toHaveBeenCalledWith({
      runtime: "extension-page",
      message: "Failed to fetch",
    });
  });

  it("扩展页在动态 chunk 上下文里的普通 fetch 失败不会被误判成 stale reload", () => {
    const reload = vi.fn();
    const onRecoverableFailure = vi.fn();

    installExtensionPageRuntimeGuard({
      location: { protocol: "chrome-extension:" },
      reload,
      sessionStorage: window.sessionStorage,
      onRecoverableFailure,
    });

    const event = new ErrorEvent("error", {
      cancelable: true,
      message: "Uncaught (in promise) TypeError: Failed to fetch",
    });
    window.dispatchEvent(event);

    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(onRecoverableFailure).toHaveBeenCalledWith({
      runtime: "extension-page",
      message: "Uncaught (in promise) TypeError: Failed to fetch",
    });
  });

  it("扩展页已处理的 AI SDK API 请求失败会被 prevent，但不会触发 reload", () => {
    const reload = vi.fn();
    const onRecoverableFailure = vi.fn();

    installExtensionPageRuntimeGuard({
      location: { protocol: "chrome-extension:" },
      reload,
      sessionStorage: window.sessionStorage,
      onRecoverableFailure,
    });

    const apiError = Object.assign(new Error("Service temporarily unavailable"), { name: "AI_APICallError" });
    const event = createUnhandledRejectionEvent(apiError);
    window.dispatchEvent(event);

    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(onRecoverableFailure).toHaveBeenCalledWith({
      runtime: "extension-page",
      message: "AI_APICallError: Service temporarily unavailable",
    });
  });

  it("扩展页真实代码错误不会被 guard 吞掉", () => {
    const onRecoverableFailure = vi.fn();

    installExtensionPageRuntimeGuard({
      location: { protocol: "chrome-extension:" },
      sessionStorage: window.sessionStorage,
      onRecoverableFailure,
    });

    const event = new ErrorEvent("error", {
      cancelable: true,
      error: new ReferenceError("x is not defined"),
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(onRecoverableFailure).not.toHaveBeenCalled();
  });
});

describe("extension worker runtime guard", () => {
  beforeEach(() => {
    __extensionContextGuardTestUtils.reset();
  });

  afterEach(() => {
    __extensionContextGuardTestUtils.reset();
  });

  it("worker 普通业务网络失败会被 prevent", () => {
    const target = new EventTarget();
    const onRecoverableFailure = vi.fn();

    __extensionContextGuardTestUtils.installExtensionWorkerRuntimeGuard({
      target,
      onRecoverableFailure,
    });

    const event = createUnhandledRejectionEvent(new Error("Cannot connect to API: fetch failed"));
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onRecoverableFailure).toHaveBeenCalledWith({
      runtime: "extension-worker",
      message: "Cannot connect to API: fetch failed",
    });
  });

  it("worker 已处理的 AI SDK API 请求失败会被 prevent", () => {
    const target = new EventTarget();
    const onRecoverableFailure = vi.fn();

    __extensionContextGuardTestUtils.installExtensionWorkerRuntimeGuard({
      target,
      onRecoverableFailure,
    });

    const event = createUnhandledRejectionEvent(
      new Error("[chat] RetryError(APICallError) [object Object] AI_APICallError: Upstream service temporarily unavailable"),
    );
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onRecoverableFailure).toHaveBeenCalledWith({
      runtime: "extension-worker",
      message: "[chat] RetryError(APICallError) [object Object] AI_APICallError: Upstream service temporarily unavailable",
    });
  });

  it("worker 非网络错误不会被 prevent", () => {
    const target = new EventTarget();
    const onRecoverableFailure = vi.fn();

    __extensionContextGuardTestUtils.installExtensionWorkerRuntimeGuard({
      target,
      onRecoverableFailure,
    });

    const event = new ErrorEvent("error", {
      cancelable: true,
      error: new TypeError("Cannot read properties of undefined (reading 'foo')"),
    });
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(onRecoverableFailure).not.toHaveBeenCalled();
  });
});
