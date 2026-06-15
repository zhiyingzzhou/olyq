/**
 * 说明：`helpers.spec` 页面模块。
 *
 * 职责：
 * - 承载 `helpers.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest';

import { buildDefaultPaintingSeed, buildEffectivePaintPrompt, isImageAspectRatio, isImageSize } from './helpers';

describe('paint helpers', () => {
  it('会把全局生图提示词前置到用户提示词之前', () => {
    expect(buildEffectivePaintPrompt('global prefix', 'user prompt')).toBe('global prefix\n\nuser prompt');
    expect(buildEffectivePaintPrompt('global prefix', '')).toBe('global prefix');
    expect(buildEffectivePaintPrompt('', 'user prompt')).toBe('user prompt');
  });

  it('会把默认生图模型转换成新建绘图任务的种子数据', () => {
    expect(buildDefaultPaintingSeed('openai/gpt-image-1')).toEqual({ model: 'openai/gpt-image-1' });
    expect(buildDefaultPaintingSeed('   ')).toBeUndefined();
    expect(buildDefaultPaintingSeed(undefined)).toBeUndefined();
  });

  it('只接受 AI SDK 顶层 size/aspectRatio 的数字格式', () => {
    expect(isImageSize('1024x1024')).toBe(true);
    expect(isImageSize('auto')).toBe(false);
    expect(isImageSize('1024*1024')).toBe(false);

    expect(isImageAspectRatio('16:9')).toBe(true);
    expect(isImageAspectRatio('auto')).toBe(false);
    expect(isImageAspectRatio('16/9')).toBe(false);
  });
});
