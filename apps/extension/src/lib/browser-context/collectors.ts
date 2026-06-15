/**
 * 说明：`collectors` 浏览器上下文采集门面模块。
 *
 * 职责：
 * - 作为 `browser-context` collector 子系统的稳定 public entry；
 * - 统一对外 re-export source cache、source 采集、prompt 渲染和发送前 preflight 能力；
 * - 通过 side-effect 装配一次性注册内置 collectors，避免调用方感知内部拆分。
 *
 * 边界：
 * - 本文件只保留门面职责，不再承载大体量实现；
 * - 具体 source cache、prompt 和预检逻辑分别下沉到独立模块；
 * - 新增 collector 时，应更新内置装配模块，而不是把实现重新塞回本文件。
 */
import './collectors-builtins';

export {
  registerBrowserContextCollector,
  getBrowserContextCollectors,
} from './collectors-registry';
export {
  clearBrowserContextPromptCache,
  invalidateBrowserContextSourceCache,
  invalidateBrowserContextPromptCacheEntry,
  invalidateBrowserContextPromptCacheForTab,
  upsertTechnologyStackSourceCacheFromRuntimeUpdate,
} from './collectors-source-cache';
export {
  collectSources,
  queryActiveTabMetadata,
  requestPageStyleLayoutFromSw,
  requestPageStyleSignalsFromSw,
  requestReadableDomFromSw,
  resolvePageIdentity,
} from './collectors-sources';
export {
  convertReadableHtmlToMarkdown,
} from './collectors-readable-markdown';
export {
  buildBrowserContextPrompt,
  refreshBrowserContextPrompt,
  renderBrowserContextPrompt,
  resolveBrowserContextForSend,
} from './collectors-operations';
