/**
 * 说明：`markdown-runtime-recovery` 组件模块。
 *
 * 职责：
 * - 收口 Markdown 相关动态 chunk 的拉取失败判定与自愈策略；
 * - 为代码高亮、公式、Mermaid 等懒加载能力提供共享恢复 helper；
 *
 * 边界：
 * - 这里只处理动态 import 失败恢复，不承载具体渲染逻辑；
 * - 真正的渲染 UI 仍由各自组件负责。
 */

/**
 * 判断错误是否属于“动态 import chunk 拉取失败”。
 *
 * @param error - 任意捕获到的错误。
 * @returns `true` 表示当前错误通常可通过刷新页面恢复。
 */
export function isDynamicImportFetchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Failed to fetch dynamically imported module/i.test(message);
}

/**
 * 针对动态导入 chunk 失效错误执行“一次性自动刷新”自愈。
 *
 * @param error - 捕获到的错误。
 * @returns `true` 表示已经触发刷新或当前错误命中了该恢复分支。
 */
export function reloadOnceForDynamicImportError(error: unknown): boolean {
  // 说明：扩展更新/重载后，旧页面可能仍在运行并引用已被删除的 chunk（hash 变更）。
  // 这类错误仅靠重试无法恢复；刷新页面加载新资源即可自愈。
  if (!isDynamicImportFetchError(error)) return false;
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') return false;
  } catch {
    // ignore
  }
  try {
    const key = '__olyq_reload_once_for_dynamic_import__';
    if (sessionStorage.getItem(key) === '1') return false;
    sessionStorage.setItem(key, '1');
  } catch {
    // 若 sessionStorage 不可用，则不做自动刷新，交给错误 UI 提示用户手动刷新。
    return false;
  }
  try {
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}
