/**
 * 说明：`link-preview-api` 扩展运行时访问模块。
 *
 * 职责：
 * - 为聊天 Markdown 链接预览提供 UI 到 Service Worker 的唯一 one-shot 调用入口；
 * - 避免 React 组件直接拼接 `chrome.runtime.sendMessage` 或跨域 `fetch`；
 *
 * 边界：
 * - 本文件只做扩展消息发送，不解析 HTML、不维护缓存、不承担 UI 展示。
 */
import type { SwLinkPreviewMetadataResponse } from '@/types/sw-messages';
import { sendExtensionMessage } from './runtime-api';

/**
 * 请求 Service Worker 获取链接预览元数据。
 *
 * @param url - 待预览的 http/https 链接。
 * @returns 后台返回的结构化元数据或稳定失败码。
 */
export async function requestLinkPreviewMetadata(url: string): Promise<SwLinkPreviewMetadataResponse> {
  return await sendExtensionMessage<SwLinkPreviewMetadataResponse>({
    type: 'link-preview/metadata/get',
    payload: { url },
  });
}
