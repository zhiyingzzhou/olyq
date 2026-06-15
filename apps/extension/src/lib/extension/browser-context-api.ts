/**
 * 说明：`browser-context-api` 浏览器上下文 one-shot 扩展 contract。
 *
 * 职责：
 * - 为 `browser-context` 提供统一的 Service Worker one-shot 请求入口；
 * - 集中承载正文、布局、设计信号和截图请求的消息类型与负载拼装；
 * - 避免 collector 与页面风格快照模块继续分散拼接 `chrome.runtime.sendMessage`。
 *
 * 边界：
 * - 这里只负责 runtime contract，不负责页面可采集性判断或降级文案；
 * - 调用方仍然负责按当前 metadata、权限态和产品语义决定是否发请求、如何兜底错误。
 */
import type { I18nText } from '@/types/i18n';
import type {
  BrowserContextReadableDomPayload,
  PageStyleCapturesPayload,
  PageStyleLayoutMetricsPayload,
  PageStyleSignalsPayload,
  SwMsg_BrowserContextPageStyleCapturesGet,
  SwMsg_BrowserContextPageStyleLayoutGet,
  SwMsg_BrowserContextPageStyleSignalsGet,
  SwMsg_BrowserContextReadableDomGet,
} from '@/types/sw-messages';
import { sendExtensionMessage } from './runtime-api';

/**
 * browser-context one-shot 后台响应。
 *
 * 说明：
 * - 这层保持后台现有 `{ ok, payload, error }` 结构，不额外重写协议；
 * - `error` 类型按消息语义保留 `string` 或 `I18nText`。
 */
export interface BrowserContextRuntimeResponse<TPayload, TError = string | I18nText> {
  /** 后台是否返回成功态。 */
  ok?: boolean;
  /** 后台返回负载。 */
  payload?: TPayload | null;
  /** 后台返回的失败码或本地化文案。 */
  error?: TError;
}

/** `browser-context/readable-dom/get` 的标准响应。 */
export type BrowserContextReadableDomRuntimeResponse =
  BrowserContextRuntimeResponse<BrowserContextReadableDomPayload, string>;

/** `browser-context/page-style-signals/get` 的标准响应。 */
export type BrowserContextPageStyleSignalsRuntimeResponse =
  BrowserContextRuntimeResponse<PageStyleSignalsPayload, string | I18nText>;

/** `browser-context/page-style-layout/get` 的标准响应。 */
export type BrowserContextPageStyleLayoutRuntimeResponse =
  BrowserContextRuntimeResponse<PageStyleLayoutMetricsPayload, string | I18nText>;

/** `browser-context/page-style-captures/get` 的标准响应。 */
export type BrowserContextPageStyleCapturesRuntimeResponse =
  BrowserContextRuntimeResponse<PageStyleCapturesPayload, string | I18nText>;

/**
 * 统一发送 browser-context 的 one-shot 请求。
 *
 * @param message - 目标消息。
 * @returns 后台原样响应。
 */
async function sendBrowserContextRuntimeMessage<TResponse>(
  message:
    | SwMsg_BrowserContextReadableDomGet
    | SwMsg_BrowserContextPageStyleSignalsGet
    | SwMsg_BrowserContextPageStyleLayoutGet
    | SwMsg_BrowserContextPageStyleCapturesGet,
): Promise<TResponse | undefined> {
  return await sendExtensionMessage<TResponse | undefined>(message);
}

/**
 * 请求后台按需采集当前页面正文。
 *
 * @param payload - 目标标签页负载。
 * @returns 后台响应。
 */
export async function requestBrowserContextReadableDom(
  payload?: SwMsg_BrowserContextReadableDomGet['payload'],
): Promise<BrowserContextReadableDomRuntimeResponse | undefined> {
  return await sendBrowserContextRuntimeMessage<BrowserContextReadableDomRuntimeResponse>({
    type: 'browser-context/readable-dom/get',
    payload,
  });
}

/**
 * 请求后台按需采集当前页面设计信号。
 *
 * @param payload - 目标标签页负载。
 * @returns 后台响应。
 */
export async function requestBrowserContextPageStyleSignals(
  payload?: SwMsg_BrowserContextPageStyleSignalsGet['payload'],
): Promise<BrowserContextPageStyleSignalsRuntimeResponse | undefined> {
  return await sendBrowserContextRuntimeMessage<BrowserContextPageStyleSignalsRuntimeResponse>({
    type: 'browser-context/page-style-signals/get',
    payload,
  });
}

/**
 * 请求后台按需采集当前页面布局度量。
 *
 * @param payload - 目标标签页负载。
 * @returns 后台响应。
 */
export async function requestBrowserContextPageStyleLayout(
  payload?: SwMsg_BrowserContextPageStyleLayoutGet['payload'],
): Promise<BrowserContextPageStyleLayoutRuntimeResponse | undefined> {
  return await sendBrowserContextRuntimeMessage<BrowserContextPageStyleLayoutRuntimeResponse>({
    type: 'browser-context/page-style-layout/get',
    payload,
  });
}

/**
 * 请求后台按需采集当前页面截图。
 *
 * @param payload - 目标标签页与截图预算。
 * @returns 后台响应。
 */
export async function requestBrowserContextPageStyleCaptures(
  payload?: SwMsg_BrowserContextPageStyleCapturesGet['payload'],
): Promise<BrowserContextPageStyleCapturesRuntimeResponse | undefined> {
  return await sendBrowserContextRuntimeMessage<BrowserContextPageStyleCapturesRuntimeResponse>({
    type: 'browser-context/page-style-captures/get',
    payload,
  });
}
