/**
 * 说明：`document-builder.spec` 基础能力模块。
 *
 * 职责：
 * - 承载 `document-builder.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { describe, expect, it, vi } from 'vitest';
import type { MessageTraceItem } from '@/types/chat';

const { getAttachmentBlobMock, blobToDataUrlMock } = vi.hoisted(() => ({
  getAttachmentBlobMock: vi.fn(async (id: string) => {
    if (id === 'img-1') return new Blob(['img'], { type: 'image/png' });
    if (id === 'file-1') {
      return {
        size: 10,
        type: 'text/plain',
        text: async () => 'alpha\nbeta',
      } as unknown as Blob;
    }
    return null;
  }),
  blobToDataUrlMock: vi.fn(async () => 'data:image/png;base64,AAAA'),
}));

vi.mock('@/i18n', () => ({
  default: {
    language: 'zh-CN',
    t: (key: string, params?: Record<string, unknown>) => {
      const dict: Record<string, string> = {
        'chat.roleYou': '你',
        'chat.system': '系统',
        'chat.assistant': '助手',
        'chat.webSearch': '联网搜索',
        'message.exportPayloadMissing': '导出内容为空',
        'exportTopic.fallbackTitle': '聊天记录',
        'exportTopic.exportedAt': '导出时间',
        'exportTopic.reasoning': '思考过程',
        'exportTopic.images': '图片附件',
        'exportTopic.files': '文件附件',
        'exportTopic.attachmentMissing': '附件不可用或已被清理',
        'exportTopic.toolCalls': '工具调用',
        'exportTopic.toolStatus': '状态',
        'exportTopic.toolArgs': '参数',
        'exportTopic.toolResult': '结果',
        'exportTopic.webSearchProvider': 'Provider',
        'exportTopic.webSearchQuery': '查询词',
        'exportTopic.translations': '翻译',
        'exportTopic.error': '错误信息',
        'errors.unknownWithDetail': `未知错误：${params?.detail ?? ''}`,
      };

      if (key === 'exportTopic.messageCount') return `共 ${params?.count ?? 0} 条消息`;
      if (key === 'exportTopic.translationItem') return `翻译：${params?.language ?? ''}`;
      return dict[key] ?? key;
    },
  },
}));

vi.mock('@/lib/attachments', () => ({
  getAttachmentBlob: getAttachmentBlobMock,
  blobToDataUrl: blobToDataUrlMock,
}));

/**
 * 测试辅助函数：`makeTrace`。
 *
 * @remarks
 * 用于在导出测试里快速拼装 assistant trace 样例，不作为运行时代码复用。
 */
function makeTrace(...items: MessageTraceItem[]) {
  return items;
}

describe('document-builder', () => {
  it('Markdown 导出会覆盖完整语义区块并内联附件', async () => {
    const { buildMarkdownExportDocument } = await import('./document-builder');

    const markdown = await buildMarkdownExportDocument({
      title: '导出测试',
      includeReasoning: true,
      fallbackAssistantModelLabel: 'openai/gpt-5.4',
      getModelLabel: () => 'GPT-5.4',
      messages: [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'Hello **world**',
          trace: makeTrace(
            { kind: 'reasoning', text: '思考链 A' },
            {
              kind: 'tool-call',
              toolCallId: 'tool-1',
              toolName: 'browser/evaluate',
              args: { expression: '2+2' },
              result: { value: 4 },
              status: 'done',
            },
            { kind: 'reasoning', text: '思考链 B' },
          ),
          createdAt: 1_730_000_000_000,
          modelId: 'openai/gpt-5.4',
          attachments: [
            { type: 'image', id: 'img-1', name: 'diagram.png', mime: 'image/png', size: 3 },
            { type: 'file', id: 'file-1', name: 'notes.md', mime: 'text/markdown', size: 10 },
            { type: 'file', id: 'missing-file', name: 'missing.txt', mime: 'text/plain', size: 12 },
          ],
          webSearchStatus: 'done',
          webSearchProviderId: 'tavily',
          webSearchQuery: 'olyq',
          webSearchResults: [
            { title: 'Doc', url: 'https://example.com/doc', snippet: 'snippet text' },
          ],
          translations: [
            { language: 'English', status: 'success' as const, content: 'Translated text' },
          ],
          error: { key: 'errors.unknownWithDetail', params: { detail: '导出错误' } },
          errorDetails: { message: 'stack here' },
        },
      ],
    });

    expect(markdown).toContain('# 导出测试');
    expect(markdown).toContain('### GPT-5.4');
    expect(markdown).toContain('Hello **world**');
    expect(markdown).toContain('#### 思考过程');
    expect(markdown.indexOf('思考链 A')).toBeLessThan(markdown.indexOf('browser/evaluate'));
    expect(markdown.indexOf('browser/evaluate')).toBeLessThan(markdown.indexOf('思考链 B'));
    expect(markdown).toContain('![diagram.png](data:image/png;base64,AAAA)');
    expect(markdown).toContain('notes.md · text/markdown');
    expect(markdown).toContain('```text\nalpha\nbeta\n```');
    expect(markdown).toContain('missing.txt · text/plain');
    expect(markdown).toContain('> 附件不可用或已被清理');
    expect(markdown).toContain('browser/evaluate');
    expect(markdown).toContain('```json\n{\n  "expression": "2+2"\n}\n```');
    expect(markdown).toContain('[Doc](https://example.com/doc)');
    expect(markdown).toContain('翻译：English');
    expect(markdown).toContain('导出错误');
    expect(markdown).toContain('stack here');
  });

  it('关闭 reasoning 时不会写入思考过程区块', async () => {
    const { buildMarkdownExportDocument } = await import('./document-builder');

    const markdown = await buildMarkdownExportDocument({
      title: '无思考',
      includeReasoning: false,
      messages: [
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Only content',
          trace: makeTrace({ kind: 'reasoning', text: 'should be hidden' }),
          createdAt: 1_730_000_000_001,
        },
      ],
    });

    expect(markdown).toContain('Only content');
    expect(markdown).not.toContain('should be hidden');
    expect(markdown).not.toContain('#### 思考过程');
  });

  it('导出用户消息时不会把页面元素引用和其拥有的附件混入正文', async () => {
    const { buildMarkdownExportDocument } = await import('./document-builder');

    const markdown = await buildMarkdownExportDocument({
      title: '引用保持纯净',
      messages: [
        {
          id: 'msg-context',
          role: 'user',
          content: '翻译',
          contextReferences: [{
            id: 'ctx-1',
            kind: 'element',
            element: {
              kind: 'image',
              tagName: 'DIV',
              text: '被选中的隐藏上下文',
              images: [{ name: 'picked.png' }],
            },
            attachmentIds: ['img-1'],
          }],
          attachments: [
            { type: 'image', id: 'img-1', name: 'picked.png', mime: 'image/png', size: 3 },
          ],
          createdAt: 1_730_000_000_003,
        },
      ],
    });

    expect(markdown).toContain('翻译');
    expect(markdown).not.toContain('被选中的隐藏上下文');
    expect(markdown).not.toContain('picked.png');
    expect(markdown).not.toContain('![picked.png]');
  });

  it('HTML 与 Word 导出会保留结构化区块和图片 data url', async () => {
    const { buildHtmlExportDocument, buildWordExportDocument } = await import('./document-builder');

    const baseMessage = {
      id: 'msg-3',
      role: 'assistant' as const,
      content: 'HTML body',
      trace: makeTrace(
        { kind: 'reasoning', text: 'HTML reasoning A' },
        { kind: 'tool-call', toolCallId: 'tool-2', toolName: 'browser/screenshot', args: { fullPage: true }, status: 'done' as const },
        { kind: 'reasoning', text: 'HTML reasoning B' },
      ),
      createdAt: 1_730_000_000_002,
      attachments: [
        { type: 'image' as const, id: 'img-1', name: 'diagram.png', mime: 'image/png', size: 3 },
      ],
      translations: [{ language: '中文', status: 'success' as const, content: '翻译块' }],
    };

    const html = await buildHtmlExportDocument({
      title: 'HTML 导出',
      messages: [baseMessage],
      includeReasoning: true,
      getModelLabel: () => 'GPT-5.4',
    });
    const word = await buildWordExportDocument({
      title: 'Word 导出',
      messages: [baseMessage],
      includeReasoning: true,
      getModelLabel: () => 'GPT-5.4',
    });

    expect(html).toContain('工具调用');
    expect(html).toContain('data:image/png;base64,AAAA');
    expect(html.indexOf('HTML reasoning A')).toBeLessThan(html.indexOf('browser/screenshot'));
    expect(html.indexOf('browser/screenshot')).toBeLessThan(html.indexOf('HTML reasoning B'));
    expect(html).toContain('翻译块');
    expect(word).toContain('xmlns:w="urn:schemas-microsoft-com:office:word"');
    expect(word).toContain('data:image/png;base64,AAAA');
    expect(word).toContain('HTML body');
  });
});
