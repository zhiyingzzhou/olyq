/**
 * 说明：`main` Side Panel 模块。
 *
 * 职责：
 * - 承载 `main` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import {
  installExtensionPageRuntimeGuard,
  recoverExtensionPageFromScriptFetchError,
} from "@/lib/dev/extension-context-guard";
import {
  bootstrapExtensionPageStartup,
  revealExtensionPageRoot,
} from '@/lib/extension/extension-page-startup';
import { logger } from "@/lib/logger";

// 扩展页运行时防护：
// - DEV 下吞掉 `Extension context invalidated.`，避免 CRXJS/HMR 在扩展重载后刷屏；
// - 生产/开发统一对陈旧 chunk 拉取失败做一次受控 reload，自愈旧页面引用旧 hash 资源的问题。
installExtensionPageRuntimeGuard();

/**
 * 侧边栏入口初始化流程。
 *
 * 负责在 React 挂载前先恢复主题和显示设置，避免闪屏。
 */
async function main() {
  await bootstrapExtensionPageStartup().catch((error) => {
    logger.general.error('extension page startup bootstrap failed', error);
  });
  const [
    { createRoot },
    { flushSync },
    { applyInitialTheme },
    { applyInitialDisplaySettings },
    ,
    ,
    { SidePanelApp },
  ] = await Promise.all([
    import("react-dom/client"),
    import("react-dom"),
    import("@/lib/theme"),
    import("@/lib/display-settings"),
    import("@/i18n"),
    import("@/index.css"),
    import("./SidePanelApp"),
  ]);
  applyInitialTheme();
  applyInitialDisplaySettings();
  const root = createRoot(document.getElementById("root")!);
  flushSync(() => {
    root.render(<SidePanelApp />);
  });
  revealExtensionPageRoot();
}

void main().catch((error) => {
  if (recoverExtensionPageFromScriptFetchError(error)) return;
  throw error;
});
