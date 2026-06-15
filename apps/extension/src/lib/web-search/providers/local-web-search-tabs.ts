/**
 * 说明：`local-web-search-tabs` 基础能力模块。
 *
 * 职责：
 * - 承载本地 Web Search provider 共享的临时标签页编排；
 * - 统一通过共享扩展 contract 执行“开标签、等加载、注入脚本、恢复焦点、关闭标签”；
 * - 避免各个本地 provider 继续分散拼接 `chrome.tabs.*` 与 `chrome.scripting.executeScript`。
 *
 * 边界：
 * - 这里只负责本地 provider 共有的浏览器标签页工作流，不负责具体搜索站点 DOM 解析规则；
 * - 站点专属的 URL 构造与结果抽取函数仍由各 provider 自己提供。
 */
import {
  createExtensionTab,
  executeExtensionTabScript,
  hasExtensionTabScriptingRuntime,
  queryCurrentWindowActiveTab,
  removeExtensionTab,
  updateExtensionTab,
  waitForExtensionTabComplete,
} from '@/lib/extension/runtime-api';
import { I18nError } from '@/lib/i18n/error';

/** 本地 Web Search provider 的临时标签页执行参数。 */
export interface LocalWebSearchTabOptions<TArgs extends unknown[], TResult> {
  /** 用于错误提示的人类可读 provider 名称。 */
  provider: string;
  /** 搜索页 URL。 */
  searchUrl: string;
  /** 新标签页是否成为当前窗口活动标签；本地搜索 provider 当前统一传 `false`。 */
  active: boolean;
  /** 执行抽取前的附加等待时间，给 SPA 结果区留渲染窗口。 */
  settleMs?: number;
  /** 等待标签页完成加载的超时时间。 */
  loadTimeoutMs?: number;
  /** 执行完后是否尝试恢复原来的活动标签页。 */
  restorePreviousActiveTab?: boolean;
  /** 站点专属抽取函数。 */
  extractor: (...args: TArgs) => TResult;
  /** 传给抽取函数的参数。 */
  args: TArgs;
}

/**
 * 归一化本地搜索查询词。
 *
 * 说明：
 * - `searchWithTime` 会在 query 前面注入 `today is YYYY-MM-DD\r\n`；
 * - 本地 provider 的 URL 只应该使用真实查询文本，不把前缀带给搜索引擎。
 */
export function normalizeLocalWebSearchQuery(query: string): string {
  const text = String(query || '');
  return text.includes('\r\n') ? text.split('\r\n').slice(1).join('\r\n') : text;
}

/**
 * 通过临时标签页执行本地网页搜索抽取。
 *
 * 说明：
 * - 本地搜索 provider 统一以后台临时标签页访问搜索页，避免打断用户当前标签页；
 * - 具体站点如需等待 DOM 渲染稳定，可以通过 `settleMs` 明确声明等待窗口；
 * - 无论成功还是失败，都会尽力关闭临时标签页；
 * - `restorePreviousActiveTab` 只保留给共享 contract 的显式调用方，本地搜索不再使用前台打开再切回。
 */
export async function runLocalWebSearchInTemporaryTab<TArgs extends unknown[], TResult>(
  options: LocalWebSearchTabOptions<TArgs, TResult>,
): Promise<TResult> {
  if (!hasExtensionTabScriptingRuntime()) {
    throw new I18nError('errors.webSearchLocalProviderRequiresExtensionContext', { provider: options.provider });
  }

  const previousActiveTab = options.restorePreviousActiveTab
    ? await queryCurrentWindowActiveTab()
    : null;
  const tab = await createExtensionTab({ url: options.searchUrl, active: options.active });
  if (!tab?.id) {
    throw new I18nError('errors.webSearchCreateTabFailedWithProvider', { provider: options.provider });
  }

  try {
    await waitForExtensionTabComplete(tab.id, { timeoutMs: options.loadTimeoutMs ?? 10_000 });

    const settleMs = Math.max(0, options.settleMs ?? 0);
    if (settleMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, settleMs));
    }

    if (options.restorePreviousActiveTab && previousActiveTab?.id) {
      void updateExtensionTab(previousActiveTab.id, { active: true });
    }

    const result = await executeExtensionTabScript({
      tabId: tab.id,
      func: options.extractor,
      args: options.args,
    });
    return (result ?? []) as TResult;
  } finally {
    void removeExtensionTab(tab.id);
  }
}
