/**
 * 说明：`runtime-environment` AI 能力模块。
 *
 * 职责：
 * - 承载 `runtime-environment` 相关的当前文件实现与模块边界；
 * - 对外暴露 `hasExtensionStorageRuntime`、`shouldUsePreviewFallbackProviders` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 读取当前全局环境里可用的 Chrome 扩展 API。
 *
 * 说明：
 * - 该文件既会在真实扩展环境运行，也会在 Storybook / 预览页等非扩展环境执行；
 * - 因此任何直接访问 `chrome` 的逻辑都要先经过这里做安全探测。
 */
function getChromeApi(): typeof chrome | undefined {
  return (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome
}

/**
 * 判断当前是否运行在可访问 `chrome.storage.local` 的扩展环境。
 *
 * 说明：
 * - 这比单纯判断 `chrome` 是否存在更严格，因为预览环境可能注入了不完整的 mock；
 * - 只要 `storage.local` 不可用，就视为无法使用扩展持久化能力。
 */
export function hasExtensionStorageRuntime(): boolean {
  const chromeApi = getChromeApi()
  return Boolean(chromeApi?.storage?.local)
}

/**
 * 判断当前是否需要启用“预览态默认 Provider”回退。
 *
 * 说明：
 * - 非扩展环境下无法从 storage 读取真实 Provider 配置；
 * - 此时 UI 会使用内置的预览数据，以便在开发和设计态下仍能正常渲染。
 */
export function shouldUsePreviewFallbackProviders(): boolean {
  return !hasExtensionStorageRuntime()
}
