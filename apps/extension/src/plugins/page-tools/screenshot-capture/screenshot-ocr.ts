/**
 * 说明：`screenshot-ocr` 后台截图文字识别模块。
 *
 * 职责：
 * - 为网页截图 OCR 动作读取当前聊天设置里的 OCR 模型；
 * - 复用主聊天 provider/runtime 计划，确保 vision 判型、provider contract、
 *   providerOptions、请求参数过滤与执行模式都走同一条真源；
 * - 使用内部 JSON 结果契约，只把 `text` 字段交给页面浮窗，避免模型解释文案进入 UI；
 * - OCR 结果一次性返回给页面浮窗，但底层请求跟随主聊天的 `streamText / generateText` 策略。
 *
 * 边界：
 * - 本模块不打开 Side Panel、不投递 UI Port、不持久化 OCR 结果；
 * - 不新增 OCR 专用 provider 矩阵，模型能力只认现有 `vision-input` 判型；
 * - OCR 是独立后台任务，显式禁用 AI SDK 隐式重试，避免一次点击放大成多次请求。
 */
import { generateText as aiGenerateText, streamText as aiStreamText } from 'ai';
import type { ModelMessage } from 'ai';

import i18n from '@/i18n';
import { readChatSettingsFromStorage } from '@/lib/chat/chat-settings-storage';
import { parseChatStreamImageUrl } from '@/lib/chat-stream-protocol';
import { I18nError } from '@/lib/i18n/error';
import { i18nText } from '@/lib/i18n/text';
import type { ChatSettings } from '@/types/chat';
import type { ScreenshotEditorActionPayload } from '@/plugins/page-tools/screenshot-capture/contracts';
import { toUserFacingAiErrorText } from '@/lib/ai/utils/api-errors';
import {
  buildRuntimeTextCallArgs,
  resolveRuntimeTextExecutionMode,
} from '@/lib/ai/runtime-text-call';
import {
  getImageInputError,
  supportsVisionInput,
} from '@/lib/ai/stream-chat-message-helpers';
import {
  buildRuntimeCallPlan,
  resolveStreamContext,
} from '@/lib/ai/stream-chat-context';

/** OCR 多模态调用依赖；测试可替换 AI SDK 与 runtime 计划。 */
export interface ScreenshotOcrDeps {
  /** 读取聊天设置。 */
  readSettings?: () => Promise<ChatSettings>;
  /** 解析 provider/model runtime 上下文。 */
  resolveContext?: typeof resolveStreamContext;
  /** 构建 provider-aware runtime 调用计划。 */
  buildPlan?: typeof buildRuntimeCallPlan;
  /** AI SDK 非流式文本生成。 */
  generateText?: typeof aiGenerateText;
  /** AI SDK 流式文本生成；OCR 最终仍只读取完整文本。 */
  streamText?: typeof aiStreamText;
}

/** OCR helper 返回的稳定结果。 */
export interface ScreenshotOcrResult {
  /** 模型识别出的文本；空字符串代表未识别到文字，不算异常。 */
  text: string;
}

/** 读取并归一化当前聊天设置。 */
async function readScreenshotOcrSettings(): Promise<ChatSettings> {
  return readChatSettingsFromStorage();
}

/** 归一化 OCR 文本字段，保留换行结构但去掉外围空白与 CRLF 差异。 */
function normalizeOcrText(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim();
}

/**
 * 解析 OCR 模型的内部结构化结果。
 *
 * 说明：
 * - OCR UI 只展示截图中真实可见的文字，不展示模型生成的说明、标题或 Markdown 包装；
 * - 这里要求模型输出严格 JSON，是为了让“提取结果如下”这类解释性文本在后台失败，而不是泄露到用户界面；
 * - 不做 code fence 清洗或前缀剥离，避免把不合约输出误判为可信 OCR 文本。
 *
 * @param rawText - AI SDK 返回的完整模型文本。
 * @returns 可直接展示的 OCR 文本。
 */
function parseScreenshotOcrText(rawText: unknown): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(rawText ?? '').trim());
  } catch {
    throw new I18nError('errors.screenshotOcrOutputInvalid');
  }

  if (
    !parsed
    || typeof parsed !== 'object'
    || Array.isArray(parsed)
    || typeof (parsed as { text?: unknown }).text !== 'string'
  ) {
    throw new I18nError('errors.screenshotOcrOutputInvalid');
  }

  return normalizeOcrText((parsed as { text: string }).text);
}

/**
 * 把截图动作里的 data URL 转成 AI SDK 官方多模态 message parts。
 *
 * 说明：
 * - 不复用聊天附件入口，避免 OCR 任务和主聊天草稿/附件协议耦合；
 * - 仍复用聊天线图片 URL 解析真源，保证 MIME 只允许 PNG/JPEG/WebP；
 * - `image` 传 base64 string，`mediaType` 明确随 data URL 透传，符合 AI SDK ImagePart 契约。
 *
 * @param payload - content script 已导出的 OCR 图片。
 * @returns 可直接传给 AI SDK 文本调用的消息数组。
 */
function buildScreenshotOcrMessages(payload: ScreenshotEditorActionPayload): ModelMessage[] {
  const parsed = parseChatStreamImageUrl(payload.image.dataUrl);
  if (parsed?.kind !== 'data' || parsed.mediaType !== payload.image.mime) {
    throw new I18nError('errors.screenshotOcrImageInvalid');
  }

  return [{
    role: 'user',
    content: [
      { type: 'text', text: i18n.t('screenshotEditor.ocrPrompt') },
      { type: 'image', image: parsed.base64, mediaType: parsed.mediaType },
    ],
  }];
}

/**
 * 把 AI SDK / provider 错误转换为 OCR 可跨运行时传递的 I18nError。
 *
 * @param error - streamText / generateText 或 provider runtime 抛出的未知错误。
 * @returns 保留 HTTP/status/provider 响应细节的 i18n 错误。
 */
function toScreenshotOcrI18nError(error: unknown): I18nError {
  const text = toUserFacingAiErrorText(error, i18nText('errors.screenshotOcrFailed'));
  return new I18nError(text.key, text.params);
}

/**
 * 执行截图 OCR。
 *
 * @param payload - content script 已导出的截图 PNG。
 * @param deps - 测试依赖注入。
 * @returns OCR 文本结果。
 */
export async function extractTextFromScreenshot(
  payload: ScreenshotEditorActionPayload,
  deps: ScreenshotOcrDeps = {},
): Promise<ScreenshotOcrResult> {
  const settings = await (deps.readSettings ?? readScreenshotOcrSettings)();
  const model = String(settings.ocrModel ?? settings.defaultModel ?? '').trim();
  if (!model) throw new I18nError('errors.screenshotOcrModelRequired');

  const resolveContext = deps.resolveContext ?? resolveStreamContext;
  const buildPlan = deps.buildPlan ?? buildRuntimeCallPlan;
  const generateText = deps.generateText ?? aiGenerateText;
  const streamText = deps.streamText ?? aiStreamText;
  const params = {
    model,
    temperature: 0,
    topP: settings.defaultTopP,
    maxTokens: settings.defaultMaxTokens || 2048,
  };
  const ctx = await resolveContext(params);

  const providerImageError = getImageInputError({
    providerName: ctx.providerConfig?.name || ctx.providerId,
    contract: ctx.providerContract,
    transportProtocol: ctx.resolvedModelMeta.transportProtocol,
  });
  if (providerImageError) throw providerImageError;
  if (ctx.providerConfig?.apiOptions?.isNotSupportImageInput) {
    throw new I18nError('errors.imageInputNotSupportedByProvider', {
      providerName: ctx.providerConfig?.name || ctx.providerId,
    });
  }
  if (!supportsVisionInput({
    kind: ctx.resolvedModelMeta.kind,
    inputModalities: ctx.resolvedModelMeta.inputModalities,
    featureKeys: ctx.featureKeys,
  })) {
    throw new I18nError('errors.screenshotOcrModelNotVision');
  }

  const plan = await buildPlan(ctx, params);
  const messages = buildScreenshotOcrMessages(payload);
  const callArgs = buildRuntimeTextCallArgs({
    runtimeCallPlan: plan,
    messages,
  });
  const execution = resolveRuntimeTextExecutionMode(
    plan,
    ctx.modelConfig?.supportedTextDelta,
  );

  try {
    if (execution.mode === 'generateText') {
      const result = await generateText(callArgs);
      return { text: parseScreenshotOcrText((result as { text?: unknown }).text) };
    }
    const result = streamText(callArgs);
    return { text: parseScreenshotOcrText(await result.text) };
  } catch (error: unknown) {
    if (error instanceof I18nError) throw error;
    throw toScreenshotOcrI18nError(error);
  }
}
