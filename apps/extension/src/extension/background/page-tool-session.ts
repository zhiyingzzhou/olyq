/**
 * 说明：`page-tool-session` 后台会话模块。
 *
 * 职责：
 * - 为元素选择器和截图编辑器维护临时页面工具会话；
 * - 统一决定页面工具关闭或提交后是否恢复 sidepanel；
 * - 避免 content script、插件和 one-shot handler 各自维护“回到侧栏”的状态。
 *
 * 边界：
 * - 这里的状态只存在于 Service Worker 内存，属于页面临时交互，不写入持久化存储；
 * - SW 被浏览器回收后，会话自然失效，用户可以重新点击工具入口恢复。
 */
import type { PageToolSessionTool } from '@/types/sw-messages';

/** 页面工具会话记录。 */
export type PageToolSessionRecord = {
  /** 页面工具会话 ID。 */
  sessionId: string;
  /** 目标网页 tabId。 */
  tabId: number;
  /** 会话所属工具。 */
  tool: PageToolSessionTool;
  /** 会话完成后是否恢复 sidepanel。 */
  returnToPanel: boolean;
  /** 会话创建时间。 */
  createdAt: number;
};

/** 页面工具会话关闭或提交后需要恢复的目标。 */
export type PageToolSessionRestoreTarget = {
  /** 被本次消息认领并移除的会话；SW 重启或重复通知时为空。 */
  session: PageToolSessionRecord | null;
  /** 应恢复 / 投递事件的网页 tabId。 */
  targetTabId: number | null;
  /** 本次动作是否应该回到 sidepanel。 */
  returnToPanel: boolean;
};

/** 页面工具会话最长存活时间，避免异常退出后 Map 长期增长。 */
const PAGE_TOOL_SESSION_TTL_MS = 10 * 60 * 1000;

/** 当前 Service Worker 生命周期内的页面工具会话表。 */
const pageToolSessions = new Map<string, PageToolSessionRecord>();

/** 清理过期会话。 */
function pruneExpiredPageToolSessions(now = Date.now()) {
  for (const [sessionId, session] of pageToolSessions) {
    if (now - session.createdAt > PAGE_TOOL_SESSION_TTL_MS) pageToolSessions.delete(sessionId);
  }
}

/** 生成页面工具会话 ID。 */
function createPageToolSessionId(tool: PageToolSessionTool, tabId: number) {
  const random = Math.random().toString(36).slice(2, 10);
  return `page-tool-${tool}-${tabId}-${Date.now().toString(36)}-${random}`;
}

/**
 * 创建页面工具会话。
 *
 * @param params - 会话所属 tab、工具与回 panel 策略。
 * @returns 已注册的会话记录。
 */
export function createPageToolSession(params: {
  tabId: number;
  tool: PageToolSessionTool;
  returnToPanel?: boolean;
}): PageToolSessionRecord {
  pruneExpiredPageToolSessions();
  // 页面工具会话不支持并行：新的用户手势成为唯一 owner。
  pageToolSessions.clear();
  const session: PageToolSessionRecord = {
    sessionId: createPageToolSessionId(params.tool, params.tabId),
    tabId: params.tabId,
    tool: params.tool,
    returnToPanel: params.returnToPanel !== false,
    createdAt: Date.now(),
  };
  pageToolSessions.set(session.sessionId, session);
  return session;
}

/**
 * 放弃尚未完成的页面工具会话。
 *
 * @param sessionId - 页面工具会话 ID。
 */
export function deletePageToolSession(sessionId: string | null | undefined): void {
  if (!sessionId) return;
  pageToolSessions.delete(sessionId);
}

/**
 * 认领并移除页面工具会话。
 *
 * @param sessionId - 页面工具会话 ID。
 * @returns 命中的会话；找不到时返回空值。
 */
export function claimPageToolSession(sessionId: string | null | undefined): PageToolSessionRecord | null {
  if (!sessionId) return null;
  pruneExpiredPageToolSessions();
  const session = pageToolSessions.get(sessionId) ?? null;
  if (session) pageToolSessions.delete(sessionId);
  return session;
}

/**
 * 认领页面工具会话并解析 sidepanel 恢复目标。
 *
 * 说明：
 * - 本函数只处理会话所有权，不直接调用 `sidePanel.open()`；
 * - Chrome 要求 `sidePanel.open()` 贴近用户手势，打开动作必须留在收到
 *   content-script 点击消息的 handler 第一段同步执行；
 * - SW 会话丢失时，只在 payload 明确带 `returnToPanel:true` 且 sender 提供
 *   tabId 时恢复，避免错误打开其它标签页的 sidepanel。
 *
 * @param params - 会话 ID、fallback tabId 和 payload return flag。
 * @returns 本次消息对应的恢复目标。
 */
export function claimPageToolSessionRestoreTarget(params: {
  sessionId?: string | null;
  fallbackTabId?: number | null;
  returnToPanel?: boolean;
}): PageToolSessionRestoreTarget {
  const session = claimPageToolSession(params.sessionId);
  const targetTabId = session?.tabId ?? params.fallbackTabId ?? null;
  const returnToPanel = session ? session.returnToPanel : params.returnToPanel === true;
  return { session, targetTabId, returnToPanel };
}

/**
 * 测试专用：读取当前会话数量。
 *
 * @returns 当前 SW 内存中的会话数量。
 */
export function getPageToolSessionCountForTest(): number {
  return pageToolSessions.size;
}
