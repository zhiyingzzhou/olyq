/**
 * 说明：`shared` 组件模块。
 *
 * 职责：
 * - 承载 `shared` 相关的当前文件实现与模块边界；
 * - 对外暴露 `runAutoRename`、`collectInputImagesFromAttachments`、`generateImageReplyAttachments` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { blobToDataUrl, dataUrlToBlob, getAttachmentBlob, putImageAttachment } from "@/lib/attachments";
import { generateImagesRuntime } from "@/lib/image-gen-runtime";
import { generateAutoRenameTitle } from "@/lib/chat/auto-rename";
import { normalizeOutboundImageBlob } from "@/lib/chat/outbound-image-normalization";
import type { Message, MessageAttachment, ResolvedConversationContext } from "@/types/chat";

/**
 * 导出函数：`runAutoRename`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function runAutoRename(topic: ResolvedConversationContext, messages: Message[]): Promise<string> {
  return await generateAutoRenameTitle(topic.model, messages);
}

/**
 * 导出函数：`collectInputImagesFromAttachments`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function collectInputImagesFromAttachments(
  attachments: MessageAttachment[] | undefined,
  signal: AbortSignal,
): Promise<string[]> {
  const imageAttachments = (Array.isArray(attachments) ? attachments : []).filter((attachment) => attachment?.type === "image");
  if (imageAttachments.length === 0) return [];

  const output: string[] = [];
  for (const attachment of imageAttachments) {
    if (signal.aborted) break;
    const blob = await getAttachmentBlob(attachment.id);
    if (!blob) continue;
    const normalized = await normalizeOutboundImageBlob({
      blob,
      name: attachment.name,
      mime: attachment.mime,
      signal,
    });
    const dataUrl = await blobToDataUrl(normalized.blob);
    if (typeof dataUrl === "string" && dataUrl.startsWith("data:")) output.push(dataUrl);
  }
  return output;
}

/**
 * 导出函数：`generateImageReplyAttachments`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function generateImageReplyAttachments(params: {
  inputImages?: string[];
  model: string;
  prompt: string;
  signal: AbortSignal;
}): Promise<MessageAttachment[]> {
  const result = await generateImagesRuntime({
    model: params.model,
    prompt: params.prompt,
    ...(params.inputImages && params.inputImages.length > 0 ? { inputImages: params.inputImages } : {}),
    signal: params.signal,
  });

  const attachments: MessageAttachment[] = [];
  for (const image of result.images) {
    const parsed = dataUrlToBlob(image.dataUrl);
    const ref = await putImageAttachment({ blob: parsed.blob, name: image.name, mime: image.mime || parsed.mime });
    attachments.push({ type: "image", id: ref.id, name: ref.name, mime: ref.mime, size: ref.size });
  }
  return attachments;
}
