/**
 * 说明：`ModelManagerHealthDialog.spec` 组件模块。
 *
 * 职责：
 * - 承载 `ModelManagerHealthDialog.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { ModelManagerHealthDialog } from './ModelManagerHealthDialog';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('react-i18next');
  const translations: Record<string, string> = {
    'common.dialogContent': 'dialog-content',
    'common.close': '关闭',
    'common.cancel': '取消',
    'common.copy': '复制',
    'common.copied': '已复制',
    'common.copyFailed': '复制失败',
    'message.details': '详情',
    'message.errorDetails': '错误详情',
    'modelManagerPanel.healthDialog.title': '模型健康检测',
    'modelManagerPanel.healthDialog.description': '检查当前模型可用性',
    'modelManagerPanel.healthDialog.warning': '会实际消耗请求额度',
    'modelManagerPanel.healthDialog.keyMode.title': 'Key 模式',
    'modelManagerPanel.healthDialog.keyMode.single': '单 Key',
    'modelManagerPanel.healthDialog.keyMode.all': '全部 Key',
    'modelManagerPanel.healthDialog.concurrent.title': '并发',
    'modelManagerPanel.healthDialog.concurrent.off': '关闭',
    'modelManagerPanel.healthDialog.concurrent.on': '开启',
    'modelManagerPanel.healthDialog.timeout': '超时',
    'modelManagerPanel.healthDialog.secondsUnit': '秒',
    'modelManagerPanel.healthDialog.start': '开始',
    'modelManagerPanel.healthDialog.running': '进行中',
    'modelManagerPanel.healthDialog.stop': '停止',
    'modelManagerPanel.healthDialog.keySummary': 'Key 汇总',
    'errors.requestTimedOutOrDisconnected': '请求已超时',
    'errors.apiCallHttpError': 'API 调用失败（HTTP {{status}}）',
    'errors.apiCallHttpErrorWithDetail': 'API 调用失败（HTTP {{status}}）：{{detail}}',
  };
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, params?: Record<string, unknown>) => {
        const template = translations[key] ?? key;
        return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params?.[name] ?? ''));
      },
    }),
  };
});

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('ModelManagerHealthDialog', () => {
  it('会按最终国际化文案渲染错误信息，并在摘要完整时隐藏详情按钮', () => {
    render(
      <TooltipProvider>
        <ModelManagerHealthDialog
          open
          running={false}
          keyMode="single"
          keyIndex={0}
          keys={['sk-test-1']}
          concurrent={false}
          timeout={15}
          results={[
            {
              modelId: 'openai/gpt-5.4',
              modelName: 'GPT-5.4',
              status: 'error',
              error: { key: 'errors.requestTimedOutOrDisconnected' },
            },
          ]}
          onSetOpen={vi.fn()}
          onSetKeyMode={vi.fn()}
          onSetKeyIndex={vi.fn()}
          onSetConcurrent={vi.fn()}
          onSetTimeout={vi.fn()}
          onRunHealthCheck={vi.fn()}
          onAbortHealthCheck={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText('模型健康检测')).toBeInTheDocument();
    expect(screen.getAllByText('请求已超时').length).toBeGreaterThan(0);
    expect(screen.queryByText('errors.requestTimedOutOrDisconnected')).not.toBeInTheDocument();

    const cancelButton = screen.getByRole('button', { name: '取消' });
    const startButton = screen.getByRole('button', { name: '开始' });
    expect(cancelButton.className).toContain('h-9');
    expect(cancelButton.className).toContain('border-input');
    expect(startButton.className).not.toContain('bg-emerald-600');
    expect(startButton.className).toContain('h-9');
    expect(cancelButton.parentElement?.className).toContain('justify-end');
    expect(cancelButton.parentElement?.className).toContain('gap-2');
    expect(screen.getAllByText('请求已超时')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '详情' })).not.toBeInTheDocument();
  });

  it('失败结果的摘要和技术详情不同时，会保留显式详情入口', () => {
    const errorDetail = 'HTTP 400 · https://api.example.com/v1/responses · 端点/codex未开启模型gpt-5.1';

    render(
      <TooltipProvider>
        <ModelManagerHealthDialog
          open
          running={false}
          keyMode="single"
          keyIndex={0}
          keys={['sk-test-1']}
          concurrent={false}
          timeout={15}
          results={[
            {
              modelId: 'openai/text-embedding-3-large',
              modelName: 'Text Embedding 3 Large',
              status: 'error',
              error: {
                key: 'errors.apiCallHttpError',
                params: {
                  status: 400,
                },
              },
              errorDetail,
            },
          ]}
          onSetOpen={vi.fn()}
          onSetKeyMode={vi.fn()}
          onSetKeyIndex={vi.fn()}
          onSetConcurrent={vi.fn()}
          onSetTimeout={vi.fn()}
          onRunHealthCheck={vi.fn()}
          onAbortHealthCheck={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText('Text Embedding 3 Large')).toBeInTheDocument();
    expect(screen.getByText('API 调用失败（HTTP 400）')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '详情' }));
    expect(screen.getByText((content) => content.includes('端点/codex未开启模型gpt-5.1'))).toBeInTheDocument();
  });

  it('失败结果即使只有技术详情，也会直接展示 detail 而不是留空', () => {
    const errorDetail = 'HTTP 400 · https://api.example.com/v1/responses · 端点/codex未开启模型gpt-5.1';

    render(
      <TooltipProvider>
        <ModelManagerHealthDialog
          open
          running={false}
          keyMode="single"
          keyIndex={0}
          keys={['sk-test-1']}
          concurrent={false}
          timeout={15}
          results={[
            {
              modelId: 'openai/gpt-5.1',
              modelName: 'GPT-5.1',
              status: 'error',
              errorDetail,
            },
          ]}
          onSetOpen={vi.fn()}
          onSetKeyMode={vi.fn()}
          onSetKeyIndex={vi.fn()}
          onSetConcurrent={vi.fn()}
          onSetTimeout={vi.fn()}
          onRunHealthCheck={vi.fn()}
          onAbortHealthCheck={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText('GPT-5.1')).toBeInTheDocument();
    expect(screen.getByText(errorDetail)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '详情' })).not.toBeInTheDocument();
  });
});
