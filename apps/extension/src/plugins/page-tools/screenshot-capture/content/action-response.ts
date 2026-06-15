/**
 * 说明：`screenshot-action-response` 截图页面工具动作消息模块。
 *
 * 职责：
 * - 统一发送截图工具条动作到 Service Worker；
 * - 将后台返回的结构化错误转换为内容脚本可展示的当前语言文案；
 * - OCR 浮窗关闭后再由页面工具会话恢复 Side Panel，本模块不承载恢复状态。
 *
 * 边界：
 * - 本模块只处理 content script 到 Service Worker 的一次性动作消息；
 * - 不创建页面 UI、不读写截图编辑器状态、不直接恢复 Side Panel。
 */
import type { ScreenshotEditorActionPayload } from '@/plugins/page-tools/screenshot-capture/contracts';
import i18n from '@/i18n';
import { toI18nTextFromError } from '@/lib/i18n/error';
import { formatI18nText } from '@/lib/i18n/format';
import { i18nText, normalizeI18nText } from '@/lib/i18n/text';
import { sendExtensionMessage } from '@/lib/extension/runtime-api';

/** Service Worker 对截图工具条动作的标准回包。 */
export type ScreenshotActionResponse = {
  /** 动作是否完成。 */
  ok?: boolean;
  /** 后台返回的结构化错误。 */
  error?: unknown;
  /** OCR 动作返回的识别文本。 */
  text?: unknown;
  /** OCR 请求 ID，用于最终回包兜底创建 / 更新对应页面浮窗。 */
  ocrRequestId?: unknown;
};

/** 带后台原始回包的截图动作错误。 */
export type ScreenshotActionError = Error & {
  /** 后台动作失败时的原始结构化回包。 */
  response?: ScreenshotActionResponse;
};

/**
 * 将未知错误转换成截图编辑器可展示的当前语言文案。
 *
 * @param error - 业务错误、I18nError 或普通 Error。
 * @returns 用户可读错误文案。
 */
export function formatScreenshotActionError(error: unknown): string {
  const response = (error as ScreenshotActionError | undefined)?.response;
  if (response?.error) {
    return formatI18nText(i18n.t.bind(i18n), normalizeI18nText(response.error));
  }
  return formatI18nText(i18n.t.bind(i18n), toI18nTextFromError(error));
}

/**
 * 向后台发送截图动作。
 *
 * @param payload - 已导出的截图动作负载。
 * @returns 后台确认后的结构化响应。
 */
export async function sendScreenshotAction(
  payload: ScreenshotEditorActionPayload,
): Promise<ScreenshotActionResponse> {
  const response = await sendExtensionMessage<ScreenshotActionResponse | undefined>({
    type: 'screenshot/action',
    payload,
  });
  if (!response?.ok) {
    const normalizedError = response?.error
      ? normalizeI18nText(response.error, i18nText('errors.pageToolSidePanelUnavailable'))
      : i18nText('errors.pageToolSidePanelUnavailable');
    const error = new Error(normalizedError.key) as ScreenshotActionError;
    if (response) response.error = normalizedError;
    if (response) error.response = response;
    throw error;
  }
  return response;
}

/**
 * 从截图动作错误里读取后台回传的 OCR requestId。
 *
 * @param error - `sendScreenshotAction` 抛出的错误或任意未知错误。
 */
export function readScreenshotActionOcrRequestId(error: unknown): string | undefined {
  const response = (error as ScreenshotActionError | undefined)?.response;
  return typeof response?.ocrRequestId === 'string' && response.ocrRequestId.trim()
    ? response.ocrRequestId.trim()
    : undefined;
}
