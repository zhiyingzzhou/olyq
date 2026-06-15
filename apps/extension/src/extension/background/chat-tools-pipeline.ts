/**
 * 说明：`chat-tools-pipeline` 后台运行时模块。
 *
 * 职责：
 * - 承载 `chat-tools-pipeline` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ChatToolsStage`、`DEFAULT_CHAT_TOOLS_STAGES`、`collectChatTools` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ToolSet } from 'ai';
import { collectMcpToolsForChat } from './mcp-chat-tools';
import { collectMemoryToolsForChat } from './memory-tools';
import { logger } from '../../lib/logger';
import type { ChatPipelineContext } from './pipeline-types';

/** 聊天工具注入 pipeline 的一个阶段（可插拔） */
export type ChatToolsStage = {
  /** 阶段 ID（用于调试/日志；需稳定且唯一） */
  id: string;
  /** 阶段执行函数：返回需要注入的 ToolSet；返回 undefined 表示本阶段不注入 */
  run: (ctx: Pick<ChatPipelineContext, 'requestId' | 'params' | 'signal' | 'emitProgress'>) => Promise<ToolSet | undefined>;
};

/**
 * 默认聊天工具注入阶段列表。
 *
 * 说明：
 * - 顺序本身有语义：前面的阶段先占用工具名，后面的阶段遇到同名工具会被跳过；
 * - memory 阶段保持尽力而为；MCP 阶段在 auto 命中后的失败必须向上抛出，避免静默退回普通聊天。
 */
export const DEFAULT_CHAT_TOOLS_STAGES: ChatToolsStage[] = [
  {
    id: 'memory',
    run: async (ctx) => collectMemoryToolsForChat(ctx).catch((e) => {
      logger.memory.error('memory tools collection failed', e, { requestId: ctx.requestId });
      return undefined;
    }),
  },
  {
    id: 'mcp',
    run: async (ctx) => collectMcpToolsForChat(ctx),
  },
];

/**
 * 把一个 ToolSet 合并到目标集合中。
 *
 * 说明：
 * - 冲突策略是“先到先得”；
 * - 一旦前序阶段已经占用某个工具名，后续阶段不会覆盖，保证注入结果稳定。
 */
function mergeToolSet(target: ToolSet, incoming: ToolSet): void {
  for (const [k, v] of Object.entries(incoming)) {
    if (k in target) continue;
    target[k] = v;
  }
}

/**
 * 聊天工具注入 pipeline（可插拔）
 *
 * 说明：
 * - 当前默认依次尝试注入记忆工具、MCP 工具；
 * - memory 等非强制阶段仍尽力而为，MCP auto 命中后的异常会阻断主聊天；
 * - 最终返回 `undefined` 表示本轮聊天完全不注入任何工具能力。
 */
export async function collectChatTools(
  ctx: Pick<ChatPipelineContext, 'requestId' | 'params' | 'signal' | 'emitProgress'>,
  stages: ChatToolsStage[] = DEFAULT_CHAT_TOOLS_STAGES,
): Promise<ToolSet | undefined> {
  /** 聚合后的最终 ToolSet。 */
  const merged: ToolSet = {};

  for (const stage of stages) {
    try {
      const tools = await stage.run(ctx);
      if (tools && Object.keys(tools).length > 0) mergeToolSet(merged, tools);
    } catch (e) {
      logger.chat.error(`chat tools stage "${stage.id}" failed`, e, { requestId: ctx.requestId });
      if (stage.id === 'mcp') throw e;
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}
