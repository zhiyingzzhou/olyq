/**
 * 说明：`offscreen/main` 离屏文档入口模块。
 *
 * 职责：
 * - 只启动 Offscreen runtime，与 Service Worker 建立后台能力通道；
 * - 不执行扩展页启动快照、主题预应用、React 挂载或首屏 reveal；
 * - 作为独立 HTML 入口存在，避免 toolbar action 直开侧栏后仍依赖已删除的 popup 页面。
 *
 * 边界：
 * - 本入口不承载任何用户可见 UI；
 * - 真实离屏能力继续由 `runtime.ts` 管理。
 */
import {
  installExtensionPageRuntimeGuard,
  recoverExtensionPageFromScriptFetchError,
} from "@/lib/dev/extension-context-guard";
import { startOffscreenRuntime } from "./runtime";

installExtensionPageRuntimeGuard();

void Promise.resolve()
  .then(() => startOffscreenRuntime())
  .catch((error) => {
    if (recoverExtensionPageFromScriptFetchError(error)) return;
    throw error;
  });
