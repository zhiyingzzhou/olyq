/**
 * 说明：`preset-storage.spec` 测试模块。
 *
 * 职责：
 * - 覆盖用户预设当前 schema 的清洗边界；
 * - 防止模型与生成参数重新进入 `StoredAssistantPreset` 真源。
 *
 * 边界：
 * - 本文件只测试纯存储规整 helper，不覆盖助手商店 UI。
 */
import { describe, expect, it } from 'vitest';

import { sanitizeStoredAssistantPreset } from './preset-storage';

describe('preset-storage generation field ownership', () => {
  it('清洗用户预设时丢弃旧图标字符字段且不映射为 iconId', () => {
    const preset = sanitizeStoredAssistantPreset({
      id: 'preset-1',
      scenario: 'general',
      name: '用户预设',
      prompt: 'system prompt',
      emoji: 'legacy-icon',
      createdAt: 1,
      updatedAt: 2,
    });

    expect(preset).toMatchObject({
      id: 'preset-1',
      scenario: 'general',
      name: '用户预设',
      prompt: 'system prompt',
    });
    expect(preset).not.toHaveProperty('emoji');
    expect(preset?.iconId).toBeUndefined();
  });

  it('清洗用户预设时丢弃模型与生成参数字段', () => {
    const preset = sanitizeStoredAssistantPreset({
      id: 'preset-1',
      scenario: 'general',
      name: '用户预设',
      prompt: 'system prompt',
      model: 'openai/gpt-5.4',
      temperature: 0.4,
      topP: 0.8,
      maxTokens: 4096,
      contextLength: 16,
      modelParams: { seed: 7 },
      createdAt: 1,
      updatedAt: 2,
    });

    expect(preset).toMatchObject({
      id: 'preset-1',
      scenario: 'general',
      name: '用户预设',
      prompt: 'system prompt',
    });
    expect(preset).not.toHaveProperty('model');
    expect(preset).not.toHaveProperty('temperature');
    expect(preset).not.toHaveProperty('topP');
    expect(preset).not.toHaveProperty('maxTokens');
    expect(preset).not.toHaveProperty('contextLength');
    expect(preset).not.toHaveProperty('modelParams');
  });
});
