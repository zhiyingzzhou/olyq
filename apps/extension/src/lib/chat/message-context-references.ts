/**
 * 说明：`message-context-references` 基础能力模块。
 *
 * 职责：
 * - 维护用户消息里可见上下文引用卡的持久化规整；
 * - 只接受当前结构化页面元素引用 schema，旧字符串引用形态直接清理；
 * - 提供 context-owned 附件 ID 集合，供消息气泡与导出过滤普通附件展示。
 *
 * 边界：
 * - 本模块只处理消息结构；
 * - 不读取附件 Blob、不访问 IndexedDB、不参与模型请求组装；
 * - 不解析旧版 Markdown 字符串，避免把已格式化中文重新升级成当前真源。
 */
import { sanitizeElementActionPayload } from '@/lib/element-context-draft';
import { isPlainRecord } from '@/lib/utils/type-guards';
import type { Message, MessageContextReference } from '@/types/chat';

/**
 * 规整上下文引用中的附件 ID 列表。
 *
 * @param raw - 持久化中读取出的原始附件 ID 列表。
 * @returns 去重后的有效附件 ID。
 */
function normalizeAttachmentIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

/**
 * 判断两个字符串数组是否完全一致。
 */
function sameStringArray(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

/** 生成稳定 JSON，用于判断清理前后是否发生 schema 变化。 */
function stableJson(value: unknown) {
  return JSON.stringify(value);
}

/**
 * 规整从存储中读取出的上下文引用卡。
 *
 * @param raw - 持久化消息里的 `contextReferences` 原始值。
 * @returns 当前 schema 下的引用卡列表与是否发生变更。
 */
export function normalizeMessageContextReferences(
  raw: unknown,
): { references?: MessageContextReference[]; changed: boolean } {
  if (raw === undefined) return { references: undefined, changed: false };
  if (!Array.isArray(raw)) return { references: undefined, changed: true };

  let changed = false;
  const references: MessageContextReference[] = [];

  for (const item of raw) {
    if (!isPlainRecord(item)) {
      changed = true;
      continue;
    }

    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const kind = item.kind === 'element' ? 'element' : null;
    const payload = sanitizeElementActionPayload({ element: item.element, source: item.source });
    const attachmentIds = normalizeAttachmentIds(item.attachmentIds);

    if (!id || !kind || !payload) {
      changed = true;
      continue;
    }

    const reference: MessageContextReference = {
      id,
      kind,
      element: payload.element,
      ...(payload.source ? { source: payload.source } : {}),
      attachmentIds,
    };
    const comparableRaw = {
      id: typeof item.id === 'string' ? item.id : '',
      kind: item.kind,
      element: item.element,
      ...(item.source !== undefined ? { source: item.source } : {}),
      attachmentIds: Array.isArray(item.attachmentIds) ? item.attachmentIds.map((value) => String(value || '').trim()).filter(Boolean) : [],
    };

    if (
      id !== item.id
      || kind !== item.kind
      || !sameStringArray(attachmentIds, comparableRaw.attachmentIds)
      || stableJson(reference.element) !== stableJson(comparableRaw.element)
      || stableJson(reference.source) !== stableJson(comparableRaw.source)
    ) {
      changed = true;
    }

    references.push(reference);
  }

  if (references.length !== raw.length) changed = true;
  return { references: references.length > 0 ? references : undefined, changed };
}

/**
 * 判断消息的 `modelContext` 是否为旧版页面元素 Markdown。
 *
 * @param modelContext - 持久化中的隐藏上下文。
 * @returns 命中旧版元素引用标题时返回 `true`。
 */
export function isLegacyElementModelContext(modelContext: unknown) {
  return typeof modelContext === 'string' && /^###\s+页面元素引用：/m.test(modelContext);
}

/**
 * 收集消息中由上下文引用拥有的附件 ID。
 *
 * @param message - 原始聊天消息。
 * @returns context-owned 附件 ID 集合。
 */
export function getMessageContextReferenceAttachmentIds(message: Message): Set<string> {
  const ids = new Set<string>();
  for (const reference of message.contextReferences || []) {
    for (const attachmentId of reference.attachmentIds || []) {
      const id = String(attachmentId || '').trim();
      if (id) ids.add(id);
    }
  }
  return ids;
}
