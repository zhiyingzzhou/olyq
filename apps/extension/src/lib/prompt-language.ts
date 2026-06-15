/**
 * 说明：Prompt 语言归一化模块。
 *
 * 职责：
 * - 为发送给模型的产品内置 prompt 提供稳定语言枚举；
 * - 让 browser-context、技术栈和页面设计信号等纯函数不直接读取 UI i18n 实例；
 * - 保持当前产品只支持中文与英文两条 prompt 文案分支。
 *
 * 边界：
 * - 本模块不读取或写入持久化语言设置；
 * - UI 当前语言仍由 `src/i18n` 负责，这里只归一化调用方传入的语言代码。
 */

/** 产品内置 prompt 当前支持的语言。 */
export type PromptLanguage = 'zh-CN' | 'en-US';

/**
 * 将任意语言代码归一化为产品内置 prompt 支持的语言。
 *
 * @param language - UI 或调用方传入的语言代码。
 * @returns `en-US` 或 `zh-CN`，未知语言归一到当前产品默认 prompt 语言。
 */
export function normalizePromptLanguage(language: string | null | undefined): PromptLanguage {
  const normalized = String(language || '').trim().toLowerCase();
  return normalized.startsWith('en') ? 'en-US' : 'zh-CN';
}
