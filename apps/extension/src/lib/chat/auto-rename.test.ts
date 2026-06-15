/**
 * 说明：`auto-rename.test` 基础能力模块。
 *
 * 职责：
 * - 承载 `auto-rename.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 单元测试：auto-rename 相关的采样构建逻辑。
 *
 * 覆盖：
 * - 代码块/噪声清洗（减少 token 浪费）；
 * - 附件线索保留（空 content 但有附件）；
 * - 长度裁剪与分隔提示。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nError } from '@/lib/i18n/error';
import type { Message } from '@/types/chat';

const { generateObjectTaskMock } = vi.hoisted(() => ({
  generateObjectTaskMock: vi.fn(),
}));

vi.mock('@/lib/object-gen', () => ({
  generateObjectTask: generateObjectTaskMock,
}));

import { buildTopicTitleSample, generateAutoRenameTitle, toAutoRenameErrorText } from './auto-rename';

/**
 * 测试辅助函数：`msg`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function msg(seed: Partial<Message> & Pick<Message, 'id' | 'role' | 'content'>): Message {
  return {
    createdAt: Date.now(),
    ...seed,
  } satisfies Message;
}

describe('auto-rename', () => {
  beforeEach(() => {
    generateObjectTaskMock.mockReset();
  });

  it('buildTopicTitleSample: 应移除三引号代码块，避免 token 浪费', () => {
    const sample = buildTopicTitleSample([
      msg({ id: 'u1', role: 'user', content: 'hello```js\nconst a = 1\n```world' }),
      msg({ id: 'a1', role: 'assistant', content: 'ok' }),
    ], { headCount: 2, tailCount: 0, perMessageMaxChars: 1000 });

    expect(sample).toContain('[代码块]');
    expect(sample).not.toContain('const a = 1');
  });

  it('buildTopicTitleSample: 当内容为空但有附件时也应保留线索', () => {
    const sample = buildTopicTitleSample([
      msg({
        id: 'u1',
        role: 'user',
        content: '',
        attachments: [{ type: 'image', id: 'img1', name: 'x.png', mime: 'image/png', size: 1 }],
      }),
      msg({ id: 'a1', role: 'assistant', content: '我看到了图片。' }),
    ], { headCount: 2, tailCount: 0 });

    expect(sample).toContain('用户：（图片×1）');
  });

  it('buildTopicTitleSample: 总长度足够时应插入分隔提示', () => {
    const msgs: Message[] = [];
    for (let i = 0; i < 10; i += 1) {
      msgs.push(msg({ id: `u${i}`, role: i % 2 === 0 ? 'user' : 'assistant', content: `m${i}` }));
    }
    const sample = buildTopicTitleSample(msgs, { headCount: 3, tailCount: 3 });
    expect(sample).toContain('系统：…（中间略）');
  });

  it('generateAutoRenameTitle: 会统一走后台任务并裁剪超长标题', async () => {
    generateObjectTaskMock.mockResolvedValue({
      title: '这是一个明显超过四十个字符的话题标题用于验证自动命名统一裁剪行为是否生效',
    });

    await expect(generateAutoRenameTitle('openai/gpt-5.4', [
      msg({ id: 'u1', role: 'user', content: '你好' }),
      msg({ id: 'a1', role: 'assistant', content: '你好，有什么可以帮你？' }),
    ])).resolves.toBe('这是一个明显超过四十个字符的话题标题用于验证自动命名统一裁剪行为是否生效');

    expect(generateObjectTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'topic-title',
      model: 'openai/gpt-5.4',
      timeoutMs: 30_000,
    }));
  });

  it('toAutoRenameErrorText: 会屏蔽原始 SSE body，避免直接进入 UI', () => {
    const text = toAutoRenameErrorText(new Error([
      'event: response.created',
      'data: {"response":{"id":"resp_123","instructions":"very long prompt body"}}',
      'event: response.completed',
    ].join('\n')));

    expect(text).toEqual({ key: 'errors.objectGenerationFailed' });
  });

  it('toAutoRenameErrorText: 已知 I18nError 会原样透传', () => {
    const text = toAutoRenameErrorText(new I18nError('errors.autoRenameTimeout'));
    expect(text).toEqual({ key: 'errors.autoRenameTimeout' });
  });

  it('toAutoRenameErrorText: 带原始 SSE detail 的 I18nError 会回退成通用失败文案', () => {
    const text = toAutoRenameErrorText(new I18nError('errors.apiCallHttpErrorWithDetail', {
      status: 200,
      detail: [
        'HTTP 200 · https://www.right.codes/codex/v1/responses',
        'request_id=req_123',
        'event: response.created',
        'data: {"response":{"id":"resp_123","instructions":"very long prompt body"}}',
      ].join(' · '),
    }));

    expect(text).toEqual({ key: 'errors.objectGenerationFailed' });
  });
});
