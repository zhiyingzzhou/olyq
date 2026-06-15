/**
 * 说明：`page-style-input` 聊天区页面风格输入模块。
 *
 * 职责：
 * - 根据当前会话的 browser-context 风格模式与模型视觉能力，决定是否附加页面截图输入；
 * - 把后台返回的页面分段截图转换成临时 API 图片附件，不污染用户消息持久化结构；
 * - 对截图失败做可诊断降级，让调用方能够提示“本轮已退化为仅使用 DOM/CSS 设计信号”。
 *
 * 边界：
 * - 本模块只处理“发给模型的临时视觉输入”，不负责 DOM/CSS 文本信号注入；
 * - 页面设计信号仍由 `buildChatSystemContent()` 走 browser-context collector 注入；
 * - 不直接显示 toast，由上层发送/重发 Hook 决定如何提示用户。
 */
import { useAssistantStore } from '@/hooks/useAssistantStore';
import {
  getBrowserContextMetadata,
  resolveBrowserContextEffectiveState,
} from '@/lib/browser-context';
import { resolveAssistantTopic } from '@/lib/chat/topic-tree';
import { supportsVisionInput } from '@/lib/ai/stream-chat-message-helpers';
import {
  loadStoredPageStyleCaptureFrames,
  resolvePageStyleContextSnapshot,
} from '@/lib/browser-context/page-style-context';
import { toI18nTextFromError } from '@/lib/i18n/error';
import { i18nText } from '@/lib/i18n/text';
import type { ApiAttachment, ApiImageAttachment } from '@/lib/chat-stream';
import type { I18nText } from '@/types/i18n';
import type { PageStyleCaptureFramePayload } from '@/types/sw-messages';
import type { BrowserContextEffectiveState } from '@/lib/browser-context';

type VisionCapableModel = {
  kind?: string;
  inputModalities?: ReadonlyArray<string>;
  features?: ReadonlyArray<string>;
};

/** 页面风格视觉输入的解析结果。 */
export type PageStyleVisionInputResult = {
  /** 按模型 ID 分组后的临时附件。 */
  attachmentsByModelId: Map<string, ApiAttachment[]>;
  /** 当前发送轮次解析出的 browser-context 生效态真值。 */
  effectiveState: BrowserContextEffectiveState;
  /** 若截图失败但主聊天可继续，则返回提示文案。 */
  warning: I18nText | null;
};

/**
 * 判断模型是否具备视觉输入能力。
 *
 * @param model - UI 模型选项。
 * @returns 是否应附加页面截图。
 */
export function supportsPageStyleVisionInput(model: unknown): boolean {
  const record = model && typeof model === 'object' ? model as VisionCapableModel : {};
  const featureKeys = new Set(
    (Array.isArray(record.features) ? record.features : [])
      .map((feature) => String(feature || '').trim().toLowerCase())
      .filter(Boolean),
  );

  return supportsVisionInput({
    kind: String(record.kind || '').trim(),
    inputModalities: (Array.isArray(record.inputModalities) ? record.inputModalities : [])
      .map((modality) => String(modality || '').trim().toLowerCase())
      .filter(Boolean),
    featureKeys,
  });
}

/**
 * 将页面截图帧转换为 API 图片附件。
 *
 * @param frames - 页面截图帧列表。
 * @returns 供模型消费的图片附件数组。
 */
function toApiImageAttachments(frames: PageStyleCaptureFramePayload[]): ApiImageAttachment[] {
  return frames.map((frame) => ({
    type: 'image',
    url: frame.dataUrl,
    name: frame.name,
    mime: frame.mime,
  }));
}

/**
 * 把 preflight 返回的截图帧转换成临时视觉附件。
 *
 * @param frames - 页面截图帧列表。
 * @returns API 附件数组。
 */
export function buildPageStyleVisionAttachmentsFromFrames(frames: PageStyleCaptureFramePayload[]): ApiAttachment[] {
  return toApiImageAttachments(frames);
}

/**
 * 为一组目标模型解析页面风格视觉输入。
 *
 * @param params - 当前会话、模型映射与取消信号。
 * @returns 视觉附件映射；失败时返回 warning 并降级为空附件。
 */
export async function resolvePageStyleVisionInputs(params: {
  conversationKey: string;
  modelIds: ReadonlyArray<string>;
  modelMap: Map<string, unknown>;
  signal: AbortSignal;
}): Promise<PageStyleVisionInputResult> {
  const resolved = resolveAssistantTopic(useAssistantStore.getState().assistants, params.conversationKey);
  const effectiveState = resolveBrowserContextEffectiveState({
    assistant: resolved?.assistant ?? null,
    conversationKey: params.conversationKey,
  });

  if (!effectiveState.effective || !effectiveState.conversationMode.styleSignalsEnabled || params.signal.aborted) {
    return { attachmentsByModelId: new Map(), effectiveState, warning: null };
  }

  const visionModelIds = Array.from(new Set(
    params.modelIds
      .map((modelId) => String(modelId || '').trim())
      .filter(Boolean)
      .filter((modelId) => supportsPageStyleVisionInput(params.modelMap.get(modelId))),
  ));

  if (visionModelIds.length < 1) {
    return { attachmentsByModelId: new Map(), effectiveState, warning: null };
  }

  try {
    const resolved = await resolvePageStyleContextSnapshot({
      conversationKey: params.conversationKey,
      metadata: getBrowserContextMetadata(),
      requireCaptures: true,
      maxCaptures: 5,
    });

    if (!resolved.snapshot) {
      return {
        attachmentsByModelId: new Map(),
        effectiveState,
        warning: resolved.captureWarning ?? i18nText('errors.pageStyleScreenshotsUnavailable'),
      };
    }

    const frames = await loadStoredPageStyleCaptureFrames(resolved.snapshot);
    if (frames.length < 1) {
      return {
        attachmentsByModelId: new Map(),
        effectiveState,
        warning: resolved.captureWarning ?? i18nText('errors.pageStyleScreenshotsUnavailable'),
      };
    }

    const attachments = toApiImageAttachments(frames);
    return {
      attachmentsByModelId: new Map(visionModelIds.map((modelId) => [modelId, attachments])),
      effectiveState,
      warning: resolved.captureWarning,
    };
  } catch (error: unknown) {
    return {
      attachmentsByModelId: new Map(),
      effectiveState,
      warning: toI18nTextFromError(error),
    };
  }
}
