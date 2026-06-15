/**
 * 说明：`selection` 基础能力模块。
 *
 * 职责：
 * - 承载 `selection` 相关的当前文件实现与模块边界；
 * - 对外暴露 `McpServerSelectionMode`、`McpServerSelection`、`normalizeMcpServerIds` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { isPlainRecord } from '@/lib/utils/type-guards';

/** MCP 服务选择模式。 */
export type McpServerSelectionMode = 'auto' | 'manual' | 'disabled';

/**
 * 助手/话题层面对 MCP 服务的选择配置。
 *
 * 说明：
 * - `auto` 表示由模型按当前消息按需选择相关 MCP 服务；
 * - `manual` 表示只启用显式列出的服务；
 * - `disabled` 表示本轮完全禁用 MCP。
 */
export interface McpServerSelection {
  /** 当前选择模式。 */
  mode: McpServerSelectionMode;
  /** 手动模式下显式选中的服务 ID 列表。 */
  manualServerIds: string[];
}

/** 规整 MCP 服务 ID 列表：去空、去重并保留顺序。 */
export function normalizeMcpServerIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const id = String(item || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** 构造“自动选择 MCP 服务”的选择对象。 */
export function createAutoMcpServerSelection(): McpServerSelection {
  return { mode: 'auto', manualServerIds: [] };
}

/** 构造“完全禁用 MCP 服务”的选择对象。 */
export function createDisabledMcpServerSelection(): McpServerSelection {
  return { mode: 'disabled', manualServerIds: [] };
}

/** 构造“手动指定服务列表”的选择对象。 */
export function createManualMcpServerSelection(serverIds: string[]): McpServerSelection {
  return {
    mode: 'manual',
    manualServerIds: normalizeMcpServerIds(serverIds),
  };
}

/**
 * 把任意原始值收敛为合法的 MCP 服务选择对象。
 *
 * 说明：
 * - 输入非法时按 `fallbackMode` 回退到 auto 或 disabled；
 * - manual 模式下会重新规整 `manualServerIds`。
 */
export function sanitizeMcpServerSelection(
  raw: unknown,
  fallbackMode: McpServerSelectionMode = 'auto',
): McpServerSelection {
  if (!isPlainRecord(raw)) {
    return fallbackMode === 'disabled'
      ? createDisabledMcpServerSelection()
      : createAutoMcpServerSelection();
  }

  const mode = raw.mode;
  const manualServerIds = normalizeMcpServerIds(raw.manualServerIds);

  if (mode === 'manual') return { mode, manualServerIds };
  if (mode === 'disabled') return createDisabledMcpServerSelection();
  if (mode === 'auto') return createAutoMcpServerSelection();

  return fallbackMode === 'disabled'
    ? createDisabledMcpServerSelection()
    : createAutoMcpServerSelection();
}

/** 根据选择模式和当前启用服务列表，计算界面上可展示的选中 serverIds。 */
export function resolveSelectedMcpServerIds(
  selection: McpServerSelection,
  _enabledServerIds: string[],
): string[] {
  if (selection.mode === 'auto') return [];
  if (selection.mode === 'disabled') return [];
  return normalizeMcpServerIds(selection.manualServerIds);
}
