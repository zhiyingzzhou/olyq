/**
 * 说明：`useChatTranslation.spec` 测试模块。
 *
 * 职责：
 * - 锁定输入区翻译确认框的开前时序；
 * - 防止 sidepanel 在打开 AlertDialog 时再次出现 textarea 保持焦点导致的 aria-hidden 警告。
 *
 * 边界：
 * - 本文件只验证翻译 hook 的局部交互副作用，不覆盖完整输入区集成链路。
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RefObject } from 'react';

import { useChatTranslation } from './useChatTranslation';

vi.mock('@/hooks/useToast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/lib/developer/stream-chat-with-developer-mode', () => ({
  streamChatWithDeveloperMode: vi.fn(),
}));

describe('useChatTranslation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('打开翻译确认框前会先清掉输入框焦点', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();
    expect(textarea).toHaveFocus();

    const closeAll = vi.fn();
    const inputRef = { current: textarea } as RefObject<HTMLTextAreaElement | null>;

    const { result } = renderHook(() => useChatTranslation({
      t: (key) => key,
      text: '需要翻译的文本',
      setText: vi.fn(),
      inputRef,
      isLoading: false,
      currentModel: 'mock-model',
      availableModelIds: ['mock-model'],
      translateLanguages: ['English'],
      translateTargetLanguage: 'English',
      translateModel: 'mock-model',
      showTranslateConfirm: true,
      closeAll,
    }));

    act(() => {
      result.current.requestTranslateFromButton();
    });

    expect(closeAll).toHaveBeenCalledOnce();
    expect(result.current.translateConfirmOpen).toBe(true);
    expect(textarea).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
  });
});
