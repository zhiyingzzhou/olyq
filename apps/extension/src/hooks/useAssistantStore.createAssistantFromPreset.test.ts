/**
 * 说明：`useAssistantStore.createAssistantFromPreset.test` Hook 模块。
 *
 * 职责：
 * - 承载 `useAssistantStore.createAssistantFromPreset.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { useAssistantStore } from '@/hooks/useAssistantStore';
import { getBrowserContextAssistantOverride, saveBrowserContextPolicyState } from '@/lib/browser-context/policy';
import { DEFAULT_BROWSER_CONTEXT_POLICY_STATE } from '@/lib/browser-context/types';
import { createAutoMcpServerSelection } from '@/lib/mcp/selection';

describe('createAssistantFromPreset', () => {
  beforeEach(() => {
    saveBrowserContextPolicyState(DEFAULT_BROWSER_CONTEXT_POLICY_STATE);
    const roleTemplate = {
      id: 'browser-operator',
      scenario: 'browser' as const,
      name: '任务执行',
      description: '帮助拆解网页任务',
      iconId: 'wrench' as const,
      prompt: '你是一个专业的浏览器任务执行助手。',
      mcpSelection: createAutoMcpServerSelection(),
      enableWebSearch: false,
      webSearchProviderId: undefined,
      enableGenerateImage: false,
      enableMemory: false,
      reasoningEffort: 'high' as const,
      tags: ['browser', 'execution'],
    };

    useAssistantStore.setState({
      presets: [roleTemplate],
      userPresets: [],
      assistants: [],
    });
  });

  it('会复制预设配置，但始终创建新的用户助手与默认话题', () => {
    const createdAssistantId = useAssistantStore.getState().createAssistantFromPreset('browser-operator');

    expect(createdAssistantId).toBeTruthy();
    expect(createdAssistantId).not.toBe('role-template-writer');

    const createdAssistant = useAssistantStore.getState().assistants.find((assistant) => assistant.id === createdAssistantId);
    expect(createdAssistant).toBeTruthy();
    expect(createdAssistant).toMatchObject({
      scenario: 'browser',
      name: '任务执行',
      description: '帮助拆解网页任务',
      iconId: 'wrench',
      prompt: '你是一个专业的浏览器任务执行助手。',
      mcpSelection: { mode: 'auto' },
      enableWebSearch: false,
      enableGenerateImage: false,
      enableMemory: false,
      tags: ['browser', 'execution'],
    });
    expect(createdAssistant).not.toHaveProperty('model');
    expect(createdAssistant).not.toHaveProperty('temperature');
    expect(createdAssistant).not.toHaveProperty('topP');
    expect(createdAssistant).not.toHaveProperty('maxTokens');
    expect(createdAssistant).not.toHaveProperty('contextLength');
    expect(createdAssistant).not.toHaveProperty('modelParams');

    expect(createdAssistant?.topics).toHaveLength(1);
    expect(createdAssistant?.topics[0]?.assistantId).toBe(createdAssistantId);
    expect(createdAssistant?.topics[0]?.id).not.toBe('browser-operator');
    expect(createdAssistant?.topics[0]?.name).toBeTruthy();

    expect(getBrowserContextAssistantOverride(createdAssistantId)).toMatchObject({
      assistantId: createdAssistantId,
      mode: 'profile',
      profileId: 'workflow-aware',
    });
  });

  it('会从用户预设创建 browser 助手，但不会种入 browser-context override', () => {
    useAssistantStore.setState({
      presets: [],
      userPresets: [{
        id: 'user-browser-preset',
        scenario: 'browser',
        name: '我的浏览器预设',
        description: '用户自定义浏览器预设',
        prompt: '请先观察页面，再拆解任务。',
        tags: ['browser', 'custom'],
        createdAt: 1,
        updatedAt: 1,
      }],
      assistants: [],
    });

    const createdAssistantId = useAssistantStore.getState().createAssistantFromPreset('user-browser-preset');
    const createdAssistant = useAssistantStore.getState().assistants.find((assistant) => assistant.id === createdAssistantId);

    expect(createdAssistantId).toBeTruthy();
    expect(createdAssistant).toMatchObject({
      scenario: 'browser',
      name: '我的浏览器预设',
      prompt: '请先观察页面，再拆解任务。',
      tags: ['browser', 'custom'],
    });
    expect(getBrowserContextAssistantOverride(createdAssistantId)).toBeNull();
  });
});
