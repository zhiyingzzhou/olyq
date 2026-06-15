/**
 * 说明：`MessageTranslationsBlock.spec` 组件模块。
 *
 * 职责：
 * - 承载 `MessageTranslationsBlock.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { toastMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { language?: string }) => (
      key === 'message.translationTargetLabel'
        ? `message.translationTargetLabel:${params?.language ?? ''}`
        : key === 'errors.unknownWithDetail'
          ? String((params as { detail?: unknown } | undefined)?.detail ?? key)
        : key
    ),
    i18n: { language: 'zh-CN' },
  }),
}));

vi.mock('@/hooks/useToast', () => ({
  toast: toastMock,
}));

describe('MessageTranslationsBlock', () => {
  it('会展示 loading、success、error 三种翻译状态，并仅在成功态存在时显示复制按钮', async () => {
    const { MessageTranslationsBlock } = await import('./MessageTranslationsBlock');

    render(
      <MessageTranslationsBlock
        translations={[
          { language: 'English', status: 'loading', content: '' },
          { language: '日本語', status: 'success', content: 'こんにちは' },
          { language: 'Deutsch', status: 'error', content: '', error: { key: 'errors.unknownWithDetail', params: { detail: 'network failed' } } },
        ]}
      />,
    );

    expect(screen.getByText('translation.translating')).toBeInTheDocument();
    expect(screen.getByText('message.translationTargetLabel:英语')).toBeInTheDocument();
    expect(screen.getByText('こんにちは')).toBeInTheDocument();
    expect(screen.getByText('network failed')).toBeInTheDocument();
    expect(screen.queryByText('English')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'message.copyTranslation' })).toBeInTheDocument();
  });

  it('loading 翻译已经有流式内容时，不再继续显示“翻译中”文案', async () => {
    const { MessageTranslationsBlock } = await import('./MessageTranslationsBlock');

    render(
      <MessageTranslationsBlock
        translations={[
          { language: 'English', status: 'loading', content: 'Hel' },
        ]}
      />,
    );

    expect(screen.getByText('Hel')).toBeInTheDocument();
    expect(screen.queryByText('translation.translating')).not.toBeInTheDocument();
  });

  it('关闭失败翻译时会回调父级移除对应语言', async () => {
    const { MessageTranslationsBlock } = await import('./MessageTranslationsBlock');
    const onRemoveTranslation = vi.fn();

    render(
      <MessageTranslationsBlock
        translations={[
          { language: 'Deutsch', status: 'error', content: '', error: { key: 'errors.unknownWithDetail', params: { detail: 'network failed' } } },
        ]}
        onRemoveTranslation={onRemoveTranslation}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'common.close' }));

    expect(onRemoveTranslation).toHaveBeenCalledWith('Deutsch');
  });
});
