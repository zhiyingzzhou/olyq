/**
 * 说明：`message-translations.test` 基础能力模块。
 *
 * 职责：
 * - 承载 `message-translations.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest';

import { getSuccessfulMessageTranslations, normalizeMessagesFromStorage } from './message-translations';

describe('message-translations', () => {
  it('会把旧版翻译结构升级为 success 状态', () => {
    const { messages, changed } = normalizeMessagesFromStorage([
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'hello',
        createdAt: 1,
        translations: [
          { language: 'English', content: 'Hello' },
        ] as never,
      },
    ]);

    expect(changed).toBe(true);
    expect(messages[0]?.translations).toEqual([
      { language: 'English', status: 'success', content: 'Hello' },
    ]);
  });

  it('会在存储恢复时清理无法恢复的 loading 翻译', () => {
    const { messages, changed } = normalizeMessagesFromStorage([
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'source',
        createdAt: 2,
        translations: [
          { language: 'English', status: 'loading', content: 'Hel' },
          { language: '中文', status: 'success', content: '你好' },
        ],
      },
    ]);

    expect(changed).toBe(true);
    expect(messages[0]?.translations).toEqual([
      { language: '中文', status: 'success', content: '你好' },
    ]);
    expect(getSuccessfulMessageTranslations(messages[0]?.translations)).toHaveLength(1);
  });

  it('会保留错误详情里的 messageI18n 字段', () => {
    const { messages, changed } = normalizeMessagesFromStorage([
      {
        id: 'msg-3',
        role: 'assistant',
        content: 'source',
        createdAt: 3,
        translations: [
          {
            language: 'English',
            status: 'error',
            content: '',
            error: { key: 'errors.imageInputModelNotRecognized' },
            errorDetails: {
              name: 'I18nError',
              message: 'errors.imageInputModelNotRecognized',
              messageI18n: { key: 'errors.imageInputModelNotRecognized' },
            },
          },
        ],
      },
    ]);

    expect(changed).toBe(false);
    expect(messages[0]?.translations?.[0]).toEqual({
      language: 'English',
      status: 'error',
      content: '',
      error: { key: 'errors.imageInputModelNotRecognized' },
      errorDetails: {
        name: 'I18nError',
        message: 'errors.imageInputModelNotRecognized',
        messageI18n: { key: 'errors.imageInputModelNotRecognized' },
      },
    });
  });

  it('会清理旧版页面元素 modelContext，不再解析成可见引用卡', () => {
    const { messages, changed } = normalizeMessagesFromStorage([
      {
        id: 'user-1',
        role: 'user',
        content: '翻译',
        modelContext: [
          '### 页面元素引用：图片 · div',
          '图片 · div · 1 张图',
          '来源：Bootstrap',
          '',
          '- picked.png：https://example.com/picked.svg',
        ].join('\n'),
        attachments: [
          { type: 'image', id: 'img-1', name: 'picked.png', mime: 'image/png', size: 3 },
        ],
        createdAt: 4,
      },
    ]);

    expect(changed).toBe(true);
    expect(messages[0]?.contextReferences).toBeUndefined();
    expect(messages[0]?.modelContext).toBeUndefined();
    expect(messages[0]?.content).toBe('翻译');
  });
});
