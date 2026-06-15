/**
 * 说明：浏览器扩展 content script 生产构建产物命名真源。
 *
 * 职责：
 * - 为 Vite / Rollup 输出提供稳定的 page-facing content script 文件名；
 * - 让构建产物校验脚本复用同一组 canonical 路径；
 * - 避免 Chromium unpacked extension 在重新构建和重载之间继续请求旧 hash 脚本。
 *
 * 边界：
 * - 只约束 production build 的文件命名，不改变 manifest 权限、WAR 匹配范围或运行时注入协议；
 * - 不保留旧 hash 文件，也不提供动态注册或兼容 fallback。
 */

/** manifest 源码里声明的 content script 入口。 */
export const CONTENT_SCRIPT_SOURCE_ENTRY = 'src/extension/content-script/index.ts';

/** Rollup chunk `facadeModuleId` 归一化后用于识别 content script 入口的后缀。 */
export const CONTENT_SCRIPT_ENTRY_ID_SUFFIX = `/${CONTENT_SCRIPT_SOURCE_ENTRY}`;

/** CRXJS 为 content script 入口生成 loader asset 时使用的原始资源名。 */
export const CONTENT_SCRIPT_LOADER_SOURCE_NAME = 'index.ts-loader.js';

/** page-facing content script 的稳定生产产物路径。 */
export const CONTENT_SCRIPT_OUTPUT_FILES = Object.freeze({
  loader: 'assets/content-script-loader.js',
  main: 'assets/content-script-main.js',
});

/** 将 Rollup / Vite 传入的路径收敛为跨平台 `/` 分隔格式。 */
export function normalizeRollupPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

/** 判断当前 Rollup chunk 是否是 manifest 静态 content script 主入口。 */
export function isContentScriptEntryChunk(chunkInfo) {
  const facadeModuleId = normalizeRollupPath(chunkInfo?.facadeModuleId);
  const moduleIds = Array.isArray(chunkInfo?.moduleIds) ? chunkInfo.moduleIds : [];
  return facadeModuleId.endsWith(CONTENT_SCRIPT_ENTRY_ID_SUFFIX)
    || moduleIds.some((id) => normalizeRollupPath(id).endsWith(CONTENT_SCRIPT_ENTRY_ID_SUFFIX))
    || chunkInfo?.name === 'index.ts';
}

/** 判断当前 Rollup asset 是否是 CRXJS 生成的 content script loader。 */
export function isContentScriptLoaderAsset(assetInfo) {
  const names = [
    assetInfo?.name,
    ...(Array.isArray(assetInfo?.names) ? assetInfo.names : []),
  ]
    .map((name) => normalizeRollupPath(name))
    .filter(Boolean);
  return names.some((name) => name === CONTENT_SCRIPT_LOADER_SOURCE_NAME || name.endsWith(`/${CONTENT_SCRIPT_LOADER_SOURCE_NAME}`));
}

/** Rollup `entryFileNames` 回调：只固定 content script 主入口，其余入口继续 hash。 */
export function resolveBrowserExtensionEntryFileName(chunkInfo) {
  if (isContentScriptEntryChunk(chunkInfo)) return CONTENT_SCRIPT_OUTPUT_FILES.main;
  return 'assets/[name]-[hash].js';
}

/** Rollup `chunkFileNames` 回调：只固定 content script 主入口，其余 chunk 继续 hash。 */
export function resolveBrowserExtensionChunkFileName(chunkInfo) {
  if (isContentScriptEntryChunk(chunkInfo)) return CONTENT_SCRIPT_OUTPUT_FILES.main;
  return 'assets/[name]-[hash].js';
}

/** Rollup `assetFileNames` 回调：只固定 CRXJS content script loader，其余 asset 继续 hash。 */
export function resolveBrowserExtensionAssetFileName(assetInfo) {
  if (isContentScriptLoaderAsset(assetInfo)) return CONTENT_SCRIPT_OUTPUT_FILES.loader;
  return 'assets/[name]-[hash][extname]';
}
