/**
 * 说明：`useExternalUiPortBridge` 页面模块。
 *
 * 职责：
 * - 承载 `useExternalUiPortBridge` 相关的当前文件实现与模块边界；
 * - 对外暴露 `useExternalUiPortBridge` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { TFunction } from 'i18next';

import { type ChatAreaHandle } from '@/components/chat/ChatArea';
import type { ChatInputExternalDraft } from '@/components/chat/chat-input/types';
import { ensureUiPortReady, onUiPortMessage, postUiPortMessage } from '@/extension/bridge/ui-port';
import {
  ensureSidePanelPageToolPortReady,
  onSidePanelPageToolCommand,
  postSidePanelPageToolMessage,
} from '@/extension/bridge/sidepanel-page-tool-port';
import { toast } from '@/hooks/useToast';
import { putImageAttachment } from '@/lib/attachments';
import { downloadUrlToFile } from '@/lib/ai/image-download';
import { decodeOutboundImageDataUrl, normalizeOutboundImageBlob } from '@/lib/chat/outbound-image-normalization';
import { sanitizeElementActionPayload } from '@/lib/element-context-draft';
import {
  startElementPicker as requestStartElementPicker,
  startScreenshotEditor as requestStartScreenshotEditor,
} from '@/lib/extension/ui-actions';
import { I18nError, toI18nTextFromError } from '@/lib/i18n/error';
import { formatI18nText } from '@/lib/i18n/format';
import { normalizeI18nText } from '@/lib/i18n/text';
import { logger } from '@/lib/logger';
import { createId } from '@/lib/utils/id';
import {
  initBrowserContextListener,
  resolvePreferredBrowserContextTab,
  setBrowserContextElementSnapshot,
  setBrowserContextSelectionSnapshot,
} from '@/lib/browser-context';
import { buildSelectionPrompt } from '@/lib/prompt-builder';
import { isPlainRecord } from '@/lib/utils/type-guards';
import type { MessageAttachment } from '@/types/chat';
import type { ElementActionPayload, PickedElement } from '@/types/element-picker';
import type { I18nText } from '@/types/i18n';
import type { ScreenshotEditorAction, ScreenshotEditorActionPayload } from '@/plugins/page-tools/screenshot-capture/contracts';

/** 切换话题后补发的纯文本消息。 */
type QueuedSendPayload = {
  /** 目标话题 ID。 */
  topicId: string;
  /** 等待补发的纯文本内容。 */
  text: string;
};

type ExternalUiPortBridgeOptions = {
  /** 当前已经加载完成的活跃话题 ID。 */
  activeLoadedTopicId: string | null;
  /** 聊天区操作句柄。 */
  chatRef: RefObject<ChatAreaHandle | null>;
  /** 把焦点还给聊天区。 */
  focusChat: () => void;
  /** 确保当前存在可用于外部投递的话题。 */
  ensureActiveTopicForExternalSend: () => string | null;
  /** 网页工具是否启用。 */
  pageToolsEnabled: boolean;
  /** 当前 i18n 翻译函数。 */
  t: TFunction;
};

type LoadedCanvasImage = {
  /** 可直接绘制到 canvas 的位图源。 */
  source: CanvasImageSource;
  /** 位图真实宽度。 */
  width: number;
  /** 位图真实高度。 */
  height: number;
  /** 释放底层位图资源。 */
  close?: () => void;
};

/**
 * 使用 DOM Image 解码 data URL，作为缺少 `createImageBitmap` 时的保底路径。
 *
 * @param dataUrl - SW 抓取的可见视口 PNG。
 * @returns 已解码的图片源。
 */
function loadImageElementFromDataUrl(dataUrl: string): Promise<LoadedCanvasImage> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({
      source: image,
      width: Math.max(1, image.naturalWidth || image.width),
      height: Math.max(1, image.naturalHeight || image.height),
    });
    image.onerror = () => reject(new I18nError('errors.elementPickerVisualScreenshotFailed'));
    image.src = dataUrl;
  });
}

/**
 * 解码视觉区域截图，优先使用明确的位图解码 API，避免依赖隐藏 sidepanel 中
 * DOM `Image.onload` 的调度时序。
 *
 * @param dataUrl - SW 抓取的可见视口 PNG。
 * @returns 可绘制到 canvas 的位图源。
 */
async function decodeCanvasImageFromDataUrl(dataUrl: string): Promise<LoadedCanvasImage> {
  const createBitmap = typeof createImageBitmap === 'function' ? createImageBitmap : null;
  if (createBitmap && typeof fetch === 'function') {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const bitmap = await createBitmap(blob);
      return {
        source: bitmap,
        width: Math.max(1, bitmap.width),
        height: Math.max(1, bitmap.height),
        close: () => bitmap.close(),
      };
    } catch {
      // 继续走 DOM Image；某些测试环境或旧浏览器不支持 data URL 位图解码。
    }
  }
  return await loadImageElementFromDataUrl(dataUrl);
}

/**
 * 限制数值在有效范围内。
 *
 * @param value - 待限制数值。
 * @param min - 最小值。
 * @param max - 最大值。
 * @returns 已限制后的数值。
 */
function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * 将视觉区域整屏截图裁剪为所选区域 PNG data URL。
 *
 * @param element - `kind=visual` 的元素选择 payload。
 * @returns 裁剪后的 PNG data URL。
 */
async function cropVisualElementToDataUrl(element: PickedElement): Promise<string> {
  const visual = element.visual;
  const screenshot = visual?.screenshot?.dataUrl;
  const rect = visual?.rect;
  const viewport = visual?.viewport;
  if (!screenshot || !screenshot.startsWith('data:image/') || !rect || !viewport) {
    throw new I18nError('errors.elementPickerVisualScreenshotFailed');
  }

  const image = await decodeCanvasImageFromDataUrl(screenshot);
  const imageWidth = Math.max(1, image.width || viewport.width);
  const imageHeight = Math.max(1, image.height || viewport.height);
  const scaleX = imageWidth / Math.max(1, viewport.width);
  const scaleY = imageHeight / Math.max(1, viewport.height);
  const sx = clampNumber(rect.x * scaleX, 0, imageWidth - 1);
  const sy = clampNumber(rect.y * scaleY, 0, imageHeight - 1);
  const sw = clampNumber(rect.width * scaleX, 1, imageWidth - sx);
  const sh = clampNumber(rect.height * scaleY, 1, imageHeight - sy);
  const outW = Math.max(1, Math.round(sw));
  const outH = Math.max(1, Math.round(sh));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new I18nError('errors.elementPickerVisualScreenshotFailed');
  try {
    ctx.drawImage(image.source, sx, sy, sw, sh, 0, 0, outW, outH);
    const dataUrl = canvas.toDataURL('image/png');
    if (!dataUrl.startsWith('data:image/png')) throw new I18nError('errors.elementPickerVisualScreenshotFailed');
    return dataUrl;
  } finally {
    image.close?.();
  }
}

/**
 * 统一处理 Content Script 进入 Side Panel 的外部消息桥接。
 *
 * 职责：
 * - 与 SW 共享 UI Port 建立连接与 keepalive；
 * - 处理外部文本 / 划词 / 元素选择三类消息；
 * - 负责在话题切换期间排队并补发消息，避免外部入口丢消息。
 */
export function useExternalUiPortBridge({
  activeLoadedTopicId,
  chatRef,
  focusChat,
  ensureActiveTopicForExternalSend,
  pageToolsEnabled,
  t,
}: ExternalUiPortBridgeOptions) {
  const [queuedSend, setQueuedSend] = useState<QueuedSendPayload | null>(null);
  const activeLoadedTopicIdRef = useRef(activeLoadedTopicId);
  const disposedRef = useRef(false);
  activeLoadedTopicIdRef.current = activeLoadedTopicId;

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
    };
  }, []);

  /**
   * 将外部投递的纯文本消息排队到当前话题。
   *
   * @param text - 待发送的消息文本。
   */
  const enqueueSend = useCallback((text: string) => {
    const targetTopicId = ensureActiveTopicForExternalSend();
    if (!targetTopicId) return;

    if (activeLoadedTopicId === targetTopicId) {
      chatRef.current?.send(text);
      return;
    }
    setQueuedSend({ topicId: targetTopicId, text });
  }, [activeLoadedTopicId, chatRef, ensureActiveTopicForExternalSend]);

  /**
   * 等到当前聊天输入区真实可插入后，再写入外部草稿。
   *
   * 说明：
   * - `sidepanel` raw Port 连上时，React 聊天区和当前 topic 可能仍在恢复；
   * - 页面工具事务必须等 ChatInput 真实接受草稿后才能 ack 给 SW；
   * - 这里等待的是明确的 readiness predicate，不靠固定 delay 猜时序。
   *
   * @param draft - 已完成附件落库和结构化渲染的外部草稿。
   */
  const acceptDraftWhenReady = useCallback((draft: ChatInputExternalDraft): Promise<void> => {
    const targetTopicId = ensureActiveTopicForExternalSend();
    if (!targetTopicId) return Promise.reject(new I18nError('errors.pageToolSidePanelUnavailable'));

    return new Promise<void>((resolve, reject) => {
      const startedAt = Date.now();
      /**
       * 单帧尝试写入外部草稿。
       *
       * 说明：这里是 bridge ack 的业务门闩。只有目标 topic 已加载且 ChatArea ref 可用时，
       * 才调用 `acceptExternalDraft()` 并释放 SW ack；否则继续按 rAF 等待真实 UI ready。
       */
      const tryInsert = () => {
        if (disposedRef.current) {
          reject(new I18nError('errors.pageToolSidePanelUnavailable'));
          return;
        }
        const chat = chatRef.current;
        if (activeLoadedTopicIdRef.current === targetTopicId && chat) {
          void chat.acceptExternalDraft(draft).then(resolve, reject);
          return;
        }
        if (Date.now() - startedAt > 12_000) {
          reject(new I18nError('errors.pageToolSidePanelUnavailable'));
          return;
        }
        window.requestAnimationFrame(tryInsert);
      };
      tryInsert();
    });
  }, [chatRef, ensureActiveTopicForExternalSend]);

  /**
   * 将 data URL 图片转换成消息附件并落库。
   *
   * @param payload - 图片 data URL 与可选元信息。
   * @returns 可直接写入消息中的附件引用。
   */
  const putImageAttachmentFromDataUrl = useCallback(async ({ dataUrl, name, mime }: { dataUrl: string; name?: string; mime?: string }) => {
    const parsed = decodeOutboundImageDataUrl(dataUrl);
    const maxBytes = 8 * 1024 * 1024;
    if (parsed.blob.size > maxBytes) {
      const mb = Math.max(0.1, Math.round((parsed.blob.size / 1024 / 1024) * 10) / 10);
      throw new I18nError('errors.imageTooLargeSkipped', { mb });
    }
    const normalized = await normalizeOutboundImageBlob({
      blob: parsed.blob,
      name: name || `image-${Date.now()}.png`,
      mime: mime || parsed.mime,
    });
    if (normalized.size > maxBytes) {
      const mb = Math.max(0.1, Math.round((normalized.size / 1024 / 1024) * 10) / 10);
      throw new I18nError('errors.imageTooLargeSkipped', { mb });
    }
    const ref = await putImageAttachment({
      blob: normalized.blob,
      name: normalized.name,
      mime: normalized.mime,
    });
    return { type: 'image', id: ref.id, name: ref.name, mime: ref.mime, size: ref.size } satisfies MessageAttachment;
  }, []);

  /**
   * 下载远程图片并转换成消息附件。
   *
   * @param payload - 图片 URL 与可选文件名。
   * @returns 可直接写入消息中的附件引用。
   */
  const putImageAttachmentFromUrl = useCallback(async ({ url, name }: { url: string; name?: string }) => {
    const target = String(url || '').trim();
    if (!target) throw new I18nError('errors.imageUrlEmpty');

    const file = await downloadUrlToFile(target);
    if (!file?.base64) throw new I18nError('errors.imageDownloadFailed', { status: 0 });

    const maxBytes = 8 * 1024 * 1024;
    const padding = file.base64.endsWith('==') ? 2 : file.base64.endsWith('=') ? 1 : 0;
    const bytesLen = Math.floor((file.base64.length * 3) / 4) - padding;
    if (bytesLen > maxBytes) {
      const mb = Math.max(0.1, Math.round((bytesLen / 1024 / 1024) * 10) / 10);
      throw new I18nError('errors.imageTooLargeSkipped', { mb });
    }

    const bin = atob(file.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);

    const mime = file.mediaType || 'image/png';
    const blob = new Blob([bytes], { type: mime });
    const normalized = await normalizeOutboundImageBlob({
      blob,
      name: name || `image-${Date.now()}.${mime.includes('jpeg') ? 'jpg' : mime.includes('png') ? 'png' : 'bin'}`,
      mime,
    });
    if (normalized.size > maxBytes) {
      const mb = Math.max(0.1, Math.round((normalized.size / 1024 / 1024) * 10) / 10);
      throw new I18nError('errors.imageTooLargeSkipped', { mb });
    }
    const ref = await putImageAttachment({
      blob: normalized.blob,
      name: normalized.name,
      mime: normalized.mime,
    });
    return { type: 'image', id: ref.id, name: ref.name, mime: ref.mime, size: ref.size } satisfies MessageAttachment;
  }, []);

  /**
   * 启动页面元素选择器。
   *
   * 说明：
   * - 若网页工具被关闭，直接提示用户开启；
   * - 当前版本已通过 manifest 安装期声明普通网页 host access；
   * - 启动失败统一由 SW content-script contract 返回结构化错误。
   */
  const handleStartElementPicker = useCallback(async () => {
    if (!pageToolsEnabled) {
      toast({ title: t('common.tip'), description: t('sitePermissionsPanel.pageTools.disabledHint') });
      return;
    }
    try {
      const targetTab = await resolvePreferredBrowserContextTab();
      const targetTabId = typeof targetTab?.id === 'number' ? targetTab.id : undefined;

      const res = await requestStartElementPicker(
        typeof targetTabId === 'number' ? { tabId: targetTabId } : undefined,
      ) as { ok?: boolean; error?: I18nText; warning?: I18nText } | undefined;
      if (!res?.ok) {
        toast({
          title: t('common.error'),
          description: res?.error ? formatI18nText(t, normalizeI18nText(res.error)) : t('common.error'),
          variant: 'destructive',
        });
        return;
      }
      if (res.warning) toast({ title: t('common.tip'), description: formatI18nText(t, normalizeI18nText(res.warning)) });
    } catch (error: unknown) {
      toast({ title: t('common.error'), description: formatI18nText(t, toI18nTextFromError(error)), variant: 'destructive' });
    }
  }, [pageToolsEnabled, t]);

  /**
   * 启动页面截图编辑器。
   *
   * 说明：
   * - 启动请求仍经由 SW，复用后台截图配额队列和 content script 可达性错误语义；
   * - UI 层只负责选定当前网页 tab，不直接调用浏览器截图 API。
   */
  const handleStartScreenshotEditor = useCallback(async () => {
    if (!pageToolsEnabled) {
      toast({ title: t('common.tip'), description: t('sitePermissionsPanel.pageTools.disabledHint') });
      return;
    }
    try {
      const targetTab = await resolvePreferredBrowserContextTab();
      const targetTabId = typeof targetTab?.id === 'number' ? targetTab.id : undefined;

      const res = await requestStartScreenshotEditor(
        typeof targetTabId === 'number' ? { tabId: targetTabId } : undefined,
      ) as { ok?: boolean; error?: I18nText; warning?: I18nText } | undefined;
      if (!res?.ok) {
        toast({
          title: t('common.error'),
          description: res?.error ? formatI18nText(t, normalizeI18nText(res.error)) : t('common.error'),
          variant: 'destructive',
        });
        return;
      }
      if (res.warning) toast({ title: t('common.tip'), description: formatI18nText(t, normalizeI18nText(res.warning)) });
    } catch (error: unknown) {
      toast({ title: t('common.error'), description: formatI18nText(t, toI18nTextFromError(error)), variant: 'destructive' });
    }
  }, [pageToolsEnabled, t]);

  useEffect(() => {
    if (!queuedSend || !activeLoadedTopicId) return;
    if (queuedSend.topicId !== activeLoadedTopicId) return;
    chatRef.current?.send(queuedSend.text);
    setQueuedSend(null);
  }, [activeLoadedTopicId, chatRef, queuedSend]);

  /** 处理截图编辑器导出的聊天 / OCR 草稿，并在真实插入输入区后返回。 */
  const handleScreenshotExternalEvent = useCallback(async (payloadValue: unknown) => {
    const payload = isPlainRecord(payloadValue) ? payloadValue as unknown as ScreenshotEditorActionPayload : null;
    const action = payload?.action === 'ocr' ? 'ocr' : payload?.action === 'chat' ? 'chat' : null;
    const image = isPlainRecord(payload?.image) ? payload.image : null;
    const dataUrl = typeof image?.dataUrl === 'string' ? image.dataUrl : '';
    if (!action || !dataUrl.startsWith('data:image/')) throw new I18nError('errors.screenshotEditorActionInvalid');

    const source = isPlainRecord(payload?.source) ? payload.source : {};
    const screenshotAction: ScreenshotEditorAction = action;
    focusChat();
    await acceptDraftWhenReady({
      id: createId(),
      kind: 'screenshot',
      action: screenshotAction,
      ...(screenshotAction === 'ocr' ? { prompt: t('screenshotEditor.ocrPrompt') } : {}),
      source: {
        ...(typeof source.url === 'string' ? { url: source.url } : {}),
          ...(typeof source.title === 'string' ? { title: source.title } : {}),
      },
      image: {
        dataUrl,
        name: typeof image?.name === 'string' ? image.name : 'screenshot.png',
        mime: 'image/png',
      },
    });
  }, [acceptDraftWhenReady, focusChat, t]);

  /** 展示页面工具启动 / 投递失败错误。 */
  const handlePageToolErrorExternalEvent = useCallback(async (payloadValue: unknown) => {
    const payload = isPlainRecord(payloadValue) ? payloadValue : {};
    toast({
      title: t('common.error'),
      description: formatI18nText(t, normalizeI18nText((payload as { error?: unknown }).error)),
      variant: 'destructive',
    });
  }, [t]);

  /** 处理元素选择器结果，并在元素引用草稿真实进入输入区后返回。 */
  const handleElementExternalEvent = useCallback(async (payloadValue: unknown) => {
    const payload: Record<string, unknown> = isPlainRecord(payloadValue) ? payloadValue : {};
    const element: Record<string, unknown> = isPlainRecord(payload.element) ? payload.element : {};

    const kind = typeof element.kind === 'string' ? element.kind : 'text';
    const text = typeof element.text === 'string' ? element.text.trim() : '';
    const codeLanguage = typeof element.codeLanguage === 'string' ? element.codeLanguage : '';
    const imagesRaw = Array.isArray(element.images) ? element.images : [];
    const images = imagesRaw
      .map((item: unknown) => (isPlainRecord(item) ? item : null))
      .filter(Boolean) as Array<Record<string, unknown>>;

    const sourceRec: Record<string, unknown> = isPlainRecord(payload.source) ? payload.source : {};
    const url = typeof sourceRec.url === 'string' ? sourceRec.url : '';
    const title = typeof sourceRec.title === 'string' ? sourceRec.title : '';
    setBrowserContextElementSnapshot({
      kind,
      text,
      codeLanguage: codeLanguage || undefined,
      url: url || undefined,
      title: title || undefined,
      capturedAt: Date.now(),
    });

    const pickedElement = element as PickedElement;
    const structuredPayload: ElementActionPayload = {
      element: pickedElement,
      source: { url, title },
    };
    const draftPayload = sanitizeElementActionPayload(structuredPayload);
    if (!draftPayload) throw new I18nError('errors.elementPickerContentScriptUnavailable');

    const attachments: MessageAttachment[] = [];

    if (pickedElement.kind === 'visual') {
      const visualDataUrl = await cropVisualElementToDataUrl(pickedElement);
      attachments.push(await putImageAttachmentFromDataUrl({
        dataUrl: visualDataUrl,
        name: pickedElement.visual?.screenshot?.name || 'element-visual.png',
        mime: 'image/png',
      }));
    }

    for (const img of images.slice(0, 3)) {
      const dataUrl = typeof img.dataUrl === 'string' ? String(img.dataUrl) : '';
      const rawUrl = typeof img.url === 'string' ? String(img.url) : '';
      const alt = typeof img.alt === 'string' ? String(img.alt) : '';
      const name = typeof img.name === 'string' ? String(img.name) : undefined;
      const mime = typeof img.mime === 'string' ? String(img.mime) : undefined;

      try {
        if (dataUrl && dataUrl.startsWith('data:')) {
          attachments.push(await putImageAttachmentFromDataUrl({ dataUrl, name, mime }));
          continue;
        }

        if (!rawUrl || rawUrl.startsWith('blob:')) continue;

        let resolvedUrl = rawUrl;
        if (!/^https?:\/\//i.test(rawUrl) && url) {
          try {
            resolvedUrl = new URL(rawUrl, url).toString();
          } catch {
            // ignore invalid relative URL resolution
          }
        }

        attachments.push(await putImageAttachmentFromUrl({ url: resolvedUrl, name }));
      } catch (error: unknown) {
        logger.general.debug('ui element image attachment failed', { hasAlt: Boolean(alt), error });
        if (alt) {
          // prompt 中已经带上了 alt hint，这里不再重复追加文本。
        }
      }
    }

    focusChat();
    await acceptDraftWhenReady({
      id: createId(),
      kind: 'element',
      element: draftPayload.element,
      ...(draftPayload.source ? { source: draftPayload.source } : {}),
      attachments: attachments.length > 0 ? attachments : undefined,
    });
  }, [
    acceptDraftWhenReady,
    focusChat,
    putImageAttachmentFromDataUrl,
    putImageAttachmentFromUrl,
  ]);

  /** 按页面工具事件类型分发，并只在业务处理完成后返回。 */
  const handleExternalUiEvent = useCallback(async (eventValue: unknown) => {
    const event = isPlainRecord(eventValue) ? eventValue as { type?: unknown; payload?: unknown } : null;
    const type = typeof event?.type === 'string' ? event.type : '';
    if (type === 'ui/screenshot') {
      await handleScreenshotExternalEvent(event?.payload);
      return;
    }
    if (type === 'ui/page-tool-error') {
      await handlePageToolErrorExternalEvent(event?.payload);
      return;
    }
    if (type === 'ui/element') {
      await handleElementExternalEvent(event?.payload);
      return;
    }
    throw new I18nError('errors.pageToolSidePanelUnavailable');
  }, [
    handleElementExternalEvent,
    handlePageToolErrorExternalEvent,
    handleScreenshotExternalEvent,
  ]);

  useEffect(() => {
    let disposed = false;
    let keepAlive: number | null = null;
    let off: (() => void) | null = null;

    void ensureUiPortReady().then((port) => {
      if (disposed || !port) return;

      off = onUiPortMessage((msg) => {
        if (msg.type === 'ui/selection') {
          const payload: Record<string, unknown> = isPlainRecord(msg.payload) ? msg.payload : {};
          const action = typeof payload.action === 'string' ? payload.action : '';
          const selectedText = typeof payload.text === 'string' ? payload.text.trim() : '';
          const sourceRec: Record<string, unknown> = isPlainRecord(payload.source) ? payload.source : {};
          const url = typeof sourceRec.url === 'string' ? sourceRec.url : '';
          const title = typeof sourceRec.title === 'string' ? sourceRec.title : '';
          if (!selectedText) return;

          setBrowserContextSelectionSnapshot({
            text: selectedText,
            url: url || undefined,
            title: title || undefined,
            capturedAt: Date.now(),
          });

          const prompt = buildSelectionPrompt({ action, text: selectedText, source: { url, title }, t });

          focusChat();
          enqueueSend(prompt);
          return;
        }

      });

      postUiPortMessage({ type: 'offscreen/ensure' });
      initBrowserContextListener();

      keepAlive = window.setInterval(() => {
        postUiPortMessage({ type: 'ping', ts: Date.now() });
      }, 25_000);
    });

    return () => {
      disposed = true;
      off?.();
      if (keepAlive) window.clearInterval(keepAlive);
    };
  }, [
    enqueueSend,
    focusChat,
    t,
  ]);

  useEffect(() => {
    let disposed = false;
    let off: (() => void) | null = null;

    void ensureSidePanelPageToolPortReady().then((port) => {
      if (disposed || !port) return;
      off = onSidePanelPageToolCommand((msg) => {
        void (async () => {
          try {
            await handleExternalUiEvent(msg.command);
            postSidePanelPageToolMessage({
              type: 'sidepanel/page-tool-command-ack',
              requestId: msg.requestId,
              generation: msg.generation,
              payload: { ok: true },
            });
          } catch (error: unknown) {
            const i18nError = toI18nTextFromError(error);
            toast({
              title: t('common.error'),
              description: formatI18nText(t, i18nError),
              variant: 'destructive',
            });
            postSidePanelPageToolMessage({
              type: 'sidepanel/page-tool-command-ack',
              requestId: msg.requestId,
              generation: msg.generation,
              payload: { ok: false, error: i18nError },
            });
          }
        })();
      });
    });

    return () => {
      disposed = true;
      off?.();
    };
  }, [handleExternalUiEvent, t]);

  return {
    startElementPicker: handleStartElementPicker,
    startScreenshotEditor: handleStartScreenshotEditor,
  };
}
