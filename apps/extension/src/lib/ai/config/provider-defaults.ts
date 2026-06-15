/**
 * 说明：`provider-defaults` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-defaults` 相关的当前文件实现与模块边界；
 * - 对外暴露 `NO_API_KEY_PROVIDERS`、`DEFAULT_PROVIDERS` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 说明：Provider 默认配置（种子数据）
 *
 * 用途：
 * - 首次运行时写入到 chrome.storage.local（`olyq.providers.v1`），作为"模型管理"的初始数据
 * - 用户可在 UI 中配置 API 密钥 / Base URL / 自定义 headers / 模型列表；后续会覆盖这份默认值
 *
 * 说明：
 * - 浏览器扩展版本不从其它项目同步/复制 provider 列表；默认配置在本文件内维护。
 * - 系统 Provider 默认 enabled: false（除 OpenAI 外），用户需自行配置 API 密钥后启用。
 * - 模型列表默认为空（除 OpenAI 预置常用模型外），建议通过"拉取模型（/models）"获取完整目录。
 */

import type { ProviderConfig } from '../types'

/**
 * 不需要 API 密钥的 Provider（通常为本地推理端点）。
 *
 * 注意：
 * - 该集合主要用于 UI（隐藏/弱化 API 密钥输入）。
 * - 运行时是否允许空 key 取决于 provider-factory 的实现与具体接口能力。
 */
export const NO_API_KEY_PROVIDERS = new Set<string>(['ollama', 'lmstudio'])

/**
 * 扩展首次启动时写入的默认 Provider 列表。
 *
 * 说明：
 * - 这里只提供“种子配置”，用户后续在模型管理中的修改会覆盖这些值；
 * - 模型目录并不追求完整，更多模型建议由“拉取模型”能力在运行时获取。
 */
export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  // ─── 主流云端 Provider ───
  {
    id: 'openai',
    name: 'OpenAI',
    // 彻底切换：默认内置 OpenAI 只认 OpenAI / OpenAI Compatible。
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.openai.com/v1',
    enabled: true,
    models: [
      // 核对日期：2026-04-02；约束：需与 DEFAULT_SETTINGS.defaultModel 保持一致。
      { id: 'gpt-5.1', name: 'GPT-5.1', group: 'Chat' },
      { id: 'gpt-5.2', name: 'GPT-5.2', group: 'Chat' },
      { id: 'gpt-5.4', name: 'GPT-5.4', group: 'Chat', isDefault: true },
      { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini', group: 'Chat' },
      // 记忆 / 语义检索等功能依赖 embedding（仅支持 openai / openai-compatible）。
      { id: 'text-embedding-3-large', name: 'Text Embedding 3 Large', group: 'Embedding', transportProtocol: 'embedding-api' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    apiKey: '',
    apiHost: 'https://api.anthropic.com',
    enabled: false,
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', group: 'Chat', isDefault: true },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', group: 'Chat' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', group: 'Chat' },
    ],
  },
  {
    id: 'google',
    name: 'Gemini',
    type: 'gemini',
    apiKey: '',
    // 注意：Gemini API 需要版本段（v1beta / v1）。默认使用 v1beta（与 AI SDK 默认值一致）。
    apiHost: 'https://generativelanguage.googleapis.com/v1beta',
    enabled: false,
    models: [
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', group: 'Chat', isDefault: true },
      { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite Preview', group: 'Chat' },
      { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', group: 'Chat' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'deepseek',
    apiKey: '',
    apiHost: 'https://api.deepseek.com',
    enabled: false,
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat (V3.2)', group: 'Chat', isDefault: true },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (V3.2 Thinking)', group: 'Chat' },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    type: 'mistral',
    apiKey: '',
    apiHost: 'https://api.mistral.ai/v1',
    enabled: false,
    models: [],
  },
  {
    id: 'groq',
    name: 'Groq',
    type: 'groq',
    apiKey: '',
    apiHost: 'https://api.groq.com/openai/v1',
    enabled: false,
    models: [
      { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', group: 'Chat', isDefault: true },
      { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', group: 'Chat' },
      { id: 'qwen/qwen3-32b', name: 'Qwen3 32B', group: 'Chat' },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B 16E', group: 'Chat' },
    ],
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    type: 'xai',
    apiKey: '',
    apiHost: 'https://api.x.ai/v1',
    enabled: false,
    models: [
      { id: 'grok-4', name: 'Grok 4', group: 'Chat' },
      { id: 'grok-4-1-fast-reasoning', name: 'Grok 4.1 Fast Reasoning', group: 'Chat', isDefault: true },
      { id: 'grok-4.20', name: 'Grok 4.20', group: 'Chat' },
      // xAI 文生图：走 AI SDK 的 ImageModel（generateImage）
      { id: 'grok-imagine-image-pro', name: 'Grok Imagine Image Pro', group: 'Image', transportProtocol: 'image-api' },
    ],
  },
  {
    id: 'cohere',
    name: 'Cohere',
    type: 'cohere',
    apiKey: '',
    apiHost: 'https://api.cohere.com/v2',
    enabled: false,
    models: [
      { id: 'command-a-03-2025', name: 'Command A', group: 'Chat', isDefault: true },
      { id: 'command-a-reasoning-08-2025', name: 'Command A Reasoning', group: 'Chat' },
      { id: 'command-a-vision-07-2025', name: 'Command A Vision', group: 'Chat' },
      { id: 'embed-v4.0', name: 'Embed v4.0', group: 'Embedding', transportProtocol: 'embedding-api' },
      { id: 'rerank-v4.0-pro', name: 'Rerank v4.0 Pro', group: 'Rerank', transportProtocol: 'rerank-api' },
    ],
  },

  // ─── OpenAI Compatible（中国 & 全球） ───
  {
    id: 'moonshot',
    name: 'Moonshot AI',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.moonshot.cn/v1',
    enabled: false,
    models: [],
  },
  {
    id: 'qwen',
    name: '通义千问',
    // 彻底切换：DashScope 独立为专用 ProviderType（对话走 compatible-mode；图片走官方 /api/v1）
    type: 'dashscope',
    apiKey: '',
    apiHost: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    enabled: false,
    models: [],
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    // 彻底切换：SiliconFlow 独立为专用 ProviderType（图片编辑不走 /images/edits）
    type: 'siliconflow',
    apiKey: '',
    apiHost: 'https://api.siliconflow.cn/v1',
    enabled: false,
    models: [],
  },
  {
    id: 'zhipu',
    name: '智谱 AI',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://open.bigmodel.cn/api/paas/v4',
    enabled: false,
    models: [],
  },
  {
    id: 'together',
    name: 'Together AI',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.together.xyz/v1',
    enabled: false,
    models: [],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.perplexity.ai',
    enabled: false,
    models: [],
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.fireworks.ai/inference/v1',
    enabled: false,
    models: [],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.minimax.chat/v1',
    enabled: false,
    models: [],
  },
  {
    id: 'baichuan',
    name: 'Baichuan',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://api.baichuan-ai.com/v1',
    enabled: false,
    models: [],
  },

  // ─── 网关 / 聚合 ───
  {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://openrouter.ai/api/v1',
    enabled: false,
    // 建议在 UI 中使用"拉取模型（/models）"功能获取完整目录
    models: [],
  },
  {
    id: 'vercel-ai-gateway',
    name: 'Vercel AI Gateway',
    type: 'gateway',
    apiKey: '',
    apiHost: 'https://ai-gateway.vercel.sh/v3/ai',
    enabled: false,
    // 说明：AI Gateway 的可用模型取决于你的账号/配置，建议在 UI 中使用“拉取模型”获取目录
    models: [],
  },
  {
    id: 'azure-openai',
    name: 'Azure OpenAI',
    type: 'azure-openai',
    apiKey: '',
    apiHost: 'https://{resource-name}.openai.azure.com/openai/deployments/{deployment}',
    apiVersion: '',
    enabled: false,
    models: [],
  },
  {
    id: 'aws-bedrock',
    name: 'AWS Bedrock',
    type: 'aws-bedrock',
    apiKey: '',
    apiHost: 'https://bedrock-runtime.{region}.amazonaws.com',
    enabled: false,
    // 对于 Bedrock：使用 region + IAM / 官方 Bedrock API Key 鉴权（在「高级设置」里配置）。
    apiOptions: {
      isSupportServiceTier: false,
      isNotSupportVerbosity: true,
      isNotSupportEnableThinking: true,
    },
    models: [],
  },
  {
    id: 'vertexai',
    name: 'Vertex AI',
    type: 'vertexai',
    apiKey: '',
    apiHost: 'https://{region}-aiplatform.googleapis.com',
    enabled: false,
    // 对于 Vertex：鉴权在专用配置里选择 Service Account 或 express mode API Key。
    apiOptions: {
      isSupportServiceTier: false,
      isNotSupportVerbosity: true,
      isNotSupportEnableThinking: true,
    },
    models: [],
  },
  {
    id: 'vertex-anthropic',
    name: 'Vertex AI（Anthropic）',
    type: 'vertex-anthropic',
    apiKey: '',
    apiHost: 'https://{region}-aiplatform.googleapis.com',
    enabled: false,
    apiOptions: {
      isSupportServiceTier: false,
      isNotSupportVerbosity: true,
      isNotSupportEnableThinking: true,
    },
    models: [],
  },
  {
    id: 'new-api',
    name: 'NewAPI',
    type: 'new-api',
    apiKey: '',
    apiHost: 'https://your-new-api-host.com',
    enabled: false,
    // 说明：NewAPI 会按模型 transportProtocol 分流协议；模型列表建议使用“批量导入/拉取模型”生成。
    models: [],
  },

  // ─── 自定义 ───
  {
    id: 'openai-compatible-custom',
    name: 'OpenAI Compatible（自定义）',
    type: 'openai',
    apiKey: '',
    apiHost: 'https://your-api-host.com/v1',
    enabled: false,
    models: [],
  },

  // ─── 本地推理 ───
  {
    id: 'ollama',
    name: 'Ollama（本地）',
    type: 'ollama',
    apiKey: '',
    apiHost: 'http://localhost:11434/v1',
    enabled: false,
    models: [],
  },
  {
    id: 'lmstudio',
    name: 'LM Studio（本地）',
    type: 'openai',
    apiKey: '',
    apiHost: 'http://localhost:1234/v1',
    enabled: false,
    models: [],
  },
]
