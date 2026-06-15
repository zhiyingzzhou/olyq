/**
 * 说明：`chat-stream-protocol` 基础能力模块。
 *
 * 职责：
 * - 承载 `chat-stream-protocol` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ParsedChatStreamImageUrl`、`ParsedChatStreamFileDataUrl`、`ChatStreamWireAttachment` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { isOutboundModelImageMime } from '@/lib/chat/outbound-image-formats';
/**
 * UI 与 Service Worker 共用的聊天线协议。
 *
 * 约束：
 * - 图片附件继续使用 `attachments[].url`，支持 data URL 与远端 http(s) URL；
 * - 文件附件统一使用 `attachments[].dataUrl`，只允许本地 data URL，不允许远端 URL；
 * - 旧 `dataUrl` 图片协议不再保留。
 */

/** 解析后的图片附件 URL。 */
export type ParsedChatStreamImageUrl =
  | {
      /** 内联 data URL。 */
      kind: 'data'
      /** 原始规范化后的 URL。 */
      raw: string
      /** 图片 MIME 类型。 */
      mediaType: string
      /** base64 数据。 */
      base64: string
    }
  | {
      /** 远端图片 URL。 */
      kind: 'remote'
      /** 原始规范化后的 URL。 */
      raw: string
      /** 解析后的 URL 对象。 */
      url: URL
    }

/** 解析后的文件 data URL。 */
export type ParsedChatStreamFileDataUrl = {
  /** 原始规范化后的 data URL。 */
  raw: string
  /** 文件 MIME 类型。 */
  mediaType: string
  /** base64 数据。 */
  base64: string
}

/**
 * 内部函数：`parseBase64DataUrl`。
 *
 * @remarks
 * 统一解析 data URL，调用方再根据场景决定是否允许该 MIME 类型。
 */
function parseBase64DataUrl(raw: string): ParsedChatStreamFileDataUrl | null {
  const value = String(raw || '').trim()
  if (!value.startsWith('data:')) return null

  const dataUrlMatch = value.match(/^data:([^;,]+);base64,(.+)$/i)
  if (!dataUrlMatch) return null

  const mediaType = String(dataUrlMatch[1] || '').trim().toLowerCase()
  const base64 = String(dataUrlMatch[2] || '').trim()
  if (!mediaType || !base64) return null
  return { raw: value, mediaType, base64 }
}

/**
 * 解析聊天线协议里的图片 URL。
 *
 * 约束：
 * - 只接受已规范化的 `data:image/png|jpeg|webp;base64,...`
 * - 或绝对 `http(s)` URL
 */
export function parseChatStreamImageUrl(raw: string): ParsedChatStreamImageUrl | null {
  const value = String(raw || '').trim()
  if (!value) return null

  const parsedDataUrl = parseBase64DataUrl(value)
  if (parsedDataUrl) {
    if (!isOutboundModelImageMime(parsedDataUrl.mediaType)) return null
    return {
      kind: 'data',
      raw: parsedDataUrl.raw,
      mediaType: parsedDataUrl.mediaType,
      base64: parsedDataUrl.base64,
    }
  }

  if (value.startsWith('data:')) return null

  try {
    const url = new URL(value)
    const protocol = url.protocol.toLowerCase()
    if (protocol !== 'http:' && protocol !== 'https:') return null
    return { kind: 'remote', raw: value, url }
  } catch {
    return null
  }
}

/**
 * 解析聊天线协议里的文件 data URL。
 *
 * 约束：
 * - 只接受 `data:<mime>;base64,...`
 * - 不接受远端 URL
 */
export function parseChatStreamFileDataUrl(raw: string): ParsedChatStreamFileDataUrl | null {
  return parseBase64DataUrl(raw)
}

/** 图片附件协议。 */
export interface ChatStreamWireImageAttachment {
  /** 附件类型：图片。 */
  type: 'image'
  /** 图片地址：支持 data URL 或远端 URL。 */
  url: string
  /** 原始文件名/展示名。 */
  name?: string
  /** MIME 类型（例如 image/png）。 */
  mime?: string
  /** 字节大小。 */
  size?: number
}

/** 文件附件协议。 */
export interface ChatStreamWireFileAttachment {
  /** 附件类型：文件。 */
  type: 'file'
  /** 文件内容：仅允许本地 data URL。 */
  dataUrl: string
  /** 文件 MIME 类型。 */
  mime: string
  /** 原始文件名/展示名。 */
  name?: string
  /** 字节大小。 */
  size?: number
}

/** 聊天线协议附件联合类型。 */
export type ChatStreamWireAttachment =
  | ChatStreamWireImageAttachment
  | ChatStreamWireFileAttachment

/** 单条聊天消息协议。 */
export interface ChatStreamWireMessage {
  /** 消息角色。 */
  role: 'user' | 'assistant' | 'system'
  /** 纯文本内容。 */
  content: string
  /** 可选附件。 */
  attachments?: ChatStreamWireAttachment[]
}
