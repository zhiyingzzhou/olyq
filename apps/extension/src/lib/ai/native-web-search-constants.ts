/**
 * 说明：`native-web-search-constants` AI 能力模块。
 *
 * 职责：
 * - 放置 native web search 运行时与 request transformer 共用的零依赖常量；
 * - 避免 provider adapter 与能力注册表之间形成运行时循环依赖。
 *
 * 边界：
 * - 这里只能保存无副作用常量；
 * - 不能 import provider、adapter、storage 或 UI 模块。
 */

/** OpenRouter request transformer 使用的内部哨兵。进入网络前必须被删除。 */
export const OPENROUTER_NATIVE_WEB_SEARCH_SENTINEL = '__olyqNativeWebSearch';
