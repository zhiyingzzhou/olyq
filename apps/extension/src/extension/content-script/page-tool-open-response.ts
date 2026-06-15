/**
 * 说明：`page-tool-open-response` 内容脚本工具模块。
 *
 * 职责：
 * - 解析 Service Worker 打开页面工具时携带的会话字段；
 * - 统一构造元素选择器和截图编辑器的真实打开确认响应；
 * - 统一把打开失败转换成跨运行时可传递的本地化错误。
 *
 * 边界：
 * - 本文件只处理 content script 返回给 Service Worker 的轻量协议对象；
 * - 不负责打开工具 UI、绑定事件或恢复 sidepanel。
 */
import { toI18nTextFromError } from '@/lib/i18n/error';
import type { PageToolOpenResponse } from '@/types/content-script-messages';
import type { PageToolSessionTool } from '@/types/sw-messages';

/** 页面工具打开消息里的会话选项。 */
export interface PageToolOpenOptions {
  /** Service Worker 创建的页面工具会话 ID。 */
  sessionId?: string;
  /** 工具关闭或完成后是否回到 sidepanel。 */
  returnToPanel: boolean;
}

/**
 * 从页面工具打开 payload 里读取会话字段。
 *
 * @param payload - Service Worker 投递给 content script 的打开负载。
 * @returns 规范化后的页面工具会话选项。
 */
export function readPageToolOpenOptions(payload: unknown): PageToolOpenOptions {
  const record = payload && typeof payload === 'object'
    ? payload as { sessionId?: unknown; returnToPanel?: unknown }
    : {};
  return {
    ...(typeof record.sessionId === 'string' && record.sessionId.trim()
      ? { sessionId: record.sessionId.trim() }
      : {}),
    returnToPanel: record.returnToPanel === true,
  };
}

/**
 * 构造页面工具真实打开后的成功确认。
 *
 * @param tool - 已打开的页面工具类型。
 * @param options - 当前页面工具会话选项。
 * @returns Service Worker 可校验的打开确认响应。
 */
export function createPageToolOpenedResponse(
  tool: PageToolSessionTool,
  options: PageToolOpenOptions,
): PageToolOpenResponse {
  return {
    ok: true,
    opened: true,
    tool,
    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
    ...(options.returnToPanel ? { returnToPanel: true } : {}),
  };
}

/**
 * 构造页面工具打开失败响应。
 *
 * @param error - 打开过程中捕获到的未知异常。
 * @returns Service Worker 可展示 toast 的稳定错误响应。
 */
export function createPageToolOpenErrorResponse(error: unknown): PageToolOpenResponse {
  return { ok: false, error: toI18nTextFromError(error) };
}
