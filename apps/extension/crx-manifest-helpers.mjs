/**
 * 当前扩展允许注入网页上下文能力的真实网页匹配集合。
 *
 * 说明：
 * - 本版本彻底切换为安装期声明普通网页 host permissions；
 * - content script 静态匹配同一集合；
 * - 内部页、扩展页、about: 与 file: 不进入这组匹配。
 */
export const WEB_PAGE_MATCHES = ["http://*/*", "https://*/*"];

/**
 * `chrome.tabs.captureVisibleTab()` 的安装期 host 权限真源。
 *
 * 说明：
 * - Chromium 对 `captureVisibleTab` 要求 `<all_urls>` 或 `activeTab` 用户手势窗口；
 * - 截图编辑器与元素视觉区域截图由 Service Worker 异步编排，不能依赖短暂的 activeTab 窗口；
 * - 注入面仍由 `WEB_PAGE_MATCHES` 限制为普通 http/https 页面，不扩大 content script / WAR 覆盖范围。
 */
export const CAPTURE_VISIBLE_TAB_HOST_PERMISSIONS = ["<all_urls>"];

/**
 * technology-stack page-world bridge 的唯一 WAR 资源名。
 * 
 * 说明：
 * - 该脚本只读取 allowlisted window chain 存在性和值摘要；
 * - 不包含远程代码加载，也不会暴露宽泛资源目录；
 * - manifest 与测试都复用这个常量，避免 WAR 白名单静默漂移。
 */
export const TECHNOLOGY_STACK_BRIDGE_RESOURCE = "technology-stack-bridge.js";

/**
 * 静态 content script 模型下不再需要修正 CRXJS 生成的 WAR。
 *
 * 说明：
 * - 保留这个函数名是为了让 Vite 配置和历史测试能以同一入口确认“不做改写”；
 * - 静态 content script 与最小 WAR 白名单都已经在 manifest 源码真源里声明。
 *
 * @param {Record<string, unknown>} manifest
 * @returns {Record<string, unknown>}
 */
export function normalizeDynamicContentScriptWar(manifest) {
  return manifest;
}
