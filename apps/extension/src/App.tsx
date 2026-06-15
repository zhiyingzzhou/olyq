/**
 * 说明：`App` 源码模块。
 *
 * 职责：
 * - 承载 `App` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { Component, Suspense, lazy, type ErrorInfo, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { recoverExtensionPageFromScriptFetchError } from "@/lib/dev/extension-context-guard";
import { logger } from "@/lib/logger";

const Index = lazy(() => import("./pages/Index"));
const Paint = lazy(() => import("./pages/Paint"));
const NotFound = lazy(() => import("./pages/NotFound"));

/**
 * 内部函数：`RouteFallback`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function RouteFallback() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-background text-muted-foreground">
      <div className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/70 px-3 py-2 text-sm backdrop-blur-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('app.loadingWorkspace')}
      </div>
    </div>
  );
}

interface RouteChunkErrorBoundaryProps {
  /** 路由懒加载区域。 */
  children: ReactNode;
}

interface RouteChunkErrorBoundaryState {
  /** 当前捕获到的路由 chunk 加载错误。 */
  error: unknown;
  /** 非陈旧 chunk 错误必须继续抛出，避免边界吞掉真实代码错误。 */
  shouldRethrow: boolean;
}

/**
 * 路由懒加载失败边界。
 *
 * 说明：
 * - 正常路径仍由原来的 `Suspense` fallback 承载；
 * - 只有扩展更新后旧页面引用失效 chunk 时，才触发一次受控刷新；
 * - 非 chunk 错误记录后继续抛出，避免边界吞掉真实代码错误。
 */
class RouteChunkErrorBoundary extends Component<RouteChunkErrorBoundaryProps, RouteChunkErrorBoundaryState> {
  state: RouteChunkErrorBoundaryState = { error: null, shouldRethrow: false };

  /**
   * 把渲染期错误记录到边界状态。
   *
   * @param error - React 捕获到的路由懒加载错误。
   * @returns 用于短暂展示加载壳的边界状态。
   */
  static getDerivedStateFromError(error: unknown): RouteChunkErrorBoundaryState {
    return { error, shouldRethrow: false };
  }

  /**
   * 捕获路由 chunk 错误并触发扩展页受控自愈。
   *
   * @param error - React 捕获到的错误对象。
   * @param errorInfo - React 组件栈信息。
   */
  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    if (recoverExtensionPageFromScriptFetchError(error)) return;
    logger.general.error('route chunk render failed', error, {
      componentStack: errorInfo.componentStack,
    });
    this.setState({ error, shouldRethrow: true });
  }

  /**
   * 渲染路由边界内容。
   *
   * @returns 正常路由内容、短暂恢复壳，或在非 chunk 错误时继续抛出。
   */
  render() {
    if (this.state.error && this.state.shouldRethrow) {
      throw this.state.error instanceof Error ? this.state.error : new Error(String(this.state.error));
    }
    if (this.state.error) return <RouteFallback />;
    return this.props.children;
  }
}

/**
 * 浏览器扩展主应用入口。
 *
 * 负责注入全局 Provider、Toast 和路由壳子；
 * 具体业务页面由各路由页面组件承担。
 */
const App = () => (
  <TooltipProvider>
    <Toaster />
    <BrowserRouter>
      <RouteChunkErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/paint" element={<Paint />} />
            {/* 自定义路由请添加在兜底 "*" 路由之前 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </RouteChunkErrorBoundary>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
