/**
 * 说明：`memory-orchestration` 后台运行时模块。
 *
 * 职责：
 * - 承载 `memory-orchestration` 相关的当前文件实现与模块边界；
 * - 对外暴露 `maybeProcessConversationMemory` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { generateText } from 'ai';

import type { ChatMessage } from '../../lib/ai/types';
import { resolveEmbeddingExecutor } from '../../lib/ai/embedding-executor';
import { addMemory, deleteMemory, searchMemoriesByVector, toUnifiedFloat32Embedding, l2NormalizeEmbedding, updateMemory } from '../../lib/memory';
import { clearCachedRelevantMemories, getCachedRelevantMemories } from './memory-tools';
import { logger } from '../../lib/logger';
import type { PostStreamContext } from './pipeline-types';
import {
  buildTextTaskCallPlan,
  toGenerateTextCallSettings,
} from './text-task-call-plan';

/** 事实提取阶段返回的最小 JSON 结构。 */
type ExtractedFacts = {
  /** 从对话中抽取出的长期稳定事实列表，供后续记忆更新决策使用。 */
  facts: string[];
};

/** 记忆更新操作。 */
type MemoryOp =
  | { action: 'ADD'; text: string }
  | { action: 'UPDATE'; id: string; text: string }
  | { action: 'DELETE'; id: string }
  | { action: 'SKIP' };

/** 去掉模型输出里可能包裹的 Markdown 代码块。 */
function stripCodeFences(text: string) {
  const s = String(text || '').trim();
  if (!s) return '';
  return s
    .replace(/^```[a-zA-Z0-9_-]*\s*/g, '')
    .replace(/\s*```$/g, '')
    .trim();
}

/**
 * 尽力把文本解析成 JSON。
 *
 * 说明：
 * - 先尝试直接解析；
 * - 若失败，再尝试截取首个对象或数组片段，兼容模型偶尔输出额外前后缀文本的情况。
 */
function tryParseJson<T>(text: string): T | null {
  const cleaned = stripCodeFences(text);
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // 尽力而为：截取第一个 JSON 对象/数组
    const startObj = cleaned.indexOf('{');
    const endObj = cleaned.lastIndexOf('}');
    if (startObj >= 0 && endObj > startObj) {
      const slice = cleaned.slice(startObj, endObj + 1);
      try { return JSON.parse(slice) as T; } catch { /* 忽略 */ }
    }
    const startArr = cleaned.indexOf('[');
    const endArr = cleaned.lastIndexOf(']');
    if (startArr >= 0 && endArr > startArr) {
      const slice = cleaned.slice(startArr, endArr + 1);
      try { return JSON.parse(slice) as T; } catch { /* 忽略 */ }
    }
    return null;
  }
}

/** 规范化事实提取结果，并限制条数与长度。 */
function normalizeFacts(raw: unknown, max = 8): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const facts = (raw && typeof raw === 'object' && !Array.isArray(raw))
    ? (raw as Record<string, unknown>).facts
    : null;
  const list = Array.isArray(facts) ? facts : [];
  for (const it of list) {
    const v = typeof it === 'string' ? it.trim() : '';
    if (!v) continue;
    if (v.length > 200) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/** 挑选最近若干轮用户/助手对话，拼成供 LLM 提取记忆的上下文。 */
function pickConversationForPrompt(messages: ChatMessage[], assistantText: string) {
  const lines: string[] = [];
  for (const m of messages) {
    if (!m) continue;
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const content = String(m.content || '').trim();
    if (!content) continue;
    const clipped = content.length > 800 ? `${content.slice(0, 800)}…` : content;
    lines.push(`${m.role === 'user' ? '用户' : 'AI'}: ${clipped}`);
  }
  const final = String(assistantText || '').trim();
  if (final) {
    const clipped = final.length > 800 ? `${final.slice(0, 800)}…` : final;
    lines.push(`AI: ${clipped}`);
  }
  return lines.slice(-20).join('\n');
}

/** 构建“事实提取”提示词。 */
function buildFactExtractionPrompt(conversationText: string) {
  return [
    '你是一个“用户记忆提取器”。',
    '任务：从对话中提取“长期稳定、与用户有关”的事实（例如：身份信息、偏好、长期目标、固定约束）。',
    '不要提取：问题、临时计划、一次性请求、通用知识、与用户无关的事实、工具/代码细节。',
    '要求：仅输出合法 JSON 对象，不要输出 Markdown，不要解释。',
    '输出格式：{"facts":["...","..."]}（最多 8 条；没有则 []）。',
    '',
    '对话：',
    conversationText,
  ].join('\n');
}

/** 构建“旧记忆 + 新事实 -\> 操作列表”的提示词。 */
function buildUpdateOpsPrompt(oldMemories: Array<{ id: string; text: string }>, facts: string[]) {
  return [
    '你是一个“记忆管理器”。你需要根据新事实更新旧记忆。',
    '',
    '你会收到：',
    '1) 旧记忆候选（JSON 数组，每项包含 id 与 text）',
    '2) 新事实（JSON 数组）',
    '',
    '你的输出必须是“纯 JSON 数组”，每一项为下列之一：',
    '- {"action":"ADD","text":"..."}：添加新记忆',
    '- {"action":"UPDATE","id":"...","text":"..."}：更新某条旧记忆（id 必须来自旧记忆候选）',
    '- {"action":"DELETE","id":"..."}：删除某条旧记忆（仅当新事实明确否定/冲突，且删除更合理）',
    '- {"action":"SKIP"}：无需操作',
    '',
    '规则：',
    '- 不要编造 id；UPDATE/DELETE 的 id 只能来自旧记忆候选。',
    '- 尽量合并重复/高度相似的信息，避免记忆条目过多。',
    '- 只输出 JSON，不要输出额外文本或代码块。',
    '',
    '旧记忆候选：',
    JSON.stringify(oldMemories, null, 2),
    '',
    '新事实：',
    JSON.stringify(facts, null, 2),
  ].join('\n');
}

/**
 * 使用统一 runtime call plan 执行记忆后台文本任务。
 *
 * @param modelId - 记忆设置里选择的 LLM 模型。
 * @param prompt - 当前后台任务提示词。
 * @param maxTokens - 本任务期望输出上限，最终是否下发由能力层过滤。
 * @param signal - 外层取消信号。
 * @returns 模型文本输出。
 */
async function generateMemoryTaskText(params: {
  modelId: string;
  prompt: string;
  maxTokens: number;
  signal: AbortSignal;
}): Promise<string> {
  const plan = await buildTextTaskCallPlan({
    model: params.modelId,
    temperature: 0.2,
    maxTokens: params.maxTokens,
    enableWebSearch: false,
  });
  const { text } = await generateText({
    model: plan.languageModel,
    prompt: params.prompt,
    ...toGenerateTextCallSettings(plan.callSettings),
    abortSignal: params.signal,
    ...(plan.providerOptions ? { providerOptions: plan.providerOptions } : {}),
  });
  return text;
}

/** 把模型输出的操作列表归一化为受控的记忆操作集合。 */
function normalizeOps(raw: unknown, candidateIds: Set<string>): MemoryOp[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: MemoryOp[] = [];
  for (const it of list) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) continue;
    const rec = it as Record<string, unknown>;
    const action = typeof rec.action === 'string' ? rec.action.trim().toUpperCase() : '';
    if (action === 'ADD') {
      const text = typeof rec.text === 'string' ? rec.text.trim() : '';
      if (!text) continue;
      out.push({ action: 'ADD', text });
      continue;
    }
    if (action === 'UPDATE') {
      const id = typeof rec.id === 'string' ? rec.id.trim() : '';
      const text = typeof rec.text === 'string' ? rec.text.trim() : '';
      if (!id || !candidateIds.has(id) || !text) continue;
      out.push({ action: 'UPDATE', id, text });
      continue;
    }
    if (action === 'DELETE') {
      const id = typeof rec.id === 'string' ? rec.id.trim() : '';
      if (!id || !candidateIds.has(id)) continue;
      out.push({ action: 'DELETE', id });
      continue;
    }
    if (action === 'SKIP') {
      out.push({ action: 'SKIP' });
      continue;
    }
  }
  return out;
}

/** 为单条文本生成归一化向量。 */
async function embedText(modelId: string, input: string): Promise<Float32Array> {
  const executor = await resolveEmbeddingExecutor({ model: modelId });
  const vec = await executor.execute([{ type: 'text', text: input }]);
  return l2NormalizeEmbedding(toUnifiedFloat32Embedding(vec));
}

/** 为多条文本批量生成归一化向量。 */
async function embedTexts(modelId: string, inputs: string[]): Promise<Float32Array[]> {
  const executor = await resolveEmbeddingExecutor({ model: modelId });
  const embeddings = await executor.executeMany(inputs.map((input) => [{ type: 'text', text: input }]));
  return embeddings.map((v) => {
    const vec = Array.isArray(v) ? v.map((x) => Number(x)) : [];
    return l2NormalizeEmbedding(toUnifiedFloat32Embedding(vec));
  });
}

/**
 * 对话结束后（assistant 回复已生成），尝试抽取“用户长期稳定事实”并写入全局记忆。
 *
 * 说明：
 * - 仅在 memory.enabled 且 embedding/llm 模型都配置时启用；
 * - “写入失败/解析失败”不会影响主对话链路（尽力而为）；
 * - 优先复用本次对话中已检索过的记忆候选，用于去重/更新（减少向量检索次数）。
 */
export async function maybeProcessConversationMemory(ctx: PostStreamContext): Promise<void> {
  const mem = ctx.params.memory;
  if (!mem?.enabled) return;
  if (!mem.embeddingModel || !mem.llmModel) return;

  const userId = String(mem.userId || '').trim() || 'default-user';
  const assistantId = typeof mem.assistantId === 'string' ? mem.assistantId.trim() || undefined : undefined;

  const debug = Boolean(ctx.params.debug);

  try {
    // 仅对“正常完成”的回复尝试写入；取消/错误不写入
    if (ctx.signal.aborted) return;
    if (!String(ctx.assistantText || '').trim()) return;

    const conversationText = pickConversationForPrompt(ctx.params.messages, ctx.assistantText);
    if (!conversationText.trim()) return;

    if (debug) {
      ctx.emit({
        type: 'chat/debug',
        requestId: ctx.requestId,
        kind: 'memory/process-start',
        payload: { enabled: true, userId, assistantId },
      });
    }

    const extraction = await generateMemoryTaskText({
      modelId: mem.llmModel,
      prompt: buildFactExtractionPrompt(conversationText),
      maxTokens: 400,
      signal: ctx.signal,
    });

    const parsed = tryParseJson<ExtractedFacts>(extraction);
    const facts = normalizeFacts(parsed, 8);
    if (facts.length === 0) return;

    // 优先使用“本次对话中模型主动调用过的记忆检索结果”，用于去重/更新（按当前实现语义）
    const cached = getCachedRelevantMemories(ctx.requestId);
    const candidates = cached.length > 0
      ? cached
      : await (async () => {
          const q = await embedText(mem.embeddingModel!, facts.join('\n'));
          return searchMemoriesByVector({
            userId,
            assistantId,
            queryEmbedding: q,
            limit: 20,
          });
        })();

    const oldMemories = candidates
      .map((m) => ({ id: String(m.id || '').trim(), text: String(m.memory || '').trim() }))
      .filter((m) => m.id && m.text)
      .map((m) => ({ ...m, text: m.text.length > 500 ? `${m.text.slice(0, 500)}…` : m.text }))
      .slice(0, 20);

    const candidateIds = new Set(oldMemories.map((m) => m.id));

    // 把“新事实 vs 旧记忆候选”转换成显式操作列表，后续写库阶段不再依赖模型自由发挥。
    let ops: MemoryOp[] = [];
    if (oldMemories.length === 0) {
      ops = facts.map((f) => ({ action: 'ADD', text: f }));
    } else {
      const opText = await generateMemoryTaskText({
        modelId: mem.llmModel,
        prompt: buildUpdateOpsPrompt(oldMemories, facts),
        maxTokens: 700,
        signal: ctx.signal,
      });
      const opParsed = tryParseJson<unknown>(opText);
      ops = normalizeOps(opParsed, candidateIds);
      // 去重兜底：若模型输出为空，则回退为全部 ADD
      if (ops.length === 0) ops = facts.map((f) => ({ action: 'ADD', text: f }));
    }

    // 先把所有新增/更新文本批量向量化，减少逐条调用 embedding 模型的开销。
    const textsToEmbed: string[] = [];
    const embedIndex: Array<{ kind: 'add' | 'update'; id?: string; text: string }> = [];
    for (const op of ops) {
      if (op.action === 'ADD') {
        textsToEmbed.push(op.text);
        embedIndex.push({ kind: 'add', text: op.text });
      } else if (op.action === 'UPDATE') {
        textsToEmbed.push(op.text);
        embedIndex.push({ kind: 'update', id: op.id, text: op.text });
      }
    }

    const vectors = textsToEmbed.length > 0 ? await embedTexts(mem.embeddingModel, textsToEmbed) : [];

    // `vectors` 与 `textsToEmbed` 一一对应，使用 cursor 顺序消费，保持 op 顺序不变。
    let vCursor = 0;
    /** 成功新增或更新的记忆条数。 */
    let wrote = 0;
    /** 成功删除的记忆条数。 */
    let deleted = 0;

    for (const op of ops) {
      if (op.action === 'DELETE') {
        await deleteMemory(op.id).catch((e) => logger.memory.error('deleteMemory failed', e, { id: op.id }));
        deleted += 1;
        continue;
      }
      if (op.action === 'SKIP') continue;
      if (op.action === 'ADD') {
        const vec = vectors[vCursor++];
        if (!vec) continue;
        // 新记忆始终带上 requestId / assistantId 元数据，方便后续回溯来源。
        await addMemory({
          userId,
          assistantId,
          memory: op.text,
          embedding: vec,
          metadata: { assistantId, requestId: ctx.requestId, source: 'auto' },
        }).catch((e) => {
          logger.memory.error('addMemory failed', e, { requestId: ctx.requestId });
          return undefined;
        });
        wrote += 1;
        continue;
      }
      if (op.action === 'UPDATE') {
        const vec = vectors[vCursor++];
        if (!vec) continue;
        // UPDATE 语义是“覆写原记忆内容并刷新 embedding”，而不是增量 patch 文本。
        const ok = await updateMemory({
          id: op.id,
          memory: op.text,
          embedding: vec,
          metadata: { assistantId, requestId: ctx.requestId, source: 'auto' },
        }).catch((e) => {
          logger.memory.error('updateMemory failed', e, { id: op.id });
          return null;
        });
        if (ok) wrote += 1;
      }
    }

    // 通知 UI 侧刷新记忆列表（避免“启用无效”的错觉；不输出内容，仅传统计信息）
    if (wrote > 0 || deleted > 0) {
      ctx.emit({
        type: 'memory/changed',
        requestId: ctx.requestId,
        payload: {
          userId,
          assistantId,
          wrote,
          deleted,
          extractedFacts: facts.length,
          at: Date.now(),
        },
      });
    }

    if (debug) {
      ctx.emit({
        type: 'chat/debug',
        requestId: ctx.requestId,
        kind: 'memory/process-done',
        payload: { extractedFacts: facts.length, wrote, deleted, cachedCandidates: cached.length },
      });
    }
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    // 记忆链路失败只通过事件上报，不得把错误抛回主聊天流。
    ctx.emit({
      type: 'memory/error',
      requestId: ctx.requestId,
      payload: {
        userId,
        assistantId,
        error: errMsg,
        at: Date.now(),
      },
    });
    if (debug) {
      ctx.emit({
        type: 'chat/debug',
        requestId: ctx.requestId,
        kind: 'memory/process-error',
        payload: { error: errMsg },
      });
    }
  } finally {
    // 请求结束后必须清掉本轮缓存，避免下一轮误复用旧检索结果。
    clearCachedRelevantMemories(ctx.requestId);
  }
}
