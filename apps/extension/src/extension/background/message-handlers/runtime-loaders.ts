/**
 * 说明：`runtime-loaders` 后台运行时模块。
 *
 * 职责：
 * - 承载 `runtime-loaders` 相关的当前文件实现与模块边界；
 * - 对外暴露 `loadChatRuntime`、`loadMockChatRuntime`、`loadImageRuntime` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ChatStreamParams } from "../../../lib/ai/types";
import { streamChat } from "../../../lib/ai/stream-chat";
import { getDefaultModelId } from "../../../lib/ai/provider-runtime";
import { isPageToolsEnabledForUrl } from "../../../lib/extension/page-tools";
import { collectChatTools } from "../chat-tools-pipeline";
import { handleEmbeddingGenerate, handleEmbeddingGenerateMany } from "../embedding-handler";
import { runHealthCheckToPort } from "../health-check";
import { generateImagesToPort } from "../image";
import { maybeProcessConversationMemory } from "../memory-orchestration";
import {
  authorizeServerFromPool,
  callToolFromPool,
  clearServerAuthorizationFromPool,
  disconnectSessionFromPool,
  getSessionPoolSnapshot,
  listToolsFromPool,
} from "../mcp-session-pool";
import { mockStreamChatV1 } from "../mock-chat";
import { generateObjectToPort, streamObjectToPort } from "../object-gen";
import { speakToPort } from "../speech";
import { transcribeToPort } from "../transcription";
import { maybeOrchestrateExternalWebSearch } from "../web-search-orchestration";

const IS_E2E = import.meta.env.VITE_OLYQ_E2E === "1";

type ChatRuntime = {
  collectChatTools: typeof import("../chat-tools-pipeline").collectChatTools;
  getDefaultModelId: typeof import("../../../lib/ai/provider-runtime").getDefaultModelId;
  maybeOrchestrateExternalWebSearch: typeof import("../web-search-orchestration").maybeOrchestrateExternalWebSearch;
  maybeProcessConversationMemory: typeof import("../memory-orchestration").maybeProcessConversationMemory;
  streamChatV1: typeof import("../../../lib/ai/stream-chat").streamChat;
};

type MockChatRuntime = {
  mockStreamChatV1: typeof import("../mock-chat").mockStreamChatV1;
};

type ImageRuntime = {
  generateImagesToPort: typeof import("../image").generateImagesToPort;
};

type TranscriptionRuntime = {
  transcribeToPort: typeof import("../transcription").transcribeToPort;
};

type SpeechRuntime = {
  speakToPort: typeof import("../speech").speakToPort;
};

type ObjectRuntime = {
  generateObjectToPort: typeof import("../object-gen").generateObjectToPort;
  streamObjectToPort: typeof import("../object-gen").streamObjectToPort;
};

type EmbeddingRuntime = {
  handleEmbeddingGenerate: typeof import("../embedding-handler").handleEmbeddingGenerate;
  handleEmbeddingGenerateMany: typeof import("../embedding-handler").handleEmbeddingGenerateMany;
};

type HealthRuntime = {
  runHealthCheckToPort: typeof import("../health-check").runHealthCheckToPort;
};

type PageToolsRuntime = {
  isPageToolsEnabledForUrl: typeof import("../../../lib/extension/page-tools").isPageToolsEnabledForUrl;
};

type McpSessionPoolRuntime = {
  authorizeServerFromPool: typeof import("../mcp-session-pool").authorizeServerFromPool;
  callToolFromPool: typeof import("../mcp-session-pool").callToolFromPool;
  clearServerAuthorizationFromPool: typeof import("../mcp-session-pool").clearServerAuthorizationFromPool;
  disconnectSessionFromPool: typeof import("../mcp-session-pool").disconnectSessionFromPool;
  getSessionPoolSnapshot: typeof import("../mcp-session-pool").getSessionPoolSnapshot;
  listToolsFromPool: typeof import("../mcp-session-pool").listToolsFromPool;
};

const CHAT_RUNTIME: ChatRuntime = {
  collectChatTools,
  getDefaultModelId,
  maybeOrchestrateExternalWebSearch,
  maybeProcessConversationMemory,
  streamChatV1: streamChat,
};

const MOCK_CHAT_RUNTIME: MockChatRuntime = {
  mockStreamChatV1,
};

const IMAGE_RUNTIME: ImageRuntime = {
  generateImagesToPort,
};

const TRANSCRIPTION_RUNTIME: TranscriptionRuntime = {
  transcribeToPort,
};

const SPEECH_RUNTIME: SpeechRuntime = {
  speakToPort,
};

const OBJECT_RUNTIME: ObjectRuntime = {
  generateObjectToPort,
  streamObjectToPort,
};

const EMBEDDING_RUNTIME: EmbeddingRuntime = {
  handleEmbeddingGenerate,
  handleEmbeddingGenerateMany,
};

const HEALTH_RUNTIME: HealthRuntime = {
  runHealthCheckToPort,
};

const PAGE_TOOLS_RUNTIME: PageToolsRuntime = {
  isPageToolsEnabledForUrl,
};

const MCP_SESSION_POOL_RUNTIME: McpSessionPoolRuntime = {
  authorizeServerFromPool,
  callToolFromPool,
  clearServerAuthorizationFromPool,
  disconnectSessionFromPool,
  getSessionPoolSnapshot,
  listToolsFromPool,
};

/**
 * 导出函数：`loadChatRuntime`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function loadChatRuntime(): Promise<ChatRuntime> {
  return Promise.resolve(CHAT_RUNTIME);
}

/**
 * 导出函数：`loadMockChatRuntime`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function loadMockChatRuntime(): Promise<MockChatRuntime> {
  return Promise.resolve(MOCK_CHAT_RUNTIME);
}

/**
 * 导出函数：`loadImageRuntime`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function loadImageRuntime(): Promise<ImageRuntime> {
  return Promise.resolve(IMAGE_RUNTIME);
}

/**
 * 导出函数：`loadTranscriptionRuntime`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function loadTranscriptionRuntime(): Promise<TranscriptionRuntime> {
  return Promise.resolve(TRANSCRIPTION_RUNTIME);
}

/**
 * 导出函数：`loadSpeechRuntime`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function loadSpeechRuntime(): Promise<SpeechRuntime> {
  return Promise.resolve(SPEECH_RUNTIME);
}

/**
 * 导出函数：`loadObjectRuntime`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function loadObjectRuntime(): Promise<ObjectRuntime> {
  return Promise.resolve(OBJECT_RUNTIME);
}

/**
 * 导出函数：`loadEmbeddingRuntime`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function loadEmbeddingRuntime(): Promise<EmbeddingRuntime> {
  return Promise.resolve(EMBEDDING_RUNTIME);
}

/**
 * 导出函数：`loadHealthRuntime`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function loadHealthRuntime(): Promise<HealthRuntime> {
  return Promise.resolve(HEALTH_RUNTIME);
}

/**
 * 导出函数：`loadPageToolsRuntime`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function loadPageToolsRuntime(): Promise<PageToolsRuntime> {
  return Promise.resolve(PAGE_TOOLS_RUNTIME);
}

/**
 * 导出函数：`loadMcpSessionPoolRuntime`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function loadMcpSessionPoolRuntime(): Promise<McpSessionPoolRuntime> {
  return Promise.resolve(MCP_SESSION_POOL_RUNTIME);
}

type WebSearchDebugPayload = {
  maxResults?: number;
  searchWithTime?: boolean;
  excludeDomainsCount?: number;
};

/**
 * 导出函数：`buildWebSearchDebugPayload`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function buildWebSearchDebugPayload(params: ChatStreamParams): WebSearchDebugPayload {
  const web = params.webSearchSettings as Record<string, unknown> | undefined;
  const maxResults = typeof web?.maxResults === "number" && Number.isFinite(web.maxResults) ? web.maxResults : undefined;
  const searchWithTime = typeof web?.searchWithTime === "boolean" ? web.searchWithTime : undefined;
  const excludeDomainsCount = Array.isArray(web?.excludeDomains) ? web.excludeDomains.length : undefined;
  return { maxResults, searchWithTime, excludeDomainsCount };
}

export { IS_E2E };
