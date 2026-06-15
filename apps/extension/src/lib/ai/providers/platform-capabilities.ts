/**
 * 说明：`platform-capabilities` AI 能力模块。
 *
 * 职责：
 * - 承载 `platform-capabilities` 相关的当前文件实现与模块边界；
 * - 对外暴露 `PLATFORM_DEFAULTS` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 平台能力矩阵（Browser Studio）
 *
 * 用途
 * - 作为“单一事实来源（SSOT）”记录各平台的关键端点/限制，避免把规则散落在业务层或多个适配文件里。
 * - 这里不做运行时网络探测；只记录我们在代码层需要遵守的契约（contract）。
 *
 * 约束（强）
 * - 本项目只支持 v1 路径（例如 /v1、/api/v1、/compatible-mode/v1）。当平台提供 v2/v4/v5 等版本段时，不在这里兼容。
 *
 * 注意
 * - 这是“文档型常量”，不是模型列表；模型列表仍由 /models 拉取或用户维护。
 */

export const PLATFORM_DEFAULTS = {
  /**
   * DashScope（阿里云 Model Studio / 通义千问）
   *
   * 对话/Embedding
   * - OpenAI Compatible：/compatible-mode/v1（Chat Completions / Embeddings 等）
   *
   * 图片
   * - 官方 /api/v1（multimodal-generation / text2image 等；见 DashScopeImageModel）
   */
  dashscope: {
    compatibleBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    compatibleBaseURLIntl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  },

  /**
   * SiliconFlow（硅基流动）
   *
   * 对话/Embedding
   * - OpenAI Compatible：/v1（chat/completions、embeddings…）
   *
   * 图片
   * - /v1/images/generations（JSON；编辑/图生图也走该端点；见 SiliconFlowImageModel）
   */
  siliconflow: {
    baseURL: 'https://api.siliconflow.cn/v1',
  },
} as const

