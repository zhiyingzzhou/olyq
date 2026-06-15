/**
 * 说明：`browser-context-send-budget` 聊天发送前上下文预算模块。
 *
 * 职责：
 * - 统一决定发送 / 重发 / 多模型发送时 browser-context preflight 的等待预算；
 * - 让显式全文模式获得足够时间完成 content script 稳定窗口采集；
 *
 * 边界：
 * - 本文件只返回预算数值，不直接触发采集、不读取存储、不操作 UI 状态。
 */

/**
 * 默认发送前 browser-context 预检预算。
 *
 * @remarks
 * 普通自动上下文也需要覆盖“顶层低质量后补采可见 iframe”的完整短链路。
 * 该值是前台总等待预算，不是传给 content script 的正文稳定窗口；后者继续使用短窗口，
 * 让低质量顶层页面尽快进入 iframe 补采集。
 */
export const DEFAULT_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS = 2_500;

/**
 * 显式全文模式发送前 browser-context 预检预算。
 *
 * @remarks
 * 全文模式需要同时覆盖 `full-page` readable-dom 稳定窗口、source cache 合并和 prompt
 * 渲染开销；总预算必须大于传给内容脚本的正文稳定窗口，避免重型营销页刚完成稳定等待就
 * 被前台总 race 降级为缓存/元数据。
 */
export const FULL_PAGE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS = 4_000;

/**
 * 页面风格截图发送前 browser-context 预检预算。
 *
 * @remarks
 * 页面截图需要经由后台串行滚动与 `captureVisibleTab` 限速，首次采集明显慢于 DOM/CSS
 * 信号读取；该预算只在本轮确实要把截图作为视觉输入时生效，避免普通自动上下文被拖慢。
 */
export const STYLE_CAPTURE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS = 5_000;

/**
 * 解析发送前 browser-context 采集预算。
 *
 * @param state - 当前会话的 browser-context 生效态片段；`requireCaptures` 表示本轮是否需要页面风格截图作为视觉输入。
 * @returns 发送前 preflight 的毫秒预算。
 */
export function resolveBrowserContextSendPreflightBudgetMs(state: {
  effective: boolean;
  conversationMode: {
    fullPageEnabled: boolean;
  };
  requireCaptures: boolean;
}): number {
  if (!state.effective) return DEFAULT_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS;
  if (state.requireCaptures) return STYLE_CAPTURE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS;
  if (state.conversationMode.fullPageEnabled) return FULL_PAGE_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS;
  return DEFAULT_BROWSER_CONTEXT_SEND_PREFLIGHT_BUDGET_MS;
}
