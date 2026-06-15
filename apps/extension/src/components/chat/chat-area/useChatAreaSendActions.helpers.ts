/**
 * 说明：`useChatAreaSendActions.helpers` 组件模块。
 *
 * 职责：
 * - 收口 `useChatAreaSendActions` 中与附件预处理、目标模型解析、native file 判定相关的纯函数；
 * - 让发送 Hook 主文件聚焦在状态编排与请求时序，而不是继续堆积模型能力分流细节；
 *
 * 边界：
 * - 本文件不触发真正的流式请求，不持有 React 状态；
 * - 这里只做“发送前决策”，不扩散到 UI 展示或后台 transport 细节之外。
 */
import type { TFunction } from "i18next";
import { useChatSettingsStore } from "@/hooks/useChatSettingsStore";
import { buildElementReferencesModelContext, type ElementContextTranslate } from "@/lib/element-context-draft";
import { I18nError } from "@/lib/i18n/error";
import { isLikelyAudioAttachment } from "@/lib/chat/attachment-media";
import { transcribeAttachment } from "@/lib/transcription";
import type { MessageAttachment, MessageContextReference } from "@/types/chat";
import { getProviderView } from "@/lib/ai/provider-storage";
import { resolveModelMeta } from "@/lib/ai/model-registry/resolver";
import { applyUserModelTypes } from "@/lib/ai/model-type-system";
import { resolveProviderContract } from "@/lib/ai/providers/provider-contracts";
import { splitModel } from "@/lib/ai/provider-model-id";
import { isNativeFileTransportSupported, supportsFileInput } from "@/lib/ai/stream-chat-message-helpers";

/** 发送链里可被转写的音频文件附件。 */
export type AudioFileAttachment = Extract<MessageAttachment, { type: "file" }>;

/** 音频转写后的标准化发送入参。 */
export type NormalizedSendMessageInput = {
  text: string;
  attachments: MessageAttachment[];
};

/**
 * 合成真正发送给模型的用户输入。
 *
 * @remarks
 * `text` 是聊天气泡里可见的用户正文；`modelContext` 是页面元素引用卡这类隐藏上下文。
 * 二者只在模型 API message 里合并，避免把结构化引用直接渲染到用户消息正文。
 */
export function buildUserModelContent(args: {
  text: string;
  modelContext?: string;
  contextReferences?: MessageContextReference[];
  t?: ElementContextTranslate;
}) {
  const text = String(args.text || '').trim();
  const elementContext = args.t ? buildElementReferencesModelContext(args.contextReferences, args.t) : '';
  const modelContext = [String(args.modelContext || '').trim(), elementContext.trim()]
    .filter(Boolean)
    .join('\n\n');
  if (!modelContext) return text;
  if (!text) return modelContext;
  return `${text}\n\n${modelContext}`;
}

/** buildApiMessages 针对单个目标模型解析出的上下文。 */
export type BuildApiMessagesTargetContext = {
  providerId: string;
  providerName: string;
  providerContract: ReturnType<typeof resolveProviderContract>;
  resolvedModelMeta: Awaited<ReturnType<typeof resolveModelMeta>>;
  featureKeys: ReadonlySet<string>;
};

/**
 * 判断附件是否为音频文件。
 *
 * @remarks
 * 这里故意只返回 boolean，而不是更窄的 TS 谓词：
 * `MessageAttachment['file']` 本身并不携带“音频文件”这个静态类型位，
 * 如果把它写成 type guard，后续非音频 file 分支会被错误窄化成 `never`。
 */
export function isAudioFileAttachment(attachment: MessageAttachment): boolean {
  return attachment.type === "file" && isLikelyAudioAttachment(attachment.name, attachment.mime);
}

/**
 * 转写音频附件并返回可拼接到 prompt 的文本块。
 *
 * @remarks
 * 音频文件继续沿用现有“先转写，再进入普通文本聊天”的链路，
 * 不参与 native file 判定，避免把现有语音聊天体验绑到 document/file transport 上。
 */
async function transcribeAudioAttachments(params: {
  attachments: AudioFileAttachment[];
  model: string;
  signal: AbortSignal;
  t: TFunction;
}): Promise<string[]> {
  const { attachments, model, signal, t } = params;
  const transcriptBlocks: string[] = [];

  for (const attachment of attachments) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const result = await transcribeAttachment({
      model,
      attachmentId: attachment.id,
      signal,
    });
    const text = String(result.text || "").trim();
    if (!text) continue;
    transcriptBlocks.push(`\n\n[${t("chat.transcriptionAttachmentLabel", { name: attachment.name })}]\n${text}`);
  }

  return transcriptBlocks;
}

/**
 * 统一标准化发送入参。
 *
 * @remarks
 * - 普通文本/图片/文件输入保持原样；
 * - 只有音频文件会在发送前先被转写为文本，并回写到用户消息 content；
 * - 若未配置默认转写模型，则在这里抛出明确错误，由调用方决定提示方式。
 */
export async function normalizeSendMessageInput(params: {
  attachments?: MessageAttachment[];
  signal: AbortSignal;
  t: TFunction;
  text: string;
}): Promise<NormalizedSendMessageInput> {
  const attachments = Array.isArray(params.attachments) ? params.attachments : [];
  const audioAttachments = attachments.filter((attachment): attachment is AudioFileAttachment => isAudioFileAttachment(attachment));
  if (audioAttachments.length === 0) {
    return { text: params.text, attachments };
  }

  const transcriptionModel = String(useChatSettingsStore.getState().settings.defaultTranscriptionModel || "").trim();
  if (!transcriptionModel) {
    throw new I18nError("chat.transcriptionModelMissingDesc");
  }

  const transcriptBlocks = await transcribeAudioAttachments({
    attachments: audioAttachments,
    model: transcriptionModel,
    signal: params.signal,
    t: params.t,
  });
  const transcriptionText = transcriptBlocks.join("");

  return {
    text: transcriptionText ? (params.text ? `${params.text}${transcriptionText}` : transcriptionText.trimStart()) : params.text,
    attachments,
  };
}

/**
 * 解析 buildApiMessages 所需的目标模型上下文。
 *
 * @remarks
 * UI 侧只读取 Provider 配置、模型语义和 Provider 契约，不实例化真实 SDK。
 * 这样 compare / mention 才能按“每个目标模型各自的 transport 与能力”安全分流。
 */
export async function resolveBuildApiMessagesTargetContext(model: string): Promise<BuildApiMessagesTargetContext> {
  const { providerId, modelId } = splitModel(model);
  const provider = await getProviderView(providerId);
  if (!provider) {
    throw new I18nError("errors.providerNotFound", { providerId });
  }

  const configuredModel = provider.models?.find((item) => String(item?.id || "").trim() === modelId);
  const systemResolvedModelMeta = await resolveModelMeta({
    providerType: provider.type,
    providerId,
    apiHost: provider.apiHost,
    rawModelId: modelId,
    rawModelName: configuredModel?.name || modelId,
  });
  const resolvedModelMeta = applyUserModelTypes(systemResolvedModelMeta, configuredModel?.manualModelTypes);

  return {
    providerId,
    providerName: provider.name || providerId,
    providerContract: resolveProviderContract({
      providerId,
      providerType: provider.type,
      effectiveProviderType: provider.type,
      transportProtocol: resolvedModelMeta.transportProtocol,
    }),
    resolvedModelMeta,
    featureKeys: new Set(resolvedModelMeta.features.map((feature) => String(feature || "").trim().toLowerCase())),
  };
}

/**
 * 判断当前文件附件是否可以保留为 native file。
 *
 * @remarks
 * 只有下面 3 层都成立才会放行：
 * - Provider contract 明确支持 `file`
 * - 模型自身显式具备 `file-input`
 * - transport 白名单允许当前 MIME 对应的原生 schema
 */
export function shouldUseNativeFileAttachment(args: {
  mime: string;
  context: BuildApiMessagesTargetContext;
}): boolean {
  const mime = String(args.mime || "").trim().toLowerCase();
  if (!mime) return false;
  if (args.context.providerContract.inputPolicies.file !== "supported") return false;
  if (!supportsFileInput({
    inputModalities: args.context.resolvedModelMeta.inputModalities,
    featureKeys: args.context.featureKeys,
  })) {
    return false;
  }
  return isNativeFileTransportSupported({
    providerId: args.context.providerId,
    transportProtocol: args.context.resolvedModelMeta.transportProtocol,
    mime,
  });
}
