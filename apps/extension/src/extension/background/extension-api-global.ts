/**
 * 说明：`extension-api-global` 后台启动层模块。
 *
 * 职责：
 * - 在 Service Worker 其它运行时代码执行前解析扩展 API 命名空间；
 * - Chromium 继续使用原生 `chrome.*`；
 * - Firefox / WebExtensions 环境若只暴露 `browser.*`，则把它提升为当前后台代码统一使用的 `chrome.*` 入口。
 *
 * 边界：
 * - 本模块只处理“后台启动层 API 命名空间可用性”，不承载业务逻辑；
 * - 不引入权限、不改 manifest schema，也不做浏览器能力试探式降级；
 * - 若当前上下文没有完整后台启动事件入口，直接抛出明确错误，避免后续裸 `chrome.runtime.*` 抛出难定位的 TypeError。
 */

/** 后台代码需要的最小扩展 API 视图。 */
type BackgroundExtensionApi = typeof chrome;

/** 可能存在 `chrome` / `browser` 命名空间的全局对象。 */
type ExtensionApiGlobal = typeof globalThis & {
  /** Chromium 与 Firefox 兼容命名空间。 */
  chrome?: Partial<BackgroundExtensionApi>;
  /** Firefox / WebExtensions Promise 命名空间。 */
  browser?: Partial<BackgroundExtensionApi>;
};

/**
 * 判断未知事件对象是否具备 WebExtensions 标准的 `addListener` 入口。
 *
 * @param event - 候选事件对象。
 * @returns 是否可同步注册监听器。
 */
function hasAddListener(event: unknown): boolean {
  return typeof (event as { addListener?: unknown } | null | undefined)?.addListener === "function";
}

/**
 * 判断 runtime 命名空间是否包含 Service Worker 顶层必须同步注册的事件。
 *
 * @param runtime - 候选 runtime 命名空间。
 * @returns 是否具备后台启动所需 runtime 事件。
 */
function hasRuntimeListeners(runtime: Partial<BackgroundExtensionApi["runtime"]> | undefined): boolean {
  return Boolean(
    hasAddListener(runtime?.onInstalled)
    && hasAddListener(runtime?.onConnect)
    && hasAddListener(runtime?.onMessage),
  );
}

/**
 * 判断某个扩展 API 命名空间是否具备 Service Worker 顶层启动所需的事件入口。
 *
 * @param api - 候选扩展 API 命名空间。
 * @returns 是否可作为后台运行时入口。
 */
function hasBackgroundStartupApi(api: Partial<BackgroundExtensionApi> | undefined): api is BackgroundExtensionApi {
  return Boolean(
    hasRuntimeListeners(api?.runtime)
    && hasAddListener(api?.alarms?.onAlarm)
    && hasAddListener(api?.tabs?.onActivated)
    && hasAddListener(api?.tabs?.onUpdated)
    && hasAddListener(api?.windows?.onFocusChanged),
  );
}

/**
 * 用 Firefox / WebExtensions 的 `browser.*` 补齐当前后台启动层需要的 `chrome.*` 入口。
 *
 * 说明：
 * - 若当前环境已经有部分 `chrome.*` API，则只补启动必需的缺口，保留既有 callback 风格对象；
 * - 若没有可用 `chrome` 对象，则直接把 `browser` 作为项目内部统一入口；
 * - 补齐后仍不满足后台启动事件要求时，调用方会继续失败并给出明确诊断。
 *
 * @param chromeApi - 当前全局 `chrome` 对象。
 * @param browserApi - 当前全局 `browser` 对象。
 * @returns 补齐后的后台扩展 API。
 */
function installBrowserApiIntoChrome(
  chromeApi: Partial<BackgroundExtensionApi> | undefined,
  browserApi: Partial<BackgroundExtensionApi>,
): BackgroundExtensionApi {
  if (chromeApi && typeof chromeApi === "object") {
    const target = chromeApi;
    if (!hasRuntimeListeners(target.runtime)) target.runtime = browserApi.runtime;
    if (!hasAddListener(target.alarms?.onAlarm)) target.alarms = browserApi.alarms;
    if (!hasAddListener(target.tabs?.onActivated) || !hasAddListener(target.tabs?.onUpdated)) target.tabs = browserApi.tabs;
    if (!hasAddListener(target.windows?.onFocusChanged)) target.windows = browserApi.windows;

    if (hasBackgroundStartupApi(target)) {
      return target;
    }
  }

  return browserApi as BackgroundExtensionApi;
}

/**
 * 安装后台统一使用的扩展 API 命名空间。
 *
 * 说明：
 * - Chromium 下 `chrome.runtime` 已完整可用时不做任何写入；
 * - Firefox / WebExtensions 只提供 `browser.runtime` 时，把 `browser` 设为 `chrome`，让现有后台模块继续使用同一套 callback 风格代码；
 * - 如果两个命名空间都缺少后台 runtime 事件，说明当前文件不是在扩展后台上下文执行，应当立即失败并给出稳定诊断。
 *
 * @returns 最终可用的扩展 API 命名空间。
 */
export function installBackgroundExtensionApiGlobal(): BackgroundExtensionApi {
  const g = globalThis as ExtensionApiGlobal;
  if (hasBackgroundStartupApi(g.chrome)) return g.chrome;
  if (hasBackgroundStartupApi(g.browser)) {
    g.chrome = installBrowserApiIntoChrome(g.chrome, g.browser);
    return g.chrome;
  }

  throw new Error("extension background runtime API is unavailable");
}

installBackgroundExtensionApiGlobal();
