/**
 * 说明：`ui-actions` 扩展 UI 语义动作模块。
 *
 * 职责：
 * - 为侧栏和设置面板提供共享的扩展 runtime contract；
 * - 把“读取内容脚本状态 / 打开扩展页 / 启动元素选择器”等 UI 语义动作集中封装；
 * - 避免 UI 文件继续分散拼接消息类型、扩展页路径和 browser API 探测。
 *
 * 边界：
 * - 这里只承载 UI 允许触发的轻量语义动作；
 * - 不重写 Service Worker 协议，也不直接承担 content script / background 的深层编排。
 */
import type { I18nText } from '@/types/i18n';
import type { SwKeepAliveConfig } from './sw-keepalive-config';
import type {
  LocalBackupSchedulePayload,
  SwMsg_ElementPickerStart,
  SwMsg_ScreenshotEditorStart,
} from '@/types/sw-messages';
import {
  canOpenExtensionPageInTab,
  getExtensionChromeApi,
  getExtensionManifest,
  hasExtensionMessageRuntime,
  openExtensionPageInTab,
  sendExtensionMessage,
  type ExtensionMessageResponse,
} from './runtime-api';

const SIDEPANEL_PAGE_PATH = 'src/extension/sidepanel/index.html';

/**
 * 内容脚本静态注入状态快照。
 *
 * 由 Service Worker 聚合 manifest 静态注入能力、注册状态和安装期网页 host access，
 * 供设置页和说明面板复用。
 */
export type ContentScriptStatusPayload = {
  /** 静态内容脚本是否启用。 */
  enabled: boolean;
  /** 注册方式：static / none。 */
  registrationMethod: 'static' | 'none';
  /** 当前运行时是否具备 `chrome.scripting`。 */
  scriptingAvailable: boolean;
  /** 当前运行时是否具备内容脚本动态注册能力。 */
  contentScriptsAvailable: boolean;
  /** manifest 安装期声明的网页 host match patterns。 */
  declaredHostMatches: string[];
  /** 当前是否已经完成注册。 */
  registered: boolean;
  /** 打包进扩展的内容脚本资源列表。 */
  bundledJs: string[] | null;
  /** 最近一次结构化内容脚本失败信息。 */
  lastRegistrationError: {
    code: 'bundle-missing' | 'stale-loader' | 'script-fetch-failed' | 'inject-failed' | 'register-failed';
    phase: 'registration' | 'injection';
    level: 'warn' | 'error';
    message: string;
    detail?: string;
    reason: string;
    at: number;
  } | null;
};

/** Service Worker keepalive 配置。 */
export type SwKeepAliveConfigPayload = SwKeepAliveConfig;

/** 本地自动快照计划与最近状态。 */
export type LocalBackupScheduleSnapshotPayload = LocalBackupSchedulePayload;

/** 页面工具启动成功后的补充响应。 */
export type PageToolStartResponseExtra = {
  /** 可选：非致命提示。 */
  warning?: I18nText;
  /** 后台创建的页面工具会话 ID。 */
  sessionId?: string;
  /** 当前会话结束后是否回到 sidepanel。 */
  returnToPanel?: boolean;
};

/** 系统 CPU 累计计数采样。 */
export type SystemCpuUsageTotals = {
  /** 所有处理器累计 idle 时间。 */
  idle: number;
  /** 所有处理器累计 total 时间。 */
  total: number;
};

/** 判断当前上下文是否可向 Service Worker 发送 one-shot 消息。 */
export function canSendExtensionMessages(): boolean {
  return hasExtensionMessageRuntime();
}

/** 读取当前扩展 manifest 快照。 */
export function getExtensionManifestSnapshot(): chrome.runtime.Manifest | null {
  return getExtensionManifest();
}

/** 判断当前运行时是否支持系统 CPU 指标读取。 */
export function canReadSystemCpuUsageTotals(): boolean {
  return Boolean(getExtensionChromeApi()?.system?.cpu?.getInfo);
}

/**
 * 读取系统 CPU 累计计数。
 *
 * 说明：
 * - `chrome.system.cpu.getInfo()` 返回累计计数，调用方需要自行做差分；
 * - Firefox 构建不声明 `system.cpu`，此函数会稳定返回 `null`；
 * - 该能力只服务性能面板展示，不参与调度或资源回收决策。
 */
export async function readSystemCpuUsageTotals(): Promise<SystemCpuUsageTotals | null> {
  const cpuApi = getExtensionChromeApi()?.system?.cpu;
  if (!cpuApi?.getInfo) return null;

  return await new Promise<SystemCpuUsageTotals | null>((resolve) => {
    try {
      cpuApi.getInfo((info) => {
        const processors = Array.isArray((info as unknown as { processors?: unknown }).processors)
          ? (info as unknown as { processors: Array<{ usage?: { idle?: number; total?: number } }> }).processors
          : [];
        let idle = 0;
        let total = 0;
        for (const processor of processors) {
          idle += Number(processor.usage?.idle || 0);
          total += Number(processor.usage?.total || 0);
        }
        if (!Number.isFinite(idle) || !Number.isFinite(total) || total <= 0) {
          resolve(null);
          return;
        }
        resolve({ idle, total });
      });
    } catch {
      resolve(null);
    }
  });
}

/** 判断当前是否可以在新标签页里打开扩展 sidepanel 页面。 */
export function canOpenSidepanelPageInNewTab(): boolean {
  return canOpenExtensionPageInTab(SIDEPANEL_PAGE_PATH);
}

/** 在新标签页中打开扩展 sidepanel 页面。 */
export async function openSidepanelPageInNewTab(): Promise<chrome.tabs.Tab | null> {
  return await openExtensionPageInTab(SIDEPANEL_PAGE_PATH);
}

/** 请求 Service Worker 返回当前静态内容脚本状态。 */
export async function readContentScriptStatus():
Promise<ExtensionMessageResponse<ContentScriptStatusPayload>> {
  return await sendExtensionMessage<ExtensionMessageResponse<ContentScriptStatusPayload>>({
    type: 'content-script/status/get',
  });
}

/** 请求启动元素选择器。 */
export async function startElementPicker(
  payload?: SwMsg_ElementPickerStart['payload'],
): Promise<ExtensionMessageResponse<never, PageToolStartResponseExtra>> {
  return await sendExtensionMessage<ExtensionMessageResponse<never, PageToolStartResponseExtra>>({
    type: 'element/picker/start',
    payload,
  });
}

/** 请求启动截图编辑器。 */
export async function startScreenshotEditor(
  payload?: SwMsg_ScreenshotEditorStart['payload'],
): Promise<ExtensionMessageResponse<never, PageToolStartResponseExtra>> {
  return await sendExtensionMessage<ExtensionMessageResponse<never, PageToolStartResponseExtra>>({
    type: 'screenshot/editor/start',
    payload,
  });
}

/** 读取当前 Service Worker keepalive 配置。 */
export async function readSwKeepAliveConfig():
Promise<ExtensionMessageResponse<SwKeepAliveConfigPayload>> {
  return await sendExtensionMessage<ExtensionMessageResponse<SwKeepAliveConfigPayload>>({
    type: 'sw/keepalive/get',
  });
}

/** 读取本地自动快照计划与最近执行状态。 */
export async function readLocalBackupScheduleStatus():
Promise<ExtensionMessageResponse<LocalBackupScheduleSnapshotPayload>> {
  return await sendExtensionMessage<ExtensionMessageResponse<LocalBackupScheduleSnapshotPayload>>({
    type: 'local-backup/schedule/get',
  });
}

/** 请求关闭 offscreen document。 */
export async function closeOffscreenDocument(): Promise<ExtensionMessageResponse> {
  return await sendExtensionMessage<ExtensionMessageResponse>({
    type: 'offscreen/close',
  });
}
