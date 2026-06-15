/**
 * 说明：`MessageErrorNotice.spec` 组件模块。
 *
 * 职责：
 * - 承载 `MessageErrorNotice.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const translationMap: Record<string, string> = {
  'common.error': '错误',
  'common.close': '关闭',
  'common.cancelled': '已取消',
  'common.noData': '暂无数据',
  'chat.copy': '复制',
  'chat.copied': '已复制',
  'message.details': '详情',
  'message.errorDetails': '错误详情',
  'message.errorName': '错误名称',
  'message.errorMessage': '错误信息',
  'message.errorStack': '堆栈信息',
  'message.errorCause': '错误原因',
  'message.copiedError': '已复制错误信息',
  'sidebar.clipboardFailed': '复制失败',
  'errors.apiCallFailed': 'API 调用失败',
  'errors.unknownWithDetail': '未知错误：{{detail}}',
  'errors.imageInputModelNotRecognized': '当前模型没有被识别为支持图片输入的 vision / multimodal 模型。',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const template = translationMap[key] ?? key;
      return template.replace('{{detail}}', String(params?.detail ?? ''));
    },
  }),
}));

vi.mock('@/hooks/useToast', () => ({
  toast: vi.fn(),
}));

describe('MessageErrorNotice', () => {
  it('详情弹窗会隐藏 I18nError 类名，并清洗堆栈首行的 raw key', async () => {
    const { MessageErrorNotice } = await import('./MessageErrorNotice');

    render(
      <MessageErrorNotice
        error={{ key: 'errors.unknownWithDetail', params: { detail: '摘要错误' } }}
        details={{
          name: 'I18nError',
          message: 'errors.imageInputModelNotRecognized',
          messageI18n: { key: 'errors.imageInputModelNotRecognized' },
          stack: 'I18nError: errors.imageInputModelNotRecognized\n    at demo.ts:1:1',
        }}
      />,
    );

    expect(screen.queryByRole('button', { name: '关闭' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '详情' }));

    expect(screen.getByText('错误')).toBeInTheDocument();
    expect(screen.getByText('当前模型没有被识别为支持图片输入的 vision / multimodal 模型。')).toBeInTheDocument();
    expect(screen.queryByText('errors.imageInputModelNotRecognized')).not.toBeInTheDocument();
    expect(screen.queryByText(/^I18nError$/)).not.toBeInTheDocument();
    expect(screen.getByText(/错误: 当前模型没有被识别为支持图片输入的 vision \/ multimodal 模型。/)).toBeInTheDocument();
    expect(screen.getByText(/at demo\.ts:1:1/)).toBeInTheDocument();
  });

  it('显式可关闭的局部错误块仍会渲染关闭按钮', async () => {
    const { MessageErrorNotice } = await import('./MessageErrorNotice');
    const onDismiss = vi.fn();

    render(
      <MessageErrorNotice
        error={{ key: 'errors.unknownWithDetail', params: { detail: '翻译失败' } }}
        dismissible
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('复制错误详情时不会带出 raw key 或 I18nError 类名', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    const { MessageErrorNotice } = await import('./MessageErrorNotice');

    render(
      <MessageErrorNotice
        error={{ key: 'errors.unknownWithDetail', params: { detail: '摘要错误' } }}
        details={{
          name: 'I18nError',
          message: 'errors.imageInputModelNotRecognized',
          messageI18n: { key: 'errors.imageInputModelNotRecognized' },
          stack: 'I18nError: errors.imageInputModelNotRecognized\n    at demo.ts:1:1',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '详情' }));
    fireEvent.click(screen.getByRole('button', { name: '复制' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = String(writeText.mock.calls[0]?.[0] ?? '');
    expect(copied).toContain('错误名称: 错误');
    expect(copied).toContain('错误: 当前模型没有被识别为支持图片输入的 vision / multimodal 模型。');
    expect(copied).not.toContain('errors.imageInputModelNotRecognized');
    expect(copied).not.toContain('I18nError');
  });

  it('普通非 i18n 错误仍保留原始错误名称和堆栈', async () => {
    const { MessageErrorNotice } = await import('./MessageErrorNotice');

    render(
      <MessageErrorNotice
        error={{ key: 'errors.unknownWithDetail', params: { detail: 'Network timeout' } }}
        details={{
          name: 'TypeError',
          message: 'Network timeout',
          stack: 'TypeError: Network timeout\n    at real.ts:2:3',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '详情' }));

    expect(screen.getByText('TypeError')).toBeInTheDocument();
    expect(screen.getByText(/TypeError: Network timeout/)).toBeInTheDocument();
    expect(screen.getByText(/at real\.ts:2:3/)).toBeInTheDocument();
  });
});
