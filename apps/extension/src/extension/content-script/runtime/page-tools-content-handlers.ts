/**
 * 说明：网页工具 Content Script 入站消息 handler。
 *
 * 职责：
 * - 统一注册 Service Worker 发往页面的 typed content-script 消息；
 * - 将元素选择器、截图编辑器、页面正文、风格信号和技术栈采集的响应语义收口；
 * - 让 `page-tools-runtime.ts` 只负责生命周期协调，不继续承载大段 router 表。
 *
 * 边界：
 * - 本模块只处理 content script 入站消息，不访问持久化状态之外的 UI runtime 状态；
 * - 页面工具打开前的浮层清理由调用方通过回调提供，避免本模块反向持有划词 UI owner；
 * - 所有消息仍通过 `content-message-router` 注册，不恢复裸字符串监听分发入口。
 */
import { ensureI18nReady } from '@/i18n';
import { I18nError } from '@/lib/i18n/error';
import { isPageToolsEnabledForUrl } from '@/lib/extension/page-tools';
import { openElementPicker, isElementPickerOpenForAck } from '../element-picker';
import { extractPageStyleLayoutMetrics, extractPageStyleSignalsAfterStable, scrollPageStyleTo } from '../page-style';
import { PageStableWindowTimeoutError } from '../page-stability';
import { extractReadableDocument } from '../readable-dom';
import { collectTechnologyPageSignals } from '../technology-stack';
import { createPageToolOpenErrorResponse, createPageToolOpenedResponse, readPageToolOpenOptions } from '../page-tool-open-response';
import { cancelPageToolSessionFromBackground } from '../page-tool-session-cancel';
import { isScreenshotEditorOpenForAck } from '@/plugins/page-tools/screenshot-capture/content/controller';
import { openScreenshotEditorOnDemand } from '@/plugins/page-tools/screenshot-capture/content/entry';
import { installContentMessageRouter } from './content-message-router';

/**
 * 读取顶层页面里可见 iframe 的轻量信号。
 *
 * 说明：这里只读取父页面 iframe 元素本身的几何与 src/title，不访问 iframe 内部 DOM；
 * 跨源正文仍由后台定向到对应 frame 的 content script 采集。
 *
 * @returns 可见 iframe 摘要。
 */
function collectVisibleIframeSummaries(): Array<{ src: string; title: string; area: number; inViewport: boolean }> {
  return Array.from(document.querySelectorAll('iframe')).map((iframe) => {
    const rect = iframe.getBoundingClientRect();
    const width = Math.max(0, rect.width);
    const height = Math.max(0, rect.height);
    const inViewport = rect.bottom > 0
      && rect.right > 0
      && rect.top < window.innerHeight
      && rect.left < window.innerWidth;
    return {
      src: iframe.getAttribute('src') || iframe.src || '',
      title: iframe.getAttribute('title') || iframe.title || iframe.getAttribute('name') || '',
      area: Math.round(width * height),
      inViewport,
    };
  }).filter((item) => item.area >= 4_000 && item.inViewport);
}

/** 安装网页工具消息 handler 时需要由 runtime owner 提供的局部能力。 */
export type PageToolsContentMessageHandlerOptions = {
  /** 读取当前页面原生选区文本。 */
  getSelectionText: () => string;
  /** 打开元素选择器前清理其它 page-facing 浮层。 */
  prepareElementPickerEntry: () => void;
  /** 打开截图编辑器前清理其它 page-facing 浮层。 */
  prepareScreenshotEditorEntry: () => void;
};

/** 按 Service Worker payload 打开元素选择器。 */
async function openElementPickerOnDemand(payload?: unknown): Promise<void> {
  await ensureI18nReady();
  const options = payload && typeof payload === 'object'
    ? payload as { sessionId?: unknown; returnToPanel?: unknown }
    : {};
  openElementPicker({
    ...(typeof options.sessionId === 'string' ? { sessionId: options.sessionId } : {}),
    ...(options.returnToPanel === true ? { returnToPanel: true } : {}),
  });
}

/**
 * 安装网页工具 Content Script 入站消息 handler。
 *
 * @param options - runtime owner 注入的局部 UI 生命周期能力。
 */
export function installPageToolsContentMessageHandlers(options: PageToolsContentMessageHandlerOptions): void {
  installContentMessageRouter({
    'element/picker/open': (msg, _sender, sendResponse) => {
      void (async () => {
        if (!(await isPageToolsEnabledForUrl(location.href))) throw new I18nError('errors.pageToolsDisabled');
        const openOptions = readPageToolOpenOptions(msg.payload);
        options.prepareElementPickerEntry();
        await openElementPickerOnDemand(msg.payload);
        if (!isElementPickerOpenForAck(openOptions.sessionId)) {
          throw new I18nError('errors.elementPickerContentScriptUnavailable');
        }
        sendResponse?.(createPageToolOpenedResponse('element-picker', openOptions));
      })().catch((e: unknown) => {
        sendResponse?.(createPageToolOpenErrorResponse(e));
      });
      return true;
    },

    'screenshot/editor/open': (msg, _sender, sendResponse) => {
      void (async () => {
        if (!(await isPageToolsEnabledForUrl(location.href))) throw new I18nError('errors.pageToolsDisabled');
        const openOptions = readPageToolOpenOptions(msg.payload);
        options.prepareScreenshotEditorEntry();
        await openScreenshotEditorOnDemand(msg.payload);
        if (!isScreenshotEditorOpenForAck(openOptions.sessionId)) {
          throw new I18nError('errors.screenshotEditorContentScriptUnavailable');
        }
        sendResponse?.(createPageToolOpenedResponse('screenshot-editor', openOptions));
      })().catch((e: unknown) => {
        sendResponse?.(createPageToolOpenErrorResponse(e));
      });
      return true;
    },

    'page-tool/session/cancel': (msg, _sender, sendResponse) => {
      cancelPageToolSessionFromBackground(msg.payload);
      sendResponse?.({ ok: true });
      return;
    },

    'page/getMeta': (_msg, _sender, sendResponse) => {
      sendResponse({ title: document.title, url: location.href });
      return;
    },

    'page/getSelection': (_msg, _sender, sendResponse) => {
      sendResponse({ text: options.getSelectionText() });
      return;
    },

    'page/getVisibleFrames': (_msg, _sender, sendResponse) => {
      sendResponse({ payload: collectVisibleIframeSummaries() });
      return;
    },

    'browser-context/getReadableDom': (msg, _sender, sendResponse) => {
      void extractReadableDocument(50_000, msg.payload?.stableWaitMs, msg.payload?.intent)
        .then((payload) => {
          sendResponse({ payload });
        })
        .catch((error: unknown) => {
          sendResponse({
            payload: null,
            error: error instanceof PageStableWindowTimeoutError ? 'timeout' : 'collector-unavailable',
          });
        });
      return true;
    },

    'page-style/signals/get': (msg, _sender, sendResponse) => {
      void extractPageStyleSignalsAfterStable(msg.payload?.stableWaitMs)
        .then((payload) => {
          sendResponse({ payload });
        })
        .catch((error: unknown) => {
          sendResponse({
            payload: null,
            error: error instanceof PageStableWindowTimeoutError ? 'timeout' : 'collector-unavailable',
          });
        });
      return true;
    },

    'page-style/layout/get': (_msg, _sender, sendResponse) => {
      sendResponse({ payload: extractPageStyleLayoutMetrics() });
      return;
    },

    'page-style/scroll-to': (msg, _sender, sendResponse) => {
      void scrollPageStyleTo(msg.payload.top)
        .then((payload) => {
          sendResponse({ payload });
        })
        .catch(() => {
          sendResponse({ payload: null });
        });
      return true;
    },

    'technology-stack/signals/get': (msg, _sender, sendResponse) => {
      const payload = msg.payload as { scanPlan?: Parameters<typeof collectTechnologyPageSignals>[0]; delayedJs?: boolean } | undefined;
      void collectTechnologyPageSignals(payload?.scanPlan, { delayedJs: Boolean(payload?.delayedJs) })
        .then((payload) => {
          sendResponse({ payload });
        })
        .catch(() => {
          sendResponse({ payload: null });
        });
      return true;
    },
  });
}
