/**
 * 说明：`logger` 基础能力模块。
 *
 * 职责：
 * - 承载 `logger` 相关的当前文件实现与模块边界；
 * - 对外暴露 `logger` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 面向关键业务链路的结构化日志工具。
 *
 * 特点：
 * - 统一格式：带 domain tag，便于过滤与检索
 * - 上下文安全：在 SW / UI / offscreen 等任意上下文都可调用
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** 单条结构化日志记录。 */
interface LogEntry {
  /** 日志所属领域。 */
  domain: string
  /** 面向开发者的主消息文案。 */
  message: string
  /** 可选：额外结构化上下文。 */
  data?: Record<string, unknown>
  /** 可选：原始错误对象。 */
  error?: unknown
}

/** 将任意错误对象格式化为单行可读文本。 */
function formatError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`
  return String(err)
}

/**
 * 根据日志等级把结构化日志输出到对应控制台方法。
 *
 * 说明：
 * - `error` 会额外附带格式化后的错误文本，便于在控制台快速扫读；
 * - 其余等级只在有 `data` 时附加上下文对象，避免空对象噪音。
 */
function emit(level: LogLevel, entry: LogEntry) {
  const tag = `[${entry.domain}]`
  const fn = level === 'error' ? console.error
    : level === 'warn' ? console.warn
    : level === 'debug' ? console.debug
    : console.info

  if (entry.error) {
    fn(tag, entry.message, entry.data ?? '', formatError(entry.error))
  } else if (entry.data) {
    fn(tag, entry.message, entry.data)
  } else {
    fn(tag, entry.message)
  }
}

/**
 * 为指定领域创建一组日志方法。
 *
 * 说明：
 * - 领域名会作为固定 tag 挂在日志前缀上；
 * - 返回的 logger 仅封装 `emit`，不引入额外状态。
 */
function createDomainLogger(domain: string) {
  return {
    debug: (message: string, data?: Record<string, unknown>) =>
      emit('debug', { domain, message, data }),
    info: (message: string, data?: Record<string, unknown>) =>
      emit('info', { domain, message, data }),
    warn: (message: string, data?: Record<string, unknown>) =>
      emit('warn', { domain, message, data }),
    error: (message: string, error?: unknown, data?: Record<string, unknown>) =>
      emit('error', { domain, message, data, error }),
  }
}

/**
 * 导出常量：`logger`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const logger = {
  /** 话题持久化（IndexedDB 读写） */
  topic: createDomainLogger('topic'),
  /** Provider 解析与模型创建 */
  provider: createDomainLogger('provider'),
  /** MCP：工具/桥接/传输 */
  mcp: createDomainLogger('mcp'),
  /** 记忆相关操作 */
  memory: createDomainLogger('memory'),
  /** 备份与同步相关操作 */
  backup: createDomainLogger('backup'),
  /** Service Worker 消息路由 */
  sw: createDomainLogger('sw'),
  /** 流式聊天与 AI SDK 交互 */
  chat: createDomainLogger('chat'),
  /** 通用/未分类 */
  general: createDomainLogger('general'),
}
