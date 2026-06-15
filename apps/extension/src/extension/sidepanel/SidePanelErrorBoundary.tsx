/**
 * 说明：Side Panel 主工作区错误边界。
 *
 * 职责：
 * - 捕获 Side Panel React 渲染期错误，避免整个扩展页白屏；
 * - 对陈旧 chunk 加载失败复用扩展页一次性 reload 自愈；
 * - 对真实渲染错误显示局部 fallback，并把组件栈交给 logger。
 *
 * 边界：
 * - 本边界只包 Side Panel 主工作区；
 * - 不处理业务请求失败，业务失败仍应停留在 toast、错误块或后台状态；
 * - 不在这里重置聊天、设置或页面工具状态真源。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { recoverExtensionPageFromScriptFetchError } from '@/lib/dev/extension-context-guard';
import { logger } from '@/lib/logger';
import { SidePanelErrorFallback } from './SidePanelErrorFallback';

type SidePanelErrorBoundaryProps = {
  /** 需要保护的 Side Panel 子树。 */
  children: ReactNode;
};

type SidePanelErrorBoundaryState = {
  /** 捕获到的非 chunk 渲染错误。 */
  error: unknown;
};

/** Side Panel 主工作区错误边界。 */
export class SidePanelErrorBoundary extends Component<SidePanelErrorBoundaryProps, SidePanelErrorBoundaryState> {
  state: SidePanelErrorBoundaryState = { error: null };

  /** 把渲染期错误记录到边界状态。 */
  static getDerivedStateFromError(error: unknown): SidePanelErrorBoundaryState {
    return { error };
  }

  /**
   * 捕获渲染错误并按错误类型处理。
   *
   * @param error - React 捕获到的错误对象。
   * @param errorInfo - React 组件栈。
   */
  componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    if (recoverExtensionPageFromScriptFetchError(error)) return;
    logger.general.error('sidepanel render failed', error, {
      componentStack: errorInfo.componentStack,
    });
  }

  /** 渲染正常子树或局部 fallback。 */
  render() {
    if (this.state.error) return <SidePanelErrorFallback />;
    return this.props.children;
  }
}
