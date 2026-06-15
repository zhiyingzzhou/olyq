/**
 * 说明：`effective-state.spec` 浏览器上下文生效态测试。
 *
 * 职责：
 * - 验证总开关、会话模式和 assistant policy 会被统一解析成单一生效态；
 * - 守住全文模式预算放大和风格信号补源的临时 profile 语义；
 * - 防止调用方重新回到各自手写 gating 的旧路。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserContextProfile } from './types';

const mocks = vi.hoisted(() => ({
  settingsEnabled: true,
  fullPagePromptChars: 24_000,
  conversationMode: {
    enabled: true,
    fullPageEnabled: false,
    styleSignalsEnabled: false,
  },
  policySource: 'default' as 'default' | 'assistant-disabled',
  policyProfile: {
    id: 'minimal-page',
    title: 'Minimal Page',
    description: '内容优先',
    sources: ['tab-meta', 'readable-dom'],
    outputFormat: 'markdown',
    maxPromptChars: 6000,
    cacheTtlMs: 60_000,
  } as BrowserContextProfile,
}));

vi.mock('./settings', () => ({
  getBrowserContextSettings: () => ({
    enabled: mocks.settingsEnabled,
    fullPagePromptChars: mocks.fullPagePromptChars,
  }),
}));

vi.mock('./conversation-mode', () => ({
  getBrowserContextConversationMode: () => ({ ...mocks.conversationMode }),
}));

vi.mock('./policy', () => ({
  resolveBrowserContextPolicyForAssistant: () => ({
    source: mocks.policySource,
    profile: { ...mocks.policyProfile, sources: [...mocks.policyProfile.sources] },
  }),
}));

describe('browser-context effective state', () => {
  beforeEach(() => {
    mocks.settingsEnabled = true;
    mocks.fullPagePromptChars = 24_000;
    mocks.conversationMode = {
      enabled: true,
      fullPageEnabled: false,
      styleSignalsEnabled: false,
    };
    mocks.policySource = 'default';
    mocks.policyProfile = {
      id: 'minimal-page',
      title: 'Minimal Page',
      description: '内容优先',
      sources: ['tab-meta', 'readable-dom'],
      outputFormat: 'markdown',
      maxPromptChars: 6000,
      cacheTtlMs: 60_000,
    };
  });

  it('把总开关、会话开关和 assistant policy 统一收敛成单一 effective 判定', async () => {
    const { resolveBrowserContextEffectiveState } = await import('./effective-state');

    expect(resolveBrowserContextEffectiveState({
      assistant: { id: 'assistant-1', tags: [] },
      conversationKey: 'topic-1',
    }).effective).toBe(true);

    mocks.settingsEnabled = false;
    expect(resolveBrowserContextEffectiveState({
      assistant: { id: 'assistant-1', tags: [] },
      conversationKey: 'topic-1',
    }).effective).toBe(false);

    mocks.settingsEnabled = true;
    mocks.conversationMode.enabled = false;
    expect(resolveBrowserContextEffectiveState({
      assistant: { id: 'assistant-1', tags: [] },
      conversationKey: 'topic-1',
    }).effective).toBe(false);

    mocks.conversationMode.enabled = true;
    mocks.policySource = 'assistant-disabled';
    const state = resolveBrowserContextEffectiveState({
      assistant: { id: 'assistant-1', tags: [] },
      conversationKey: 'topic-1',
    });
    expect(state.disabledByAssistant).toBe(true);
    expect(state.effective).toBe(false);
  });

  it('全文和风格模式只影响当前轮 profile，不回写策略中心真源', async () => {
    mocks.conversationMode.fullPageEnabled = true;
    mocks.conversationMode.styleSignalsEnabled = true;
    const baseProfile = { ...mocks.policyProfile, sources: [...mocks.policyProfile.sources] };

    const { resolveBrowserContextEffectiveState } = await import('./effective-state');
    const state = resolveBrowserContextEffectiveState({
      assistant: { id: 'assistant-1', tags: [] },
      conversationKey: 'topic-1',
    });

    expect(state.profile.sources).toContain('readable-dom');
    expect(state.profile.sources).toContain('page-style-signals');
    expect(state.profile.maxPromptChars).toBe(24_000);
    expect(baseProfile.sources).toEqual(['tab-meta', 'readable-dom']);
    expect(mocks.policyProfile.maxPromptChars).toBe(6000);
  });

  it('缺少会话时保守回落到非生效态，但仍返回稳定 profile 与 mode 快照', async () => {
    mocks.conversationMode = {
      enabled: false,
      fullPageEnabled: false,
      styleSignalsEnabled: false,
    };

    const { resolveBrowserContextEffectiveState } = await import('./effective-state');
    const state = resolveBrowserContextEffectiveState({
      assistant: null,
      conversationKey: '',
    });

    expect(state.hasConversation).toBe(false);
    expect(state.conversationEnabled).toBe(false);
    expect(state.effective).toBe(false);
    expect(state.profile.id).toBe('minimal-page');
  });
});
