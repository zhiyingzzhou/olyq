/**
 * 说明：`toast.spec` 组件模块。
 *
 * 职责：
 * - 守住全局 toast 视口与共享 overlay 层级常量的一致性；
 * - 防止后续把 toast 视口重新改回低于 blocking modal 的硬编码层级。
 *
 * 边界：
 * - 本文件只验证共享层级接线，不覆盖具体 toast 动画或文案。
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OVERLAY_TOAST_LAYER_CLASS } from './overlay-layers';
import { Toast, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from './toast';

describe('ToastViewport', () => {
  it('应复用共享 toast 层级类名，确保始终压过 blocking modal', () => {
    render(
      <ToastProvider>
        <ToastViewport />
      </ToastProvider>,
    );

    const viewport = document.body.querySelector('ol[class*="max-h-screen"]');

    expect(viewport).not.toBeNull();
    expect((viewport as HTMLElement).className).toContain(OVERLAY_TOAST_LAYER_CLASS);
  });

  it('应给标题和描述开启长 token 换行能力，避免详细错误撑出容器', () => {
    render(
      <ToastProvider>
        <Toast open>
          <div className="grid min-w-0 flex-1 gap-1 pr-2" data-testid="toast-copy">
            <ToastTitle>连接失败</ToastTitle>
            <ToastDescription>
              S3 连接测试失败（404）：Code=NoSuchKey; TraceId=OGVmYzZiMmQzYjA2OWNhODk0NTRkMTBiOWVmMDAxODc0OWRkZjk0ZDM1NmI1M2E2MTRlY2MzZDhmNmI5MWI1OWEzMDE4ZGI4NTE5MWE4YmYxODQ1NWI3YzFiOTg0ZjdlODlmOGU2Y2Y3NmI3NmU0MmZiZTVhOTU1YmI0NjM4ZWU=
            </ToastDescription>
          </div>
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );

    expect(screen.getByTestId('toast-copy').className).toContain('min-w-0');
    expect(screen.getByText('连接失败').className).toContain('[overflow-wrap:anywhere]');
    expect(screen.getByText(/TraceId=/).className).toContain('[overflow-wrap:anywhere]');
    expect(screen.getByText(/TraceId=/).className).toContain('whitespace-pre-wrap');
  });
});
