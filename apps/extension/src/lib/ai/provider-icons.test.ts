/**
 * 说明：`provider-icons.test` AI 能力模块。
 *
 * 职责：
 * - 承载 `provider-icons.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest';

import { buildLobeIconUrl, getProviderIconUrl } from './provider-icons';

describe('provider-icons preset brand mappings', () => {
  it.each([
    ['vercel-ai-gateway', 'vercel', false],
    ['aws-bedrock', 'bedrock', true],
    ['vertexai', 'vertexai', true],
    ['vertex-anthropic', 'vertexai', true],
    ['openai-compatible-custom', 'openai', false],
  ] as const)('maps %s to the expected lobe icon asset', (providerId, iconId, hasColor) => {
    expect(getProviderIconUrl(providerId, 'light')).toBe(buildLobeIconUrl(iconId, false, hasColor));
  });

  it('keeps vertex-anthropic aligned with vertexai in dark mode', () => {
    expect(getProviderIconUrl('vertex-anthropic', 'dark')).toBe(buildLobeIconUrl('vertexai', true, true));
  });
});
