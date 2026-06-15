/**
 * 说明：`workspace-startup-state.spec` 聊天工作区启动状态测试模块。
 *
 * 职责：
 * - 验证打开新宿主前的共享启动状态写入顺序；
 * - 守住 assistants 必须先于 chat runtime 可见的启动快照约束。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/types/assistant';

const { writeStoredJsonMock } = vi.hoisted(() => ({
  writeStoredJsonMock: vi.fn(async () => undefined),
}));

vi.mock('@/lib/storage/json-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage/json-storage')>();
  return {
    ...actual,
    writeStoredJson: writeStoredJsonMock,
  };
});

import { ASSISTANTS_STORAGE_KEY, CHAT_RUNTIME_STORAGE_KEY } from '@/lib/legal/preset-remediation';
import { writeWorkspaceStartupState } from './workspace-startup-state';

describe('writeWorkspaceStartupState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('先写 assistants，再写 chat runtime', async () => {
    const assistants: Assistant[] = [{
      id: 'assistant-1',
      scenario: 'general',
      name: '助手',
      prompt: '',
      topics: [],
      order: 1,
      createdAt: 1,
      updatedAt: 1,
    }];
    const runtime = {
      activeAssistantId: 'assistant-1',
      activeTopicId: 'topic-1',
    };

    await writeWorkspaceStartupState(assistants, runtime);

    expect(writeStoredJsonMock).toHaveBeenNthCalledWith(1, ASSISTANTS_STORAGE_KEY, assistants);
    expect(writeStoredJsonMock).toHaveBeenNthCalledWith(2, CHAT_RUNTIME_STORAGE_KEY, runtime);
  });
});
