/**
 * 说明：`host` 源码模块。
 *
 * 职责：
 * - 承载 `host` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SwMessage`、`SwPluginRuntime`、`SwPluginMessageContext` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：Service Worker 收到的 sendMessage 指令。
 *
 * 已知消息类型定义在 `\@/types/sw-messages` 的 `SwInboundMessage` 联合类型中。
 * 插件系统保留 `string` 以支持第三方/动态注册的消息类型。
 */

import { toI18nTextFromError } from '@/lib/i18n/error';
import { i18nText } from '@/lib/i18n/text';
import type { PageToolSessionTool } from '@/types/sw-messages';
import type {
  SidePanelOwnerClaimResult,
  SidePanelOwnerRecord,
  SidePanelPageToolCommandResult,
} from '@/extension/background/side-panel-service';

/** Service Worker 消息的最小插件契约。 */
export type SwMessage = {
  /** 消息类型（已知类型见 SwInboundMessageType） */
  type: string;
  /** 可选：消息负载（已知消息的 payload 类型见 SwInboundMessage） */
  payload?: unknown;
};

/** Service Worker 插件运行时（由宿主实现；便于插件后续抽离） */
export type SwPluginRuntime = {
  /** 广播到 UI Port（Side Panel / Content Script 内联入口） */
  postUiEvent: (evt: { type: string; payload?: unknown }) => void;
  /** 开始 Side Panel 单 owner 页面工具会话。 */
  beginPageToolSidePanelOwner: (params: { tabId: number; tool: PageToolSessionTool; sessionId?: string }) => SidePanelOwnerRecord;
  /** 取消当前 Side Panel 页面工具 owner。 */
  cancelPageToolSidePanelOwner: (generation?: number) => void;
  /** 认领当前 Side Panel 页面工具 owner。 */
  claimPageToolSidePanelOwner: (params: {
    sessionId?: string | null;
    tool?: PageToolSessionTool | null;
    fallbackTabId?: number | null;
    returnToPanel?: boolean;
  }) => SidePanelOwnerClaimResult;
  /** 向单 owner Side Panel 投递页面工具命令并等待业务 ack。 */
  postPageToolCommandToSidePanel: (
    generation: number,
    evt: { type: string; payload?: unknown },
  ) => Promise<SidePanelPageToolCommandResult>;
  /** 打开主面板（Chromium Side Panel / Firefox Sidebar；可选传 tabId） */
  ensurePanel: (tabId?: number | null) => Promise<void>;
  /** 在 content-script 用户手势链路里立即打开当前 tab 主面板。 */
  openPanelForTabFromUserGesture: (tabId: number, pageToolGeneration?: number) => Promise<void>;
  /** 获取当前活动 tabId */
  getActiveTabId: () => Promise<number | null>;
};

/** 传给 Service Worker 插件的消息处理上下文。 */
export type SwPluginMessageContext = {
  /** 原始消息（来自 chrome.runtime.sendMessage） */
  msg: SwMessage;
  /** sender 信息（包含 sender.tab.id） */
  sender: chrome.runtime.MessageSender;
  /** sendResponse（由宿主透传） */
  sendResponse: (response: unknown) => void;
  /** 插件运行时 */
  runtime: SwPluginRuntime;
};

/** Service Worker 插件：按消息 type 注册处理函数 */
export type SwPlugin = {
  /** 插件 ID（稳定且唯一） */
  id: string;
  /** 关注的消息类型（用于宿主 O(1) 分发） */
  onMessageTypes: string[];
  /**
   * 处理消息：
   * - 返回 true：表示异步响应（宿主需要在 onMessage listener 中 return true）
   * - 返回 false/void：同步响应或无需保持通道
   */
  onMessage: (ctx: SwPluginMessageContext) => boolean | void;
};

/** Service Worker 插件宿主向上暴露的最小分发接口。 */
export type SwPluginHost = {
  /**
   * 分发一条消息；返回：
   * - undefined：没有插件接管
   * - boolean：插件已接管（true 表示异步响应）
   */
  dispatch: (ctx: Omit<SwPluginMessageContext, 'runtime'>) => boolean | undefined;
};

/** 插件激活事件：建议与 sendMessage 的 msg.type 对齐（例如 "screenshot/editor/start"） */
export type SwActivationEvent = string;

/** Service Worker 插件描述符：支持“激活事件”+ 动态导入 */
export type SwPluginDescriptor = {
  /** 描述符 ID（用于缓存加载结果；建议与插件 id 相同） */
  id: string;
  /** 激活事件列表（首次触发任一事件时加载该插件） */
  activationEvents: SwActivationEvent[];
  /** 动态加载函数（建议使用 import() 生成独立 chunk） */
  load: () => Promise<SwPlugin | SwPlugin[]>;
};

/**
 * 创建 Service Worker 插件宿主：
 * - 只做"按 type 分发 + 单插件接管 + 隔离异常"
 * - 避免一个插件 sendResponse 多次或多个插件抢同一条消息
 */
export function createSwPluginHost({ plugins, runtime }: { plugins: SwPlugin[]; runtime: SwPluginRuntime }): SwPluginHost {
  const index = new Map<string, SwPlugin[]>();
  for (const p of plugins) {
    for (const type of p.onMessageTypes) {
      const key = String(type || '').trim();
      if (!key) continue;
      const arr = index.get(key) ?? [];
      arr.push(p);
      index.set(key, arr);
    }
  }

  return {
        /**
     * 内部方法：`dispatch`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    dispatch(ctx) {
      const type = String(ctx?.msg?.type || '').trim();
      if (!type) return undefined;
      const list = index.get(type);
      if (!list || list.length === 0) return undefined;

      // 约定：同一条消息只由第一个匹配插件接管（避免多次 sendResponse）
      const p = list[0];
      try {
        const res = p.onMessage({ ...ctx, runtime });
        return Boolean(res);
      } catch {
        return undefined;
      }
    },
  };
}

/**
 * 把一个函数包装成“只允许调用一次”的版本。
 *
 * @param fn - 原始函数。
 * @returns 首次调用生效、后续调用静默忽略的包装函数。
 */
function safeOnce<TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult) {
  let called = false;
  return (...args: TArgs) => {
    if (called) return;
    called = true;
    fn(...args);
  };
}

/**
 * 将插件注册到按消息类型分发的索引中。
 *
 * @param index - 宿主内部的消息类型索引。
 * @param loadedIds - 已加载插件 ID 集合。
 * @param plugin - 待注册插件。
 */
function registerSwPlugin(index: Map<string, SwPlugin[]>, loadedIds: Set<string>, plugin: SwPlugin) {
  if (loadedIds.has(plugin.id)) return;
  loadedIds.add(plugin.id);
  for (const type of plugin.onMessageTypes) {
    const key = String(type || '').trim();
    if (!key) continue;
    const arr = index.get(key) ?? [];
    arr.push(plugin);
    index.set(key, arr);
  }
}

/**
 * 创建懒加载 Service Worker 插件宿主（激活事件 + 动态导入）
 * - 首次收到某个 msg.type 时，按 activationEvents 映射动态加载对应插件
 * - 为保证 sendResponse 通道不被提前关闭：首次触发需要异步加载时会直接 return true
 */
export function createLazySwPluginHost({ descriptors, runtime }: { descriptors: SwPluginDescriptor[]; runtime: SwPluginRuntime }): SwPluginHost {
  const loadedPluginIds = new Set<string>();
  const index = new Map<string, SwPlugin[]>();

  const activationIndex = new Map<string, SwPluginDescriptor[]>();
  for (const d of descriptors) {
    for (const ev of d.activationEvents) {
      const key = String(ev || '').trim();
      if (!key) continue;
      const arr = activationIndex.get(key) ?? [];
      arr.push(d);
      activationIndex.set(key, arr);
    }
  }

  const descriptorPromises = new Map<string, Promise<void>>();

  /**
   * 只加载一次指定插件描述符。
   *
   * @param d - 插件描述符。
   * @returns 本次描述符加载 Promise。
   */
  async function loadDescriptorOnce(d: SwPluginDescriptor) {
    const id = String(d.id || '').trim();
    if (!id) return;
    const existing = descriptorPromises.get(id);
    if (existing) return existing;

    const p = (async () => {
      const loaded = await d.load();
      const list = Array.isArray(loaded) ? loaded : [loaded];
      for (const plugin of list) registerSwPlugin(index, loadedPluginIds, plugin);
    })();

    descriptorPromises.set(id, p);
    return p;
  }

  /**
   * 根据当前消息类型激活并加载对应插件。
   *
   * @param eventType - 激活事件类型。
   */
  async function activateByEvent(eventType: string) {
    const list = activationIndex.get(eventType);
    if (!list || list.length === 0) return;
    await Promise.all(list.map(loadDescriptorOnce));
  }

  /**
   * 在当前已加载插件中查找并执行匹配处理器。
   *
   * @param ctx - 消息处理上下文。
   * @returns `boolean` 表示消息已被插件接管；`undefined` 表示未命中处理器。
   */
  function runHandlerIfAny(ctx: Omit<SwPluginMessageContext, 'runtime'>) {
    const type = String(ctx?.msg?.type || '').trim();
    if (!type) return undefined;
    const list = index.get(type);
    if (!list || list.length === 0) return undefined;

    const plugin = list[0];
    const sendResponseOnce = safeOnce(ctx.sendResponse);
    try {
      return Boolean(plugin.onMessage({ ...ctx, sendResponse: sendResponseOnce, runtime }));
    } catch (e: unknown) {
      // 尽力而为：尽量返回一个明确错误，避免上层 await 挂住。
      // 约束：error 统一返回 I18nText（key + params），由 UI 侧负责渲染。
      sendResponseOnce({ ok: false, error: toI18nTextFromError(e) });
      return false;
    }
  }

  return {
        /**
     * 内部方法：`dispatch`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    dispatch(ctx) {
      const type = String(ctx?.msg?.type || '').trim();
      if (!type) return undefined;

      // 已有同步处理器：直接执行并返回结果（与非懒加载版本保持一致）
      const immediate = runHandlerIfAny(ctx);
      if (typeof immediate === 'boolean') return immediate;

      // 若没有已注册处理器，但存在 activation 映射：异步加载后再执行
      const descList = activationIndex.get(type);
      if (!descList || descList.length === 0) return undefined;

      const sendResponseOnce = safeOnce(ctx.sendResponse);
      void (async () => {
        try {
          await activateByEvent(type);
          const res = runHandlerIfAny({ ...ctx, sendResponse: sendResponseOnce });
          if (typeof res === 'undefined') {
            // 尽力而为：避免上层 await 悬挂
            sendResponseOnce({ ok: false, error: i18nText('errors.swPluginHandlerNotFound') });
          }
        } catch (e: unknown) {
          sendResponseOnce({ ok: false, error: toI18nTextFromError(e) });
        }
      })();

      // 关键：return true 以保持 sendResponse 通道（动态 import 必须异步）
      return true;
    },
  };
}
