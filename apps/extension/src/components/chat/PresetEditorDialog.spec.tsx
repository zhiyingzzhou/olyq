/**
 * 说明：`PresetEditorDialog.spec` 组件模块。
 *
 * 职责：
 * - 守住用户预设编辑弹窗的滚动容器契约；
 * - 防止长表单再次把 dialog 内容整体撑爆，导致无法在弹窗内部滚动；
 * - 只验证当前组件的结构语义，不替代真实浏览器里的视觉回归。
 *
 * 边界：
 * - 本文件不覆盖预设 CRUD 或 MCP 业务流程；
 * - 这里只验证“头尾固定、中间表单区滚动”和生成参数不进入预设表单。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { StoredAssistantPreset } from '@/types/assistant';
import { PresetEditorDialog } from './PresetEditorDialog';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        if (key === 'assistant.removeTag') return `remove-tag-${String(options?.tag ?? '')}`;
        return key;
      },
    }),
  };
});

vi.mock('@/hooks/useModelOptions', () => ({
  useModelOptions: () => ({
    getModelLabel: (modelId: string) => modelId,
  }),
}));

vi.mock('@/lib/mcp/use-mcp-servers-resource', () => ({
  useMcpServersResource: () => ({
    status: 'ready',
    data: [],
    error: null,
    enabledServers: [],
    reload: async () => undefined,
  }),
}));

vi.mock('@/components/chat/ModelPickerDialog', () => ({
  ModelPickerDialog: () => null,
}));

describe('PresetEditorDialog', () => {
  it('把头部和底部固定在 dialog 内，中间表单区使用内部滚动容器', () => {
    render(
      <PresetEditorDialog
        open
        preset={null}
        availableTags={['执行', '研究']}
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    );

    const dialog = screen.getByRole('dialog');
    const scrollBody = screen.getByTestId('preset-editor-scroll-body');
    const saveButton = screen.getByRole('button', { name: 'assistant.store.createPreset' });

    expect(dialog.className).toContain('flex');
    expect(dialog.className).toContain('flex-col');
    expect(dialog.className).toContain('overflow-hidden');
    expect(scrollBody.className).toContain('min-h-0');
    expect(scrollBody.className).toContain('flex-1');
    expect(scrollBody.className).toContain('overflow-y-auto');
    expect(scrollBody).not.toContainElement(saveButton);
  });

  it('用户预设编辑器不渲染或提交生成参数字段', () => {
    const onSubmit = vi.fn();

    render(
      <PresetEditorDialog
        open
        preset={{
          id: 'preset-1',
          scenario: 'general',
          name: '预设',
          prompt: 'system prompt',
          model: 'openai/gpt-5.4',
          temperature: 0.4,
          topP: 0.8,
          maxTokens: 4096,
          contextLength: 16,
          modelParams: { seed: 7 },
          createdAt: 1,
          updatedAt: 1,
        } as StoredAssistantPreset}
        availableTags={['执行', '研究']}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryByText('assistant.model')).not.toBeInTheDocument();
    expect(screen.queryByText('assistant.generation.maxTokens')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'assistant.store.savePreset' }));

    const draft = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(draft).not.toHaveProperty('model');
    expect(draft).not.toHaveProperty('temperature');
    expect(draft).not.toHaveProperty('topP');
    expect(draft).not.toHaveProperty('maxTokens');
    expect(draft).not.toHaveProperty('contextLength');
    expect(draft).not.toHaveProperty('modelParams');
  });
});
