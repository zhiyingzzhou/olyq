/**
 * 说明：静态内容脚本状态模块。
 *
 * 职责：
 * - 表达当前浏览器扩展已经彻底切换为 manifest 静态 `http/https` content script 注入；
 * - 为 browser-context、页面工具和技术栈插件提供统一的内容脚本就绪检查；
 * - 给设置页和开发者面板返回可诊断状态，但不再注册、注销或申请网页 host 权限。
 *
 * 边界：
 * - 本模块不调用任何运行时网页授权 API；
 * - 不维护动态注册开关，也不写入 shared storage；
 * - 页面是否可采集仍按普通网页 URL 与 tabs/message handshake 判断；
 * - page tools 的用户手势启动链路允许一次性执行 manifest 静态 bundle，修复安装前已打开标签页不可达。
 */
import {
  getExtensionTab,
  isExtensionTabMessageError,
  sendExtensionTabMessageWithRetry,
  type ExtensionTabMessageErrorReason,
} from '@/lib/extension/runtime-api';

/** 静态内容脚本注册方式。 */
export type ContentScriptRegistrationMethod = 'static' | 'none';

/** 静态注入模型下保留的结构化错误码。 */
export type ContentScriptRegistrationErrorCode =
  | 'bundle-missing'
  | 'script-fetch-failed'
  | 'inject-failed'
  | 'register-failed'
  | 'stale-loader';

/** 设置页和开发面板使用的结构化内容脚本失败信息。 */
export type ContentScriptRegistrationError = {
  /** 结构化错误码。 */
  code: ContentScriptRegistrationErrorCode;
  /** 失败发生的 content script 生命周期阶段。 */
  phase: 'registration' | 'injection';
  /** 日志分级。 */
  level: 'warn' | 'error';
  /** 面向设置页/开发面板的可读摘要。 */
  message: string;
  /** 原始错误细节。 */
  detail?: string;
  /** 触发当前收敛的原因。 */
  reason: string;
  /** 最近一次记录时间。 */
  at: number;
};

/**
 * Content Script 当前状态快照。
 *
 * 说明：
 * - `registered=true` 表示 manifest 声明了静态 http/https content script；
 * - 不代表当前标签页已经可响应，具体页面仍通过 `ensureContentScriptReadyForTab()` 判断。
 */
export type ContentScriptStatus = {
  /** 静态内容脚本始终启用。 */
  enabled: boolean;
  /** 当前使用的注册方式。 */
  registrationMethod: ContentScriptRegistrationMethod;
  /** 是否具备 `chrome.scripting.registerContentScripts` 能力；静态模型不依赖该能力。 */
  scriptingAvailable: boolean;
  /** 是否具备 Firefox `contentScripts.register` 能力；静态模型不依赖该能力。 */
  contentScriptsAvailable: boolean;
  /** 安装期声明的普通网页 host match patterns。 */
  declaredHostMatches: string[];
  /** manifest 是否声明了静态 content script。 */
  registered: boolean;
  /** 打包进扩展的内容脚本资源列表。 */
  bundledJs: string[] | null;
  /** 最近一次结构化内容脚本失败信息；静态模型下不再维护动态注册错误。 */
  lastRegistrationError: ContentScriptRegistrationError | null;
};

/** 按需确认指定标签页内容脚本是否可用于正文采集的返回结果。 */
export type EnsureContentScriptReadyResult =
  | {
      /** 已确认内容脚本可用。 */
      ready: true;
      /** 是否通过用户手势触发的 page tools 补注入恢复可达。 */
      injected: boolean;
    }
  | {
      /** 当前标签页仍不可用。 */
      ready: false;
      /** 失败原因。 */
      reason:
        | 'page-uncollectable'
        | 'content-script-unreachable'
        | 'content-script-not-ready'
        | 'page-access-unavailable'
        | 'content-script-injection-failed'
        | 'bundle-missing'
        | 'tab-unavailable';
      /** 失败发生的阶段；只用于诊断，不作为业务分支真源。 */
      phase?: 'preflight' | 'manifest' | 'initial-handshake' | 'injection' | 'post-injection-handshake';
      /** 浏览器 API 或 tabs/message 返回的原始错误细节；只用于诊断。 */
      detail?: string | null;
    };

/** 真实网页注入面。 */
const STATIC_WEB_MATCH_PATTERNS = ['http://*/*', 'https://*/*'] as const;

/** 判断当前标签页 URL 是否允许自动正文采集。 */
function isCollectableTabUrl(url: string): boolean {
  const normalized = String(url || '').trim();
  return normalized.startsWith('http://') || normalized.startsWith('https://');
}

/** 获取构建产物中声明的静态 content script JS 文件列表。 */
function getBundledContentScriptJsFromManifest(): string[] | null {
  const manifest = chrome.runtime.getManifest() as unknown as { content_scripts?: Array<{ js?: unknown; matches?: unknown }> };
  const list = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
  const first = list[0] as { js?: unknown } | undefined;
  const js = Array.isArray(first?.js) ? (first!.js as unknown[]) : [];
  const files = js.map((x) => String(x || '').trim()).filter(Boolean);
  return files.length > 0 ? files : null;
}

/** 判断 manifest 是否声明了静态 http/https content script。 */
function hasStaticWebContentScript(): boolean {
  const manifest = chrome.runtime.getManifest() as unknown as { content_scripts?: Array<{ matches?: unknown; js?: unknown }> };
  const list = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
  return list.some((entry) => {
    const matches = Array.isArray(entry.matches) ? entry.matches.map((x) => String(x || '').trim()) : [];
    const js = Array.isArray(entry.js) ? entry.js : [];
    return js.length > 0
      && STATIC_WEB_MATCH_PATTERNS.every((pattern) => matches.includes(pattern));
  });
}

/** 内容脚本握手结果。 */
type ContentScriptHandshakeResult =
  | {
      /** `page/getMeta` 已成功返回。 */
      ready: true;
    }
  | {
      /** 当前仍无法确认 content script ready。 */
      ready: false;
      /** tabs/message 统一原因码。 */
      reason: ExtensionTabMessageErrorReason;
      /** 原始错误细节。 */
      detail: string | null;
    };

/** content script bundle 执行结果。 */
type ContentScriptInjectionResult =
  | {
      /** 浏览器已接受并完成脚本执行请求。 */
      ok: true;
    }
  | {
      /** 脚本执行请求失败。 */
      ok: false;
      /** 原始错误细节。 */
      detail: string | null;
    };

/** CRXJS content script loader 解析结果。 */
type CrxjsContentScriptBundleResult =
  | {
      /** 已解析出真实主 content bundle URL。 */
      ok: true;
      /** 可被 isolated world 动态导入的扩展资源 URL。 */
      mainBundleUrl: string;
    }
  | {
      /** loader 解析失败。 */
      ok: false;
      /** 原始错误细节。 */
      detail: string | null;
    };

/** 从未知异常中提取可诊断但不参与业务分支的细节。 */
function getErrorDetail(error: unknown): string | null {
  if (isExtensionTabMessageError(error)) {
    return error.detail ?? error.message ?? null;
  }
  if (error instanceof Error) return error.message || null;
  const text = String(error || '').trim();
  return text || null;
}

/** 读取扩展内资源 URL；失败时返回空值。 */
function getExtensionResourceUrl(path: string): string | null {
  try {
    const url = chrome.runtime.getURL(path);
    return typeof url === 'string' && url.trim() ? url : null;
  } catch {
    return null;
  }
}

/**
 * 从 CRXJS loader 文本里解析真实主 content script bundle 路径。
 *
 * 说明：生产 manifest 里的 content script 通常是 `*-loader-*.js`，它再通过
 * `chrome.runtime.getURL("assets/index.ts-*.js")` 导入真正的主 bundle。用户手势补注入
 * 若只执行 loader，loader 内部错误会被 `.catch(console.error)` 吞掉，因此必须解析出主
 * bundle 并由 `executeScript({ func })` 直接等待 import 结果。
 */
function parseCrxjsLoaderMainBundlePath(loaderText: string): string | null {
  const match = loaderText.match(/chrome\.runtime\.getURL\(\s*["']([^"']+\.js)["']\s*\)/);
  return typeof match?.[1] === 'string' && match[1].trim() ? match[1].trim() : null;
}

/** 读取 manifest loader 并解析出真实主 content bundle URL。 */
async function resolveCrxjsMainBundleUrlFromManifest(files: string[]): Promise<CrxjsContentScriptBundleResult> {
  for (const file of files) {
    const loaderUrl = getExtensionResourceUrl(file);
    if (!loaderUrl) {
      return { ok: false, detail: `chrome.runtime.getURL failed for ${file}` };
    }
    try {
      const response = await fetch(loaderUrl);
      if (!response.ok) {
        return { ok: false, detail: `failed to fetch content script loader ${file}: ${response.status}` };
      }
      const loaderText = await response.text();
      const mainBundlePath = parseCrxjsLoaderMainBundlePath(loaderText);
      if (!mainBundlePath) continue;
      const mainBundleUrl = getExtensionResourceUrl(mainBundlePath);
      if (!mainBundleUrl) {
        return { ok: false, detail: `chrome.runtime.getURL failed for ${mainBundlePath}` };
      }
      return { ok: true, mainBundleUrl };
    } catch (error) {
      return { ok: false, detail: getErrorDetail(error) ?? `failed to read content script loader ${file}` };
    }
  }

  return {
    ok: false,
    detail: 'manifest content script loader does not reference a CRXJS main bundle',
  };
}

/**
 * 在目标网页 isolated world 内导入真实主 content script bundle。
 *
 * 说明：
 * - 该函数会被 `chrome.scripting.executeScript({ func })` 序列化到网页标签页执行；
 * - 不引用当前模块闭包，确保 Chrome 可以完整序列化；
 * - 主 bundle 顶层已有 `__olyq_content_script_bootstrapped__` 哨兵，重复导入不会重复绑定监听器。
 */
async function importContentScriptMainBundleForPageTool(mainBundleUrl: string): Promise<void> {
  const injectTime = performance.now();
  const mod = await import(/* @vite-ignore */ mainBundleUrl) as { onExecute?: (args?: unknown) => unknown };
  if (typeof mod.onExecute === 'function') {
    await mod.onExecute({ perf: { injectTime, loadTime: performance.now() - injectTime } });
  }
}

/** 在当前标签页上等待内容脚本完成启动。 */
async function waitForContentScriptReady(tabId: number, attempts = 10, delayMs = 80): Promise<ContentScriptHandshakeResult> {
  try {
    const response = await sendExtensionTabMessageWithRetry<Record<string, unknown>>(
      tabId,
      { type: 'page/getMeta' },
      { maxAttempts: attempts, delayMs },
    );
    if (response && typeof response === 'object') return { ready: true };
    return {
      ready: false,
      reason: 'content-script-unreachable',
      detail: 'page/getMeta returned an empty response',
    };
  } catch (error) {
    return {
      ready: false,
      reason: isExtensionTabMessageError(error) ? error.reason : 'content-script-unreachable',
      detail: getErrorDetail(error),
    };
  }
}

/** 判断一个返回值是否像 Promise。 */
function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(value && typeof (value as { then?: unknown }).then === 'function');
}

/**
 * 在用户显式点击 page tools 后执行 manifest loader 指向的真实 content script 主 bundle。
 *
 * 说明：
 * - 只用于普通 http/https 页面工具启动前的可达性修复；
 * - 不注册动态 content script，不申请可选权限，也不扩大 content script matches；
 * - content script 内部有 bootstrap 哨兵，重复执行同一 bundle 不会重复绑定监听器。
 * - `executeScript(files)` 只代表 CRXJS loader 运行结束，不能等待 loader 内部动态 import；
 *   这里改为解析 loader 并用 `executeScript(func)` 导入主 bundle，才能拿到真实失败。
 *
 * @param tabId - 目标网页 tabId。
 * @param files - manifest 中打包出的 content script JS 文件。
 * @returns 是否已由浏览器接受执行请求。
 */
async function executeBundledContentScriptForPageTool(tabId: number, files: string[]): Promise<ContentScriptInjectionResult> {
  const scriptingApi = chrome.scripting;
  if (typeof scriptingApi?.executeScript !== 'function') {
    return { ok: false, detail: 'chrome.scripting.executeScript is unavailable' };
  }
  if (files.length === 0) return { ok: false, detail: 'manifest content script bundle is empty' };
  const resolved = await resolveCrxjsMainBundleUrlFromManifest(files);
  if (!resolved.ok) return { ok: false, detail: resolved.detail };

  return await new Promise<ContentScriptInjectionResult>((resolve) => {
    let settled = false;
    /**
     * 统一收口 Promise 与 callback 两种 executeScript 完成信号。
     *
     * 说明：Chromium / Firefox 兼容层可能同时暴露 Promise 返回值和 callback；
     * 这里只认最先到达的一次结果，并在 callback 窗口内读取 `runtime.lastError`，
     * 避免旧标签页补注入失败时留下控制台噪声。
     */
    const finish = (result: ContentScriptInjectionResult) => {
      if (settled) return;
      settled = true;
      consumeRuntimeLastError();
      resolve(result);
    };

    try {
      const result = (scriptingApi as {
        executeScript: (
          injection: {
            target: { tabId: number };
            func: (mainBundleUrl: string) => Promise<void>;
            args: [string];
          },
          callback?: () => void,
        ) => Promise<unknown> | void;
      }).executeScript({
        target: { tabId },
        func: importContentScriptMainBundleForPageTool,
        args: [resolved.mainBundleUrl],
      }, () => {
        const detail = chrome.runtime.lastError?.message;
        finish(detail ? { ok: false, detail } : { ok: true });
      });
      if (isPromiseLike(result)) {
        void result.then(() => finish({ ok: true })).catch((error: unknown) => {
          finish({ ok: false, detail: getErrorDetail(error) });
        });
      }
    } catch (error) {
      finish({ ok: false, detail: getErrorDetail(error) });
    }
  });
}

/** 消费 callback 风格扩展 API 暴露的 lastError，避免控制台噪声。 */
function consumeRuntimeLastError(): void {
  void chrome.runtime?.lastError;
}

/**
 * 静态注入模型下的 no-op 收敛入口。
 *
 * @param _reason - 历史动态注册触发源；保留参数便于调用方无需关心旧时序。
 */
export async function ensureContentScriptRegistration(_reason: string): Promise<void> {
  return;
}

/**
 * 静态注入模型下不允许关闭内容脚本。
 *
 * @param _enabled - 忽略的历史动态注入开关。
 */
export async function setContentScriptEnabled(_enabled: boolean): Promise<void> {
  return;
}

/**
 * 获取当前 content script 的综合状态快照（用于设置页展示）。
 *
 * @returns 静态 manifest 与安装期 host access 状态。
 */
export async function getContentScriptStatus(): Promise<ContentScriptStatus> {
  return {
    enabled: true,
    registrationMethod: hasStaticWebContentScript() ? 'static' : 'none',
    scriptingAvailable: Boolean(chrome.scripting?.registerContentScripts),
    contentScriptsAvailable: Boolean((globalThis as unknown as { browser?: { contentScripts?: unknown } }).browser?.contentScripts),
    declaredHostMatches: [...STATIC_WEB_MATCH_PATTERNS],
    registered: hasStaticWebContentScript(),
    bundledJs: getBundledContentScriptJsFromManifest(),
    lastRegistrationError: null,
  };
}

/**
 * 确保指定标签页上的内容脚本已经就绪。
 *
 * 说明：
 * - 静态 content script 会在普通 `http/https` 页面 `document_idle` 自动运行；
 * - 对刚打开或软路由中的页面，这里只做短暂 handshake 等待；
 * - 内部页、扩展页、`about:` 与 `file:` 明确返回 `page-uncollectable`。
 *
 * @param tabId - 目标标签页 ID。
 * @returns 就绪结果。
 */
export async function ensureContentScriptReadyForTab(tabId: number): Promise<EnsureContentScriptReadyResult> {
  if (!tabId) return { ready: false, reason: 'tab-unavailable' };

  const tab = await getExtensionTab(tabId);
  if (!tab?.url) return { ready: false, reason: 'tab-unavailable', phase: 'preflight' };
  if (!isCollectableTabUrl(tab.url)) return { ready: false, reason: 'page-uncollectable', phase: 'preflight' };

  if (!getBundledContentScriptJsFromManifest() || !hasStaticWebContentScript()) {
    return {
      ready: false,
      reason: 'bundle-missing',
      phase: 'manifest',
      detail: 'manifest is missing static http/https content script bundle',
    };
  }

  const ready = await waitForContentScriptReady(tabId);
  if (ready.ready) return { ready: true, injected: false };
  return {
    ready: false,
    reason: ready.reason,
    phase: 'initial-handshake',
    detail: ready.detail,
  };
}

/**
 * 确保 page tools 目标标签页内容脚本可用。
 *
 * 说明：
 * - 普通静态注入仍是主路径；
 * - 若用户点击“选择元素 / 网页截图”时发现旧标签页没有 content script，则执行一次 manifest
 *   中声明的 bundle，再重新握手，覆盖 GitHub 等安装前已打开页面点了没反应的问题；
 * - 该能力只暴露给 page tools 启动链路，不改变 browser-context 与技术栈的静态注入语义。
 *
 * @param tabId - 目标网页 tabId。
 * @returns 内容脚本可达性结果。
 */
export async function ensurePageToolContentScriptReadyForTab(tabId: number): Promise<EnsureContentScriptReadyResult> {
  if (!tabId) return { ready: false, reason: 'tab-unavailable' };

  const tab = await getExtensionTab(tabId);
  if (!tab?.url) return { ready: false, reason: 'tab-unavailable', phase: 'preflight' };
  if (!isCollectableTabUrl(tab.url)) return { ready: false, reason: 'page-uncollectable', phase: 'preflight' };

  const files = getBundledContentScriptJsFromManifest();
  if (!files || !hasStaticWebContentScript()) {
    return {
      ready: false,
      reason: 'bundle-missing',
      phase: 'manifest',
      detail: 'manifest is missing static http/https content script bundle',
    };
  }

  const initialReady = await waitForContentScriptReady(tabId, 6, 80);
  if (initialReady.ready) return { ready: true, injected: false };

  const injected = await executeBundledContentScriptForPageTool(tabId, files);
  if (!injected.ok) {
    return {
      ready: false,
      reason: 'content-script-injection-failed',
      phase: 'injection',
      detail: injected.detail ?? initialReady.detail,
    };
  }

  // 即使 executeScript 已经等待主 bundle import 完成，也仍只把 `page/getMeta`
  // 握手成功视为 content script ready，避免模块执行成功但 listener 未绑定时误判。
  const postInjectionReady = await waitForContentScriptReady(tabId, 12, 80);
  if (postInjectionReady.ready) return { ready: true, injected: true };
  return {
    ready: false,
    reason: postInjectionReady.reason,
    phase: 'post-injection-handshake',
    detail: postInjectionReady.detail ?? initialReady.detail,
  };
}
