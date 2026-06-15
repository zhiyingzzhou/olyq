/**
 * 说明：页面工具打开确认校验模块。
 *
 * 职责：
 * - 将 content script 的 `element/picker/open` / `screenshot/editor/open` 响应收敛为强事务确认；
 * - 避免 Service Worker 把“消息送达”误判成“工具已经显示并接管页面”；
 * - 统一处理 session 不匹配、工具类型不匹配与 content script 显式失败。
 *
 * 边界：
 * - 本模块不发送消息、不创建会话，只校验跨运行时响应；
 * - 失败统一抛出可国际化错误，调用方负责删除 session、恢复 sidepanel 和 toast。
 */
import { I18nError } from '@/lib/i18n/error';
import { isI18nText } from '@/lib/i18n/text';
import { isPlainRecord } from '@/lib/utils/type-guards';
import type { PageToolOpenResponse } from '@/types/content-script-messages';
import type { PageToolSessionTool } from '@/types/sw-messages';

/**
 * 校验页面工具是否已经真实打开。
 *
 * @param response - content script 返回的原始响应。
 * @param expected - 当前 SW 会话预期的工具、session 与失败文案。
 * @returns 通过校验后的成功响应。
 * @throws I18nError 或 content script 返回的 I18nText。
 */
export function assertPageToolOpened(response: unknown, expected: {
  tool: PageToolSessionTool;
  sessionId: string;
  errorKey: string;
}): Extract<PageToolOpenResponse, { ok: true }> {
  if (isPlainRecord(response) && response.ok === false && isI18nText(response.error)) {
    throw response.error;
  }

  if (!isPlainRecord(response)) {
    throw new I18nError(expected.errorKey);
  }

  if (
    response.ok !== true
    || response.opened !== true
    || response.tool !== expected.tool
    || response.sessionId !== expected.sessionId
  ) {
    throw new I18nError(expected.errorKey);
  }

  return response as Extract<PageToolOpenResponse, { ok: true }>;
}
