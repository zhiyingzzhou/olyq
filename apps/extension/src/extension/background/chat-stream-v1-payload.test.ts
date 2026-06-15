/**
 * 说明：`chat-stream-v1-payload.test` 后台运行时模块。
 *
 * 职责：
 * - 承载 `chat-stream-v1-payload.test` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it } from 'vitest';
import { isI18nError } from '@/lib/i18n/error';
import { parseChatStreamMessagesPayload } from './chat-stream-v1-payload';

/**
 * 测试辅助函数：`expectInvalidPayload`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function expectInvalidPayload(raw: unknown, detail: string) {
  try {
    parseChatStreamMessagesPayload(raw);
    throw new Error('expected parseChatStreamMessagesPayload to throw');
  } catch (error) {
    expect(isI18nError(error)).toBe(true);
    if (!isI18nError(error)) return;
    expect(error.i18n.key).toBe('errors.chatStreamMessagesInvalidWithDetail');
    expect(error.i18n.params?.detail).toBe(detail);
  }
}

describe('chat-stream-v1-payload', () => {
  it('接受 attachments[].url 为 data URL 的图片消息', () => {
    expect(
      parseChatStreamMessagesPayload([
        {
          role: 'user',
          content: 'describe this image',
          attachments: [{ type: 'image', url: 'data:image/png;base64,AA==', mime: 'image/png', name: 'demo.png' }],
        },
      ]),
    ).toEqual([
      {
        role: 'user',
        content: 'describe this image',
        attachments: [{ type: 'image', url: 'data:image/png;base64,AA==', mime: 'image/png', name: 'demo.png' }],
      },
    ]);
  });

  it('接受 attachments[].url 为 https URL 的图片消息', () => {
    expect(
      parseChatStreamMessagesPayload([
        {
          role: 'user',
          content: 'describe this image',
          attachments: [{ type: 'image', url: 'https://example.com/demo.png', mime: 'image/png', name: 'demo.png' }],
        },
      ]),
    ).toEqual([
      {
        role: 'user',
        content: 'describe this image',
        attachments: [{ type: 'image', url: 'https://example.com/demo.png', mime: 'image/png', name: 'demo.png' }],
      },
    ]);
  });

  it('接受本地 data URL 文件附件，并保留 mime/name/size', () => {
    expect(
      parseChatStreamMessagesPayload([
        {
          role: 'user',
          content: 'summarize the pdf',
          attachments: [{
            type: 'file',
            dataUrl: 'data:application/pdf;base64,JVBERi0xLjc=',
            mime: 'application/pdf',
            name: 'report.pdf',
            size: 2048,
          }],
        },
      ]),
    ).toEqual([
      {
        role: 'user',
        content: 'summarize the pdf',
        attachments: [{
          type: 'file',
          dataUrl: 'data:application/pdf;base64,JVBERi0xLjc=',
          mime: 'application/pdf',
          name: 'report.pdf',
          size: 2048,
        }],
      },
    ]);
  });

  it('拒绝旧协议的 dataUrl 字段', () => {
    expectInvalidPayload(
      [{ role: 'user', content: 'hi', attachments: [{ type: 'image', dataUrl: 'data:image/png;base64,AA==' }] }],
      'messages[0].attachments[0] must use url instead of dataUrl',
    );
  });

  it('拒绝 content 数组', () => {
    expectInvalidPayload([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], 'messages[0].content must be a string');
  });

  it('拒绝缺少 url 的图片附件', () => {
    expectInvalidPayload(
      [{ role: 'user', content: 'hi', attachments: [{ type: 'image' }] }],
      'messages[0].attachments[0].url must be a non-empty string',
    );
  });

  it('拒绝空 url 的图片附件', () => {
    expectInvalidPayload(
      [{ role: 'user', content: 'hi', attachments: [{ type: 'image', url: '   ' }] }],
      'messages[0].attachments[0].url must be a non-empty string',
    );
  });

  it('拒绝非法 data URL 图片附件', () => {
    expectInvalidPayload(
      [{ role: 'user', content: 'hi', attachments: [{ type: 'image', url: 'data:image/png,AA==' }] }],
      'messages[0].attachments[0].url must be a valid image data URL or http(s) URL',
    );
  });

  it('拒绝未经过出站规范化的 SVG / GIF 图片 data URL', () => {
    expectInvalidPayload(
      [{ role: 'user', content: 'hi', attachments: [{ type: 'image', url: 'data:image/svg+xml;base64,PHN2Zy8+', mime: 'image/svg+xml' }] }],
      'messages[0].attachments[0].url must be a valid image data URL or http(s) URL',
    );
    expectInvalidPayload(
      [{ role: 'user', content: 'hi', attachments: [{ type: 'image', url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', mime: 'image/gif' }] }],
      'messages[0].attachments[0].url must be a valid image data URL or http(s) URL',
    );
  });

  it('拒绝图片附件声明 MIME 与 data URL 媒体类型不一致', () => {
    expectInvalidPayload(
      [{ role: 'user', content: 'hi', attachments: [{ type: 'image', url: 'data:image/png;base64,AA==', mime: 'image/webp' }] }],
      'messages[0].attachments[0].mime must match dataUrl media type',
    );
  });

  it('拒绝缺少 dataUrl 的文件附件', () => {
    expectInvalidPayload(
      [{ role: 'user', content: 'hi', attachments: [{ type: 'file', mime: 'application/pdf' }] }],
      'messages[0].attachments[0].dataUrl must be a non-empty string',
    );
  });

  it('拒绝 mime 与 dataUrl media type 不匹配的文件附件', () => {
    expectInvalidPayload(
      [{ role: 'user', content: 'hi', attachments: [{ type: 'file', dataUrl: 'data:application/pdf;base64,JVBERi0xLjc=', mime: 'text/plain' }] }],
      'messages[0].attachments[0].mime must match dataUrl media type',
    );
  });

  it('拒绝不支持的 URL scheme', () => {
    expectInvalidPayload(
      [{ role: 'user', content: 'hi', attachments: [{ type: 'image', url: 'blob:https://example.com/demo' }] }],
      'messages[0].attachments[0].url must be a valid image data URL or http(s) URL',
    );
  });
});
