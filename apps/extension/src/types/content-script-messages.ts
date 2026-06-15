/**
 * 说明：Service Worker 发往 Content Script 的消息契约。
 *
 * 职责：
 * - 定义 `chrome.tabs.sendMessage` 投递到 Content Script 的入站消息联合类型；
 * - 定义页面工具打开确认响应，供 SW 校验工具是否真实接管页面；
 * - 让 `sw-messages.ts` 只保留发往 Service Worker 的 one-shot 协议。
 *
 * 边界：
 * - 本文件只定义类型，不访问浏览器 API；
 * - 页面正文、页面风格和技术栈响应 payload 仍复用对应数据结构真源。
 */
import type { ScreenshotEditorOpenPayload } from '@/plugins/page-tools/screenshot-capture/contracts';
import type { TechnologyPageScanPlan } from '@/lib/technology-stack/types';
import type { I18nText } from './i18n';
import type {
  BrowserContextReadableDomIntent,
  PageToolSessionCloseReason,
  PageToolSessionTool,
} from './sw-messages';

/**
 * Content Script 页面工具打开确认响应。
 *
 * 说明：
 * - `page/getMeta` 只能证明内容脚本可通信，不能证明页面工具已经进入真实交互态；
 * - 元素选择器和截图编辑器必须在事件屏蔽层 / 编辑器 DOM / 监听器就绪后返回 `opened:true`；
 * - Service Worker 会把缺少 `opened:true`、工具类型不匹配或 session 不匹配视为启动失败并恢复 sidepanel。
 */
export type PageToolOpenResponse =
  | {
      /** 打开成功。 */
      ok: true;
      /** 已真实进入页面工具交互态。 */
      opened: true;
      /** 打开的页面工具类型。 */
      tool: PageToolSessionTool;
      /** 页面工具会话 ID。 */
      sessionId?: string;
      /** 本次会话完成后是否回到 sidepanel。 */
      returnToPanel?: boolean;
    }
  | {
      /** 打开失败。 */
      ok: false;
      /** 用户可见的稳定错误。 */
      error?: I18nText;
    };

/** SW 请求打开元素选择器。 */
export interface CsMsg_ElementPickerOpen {
  /** 消息类型：通知内容脚本打开元素选择器。 */
  type: 'element/picker/open';
  /** 页面工具会话身份，用于关闭或提交后恢复 sidepanel。 */
  payload?: {
    /** 页面工具会话 ID。 */
    sessionId?: string;
    /** 本次会话完成后是否需要回到 sidepanel。 */
    returnToPanel?: boolean;
  };
}

/** SW 请求打开截图编辑器。 */
export interface CsMsg_ScreenshotEditorOpen {
  /** 消息类型：通知内容脚本打开截图编辑器。 */
  type: 'screenshot/editor/open';
  /** 可见视口截图负载。 */
  payload: ScreenshotEditorOpenPayload;
}

/** SW 请求取消当前页面工具会话。 */
export interface CsMsg_PageToolSessionCancel {
  /** 消息类型：通知内容脚本关闭页面工具浮层。 */
  type: 'page-tool/session/cancel';
  /** 需要取消的页面工具会话身份。 */
  payload?: {
    /** 页面工具会话 ID；为空时关闭当前打开的页面工具。 */
    sessionId?: string;
    /** 页面工具类型；为空时关闭当前打开的任一页面工具。 */
    tool?: PageToolSessionTool;
    /** 取消原因；本轮用于单 owner 替换。 */
    reason?: Extract<PageToolSessionCloseReason, 'replace'>;
  };
}

/** SW 请求获取页面元信息。 */
export interface CsMsg_PageGetMeta {
  /** 消息类型：请求内容脚本提取页面元信息。 */
  type: 'page/getMeta';
}

/** SW 请求获取当前选区文本。 */
export interface CsMsg_PageGetSelection {
  /** 消息类型：请求内容脚本读取当前选区文本。 */
  type: 'page/getSelection';
}

/** SW 请求顶层 frame 统计可见 iframe。 */
export interface CsMsg_PageGetVisibleFrames {
  /** 消息类型：请求内容脚本统计当前页面可见 iframe。 */
  type: 'page/getVisibleFrames';
}

/** SW 请求获取页面可读正文结构。 */
export interface CsMsg_BrowserContextGetReadableDom {
  /** 消息类型：请求内容脚本提取页面可读正文。 */
  type: 'browser-context/getReadableDom';
  /** 可选：稳定窗口等待预算。 */
  payload?: {
    /** 正文采集意图：普通模式优先文章主体，全文模式优先可见页面结构。 */
    intent?: BrowserContextReadableDomIntent;
    /** 页面稳定窗口最长等待毫秒数。 */
    stableWaitMs?: number;
  };
}

/** SW 请求提取当前页面的设计信号。 */
export interface CsMsg_PageStyleGetSignals {
  /** 消息类型：请求内容脚本返回设计风格信号。 */
  type: 'page-style/signals/get';
  /** 可选：稳定窗口等待预算。 */
  payload?: {
    /** 页面稳定窗口最长等待毫秒数。 */
    stableWaitMs?: number;
  };
}

/** SW 请求读取当前页面的布局度量。 */
export interface CsMsg_PageStyleGetLayoutMetrics {
  /** 消息类型：请求内容脚本返回页面布局度量。 */
  type: 'page-style/layout/get';
}

/** SW 请求把页面滚动到指定位置。 */
export interface CsMsg_PageStyleScrollTo {
  /** 消息类型：请求内容脚本滚动页面。 */
  type: 'page-style/scroll-to';
  /** 目标滚动位置。 */
  payload: {
    /** 要滚动到的纵向像素位置。 */
    top: number;
  };
}

/** SW 请求内容脚本采集技术栈页面信号。 */
export interface CsMsg_TechnologyStackSignalsGet {
  /** 消息类型：请求技术栈页面信号。 */
  type: 'technology-stack/signals/get';
  /** 页面扫描计划，由 SW 从本地规则包生成。 */
  payload?: {
    /** DOM selector / JS chain allowlist。 */
    scanPlan?: TechnologyPageScanPlan;
    /** 是否等待一次延迟 JS pass，用于捕获异步挂载的 page-world 全局对象。 */
    delayedJs?: boolean;
  };
}

/** 所有已知的 Content Script 入站消息联合类型。 */
export type CsInboundMessage =
  | CsMsg_ElementPickerOpen
  | CsMsg_ScreenshotEditorOpen
  | CsMsg_PageToolSessionCancel
  | CsMsg_PageGetMeta
  | CsMsg_PageGetSelection
  | CsMsg_PageGetVisibleFrames
  | CsMsg_BrowserContextGetReadableDom
  | CsMsg_PageStyleGetSignals
  | CsMsg_PageStyleGetLayoutMetrics
  | CsMsg_PageStyleScrollTo
  | CsMsg_TechnologyStackSignalsGet;

/** CS 入站消息的 type 字面量联合。 */
export type CsInboundMessageType = CsInboundMessage['type'];
