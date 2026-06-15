/**
 * 说明：`assistant-selection-storage.spec` 基础能力模块。
 *
 * 职责：
 * - 承载 `assistant-selection-storage.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Assistant } from '@/types/assistant';
import { createAutoMcpServerSelection, createManualMcpServerSelection } from './selection';
import { resolveAssistantMcpSelection } from './assistant-selection-storage';

/**
 * 测试辅助函数：`makeAssistant`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function makeAssistant(overrides: Partial<Assistant> = {}): Assistant {
  const { scenario = 'general', ...rest } = overrides;
  return {
    id: 'assistant-1',
    scenario,
    name: 'Test Assistant',
    prompt: 'You are helpful.',
    topics: [],
    order: 1,
    createdAt: 1,
    updatedAt: 1,
    ...rest,
  };
}

describe('assistant mcp selection storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('prefers assistant embedded selection', () => {
    const assistant = makeAssistant({ mcpSelection: createManualMcpServerSelection(['inline-server']) });

    expect(resolveAssistantMcpSelection(assistant)).toEqual({
      mode: 'manual',
      manualServerIds: ['inline-server'],
    });
  });

  it('falls back to auto mode when assistant does not carry explicit selection', () => {
    expect(resolveAssistantMcpSelection(makeAssistant())).toEqual(createAutoMcpServerSelection());
  });
});
