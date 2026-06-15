/**
 * 说明：`chat-utils` 基础能力模块。
 *
 * 职责：
 * - 承载 `chat-utils` 相关的当前文件实现与模块边界；
 * - 对外暴露 `isContextDividerMessage`、`isEmptyAssistantShellMessage`、`shouldIncludeMessageInModelContext` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：ChatArea 的工具函数与类型定义。
 *
 * 从 ChatArea.tsx 拆分出的纯函数（便于复用/测试，减少主组件体积）：
 * - 上下文消息裁剪
 * - 虚拟列表行模型构建
 * - 内容搜索工具
 * - Markdown 转纯文本
 * - DOM/range 辅助
 * - 附件 ID 收集
 */

import type { Message } from '@/types/chat';
import { getMessageReasoningText, getMessageToolCalls } from '@/lib/chat/message-trace';

/**
 * 判断一条消息是否为“新上下文分隔符”。
 *
 * @param m - 待判断的消息。
 * @returns 是否为 `context-divider` system 消息。
 */
export function isContextDividerMessage(m: Message) {
  return m.role === 'system' && m.subtype === 'context-divider';
}

/**
 * 判断 assistant 消息是否只是一次失败后留下的空壳占位。
 *
 * 约束：
 * - 只过滤 assistant；
 * - 只要存在 content / reasoning / toolCalls / attachments 之一，就仍然保留；
 * - 目的是避免失败后的空壳消息污染下一轮 prompt。
 */
export function isEmptyAssistantShellMessage(m: Message) {
  if (m.role !== 'assistant') return false;
  const hasContent = Boolean(m.content?.trim());
  const hasReasoning = Boolean(getMessageReasoningText(m).trim());
  const hasToolCalls = getMessageToolCalls(m).length > 0;
  const hasAttachments = Array.isArray(m.attachments) && m.attachments.length > 0;
  return !hasContent && !hasReasoning && !hasToolCalls && !hasAttachments;
}

/**
 * 判断一条消息是否应进入模型上下文。
 *
 * 说明：
 * - 上下文分隔符只用于 UI，不会发给模型；
 * - 失败后残留的空 assistant 壳消息也要过滤掉，避免污染后续对话。
 */
export function shouldIncludeMessageInModelContext(m: Message) {
  return !isContextDividerMessage(m) && !isEmptyAssistantShellMessage(m);
}

/**
 * 从完整消息列表里裁剪出要发给模型的上下文消息。
 *
 * @param messages - 完整消息列表。
 * @param contextLength - 最多保留的消息条数。
 * @returns 已按最后一个上下文分隔符截断后的上下文消息。
 */
export function pickContextMessages(messages: Message[], contextLength: number) {
  // 约束：NEW_CONTEXT 分隔符会清空此前上下文，因此只取"最后一个分隔符之后"的消息作为上下文。
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (isContextDividerMessage(messages[i]!)) {
      start = i + 1;
      break;
    }
  }
  const sliced = messages.slice(start).filter(shouldIncludeMessageInModelContext);
  return sliced.slice(-contextLength);
}

/**
 * 收集某个 user ask 后面连续跟随的 assistant 消息。
 *
 * 说明：
 * - 只收“紧邻该 user 之后”的连续 assistant；
 * - 一旦遇到第一个非同 ask assistant 或非 assistant，立即停止；
 * - 该规则同时用于渲染分组与 replay，避免多处各写一套扫描逻辑后再次偏移。
 */
export function collectContiguousAskAssistants(messages: Message[], userIndex: number, askId: string) {
  const assistants: Message[] = [];
  for (let index = userIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message || message.role !== 'assistant' || message.askId !== askId) break;
    assistants.push(message);
  }
  return assistants;
}

/** 虚拟列表中的"普通消息行" */
export interface MessageRow {
  /** 行类型：普通消息 */
  kind: 'message';
  /** 消息数据 */
  message: Message;
  /** message 在原 messages 数组中的索引（用于判断最后一条等） */
  index: number;
}

/** 虚拟列表中的"上下文分隔线行" */
export interface DividerRow {
  /** 行类型：上下文分隔线 */
  kind: 'divider';
  /** 分隔线对应的 system 消息 */
  message: Message;
  /** message 在原 messages 数组中的索引 */
  index: number;
}

/** 虚拟列表中的"多模型分组行"（按 askId 将多条 assistant 合并成一组） */
export interface GroupRow {
  /** 行类型：分组 */
  kind: 'group';
  /** 分组 askId */
  askId: string;
  /** 该分组对应的 user 消息（持有 groupPrefs） */
  user: Message;
  /** 该 askId 下的 assistant 消息列表（\>=2） */
  assistants: Message[];
  /** user message 在原 messages 数组中的索引 */
  userIndex: number;
  /** assistant 覆盖的起始索引（含） */
  startIndex: number;
  /** assistant 覆盖的结束索引（含） */
  endIndex: number;
  /** 是否仍在生成中（用于展示 loading） */
  isLoading: boolean;
}

/** 虚拟列表中的"正在生成"占位行 */
export interface LoadingRow {
  /** 行类型：占位 loading */
  kind: 'loading';
}

/** ChatArea 虚拟列表行数据 */
export type ChatRow = MessageRow | DividerRow | GroupRow | LoadingRow;

/** 搜索命中的单条结果。 */
export type ContentSearchMatch = {
  /** 命中的消息 ID。 */
  messageId: string;
  /** 命中的消息索引。 */
  messageIndex: number;
  /** 这是该消息内的第几次命中。 */
  occurrence: number;
  /** 命中消息的角色。 */
  role: 'user' | 'assistant';
  /** 若属于多模型 ask，可携带 askId。 */
  askId?: string;
  /** 命中发生在 reasoning / tool-call / content / translation 哪一段。 */
  part: 'reasoning' | 'tool-call' | 'content' | 'translation';
};

/**
 * 构造 ChatArea 虚拟列表行模型。
 *
 * @param messages - 当前要渲染的消息数组。
 * @param startIndexOffset - 这些消息在原始数组中的偏移量。
 * @param isLoading - 当前是否仍有回复在生成中。
 * @returns 虚拟列表可直接消费的行数据。
 */
export function buildRows(
  messages: Message[],
  startIndexOffset: number,
  isLoading: boolean,
): ChatRow[] {
  const rows: ChatRow[] = [];

  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];

    if (isContextDividerMessage(msg)) {
      rows.push({ kind: 'divider', message: msg, index: startIndexOffset + i });
      i += 1;
      continue;
    }

    // 以 user message 为锚点：检测其后是否有多条同 askId 的 assistant 回复
    if (msg.role === 'user') {
      const askId = msg.askId || msg.id;
      const userIndex = startIndexOffset + i;
      rows.push({ kind: 'message', message: msg, index: userIndex });

      const assistants = collectContiguousAskAssistants(messages, i, askId);
      const j = i + 1 + assistants.length;

      if (assistants.length >= 2) {
        const startIndex = startIndexOffset + i + 1;
        const endIndex = startIndexOffset + j - 1;
        const groupLoading = assistants.some((m) => m.status === 'pending' || m.status === 'preparing' || m.status === 'processing') || (isLoading && j === messages.length);
        rows.push({
          kind: 'group',
          askId,
          user: msg,
          assistants,
          userIndex,
          startIndex,
          endIndex,
          isLoading: groupLoading,
        });
        i = j;
        continue;
      }

      i += 1;
      continue;
    }

    rows.push({ kind: 'message', message: msg, index: startIndexOffset + i });
    i += 1;
  }

  if (isLoading && messages.at(-1)?.role !== 'assistant') {
    rows.push({ kind: 'loading' });
  }

  return rows;
}

/**
 * 生成消息尾部的轻量签名。
 *
 * @param messages - 原始消息列表。
 * @param take - 参与签名的尾部消息数量。
 * @returns 用于比对最近消息是否变化的轻量签名。
 */
export function tailSignature(messages: Message[], take = 6) {
  /**
   * 生成消息尾部签名（轻量 hash-ish），用于快速判断“最近 N 条消息是否变化”。
   *
   * 说明：
   * - 仅用于缓存/去重等场景，不要求抗碰撞；
   * - 覆盖会影响渲染/上下文的关键字段（content 长度、reasoning 长度、工具调用数量、附件数量等）。
   */
  const tail = messages.slice(-take);
  return tail
    .map((m) => {
      const toolCallsLen = getMessageToolCalls(m).length;
      const attachmentsLen = m.attachments?.length ?? 0;
      return [
        m.id,
        m.role,
        m.modelId || '',
        m.content?.length ?? 0,
        getMessageReasoningText(m).length,
        toolCallsLen,
        attachmentsLen,
      ].join(':');
    })
    .join('|');
}

/**
 * 生成单条消息用于底部未读提示的可见输出签名。
 *
 * @remarks
 * 这份签名只服务“用户离底阅读时，尾部 assistant 正文或附件继续增长是否应提示”：
 * - 只记录正文长度和附件身份，不读取 reasoning、tool trace 或 status；
 * - 非 assistant 消息返回稳定空签名，避免用户 / system 原位编辑误触发底部 banner；
 * - 签名只进入当前聊天滚动 session 的内存 read marker，不作为持久化消息 schema。
 *
 * @param message - 当前需要记录为已读尾部的消息。
 * @returns 可用于比较尾部可见输出是否变化的轻量签名。
 */
export function visibleAssistantOutputSignature(message: Message | null | undefined) {
  if (!message || message.role !== 'assistant') return '';
  const attachmentSig = (message.attachments ?? [])
    .map((attachment) => [
      attachment.type,
      attachment.id,
      attachment.mime,
      attachment.size ?? 0,
    ].join(':'))
    .join(',');
  return [
    message.id,
    message.content?.length ?? 0,
    attachmentSig,
  ].join('|');
}

/**
 * 判断字符串是否只包含 ASCII。
 *
 * @param s - 待判断字符串。
 * @returns 是否仅包含 ASCII。
 */
export function isAsciiOnly(s: string) {
  /** 判断字符串是否仅包含 ASCII（用于搜索大小写/整词匹配等策略的启发式）。 */
  for (let i = 0; i < s.length; i += 1) {
    if (s.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

const wordCharRe = /[\p{L}\p{N}_]/u;

/**
 * 判断字符是否可视作“单词字符”。
 *
 * @param ch - 单个字符。
 * @returns 是否为字母/数字/下划线。
 */
export function isWordChar(ch: string): boolean {
  /** 判断字符是否可作为“单词字符”（字母/数字/下划线），用于整词匹配边界判定。 */
  return Boolean(ch && wordCharRe.test(ch));
}

/**
 * 判断查询词是否适合做整词匹配。
 *
 * @param q - 查询词。
 * @returns 是否满足整词匹配条件。
 */
export function isWordQuery(q: string) {
  /** 判断查询词是否适合做“whole word”匹配（当前仅对 ASCII 的字母数字下划线启用）。 */
  const s = q.trim();
  if (!s) return false;
  if (!isAsciiOnly(s)) return false;
  return /^[A-Za-z0-9_]+$/.test(s);
}

/**
 * 根据查询词推断默认的大小写敏感策略。
 *
 * @param q - 查询词。
 * @returns 是否默认开启大小写敏感。
 */
export function defaultCaseSensitiveForQuery(q: string) {
  /**
   * 推断某次搜索是否默认大小写敏感。
   *
   * 规则（启发式）：
   * - 非 ASCII：默认不敏感（避免误判）
   * - 含大写：认为用户希望敏感
   */
  const query = q.trim();
  if (!query) return false;
  // 交互稿：仅拉丁字母时启用大小写敏感；这里做近似：包含非 ASCII 时强制不敏感
  if (!isAsciiOnly(query)) return false;
  // 输入包含大写字母时认为用户希望大小写敏感
  return /[A-Z]/.test(query);
}

/**
 * 在文本中查找查询词的全部命中位置。
 *
 * @param haystackRaw - 被搜索文本。
 * @param needleRaw - 查询词。
 * @param opts - 大小写与整词匹配配置。
 * @returns 所有命中的起始下标。
 */
export function findAllOccurrences(
  haystackRaw: string,
  needleRaw: string,
  opts: { caseSensitive: boolean; wholeWord: boolean },
) {
  /**
   * 在 haystack 中查找 needle 的所有出现位置（返回起始下标数组）。
   *
   * 选项说明：
   * - `opts.caseSensitive`：是否大小写敏感。
   * - `opts.wholeWord`：是否整词匹配，仅对 `isWordQuery(needle)` 生效。
   */
  const needle = needleRaw.trim();
  if (!needle) return [];
  const haystack = String(haystackRaw || '');
  if (!haystack) return [];

  const caseSensitive = Boolean(opts.caseSensitive);
  const wholeWord = Boolean(opts.wholeWord) && isWordQuery(needle);

  const src = caseSensitive ? haystack : haystack.toLowerCase();
  const q = caseSensitive ? needle : needle.toLowerCase();

  const out: number[] = [];
  let idx = 0;
  while (idx <= src.length) {
    const hit = src.indexOf(q, idx);
    if (hit < 0) break;
    if (wholeWord) {
      const before = hit > 0 ? haystack[hit - 1] : '';
      const after = hit + q.length < haystack.length ? haystack[hit + q.length] : '';
      if (isWordChar(before) || isWordChar(after)) {
        idx = hit + Math.max(1, q.length);
        continue;
      }
    }
    out.push(hit);
    idx = hit + Math.max(1, q.length);
  }
  return out;
}

/**
 * 近似地把 Markdown 转成纯文本。
 *
 * @param mdRaw - 原始 Markdown。
 * @returns 尽量保留可读语义的纯文本。
 */
export function markdownToPlainText(mdRaw: string) {
  /**
   * 将 Markdown 近似转换为纯文本（用于搜索/摘要等场景）。
   *
   * 说明：
   * - 该函数不追求 100% 语义等价，只保证“尽量可读 + 不崩”；
   * - 处理常见结构：代码块、行内代码、图片/链接、标题/引用/列表、强调/删除线、HTML 标签等。
   */
  let s = String(mdRaw || '');
  if (!s) return '';
  s = s.replace(/\r\n/g, '\n');

  // 处理 code fences：保留内部文本，移除 fence
  s = s.replace(/```[^\n]*\n([\s\S]*?)```/g, (_m, code: string) => `\n${code}\n`);

  // 行内代码：去掉反引号
  s = s.replace(/`([^`]+)`/g, '$1');

  // 处理 images / links：保留可读文本
  s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 标题/引用/列表标记：去掉前缀符号
  s = s.replace(/^#{1,6}\s+/gm, '');
  s = s.replace(/^>\s?/gm, '');
  s = s.replace(/^(\s*)([-*+]|\d+\.)\s+/gm, '$1');

  // 强调/删除线：移除标记符
  s = s.replace(/(\*\*|__)(.*?)\1/g, '$2');
  s = s.replace(/(\*|_)(.*?)\1/g, '$2');
  s = s.replace(/~~(.*?)~~/g, '$1');

  // 处理 HTML tags（尽力而为）
  s = s.replace(/<[^>]+>/g, ' ');

  // 空白归一（保留换行）
  s = s.replace(/[ \t]+/g, ' ');
  return s;
}

/**
 * 对字符串执行 CSS 选择器安全转义。
 *
 * @param value - 原始字符串。
 * @returns 可安全拼入 `querySelector` 的字符串。
 */
export function cssEscape(value: string) {
  /**
   * 对字符串做 CSS.escape 处理（有原生则用原生，否则做最小兜底转义）。
   *
   * 用途：构建 querySelector/高亮定位等场景的安全选择器片段。
   */
  const v = String(value || '');
  const esc = (globalThis as unknown as { CSS?: { escape?: (s: string) => string } }).CSS?.escape;
  if (typeof esc === 'function') return esc(v);
  return v.replace(/["\\]/g, '\\$&');
}

/**
 * 收集消息数组中引用到的全部附件 ID。
 *
 * @param msgs - 消息数组。
 * @returns 去重后的附件 ID 列表。
 */
export function collectAttachmentIdsFromMessages(msgs: Message[]) {
  /**
   * 收集消息列表中引用的附件 ID（去重）。
   *
   * 用途：备份/恢复、清理话题数据时同步清理附件等。
   */
  const ids: string[] = [];
  for (const m of msgs) {
    for (const a of m.attachments || []) {
      if ((a?.type === 'image' || a?.type === 'file') && a.id) ids.push(a.id);
    }
  }
  return Array.from(new Set(ids));
}
