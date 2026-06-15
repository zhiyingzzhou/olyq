/**
 * 说明：`runtime-api` 扩展运行时访问模块。
 *
 * 职责：
 * - 提供扩展内共享的 runtime / tabs / scripting / identity 安全访问入口；
 * - 统一 Promise 化 one-shot `sendMessage`、标签页编排、脚本执行、identity 读取与扩展页 URL 解析；
 * - 避免 UI、sync、provider 等模块重复拼接 `chrome.*` 访问与运行期探测逻辑。
 *
 * 边界：
 * - 这里只封装浏览器 API 访问，不承载业务语义；
 * - 真正的“打开面板 / 启动元素选择器 / 本地搜索标签页编排”等业务语义由上层模块承担。
 */
import type { I18nText } from '@/types/i18n';
import type { SwInboundMessage } from '@/types/sw-messages';
import { ExtensionRuntimeError } from './runtime-errors';

type GlobalWithChrome = typeof globalThis & { chrome?: typeof chrome };

/** `tabs.onUpdated` 监听器类型直接从当前 Chrome Event contract 推导，避免依赖声明包内部命名。 */
type ExtensionTabsOnUpdatedListener = Parameters<typeof chrome.tabs.onUpdated.addListener>[0];

/** 标签页消息失败的稳定原因编码。 */
export type ExtensionTabMessageErrorReason =
  | 'tab-unavailable'
  | 'content-script-unreachable'
  | 'content-script-not-ready'
  | 'page-access-unavailable';

/** 标签页消息重试策略。 */
export type ExtensionTabMessageRetryPolicy = {
  /** 最大尝试次数，至少为 1。 */
  maxAttempts?: number;
  /** 每次重试之间的等待毫秒数。 */
  delayMs?: number;
};

/** 标签页内容脚本消息目标选项。 */
export type ExtensionTabMessageOptions = {
  /** 指定目标 frame；为空时由浏览器发送到默认 frame。 */
  frameId?: number;
};

/**
 * tabs/message contract 的统一错误类型。
 *
 * 说明：
 * - 上层模块只依赖 `reason` 这组稳定语义，不再直接消费浏览器原始报错文案；
 * - `detail` 仅用于调试或补充诊断，不作为业务分支判断真源。
 */
export class ExtensionTabMessageError extends Error {
  readonly reason: ExtensionTabMessageErrorReason;

  readonly detail: string | null;

  readonly tabId: number;

  constructor(
    reason: ExtensionTabMessageErrorReason,
    options: { tabId: number; detail?: string | null; cause?: unknown },
  ) {
    super(reason);
    this.name = 'ExtensionTabMessageError';
    this.reason = reason;
    this.detail = typeof options.detail === 'string' && options.detail.trim()
      ? options.detail.trim()
      : null;
    this.tabId = options.tabId;
    if ('cause' in options) {
      (this as unknown as { cause?: unknown }).cause = options.cause;
    }
  }
}

/**
 * 判断未知错误是否为共享 tabs/message contract 错误。
 *
 * @param error - 待判断错误。
 * @returns 是否为 `ExtensionTabMessageError`。
 */
export function isExtensionTabMessageError(error: unknown): error is ExtensionTabMessageError {
  return error instanceof ExtensionTabMessageError;
}

/**
 * UI -\> Service Worker 的标准响应泛型。
 *
 * 说明：
 * - 大多数 one-shot 消息都返回 `{ ok: true }` 或 `{ ok: false, error }`；
 * - 某些消息会在成功态额外带 `payload` 或其他补充字段。
 */
export type ExtensionMessageResponse<TPayload = never, TExtra extends object = object> =
  | (([TPayload] extends [never] ? { ok: true } : { ok: true; payload: TPayload }) & TExtra)
  | ({ ok: false; error?: I18nText } & TExtra);

/**
 * 安全读取当前环境里的 Chrome 扩展 API。
 *
 * @returns 若当前不是扩展环境或 mock 不完整，则返回 `null`。
 */
export function getExtensionChromeApi(): typeof chrome | null {
  return (globalThis as GlobalWithChrome).chrome ?? null;
}

/**
 * 读取当前扩展 runtime。
 *
 * @returns 可用 runtime；不存在时返回 `null`。
 */
export function getExtensionRuntime(): typeof chrome.runtime | null {
  return getExtensionChromeApi()?.runtime ?? null;
}

/**
 * 读取当前扩展 identity API。
 *
 * @returns 可用 identity；不存在时返回 `null`。
 */
export function getExtensionIdentity(): typeof chrome.identity | null {
  return getExtensionChromeApi()?.identity ?? null;
}

/**
 * 判断当前上下文是否具备标签页脚本执行能力。
 *
 * @returns 是否同时具备 `tabs` 与 `scripting.executeScript`。
 */
export function hasExtensionTabScriptingRuntime(): boolean {
  const chromeApi = getExtensionChromeApi();
  return Boolean(chromeApi?.tabs && chromeApi?.scripting?.executeScript);
}

/**
 * 判断当前上下文是否具备 identity 能力。
 *
 * @returns 是否存在 `chrome.identity`。
 */
export function hasExtensionIdentityRuntime(): boolean {
  return Boolean(getExtensionIdentity());
}

/**
 * 判断当前上下文是否具备 one-shot `sendMessage` 能力。
 *
 * @returns 是否可以向 Service Worker 发送一次性消息。
 */
export function hasExtensionMessageRuntime(): boolean {
  return Boolean(getExtensionRuntime()?.sendMessage);
}

/**
 * 判断当前上下文是否具备扩展共享配置存储能力。
 *
 * @returns 是否存在扩展级 shared storage 后端。
 */
export function hasExtensionSharedStorageRuntime(): boolean {
  return Boolean(getExtensionChromeApi()?.storage?.local);
}

/**
 * 读取当前扩展 manifest 快照。
 *
 * @returns manifest；运行时不可用或读取失败时返回 `null`。
 */
export function getExtensionManifest(): chrome.runtime.Manifest | null {
  const runtime = getExtensionRuntime();
  if (!runtime?.getManifest) return null;
  try {
    return runtime.getManifest();
  } catch {
    return null;
  }
}

/**
 * 解析扩展内部页面 URL。
 *
 * @param path - 扩展内相对路径。
 * @returns 扩展页 URL；运行时不可用时返回 `null`。
 */
export function getExtensionPageUrl(path: string): string | null {
  const runtime = getExtensionRuntime();
  if (!runtime?.id || !runtime.getURL) return null;
  try {
    return runtime.getURL(path);
  } catch {
    return null;
  }
}

/**
 * 判断当前环境是否允许新开扩展标签页。
 *
 * @param path - 待打开的扩展页相对路径。
 * @returns 是否同时具备 `tabs.create` 与目标页面 URL。
 */
export function canOpenExtensionPageInTab(path: string): boolean {
  return Boolean(getExtensionChromeApi()?.tabs?.create && getExtensionPageUrl(path));
}

/**
 * Promise 化发送一次性消息到 Service Worker。
 *
 * @param message - 发送给 Service Worker 的消息。
 * @returns 原样返回后台响应。
 */
export async function sendExtensionMessage<TResponse = unknown>(
  message: SwInboundMessage,
): Promise<TResponse> {
  const runtime = getExtensionRuntime();
  if (!runtime?.sendMessage) {
    throw new ExtensionRuntimeError('runtime-unavailable', {
      detail: 'chrome.runtime.sendMessage is unavailable',
    });
  }
  return await new Promise<TResponse>((resolve, reject) => {
    try {
      runtime.sendMessage(message, (response: TResponse) => {
        const lastError = runtime.lastError ?? getExtensionChromeApi()?.runtime?.lastError;
        if (lastError) {
          reject(new ExtensionRuntimeError('message-send-failed', {
            detail: lastError.message || 'chrome.runtime.sendMessage failed',
          }));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 安全读取浏览器当前窗口中的原始 `runtime.lastError.message`。
 *
 * @returns 当前错误文案；不可用或为空时返回 `null`。
 */
function readExtensionRuntimeLastErrorMessage(): string | null {
  const detail = getExtensionChromeApi()?.runtime?.lastError?.message;
  return typeof detail === 'string' && detail.trim() ? detail.trim() : null;
}

/**
 * 把浏览器 tabs/message 原始报错文案收敛为稳定原因编码。
 *
 * @param detail - 原始错误详情。
 * @returns 统一错误原因。
 */
export function classifyExtensionTabConnectionError(detail: string | null | undefined): ExtensionTabMessageErrorReason {
  const normalizedDetail = String(detail || '').trim();
  if (!normalizedDetail) return 'content-script-unreachable';

  if (
    /No tab with id/i.test(normalizedDetail)
    || /Tabs cannot be edited right now/i.test(normalizedDetail)
    || /Invalid tab ID/i.test(normalizedDetail)
  ) {
    return 'tab-unavailable';
  }

  if (
    /Missing host permission/i.test(normalizedDetail)
    || /Cannot access contents of/i.test(normalizedDetail)
    || /must request permission to access/i.test(normalizedDetail)
    || /The extensions gallery cannot be scripted/i.test(normalizedDetail)
  ) {
    return 'page-access-unavailable';
  }

  if (
    /Could not establish connection/i.test(normalizedDetail)
    || /Receiving end does not exist/i.test(normalizedDetail)
  ) {
    return 'content-script-not-ready';
  }

  return 'content-script-unreachable';
}

/**
 * 根据浏览器 tabs/message 失败细节创建统一错误。
 *
 * @param tabId - 目标标签页 ID。
 * @param detail - 原始错误详情。
 * @param cause - 原始错误对象。
 * @returns 统一 contract 错误。
 */
function createExtensionTabMessageError(
  tabId: number,
  detail: string | null | undefined,
  cause?: unknown,
): ExtensionTabMessageError {
  return new ExtensionTabMessageError(classifyExtensionTabConnectionError(detail), {
    tabId,
    detail,
    cause,
  });
}

/**
 * 安全查询标签页列表。
 *
 * @param queryInfo - 标签页查询条件。
 * @returns 命中的标签页；失败时返回空数组。
 */
export async function queryExtensionTabs(
  queryInfo: chrome.tabs.QueryInfo,
): Promise<chrome.tabs.Tab[]> {
  const tabsApi = getExtensionChromeApi()?.tabs;
  if (!tabsApi?.query) return [];
  return await new Promise((resolve) => {
    try {
      tabsApi.query(queryInfo, (tabs) => {
        const lastError = getExtensionChromeApi()?.runtime?.lastError;
        if (lastError) {
          resolve([]);
          return;
        }
        resolve(tabs ?? []);
      });
    } catch {
      resolve([]);
    }
  });
}

/**
 * 查询当前窗口的活动标签页。
 *
 * @returns 第一个活动标签页；找不到时返回 `null`。
 */
export async function queryCurrentWindowActiveTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await queryExtensionTabs({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

/**
 * 安全读取单个标签页快照。
 *
 * @param tabId - 目标标签页 ID。
 * @returns 标签页快照；不可用或读取失败时返回 `null`。
 */
export async function getExtensionTab(tabId: number): Promise<chrome.tabs.Tab | null> {
  const tabsApi = getExtensionChromeApi()?.tabs;
  if (!tabsApi?.get || !Number.isFinite(tabId)) return null;
  return await new Promise((resolve) => {
    try {
      tabsApi.get(tabId, (tab) => {
        const lastError = getExtensionChromeApi()?.runtime?.lastError;
        if (lastError) {
          resolve(null);
          return;
        }
        resolve(tab ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * 向指定标签页发送 one-shot 消息。
 *
 * @param tabId - 目标标签页 ID。
 * @param message - 发送给内容脚本的消息。
 * @returns 内容脚本原样响应。
 * @throws `ExtensionTabMessageError` - 当标签页不可达、缺少 host 权限或内容脚本未就绪时抛出统一错误。
 */
export async function sendExtensionTabMessage<TResponse = unknown>(
  tabId: number,
  message: unknown,
  options: ExtensionTabMessageOptions = {},
): Promise<TResponse> {
  const tabsApi = getExtensionChromeApi()?.tabs;
  if (!tabsApi?.sendMessage || !Number.isFinite(tabId)) {
    throw new ExtensionTabMessageError('tab-unavailable', { tabId, detail: null });
  }
  const frameId = typeof options.frameId === 'number' && Number.isFinite(options.frameId)
    ? Math.trunc(options.frameId)
    : undefined;
  const messageOptions = typeof frameId === 'number' ? { frameId } : undefined;

  return await new Promise<TResponse>((resolve, reject) => {
    try {
      /**
       * 统一处理 tabs.sendMessage callback。
       *
       * @param response - 内容脚本返回值。
       */
      const callback = (response: TResponse) => {
        const lastErrorMessage = readExtensionRuntimeLastErrorMessage();
        if (lastErrorMessage) {
          reject(createExtensionTabMessageError(tabId, lastErrorMessage));
          return;
        }
        resolve(response);
      };
      if (messageOptions) {
        tabsApi.sendMessage(tabId, message, messageOptions, callback);
        return;
      }
      tabsApi.sendMessage(tabId, message, callback);
    } catch (error) {
      reject(createExtensionTabMessageError(
        tabId,
        error instanceof Error ? error.message : String(error || ''),
        error,
      ));
    }
  });
}

/**
 * 在内容脚本可能尚未挂上监听时做短暂重试。
 *
 * 说明：
 * - 只会对 `content-script-not-ready` 这一类“接收端尚未建立”的错误重试；
 * - 若重试窗口耗尽，错误会升级为稳定的 `content-script-unreachable`。
 *
 * @param tabId - 目标标签页 ID。
 * @param message - 发送消息。
 * @param retryPolicy - 最大尝试次数与退避间隔。
 * @returns 内容脚本响应。
 */
export async function sendExtensionTabMessageWithRetry<TResponse = unknown>(
  tabId: number,
  message: unknown,
  retryPolicy: ExtensionTabMessageRetryPolicy = {},
  options: ExtensionTabMessageOptions = {},
): Promise<TResponse> {
  const maxAttempts = Math.max(1, Math.round(retryPolicy.maxAttempts ?? 10));
  const delayMs = Math.max(0, Math.round(retryPolicy.delayMs ?? 120));
  let lastPendingError: ExtensionTabMessageError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await sendExtensionTabMessage<TResponse>(tabId, message, options);
    } catch (error) {
      if (!isExtensionTabMessageError(error)) throw error;
      if (error.reason !== 'content-script-not-ready') throw error;
      lastPendingError = error;
      if (attempt >= maxAttempts) break;
      if (delayMs > 0) {
        await new Promise<void>((resolve) => {
          globalThis.setTimeout(resolve, delayMs);
        });
      }
    }
  }

  throw new ExtensionTabMessageError('content-script-unreachable', {
    tabId,
    detail: lastPendingError?.detail ?? null,
    cause: lastPendingError,
  });
}

/**
 * 新开一个浏览器标签页。
 *
 * @param createProperties - 新标签页属性。
 * @returns 新建的标签页；失败时返回 `null`。
 */
export async function createExtensionTab(
  createProperties: chrome.tabs.CreateProperties,
): Promise<chrome.tabs.Tab | null> {
  const tabsApi = getExtensionChromeApi()?.tabs;
  if (!tabsApi?.create) return null;
  return await new Promise((resolve) => {
    try {
      tabsApi.create(createProperties, (tab) => {
        const lastError = getExtensionChromeApi()?.runtime?.lastError;
        if (lastError) {
          resolve(null);
          return;
        }
        resolve(tab ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * 更新指定标签页。
 *
 * @param tabId - 目标标签页 ID。
 * @param updateProperties - 更新参数。
 * @returns 更新后的标签页；失败时返回 `null`。
 */
export async function updateExtensionTab(
  tabId: number,
  updateProperties: chrome.tabs.UpdateProperties,
): Promise<chrome.tabs.Tab | null> {
  const tabsApi = getExtensionChromeApi()?.tabs;
  if (!tabsApi?.update) return null;
  return await new Promise((resolve) => {
    try {
      tabsApi.update(tabId, updateProperties, (tab) => {
        const lastError = getExtensionChromeApi()?.runtime?.lastError;
        if (lastError) {
          resolve(null);
          return;
        }
        resolve(tab ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * 关闭指定标签页。
 *
 * @param tabId - 目标标签页 ID。
 * @returns 是否成功发起关闭请求。
 */
export async function removeExtensionTab(tabId: number): Promise<boolean> {
  const tabsApi = getExtensionChromeApi()?.tabs;
  if (!tabsApi?.remove) return false;
  return await new Promise((resolve) => {
    try {
      tabsApi.remove(tabId, () => {
        const lastError = getExtensionChromeApi()?.runtime?.lastError;
        resolve(!lastError);
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * 等待指定标签页进入 `complete`。
 *
 * @param tabId - 目标标签页 ID。
 * @param options - 超时配置。
 * @returns `true` 表示等到完成；`false` 表示超时或监听能力不可用。
 */
export async function waitForExtensionTabComplete(
  tabId: number,
  options: { timeoutMs?: number } = {},
): Promise<boolean> {
  const tabsApi = getExtensionChromeApi()?.tabs;
  if (!tabsApi?.onUpdated?.addListener || !tabsApi?.onUpdated?.removeListener) return false;

  const timeoutMs = Math.max(0, options.timeoutMs ?? 10_000);
  return await new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    /**
     * 统一收口 resolve / 清理时序，避免成功与超时分支重复拆监听。
     */
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      tabsApi.onUpdated.removeListener(listener);
      resolve(ok);
    };

    /**
     * 只监听目标标签页的 complete 事件，其它标签更新一律忽略。
     */
    const listener: ExtensionTabsOnUpdatedListener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        finish(true);
      }
    };

    try {
      tabsApi.onUpdated.addListener(listener);
      timer = setTimeout(() => finish(false), timeoutMs);
    } catch {
      finish(false);
    }
  });
}

/**
 * 在指定标签页里执行脚本，并返回首个注入结果。
 *
 * @param options - 执行参数。
 * @returns 注入结果；不可用或失败时返回 `null`。
 */
export async function executeExtensionTabScript<TArgs extends unknown[], TResult>(options: {
  tabId: number;
  func: (...args: TArgs) => TResult;
  args: TArgs;
}): Promise<TResult | null> {
  const chromeApi = getExtensionChromeApi();
  const scriptingApi = chromeApi?.scripting;
  if (!scriptingApi?.executeScript) return null;

  return await new Promise((resolve) => {
    try {
      scriptingApi.executeScript(
        {
          target: { tabId: options.tabId },
          func: options.func as (...args: unknown[]) => unknown,
          args: options.args as unknown[],
        },
        (results) => {
          const lastError = getExtensionChromeApi()?.runtime?.lastError;
          if (lastError) {
            resolve(null);
            return;
          }
          resolve((results?.[0]?.result ?? null) as TResult | null);
        },
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * 清理 identity 缓存里的 OAuth token。
 *
 * @param token - 待移除的 token。
 * @returns `true` 表示成功调用；`false` 表示运行时不支持或调用失败。
 */
export async function removeCachedIdentityAuthToken(token: string): Promise<boolean> {
  const identity = getExtensionIdentity();
  if (!identity?.removeCachedAuthToken) return false;

  return await new Promise((resolve) => {
    try {
      identity.removeCachedAuthToken({ token }, () => {
        const lastError = getExtensionChromeApi()?.runtime?.lastError;
        resolve(!lastError);
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * 读取当前 identity profile email。
 *
 * @returns email；不可用或读取失败时返回空字符串。
 */
export async function readIdentityProfileEmail(): Promise<string> {
  const identity = getExtensionIdentity();
  if (!identity?.getProfileUserInfo) return '';

  return await new Promise((resolve) => {
    try {
      identity.getProfileUserInfo((info) => {
        const lastError = getExtensionChromeApi()?.runtime?.lastError;
        if (lastError) {
          resolve('');
          return;
        }
        resolve(typeof info?.email === 'string' ? info.email : '');
      });
    } catch {
      resolve('');
    }
  });
}

/**
 * 在新标签页中打开扩展内部页面。
 *
 * @param path - 扩展内相对路径。
 * @param createProperties - 附加标签页属性；`url` 始终由本 helper 覆盖。
 * @returns 新建的标签页；失败时返回 `null`。
 */
export async function openExtensionPageInTab(
  path: string,
  createProperties: Omit<chrome.tabs.CreateProperties, 'url'> = {},
): Promise<chrome.tabs.Tab | null> {
  const url = getExtensionPageUrl(path);
  if (!url) return null;
  return await createExtensionTab({
    ...createProperties,
    url,
  });
}
