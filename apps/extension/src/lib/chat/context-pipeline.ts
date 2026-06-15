/**
 * 说明：`context-pipeline` 基础能力模块。
 *
 * 职责：
 * - 承载 `context-pipeline` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ChatContextStageContext`、`ChatContextStage`、`BuildChatSystemContentResult` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ResolvedConversationContext } from '@/types/chat';
/** 上下文注入 pipeline 的运行时上下文（每一轮对话都会重新构造） */
export type ChatContextStageContext = {
  /** 当前话题（包含 systemPrompt/模型参数/历史） */
  topic: ResolvedConversationContext;
  /** 用户本轮输入（用于检索/记忆/联网搜索等） */
  query: string;
  /** 可选：取消信号（用户停止生成或页面卸载） */
  signal?: AbortSignal;
};

/** 单个"上下文注入阶段"的定义（可插拔） */
export type ChatContextStage = {
  /** 阶段 ID：用于日志/调试/开关控制 */
  id: string;
  /** 执行阶段并返回要追加到 system prompt 的片段；返回 null 表示本阶段无内容 */
  run: (ctx: ChatContextStageContext) => Promise<string | null>;
};

/** buildChatSystemContent 的返回结果 */
export type BuildChatSystemContentResult = {
  /** 完整系统提示词（含所有注入内容） */
  systemContent: string;
};

/**
 * 以双换行的形式把新的 system prompt 片段追加到现有内容尾部。
 *
 * 说明：
 * - 两侧都会先 trim，避免阶段输出中夹带多余空白导致 prompt 结构不稳定；
 * - 任一侧为空时直接回退另一侧，保证最终 system prompt 不会出现空段落。
 */
function appendPart(base: string, part: string) {
  const a = String(base || '').trim();
  const b = String(part || '').trim();
  if (!b) return a;
  if (!a) return b;
  return `${a}\n\n${b}`;
}

/**
 * 构建本轮 system prompt 内容时需要的输入参数。
 *
 * 说明：
 * - 这里聚合“话题基线 + 用户输入 + 取消信号”，让 pipeline 可在不感知外层 UI 的前提下运行；
 * - `query` 当前虽然未在所有阶段中使用，但保留为统一合同，方便后续接入检索/记忆/搜索阶段。
 */
type BuildChatSystemContentOptions = {
  /** 话题对象（读取 topic.systemPrompt 作为基底） */
  topic: ResolvedConversationContext;
  /** 用户输入（传给各 stage 用于检索/搜索/记忆） */
  query: string;
  /** 已经提前解析好的浏览器上下文 prompt。 */
  browserContextPrompt?: string | null;
  /** 可选：取消信号（会在循环中被检查） */
  signal?: AbortSignal;
};

/**
 * 生成本轮对话的 system prompt（可插拔 pipeline）
 * - 按当前实现：联网搜索不再在这里“预搜索并注入 system prompt”
 * - 仅注入：浏览器上下文（尽力而为）
 */
export async function buildChatSystemContent({
  browserContextPrompt,
  topic,
}: BuildChatSystemContentOptions): Promise<BuildChatSystemContentResult> {
  let systemContent = topic.systemPrompt || '';

  // 按当前实现：话题级提示词在发送链路中拼接到 system prompt（assistant.prompt + topic.prompt）。
  if (topic.topicPrompt && String(topic.topicPrompt).trim()) {
    const a = String(systemContent || '').trim();
    const b = String(topic.topicPrompt || '').trim();
    systemContent = a ? `${a}\n${b}` : b;
  }

  if (browserContextPrompt) systemContent = appendPart(systemContent, browserContextPrompt);

  return { systemContent };
}
