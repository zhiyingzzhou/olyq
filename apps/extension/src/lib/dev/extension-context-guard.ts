/**
 * 说明：`extension-context-guard` 基础能力模块。
 *
 * 职责：
 * - 承载 `extension-context-guard` 相关的当前文件实现与模块边界；
 * - 对外暴露 `recoverExtensionPageFromScriptFetchError`、`installDevExtensionContextInvalidatedGuard`、`installExtensionPageRuntimeGuard`、`installExtensionWorkerRuntimeGuard` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { logger } from '@/lib/logger'
/**
 * 开发期防护：吞掉 CRXJS/Vite HMR 在扩展重载后可能抛出的
 * `Extension context invalidated.`，避免以 Uncaught Error 的形式刷屏。
 *
 * 另外，扩展页（sidepanel / offscreen）在扩展重载或重新安装后，
 * 也可能继续引用已经失效的 hash chunk，触发：
 * - `Failed to fetch dynamically imported module`
 * - `Importing a module script failed`
 * - `An unknown error occurred when fetching the script.`
 *
 * 这类错误通常只需要刷新一次页面即可自愈，因此为扩展页单独提供一次性、
 * 带节流的自动 reload 防护；content script 不启用该恢复逻辑，避免误刷新宿主网页。
 */

const EXTENSION_PAGE_AUTO_RELOAD_STORAGE_KEY = "__olyq_extension_page_auto_reload_at__";
const EXTENSION_PAGE_AUTO_RELOAD_THROTTLE_MS = 10_000;
const STALE_EXTENSION_SCRIPT_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /an unknown error occurred when fetching the script/i,
  /error loading dynamically imported module/i,
  /chunkloaderror/i,
] as const;
const BUSINESS_NETWORK_ERROR_PATTERNS = [
  /^(?:uncaught(?: \(in promise\))?\s*)?typeerror:\s*failed to fetch\.?$/i,
  /^failed to fetch\.?$/i,
  /^(?:uncaught(?: \(in promise\))?\s*)?(?:typeerror:\s*)?networkerror when attempting to fetch resource\.?$/i,
  /^(?:uncaught(?: \(in promise\))?\s*)?(?:typeerror:\s*)?load failed\.?$/i,
  /^(?:uncaught(?: \(in promise\))?\s*)?(?:typeerror:\s*)?fetch failed\.?$/i,
  /\bcannot connect to api\b/i,
] as const;
const HANDLED_AI_API_ERROR_PATTERNS = [
  /\bAI_RetryError\b/i,
  /\bAI_APICallError\b/i,
  /\bRetryError\(APICallError\)/i,
] as const;
const EXTENSION_PAGE_PROTOCOLS = new Set(["chrome-extension:", "moz-extension:"]);

type StorageLike = Pick<Storage, "getItem" | "setItem">;
type ExtensionRuntimeEventTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
type RuntimeGuardEventLike = Event & {
  error?: unknown;
  message?: unknown;
  reason?: unknown;
};
type RecoverableBusinessNetworkFailure = {
  runtime: 'extension-page' | 'extension-worker';
  message: string;
};
type RecoverableBusinessNetworkFailureReporter = (failure: RecoverableBusinessNetworkFailure) => void;
type ExtensionPageRuntimeGuardOptions = {
  location?: Location | URL | { protocol?: string };
  now?: () => number;
  reload?: () => void;
  sessionStorage?: StorageLike;
  onRecoverableFailure?: RecoverableBusinessNetworkFailureReporter;
};
type ExtensionWorkerRuntimeGuardOptions = {
  target?: ExtensionRuntimeEventTarget;
  onRecoverableFailure?: RecoverableBusinessNetworkFailureReporter;
};

let devGuardInstalled = false;
let extensionPageGuardInstalled = false;
let extensionWorkerGuardInstalled = false;
let cleanupDevGuard: (() => void) | null = null;
let cleanupExtensionPageGuard: (() => void) | null = null;
let cleanupExtensionWorkerGuard: (() => void) | null = null;

/**
 * 判断某个错误消息是否属于扩展上下文失效错误。
 *
 * 说明：
 * - Chromium 在扩展热更新后抛出的文案并不总是完全一致，因此这里只做宽松的大小写不敏感包含匹配；
 * - 该判断只用于 DEV 防噪音处理，宁可稍微宽松，也不要漏掉重复刷屏的无害异常。
 */
function isExtensionContextInvalidatedMessage(message: unknown) {
  const s = typeof message === "string" ? message : "";
  // 不同 Chromium 版本/场景下可能是否带句号，或大小写不同；这里做宽松匹配即可。
  return s.toLowerCase().includes("extension context invalidated");
}

/**
 * 内部函数：`isStaleExtensionScriptFetchMessage`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function isStaleExtensionScriptFetchMessage(message: unknown) {
  const s = typeof message === "string" ? message : "";
  return STALE_EXTENSION_SCRIPT_ERROR_PATTERNS.some((pattern) => pattern.test(s));
}

/**
 * 归一化错误消息文本，避免空白和大小写差异影响守卫判定。
 */
function normalizeMessage(message: string) {
  return message.trim().replace(/\s+/g, ' ')
}

/**
 * 把任意异常/拒绝原因转换成可匹配的字符串消息。
 *
 * 说明：
 * - 浏览器的 `error` / `unhandledrejection` 事件里，错误载荷可能是 Error、字符串或任意对象；
 * - 这里统一转成字符串，方便后续按关键词识别，同时避免 guard 自身因为序列化失败再抛异常。
 */
function toMessage(value: unknown): string {
  if (value instanceof Error) {
    const message = String(value.message || "");
    const name = typeof value.name === 'string' ? value.name.trim() : "";
    // AI SDK 的 Error.message 常常不含 `AI_APICallError` / `AI_RetryError` 名称，
    // 但浏览器扩展错误页会把 name 拼进去；guard 需要按同一语义识别已处理的 API 失败。
    if (name.startsWith('AI_')) return `${name}${message ? `: ${message}` : ""}`;
    return message;
  }
  if (typeof value === "string") return value;
  try {
    const json = JSON.stringify(value);
    return typeof json === "string" ? json : String(value);
  } catch {
    return String(value);
  }
}

/**
 * 判断某条异常消息是否属于普通业务网络 / AI API 请求失败。
 *
 * 说明：
 * - 这里只认稳定的 fetch / network 层特征，以及已被业务层转换成 `chat/error` 的 AI SDK API 错误；
 * - 不把普通业务 invariant 和代码错误混进来；
 * - `Failed to fetch dynamically imported module` 这类陈旧 chunk 故障会先被 stale 分支拦截，
 *   因此这里显式排除，避免它们在 reload 节流期被误吞成业务网络失败。
 */
function isBusinessNetworkFailureMessage(message: unknown) {
  const normalized = normalizeMessage(typeof message === 'string' ? message : '')
  if (!normalized) return false
  if (isStaleExtensionScriptFetchMessage(normalized)) return false
  return BUSINESS_NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(normalized))
    || HANDLED_AI_API_ERROR_PATTERNS.some((pattern) => pattern.test(normalized))
}

/**
 * 内部函数：`isExtensionPageLocation`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function isExtensionPageLocation(locationLike: Location | URL | { protocol?: string } | null | undefined) {
  return EXTENSION_PAGE_PROTOCOLS.has(String(locationLike?.protocol ?? ""));
}

/**
 * 获取当前运行时可用的全局事件目标。
 *
 * 说明：
 * - 页面环境和 service worker 都有全局 `addEventListener/removeEventListener`；
 * - 测试环境里如果没有这组 API，则直接返回 `null`，由调用方放弃安装守卫。
 */
function getGlobalRuntimeEventTarget(): ExtensionRuntimeEventTarget | null {
  const target = globalThis as Partial<ExtensionRuntimeEventTarget>
  return typeof target.addEventListener === 'function' && typeof target.removeEventListener === 'function'
    ? (target as ExtensionRuntimeEventTarget)
    : null
}

/**
 * 内部函数：`shouldThrottleExtensionPageAutoReload`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function shouldThrottleExtensionPageAutoReload(storage: StorageLike, now: number) {
  const raw = storage.getItem(EXTENSION_PAGE_AUTO_RELOAD_STORAGE_KEY);
  const lastReloadAt = Number(raw);
  return Number.isFinite(lastReloadAt) && lastReloadAt > 0 && now - lastReloadAt < EXTENSION_PAGE_AUTO_RELOAD_THROTTLE_MS;
}

/**
 * 内部函数：`tryRecoverStaleExtensionScriptFetch`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function tryRecoverStaleExtensionScriptFetch(options: ExtensionPageRuntimeGuardOptions = {}) {
  if (typeof window === "undefined") return false;
  const locationLike = options.location ?? window.location;
  if (!isExtensionPageLocation(locationLike)) return false;

  const reload = options.reload ?? (() => window.location.reload());
  const storage = options.sessionStorage ?? window.sessionStorage;
  const now = options.now?.() ?? Date.now();

  try {
    if (shouldThrottleExtensionPageAutoReload(storage, now)) return false;
    storage.setItem(EXTENSION_PAGE_AUTO_RELOAD_STORAGE_KEY, String(now));
  } catch {
    // 如果 sessionStorage 不可用，则宁可不上自动恢复，也不要冒 reload 死循环风险。
    return false;
  }

  reload();
  return true;
}

/**
 * 尝试将任意异常按“扩展页陈旧 chunk / 脚本抓取失败”处理。
 *
 * 返回 `true` 表示当前错误已命中恢复分支，并且已经触发了一次受控 reload。
 */
export function recoverExtensionPageFromScriptFetchError(
  error: unknown,
  options: ExtensionPageRuntimeGuardOptions = {},
) {
  const message = toMessage(error);
  if (!isStaleExtensionScriptFetchMessage(message)) return false;
  return tryRecoverStaleExtensionScriptFetch(options);
}

/**
 * 记录一次已经被 guard 降级的普通业务网络失败。
 *
 * 说明：
 * - 这类失败应该继续停留在业务层自己的 toast / error state；
 * - guard 只负责避免它升级成扩展级“崩溃错误”，同时保留一条受控 warn 日志便于排查。
 */
function reportRecoverableBusinessNetworkFailure(
  runtime: RecoverableBusinessNetworkFailure['runtime'],
  message: string,
  reporter?: RecoverableBusinessNetworkFailureReporter,
) {
  const normalizedMessage = normalizeMessage(message)
  if (reporter) {
    reporter({ runtime, message: normalizedMessage })
    return
  }
  logger.general.warn('extension runtime business network failure suppressed', {
    runtime,
    message: normalizedMessage,
  })
}

/**
 * 为指定运行时目标挂载共享的 `error / unhandledrejection` 监听。
 *
 * 说明：
 * - 页面和 worker 只是在“如何分类 recoverable failure”上不同；
 * - 底层监听与 `preventDefault()` 时机保持一致，避免两套守卫各自漂移。
 */
function installRuntimeGuardListeners(
  target: ExtensionRuntimeEventTarget,
  resolveAction: (message: string) => 'prevent' | 'ignore',
) {
  /**
   * 内部函数变量：`onError`。
   *
   * @remarks
   * 统一处理同步冒出的运行时错误，并只在上层分类明确要求时阻止默认上报。
   */
  const onError = (event: Event) => {
    const errorEvent = event as RuntimeGuardEventLike
    const message = toMessage(errorEvent.error ?? errorEvent.message)
    if (resolveAction(message) !== 'prevent') return
    event.preventDefault()
  }

  /**
   * 内部函数变量：`onUnhandledRejection`。
   *
   * @remarks
   * 统一处理异步 Promise rejection，并只对可恢复网络失败执行 `preventDefault()`。
   */
  const onUnhandledRejection = (event: Event) => {
    const rejectionEvent = event as RuntimeGuardEventLike
    const message = toMessage(rejectionEvent.reason)
    if (resolveAction(message) !== 'prevent') return
    event.preventDefault()
  }

  target.addEventListener('error', onError as EventListener, { capture: true })
  target.addEventListener('unhandledrejection', onUnhandledRejection as EventListener, { capture: true })
  return () => {
    target.removeEventListener('error', onError as EventListener, { capture: true })
    target.removeEventListener('unhandledrejection', onUnhandledRejection as EventListener, { capture: true })
  }
}

/**
 * 安装 "Extension context invalidated" 全局防护。
 *
 * - 使用 `window.error` + `unhandledrejection` 两条链路覆盖：
 *   1) 同步抛错（Uncaught Error）
 *   2) Promise/async 链路的未处理拒绝（UnhandledPromiseRejection）
 *
 * 注意：这里只做 `preventDefault()`，不主动 reload。
 * - 在 CRXJS 的 HMR client 里已经有 "ping 失败 -\> reload" 的逻辑。
 * - 我们的职责是避免 send/init 等未包 try/catch 的路径把控制台刷满并中断执行。
 */
export function installDevExtensionContextInvalidatedGuard() {
  if (!import.meta.env.DEV) return;
  if (devGuardInstalled) return;
  devGuardInstalled = true;

  // 某些运行时（SSR/worker）没有 window，这里做防御。
  if (typeof window === "undefined") return;

    /**
   * 内部函数变量：`onError`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const onError = (event: ErrorEvent) => {
    const message = toMessage(event.error ?? event.message);
    if (!isExtensionContextInvalidatedMessage(message)) return;
    // 阻止默认的 "Uncaught Error" 输出（减少噪音）。
    event.preventDefault();
  };

    /**
   * 内部函数变量：`onUnhandledRejection`。
   *
   * @remarks
   * 用于收束当前文件中的局部执行步骤、事件回调或派生计算，避免主流程继续膨胀。
   */
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const message = toMessage(event.reason);
    if (!isExtensionContextInvalidatedMessage(message)) return;
    // 阻止默认的 "Unhandled promise rejection" 输出（减少噪音）。
    event.preventDefault();
  };

  window.addEventListener("error", onError, { capture: true });
  window.addEventListener("unhandledrejection", onUnhandledRejection, { capture: true });
  cleanupDevGuard = () => {
    window.removeEventListener("error", onError, { capture: true });
    window.removeEventListener("unhandledrejection", onUnhandledRejection, { capture: true });
  };
}

/**
 * 为扩展页安装运行时恢复防护。
 *
 * 行为：
 * - DEV 下继续吞掉 `Extension context invalidated`，避免扩展热更新刷屏；
 * - 在扩展页捕获到“陈旧脚本 / chunk 拉取失败”时，执行一次受控 reload；
 * - 普通业务网络失败只做 `preventDefault()` 与受控 warn 日志，不触发 reload；
 * - 若刚刚已经自动 reload 过，则不再吞错，保留真实错误以便继续排查。
 */
export function installExtensionPageRuntimeGuard(options: ExtensionPageRuntimeGuardOptions = {}) {
  if (extensionPageGuardInstalled) return;
  extensionPageGuardInstalled = true;

  if (typeof window === "undefined") return;

  cleanupExtensionPageGuard = installRuntimeGuardListeners(window, (message) => {
    if (import.meta.env.DEV && isExtensionContextInvalidatedMessage(message)) return 'prevent'
    if (isStaleExtensionScriptFetchMessage(message)) {
      return recoverExtensionPageFromScriptFetchError(message, options) ? 'prevent' : 'ignore'
    }
    if (!isBusinessNetworkFailureMessage(message)) return 'ignore'
    reportRecoverableBusinessNetworkFailure('extension-page', message, options.onRecoverableFailure)
    return 'prevent'
  })
}

/**
 * 为 service worker 等无页面 UI 的扩展运行时安装网络失败守卫。
 *
 * 行为：
 * - 只吞掉已经明确识别为普通业务网络失败的未处理异常；
 * - 不引入 reload、自愈或额外 fallback；
 * - 真实代码错误、陈旧脚本错误与普通 invariant 仍继续冒出。
 */
export function installExtensionWorkerRuntimeGuard(options: ExtensionWorkerRuntimeGuardOptions = {}) {
  if (extensionWorkerGuardInstalled) return
  extensionWorkerGuardInstalled = true

  const target = options.target ?? getGlobalRuntimeEventTarget()
  if (!target) return

  cleanupExtensionWorkerGuard = installRuntimeGuardListeners(target, (message) => {
    if (!isBusinessNetworkFailureMessage(message)) return 'ignore'
    reportRecoverableBusinessNetworkFailure('extension-worker', message, options.onRecoverableFailure)
    return 'prevent'
  })
}

/**
 * 导出常量：`__extensionContextGuardTestUtils`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const __extensionContextGuardTestUtils = {
  isExtensionContextInvalidatedMessage,
  isStaleExtensionScriptFetchMessage,
  isBusinessNetworkFailureMessage,
  isExtensionPageLocation,
  getGlobalRuntimeEventTarget,
  shouldThrottleExtensionPageAutoReload,
  tryRecoverStaleExtensionScriptFetch,
  recoverExtensionPageFromScriptFetchError,
  installExtensionWorkerRuntimeGuard,
    /**
   * 内部方法：`reset`。
   *
   * @remarks
   * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
   */
  reset() {
    cleanupDevGuard?.();
    cleanupExtensionPageGuard?.();
    cleanupExtensionWorkerGuard?.();
    cleanupDevGuard = null;
    cleanupExtensionPageGuard = null;
    cleanupExtensionWorkerGuard = null;
    devGuardInstalled = false;
    extensionPageGuardInstalled = false;
    extensionWorkerGuardInstalled = false;
  },
};
