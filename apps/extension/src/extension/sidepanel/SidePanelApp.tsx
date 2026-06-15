/**
 * 说明：`SidePanelApp` Side Panel 模块。
 *
 * 职责：
 * - 承载 `SidePanelApp` 相关的当前文件实现与模块边界；
 * - 对外暴露 `SidePanelApp` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { Suspense, lazy } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { HashRouter, Route, Routes } from "react-router-dom";
import Index from "@/pages/Index";
import NotFound from "@/pages/NotFound";
import { ExtensionSettingsPage } from "@/components/chat/ExtensionSettings";
import { SidePanelErrorBoundary } from './SidePanelErrorBoundary';

const Paint = lazy(async () => ({
  default: (await import("@/pages/Paint")).default,
}));

/**
 * 扩展侧边栏应用入口。
 *
 * 与主应用共享页面结构，但使用 `HashRouter` 适配扩展页 URL 形态，
 * 避免 Side Panel 的真实 pathname 与业务路由不一致。
 */
export function SidePanelApp() {
  return (
    <TooltipProvider>
      <Toaster />
      {/* 扩展页 URL 是 `.../src/extension/sidepanel/index.html`，pathname 不等于 `/`。
          使用 HashRouter 可以避免基于 pathname 的路由失配，同时满足 Index 内 `useNavigate()` 的依赖。 */}
      <HashRouter>
        <SidePanelErrorBoundary>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route
              path="/paint"
              element={(
                <Suspense fallback={null}>
                  <Paint />
                </Suspense>
              )}
            />
            <Route path="/settings" element={<ExtensionSettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SidePanelErrorBoundary>
      </HashRouter>
    </TooltipProvider>
  );
}
