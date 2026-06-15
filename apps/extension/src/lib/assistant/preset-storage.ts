/**
 * 说明：`preset-storage` 助手预设持久化模块。
 *
 * 职责：
 * - 统一用户自定义助手预设的存储 key、schema 归一化与导入逻辑；
 * - 为 store、导入导出与测试提供同一套无副作用 helper；
 * - 明确“我的预设”只保存当前 schema，不承载助手实例态或 browser-context override。
 *
 * 边界：
 * - 这里只处理用户预设自身，不负责内置 `public/data/*.json` 预设目录加载；
 * - 不直接触发浏览器下载、弹窗或 toast；
 * - 不读写旧 `preset-prefs` 真源，也不做双版本兼容解析。
 */
import { normalizeAssistantIconId } from '@/lib/assistant-icons';
import { sanitizeMcpServerSelection } from '@/lib/mcp/selection';
import { createId } from '@/lib/utils/id';
import { isPlainRecord } from '@/lib/utils/type-guards';
import { normalizeAssistantScenario, type StoredAssistantPreset } from '@/types/assistant';
import { normalizeStringArray } from './assistant-storage';

/** 用户自定义助手预设的共享存储 key。 */
export const ASSISTANT_PRESETS_STORAGE_KEY = 'olyq.assistant-presets.v1';

/**
 * 用于创建或编辑用户预设的固定字段草稿。
 *
 * 说明：
 * - 当前产品只允许用户维护这组字段；
 * - 其它 AssistantConfig 字段不会进入“我的预设”真源。
 */
export interface StoredAssistantPresetDraft {
  scenario: StoredAssistantPreset['scenario'];
  iconId?: StoredAssistantPreset['iconId'];
  name: string;
  description?: string;
  prompt: string;
  tags?: string[];
  enableWebSearch?: boolean;
  enableGenerateImage?: boolean;
  enableMemory?: boolean;
  mcpSelection?: StoredAssistantPreset['mcpSelection'];
}

/**
 * 把任意输入规整为单条可持久化的用户预设。
 *
 * @remarks
 * 这条 helper 是“我的预设”唯一 schema 收口点：
 * - 只有名称与 prompt 同时有效时才会保留；
 * - 图标、标签、MCP 选择和布尔开关都统一走当前 helper 归一化；
 * - 不接受未知扩展字段渗入用户预设真源。
 */
export function sanitizeStoredAssistantPreset(
  raw: unknown,
  options: {
    fallbackId?: string;
    fallbackNow?: number;
    allowGeneratedId?: boolean;
  } = {},
): StoredAssistantPreset | null {
  if (!isPlainRecord(raw)) return null;

  const fallbackNow = typeof options.fallbackNow === 'number' && Number.isFinite(options.fallbackNow)
    ? options.fallbackNow
    : Date.now();
  const rawId = typeof raw.id === 'string' || typeof raw.id === 'number' ? String(raw.id).trim() : '';
  const id = rawId || (options.allowGeneratedId ? (options.fallbackId || createId()) : '');
  if (!id) return null;

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const prompt = normalizeMultilineText(raw.prompt);
  if (!name || !prompt) return null;

  const createdAt = normalizeTimestamp(raw.createdAt, fallbackNow);
  const updatedAt = normalizeTimestamp(raw.updatedAt, createdAt);

  return {
    id,
    scenario: normalizeAssistantScenario(raw.scenario),
    iconId: normalizeAssistantIconId(raw.iconId),
    name,
    description: normalizeOptionalMultilineText(raw.description),
    prompt,
    tags: normalizeStringArray(raw.tags),
    enableWebSearch: normalizeOptionalBoolean(raw.enableWebSearch),
    enableGenerateImage: normalizeOptionalBoolean(raw.enableGenerateImage),
    enableMemory: normalizeOptionalBoolean(raw.enableMemory),
    mcpSelection: sanitizeMcpServerSelection(raw.mcpSelection, 'auto'),
    createdAt,
    updatedAt,
  };
}

/**
 * 批量清洗用户预设数组。
 *
 * @remarks
 * 仅负责“结构合法且 ID 去重”，不在这里做导入冲突重生；
 * 导入场景会交给 `normalizeImportedStoredAssistantPresets` 处理。
 */
export function sanitizeStoredAssistantPresets(raw: unknown): StoredAssistantPreset[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredAssistantPreset[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const preset = sanitizeStoredAssistantPreset(item);
    if (!preset || seen.has(preset.id)) continue;
    seen.add(preset.id);
    out.push(preset);
  }
  return out.sort((left, right) => right.updatedAt - left.updatedAt);
}

/**
 * 将导入 payload 规整为当前 schema 的用户预设列表。
 *
 * @remarks
 * 这里接受“单对象或数组”两种输入，并强制把 ID 冲突改写为新 ID：
 * - 与现有内置/用户预设冲突时直接重生；
 * - 同一批导入内部互相冲突时也会继续重生；
 * - 导入后的 `createdAt/updatedAt` 统一落为当前导入时间。
 */
export function normalizeImportedStoredAssistantPresets(
  raw: unknown,
  options: {
    existingIds: Iterable<string>;
    now?: number;
  },
): StoredAssistantPreset[] {
  const now = typeof options.now === 'number' && Number.isFinite(options.now) ? options.now : Date.now();
  const sourceItems = Array.isArray(raw) ? raw : [raw];
  const usedIds = new Set<string>();
  for (const id of options.existingIds) {
    const normalized = String(id || '').trim();
    if (normalized) usedIds.add(normalized);
  }

  const out: StoredAssistantPreset[] = [];
  for (const item of sourceItems) {
    const normalized = sanitizeStoredAssistantPreset(item, {
      allowGeneratedId: true,
      fallbackNow: now,
    });
    if (!normalized) continue;

    const id = reservePresetId(normalized.id, usedIds);
    out.push({
      ...normalized,
      id,
      createdAt: now,
      updatedAt: now,
    });
  }
  return out;
}

/**
 * 把草稿物化为一条新的用户预设记录。
 *
 * @remarks
 * 新建和编辑都会经过 `sanitizeStoredAssistantPreset`，保证最终落盘结构只认当前 schema。
 */
export function buildStoredAssistantPresetRecord(
  draft: StoredAssistantPresetDraft,
  options: {
    presetId?: string;
    createdAt?: number;
    updatedAt?: number;
  } = {},
): StoredAssistantPreset | null {
  const now = typeof options.updatedAt === 'number' && Number.isFinite(options.updatedAt)
    ? options.updatedAt
    : Date.now();
  return sanitizeStoredAssistantPreset(
    {
      ...draft,
      id: options.presetId ?? createId(),
      createdAt: typeof options.createdAt === 'number' && Number.isFinite(options.createdAt) ? options.createdAt : now,
      updatedAt: now,
    },
    {
      allowGeneratedId: true,
      fallbackId: options.presetId,
      fallbackNow: now,
    },
  );
}

/**
 * 内部函数：`normalizeMultilineText`。
 *
 * @remarks
 * 保持 prompt / description 的换行稳定为 LF，避免不同导入来源的 CRLF 漂移。
 */
function normalizeMultilineText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '';
}

/**
 * 内部函数：`normalizeOptionalMultilineText`。
 *
 * @remarks
 * 用于描述字段的可选换行文本清洗。
 */
function normalizeOptionalMultilineText(value: unknown): string | undefined {
  const normalized = normalizeMultilineText(value);
  return normalized || undefined;
}

/**
 * 内部函数：`normalizeOptionalBoolean`。
 *
 * @remarks
 * 只接受显式布尔值，其它输入统一视为未填写。
 */
function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * 内部函数：`normalizeTimestamp`。
 *
 * @remarks
 * 持久化时间戳一律要求有限数字；非法值直接回退到给定默认值。
 */
function normalizeTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * 内部函数：`reservePresetId`。
 *
 * @remarks
 * 导入预设时不保留冲突 ID：
 * 只要命中现有集合，就持续重生直到拿到当前批次里唯一的新 ID。
 */
function reservePresetId(candidate: string, usedIds: Set<string>): string {
  const normalizedCandidate = String(candidate || '').trim();
  if (normalizedCandidate && !usedIds.has(normalizedCandidate)) {
    usedIds.add(normalizedCandidate);
    return normalizedCandidate;
  }

  let nextId = createId();
  while (usedIds.has(nextId)) nextId = createId();
  usedIds.add(nextId);
  return nextId;
}
