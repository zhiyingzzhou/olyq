/**
 * 说明：`AssistantTagPicker.spec` 组件模块。
 *
 * 职责：
 * - 覆盖共享标签选择器的列表点选、手动新增、去重与删除回归；
 * - 确保助手编辑器和预设编辑器共用的标签入口保持一致语义。
 *
 * 边界：
 * - 本文件只验证标签组件自身，不扩展到助手或预设表单提交流程。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AssistantTagPicker } from './AssistantTagPicker';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        const messages: Record<string, string> = {
          'assistant.tagsInputPlaceholder': '输入标签后按 Enter 或逗号确认',
          'assistant.tagsEmpty': '还没有选中的标签',
          'assistant.availableTags': '已有标签',
          'assistant.availableTagsEmpty': '暂时没有可复用的标签',
          'assistant.removeTag': `移除标签 ${options?.tag ?? ''}`,
        };
        return messages[key] ?? key;
      },
    }),
  };
});

/**
 * 测试辅助组件：`TagPickerHarness`。
 *
 * @remarks
 * 用受控 state 包一层共享标签选择器，专门给当前组件测试观察 `onChange` 写回结果。
 */
function TagPickerHarness({
  initialValue = [],
  availableTags = [],
}: {
  initialValue?: string[];
  availableTags?: string[];
}) {
  const [value, setValue] = useState<string[]>(initialValue);
  return (
    <div>
      <AssistantTagPicker value={value} availableTags={availableTags} onChange={setValue} />
      <div data-testid="tag-value">{value.join('|')}</div>
    </div>
  );
}

describe('AssistantTagPicker', () => {
  it('支持点选已有标签、手动新增、去重与删除', () => {
    render(
      <TagPickerHarness
        initialValue={['已选']}
        availableTags={['已选', '已有', '共享']}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '已有' }));
    expect(screen.getByTestId('tag-value')).toHaveTextContent('已选|已有');

    fireEvent.change(screen.getByPlaceholderText('输入标签后按 Enter 或逗号确认'), {
      target: { value: '新增标签' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('输入标签后按 Enter 或逗号确认'), { key: 'Enter' });
    expect(screen.getByTestId('tag-value')).toHaveTextContent('已选|已有|新增标签');

    fireEvent.change(screen.getByPlaceholderText('输入标签后按 Enter 或逗号确认'), {
      target: { value: '已有' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('输入标签后按 Enter 或逗号确认'), { key: ',' });
    expect(screen.getByTestId('tag-value')).toHaveTextContent('已选|已有|新增标签');

    fireEvent.click(screen.getByRole('button', { name: '移除标签 已选' }));
    expect(screen.getByTestId('tag-value')).toHaveTextContent('已有|新增标签');
  });
});
