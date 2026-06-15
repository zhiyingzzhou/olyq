/**
 * 说明：`MessageBubble.context-references.spec` 组件模块。
 *
 * 职责：
 * - 覆盖用户消息历史中的页面元素引用卡展示；
 * - 验证引用卡默认折叠、展开后显示上下文，并且 context-owned 附件不重复当普通附件展示。
 *
 * 边界：
 * - 本文件只测试 MessageBubble 渲染，不启动真实附件库或模型请求。
 */
import type { ReactNode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageBubble } from './MessageBubble';
import type { Message } from '@/types/chat';

const { getAttachmentBlobMock, i18nMock } = vi.hoisted(() => ({
  getAttachmentBlobMock: vi.fn(async () => new Blob(['image'], { type: 'image/png' })),
  i18nMock: { language: 'zh-CN' },
}));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  const zh: Record<string, string> = {
    'message.contextReference': '页面元素引用',
    'message.expandContextReference': '展开页面元素引用',
    'message.collapseContextReference': '收起页面元素引用',
    'elementContext.kind.text': '文本',
    'elementContext.kind.image': '图片',
    'elementContext.kind.table': '表格',
    'elementContext.summary.image': '{{kind}} · {{tag}} · {{count}} 张图',
    'elementContext.summary.table': '{{kind}} · {{tag}} · {{rows}} 行 × {{columns}} 列',
    'elementContext.summary.text': '{{kind}} · {{tag}} · 约 {{count}} 字',
    'elementContext.detail.label.type': '类型',
    'elementContext.detail.label.tag': '标签',
    'elementContext.detail.label.source': '来源',
    'elementContext.detail.label.url': 'URL',
    'elementContext.detail.label.selector': '选择器',
    'elementContext.detail.label.size': '规模',
    'elementContext.detail.label.images': '图片',
    'elementContext.detail.label.imageName': '文件名',
    'elementContext.detail.label.imageAlt': '替代文本',
    'elementContext.detail.value.chars': '约 {{count}} 字',
    'elementContext.detail.value.images': '{{count}} 张图',
    'elementContext.detail.value.tableSize': '{{rows}} 行 × {{columns}} 列',
    'elementContext.detail.value.regionSize': '{{width}} × {{height}} CSS px',
    'elementContext.detail.section.metadata': '引用元数据',
    'elementContext.detail.section.preview': '引用预览',
    'elementContext.detail.section.content': '完整内容',
    'elementContext.detail.section.technical': '技术详情',
    'elementContext.detail.section.text': '正文',
    'elementContext.detail.section.table': '表格',
    'elementContext.detail.section.image': '图片',
    'elementContext.detail.empty.table': '(表格为空)',
    'elementContext.detail.generatedColumn': '列 {{index}}',
    'elementContext.detail.tableTruncated': '...(已截断，原表 {{rows}} 行)',
    'elementContext.detail.previewMoreRows': '仅预览前 {{count}} 行',
    'elementContext.detail.imageFallback': '图片 {{index}}',
    'elementContext.detail.attachmentStatus': '{{count}} 个附件已加入本次引用',
    'elementContext.detail.showFullContent': '查看完整内容',
    'elementContext.detail.hideFullContent': '收起完整内容',
    'elementContext.detail.showTechnicalDetails': '技术详情',
    'elementContext.detail.hideTechnicalDetails': '收起技术详情',
    'elementContext.markdown.heading': '页面元素引用：{{title}}',
    'elementContext.markdown.source': '来源：{{source}}',
    'elementContext.markdown.imageFallback': '图片 {{index}}',
    'elementContext.markdown.imageAttached': '[已作为附件加入]',
    'elementContext.markdown.imageAttachmentOnly': '(图片已作为附件加入)',
  };
  const en: Record<string, string> = {
    'message.contextReference': 'Page element',
    'message.expandContextReference': 'Expand page element reference',
    'message.collapseContextReference': 'Collapse page element reference',
    'elementContext.kind.text': 'Text',
    'elementContext.kind.image': 'Image',
    'elementContext.kind.table': 'Table',
    'elementContext.summary.image': '{{kind}} · {{tag}} · {{count}} images',
    'elementContext.summary.table': '{{kind}} · {{tag}} · {{rows}} rows × {{columns}} columns',
    'elementContext.summary.text': '{{kind}} · {{tag}} · about {{count}} chars',
    'elementContext.detail.label.type': 'Type',
    'elementContext.detail.label.tag': 'Tag',
    'elementContext.detail.label.source': 'Source',
    'elementContext.detail.label.url': 'URL',
    'elementContext.detail.label.selector': 'Selector',
    'elementContext.detail.label.size': 'Size',
    'elementContext.detail.label.images': 'Images',
    'elementContext.detail.label.imageName': 'File name',
    'elementContext.detail.label.imageAlt': 'Alt text',
    'elementContext.detail.value.chars': 'about {{count}} chars',
    'elementContext.detail.value.images': '{{count}} images',
    'elementContext.detail.value.tableSize': '{{rows}} rows × {{columns}} columns',
    'elementContext.detail.value.regionSize': '{{width}} × {{height}} CSS px',
    'elementContext.detail.section.metadata': 'Reference metadata',
    'elementContext.detail.section.preview': 'Reference preview',
    'elementContext.detail.section.content': 'Full content',
    'elementContext.detail.section.technical': 'Technical details',
    'elementContext.detail.section.text': 'Text',
    'elementContext.detail.section.table': 'Table',
    'elementContext.detail.section.image': 'Images',
    'elementContext.detail.empty.table': '(Table is empty)',
    'elementContext.detail.generatedColumn': 'Column {{index}}',
    'elementContext.detail.tableTruncated': "...(truncated, original table had {{rows}} rows)",
    'elementContext.detail.previewMoreRows': 'Previewing first {{count}} rows',
    'elementContext.detail.imageFallback': 'Image {{index}}',
    'elementContext.detail.attachmentStatus': '{{count}} attachments added to this reference',
    'elementContext.detail.showFullContent': 'Show full content',
    'elementContext.detail.hideFullContent': 'Hide full content',
    'elementContext.detail.showTechnicalDetails': 'Technical details',
    'elementContext.detail.hideTechnicalDetails': 'Hide technical details',
    'elementContext.markdown.heading': 'Page element reference: {{title}}',
    'elementContext.markdown.source': 'Source: {{source}}',
    'elementContext.markdown.imageFallback': 'Image {{index}}',
    'elementContext.markdown.imageAttached': '[added as attachment]',
    'elementContext.markdown.imageAttachmentOnly': '(Image added as attachment)',
  };
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, params?: Record<string, unknown>) => ((i18nMock.language === 'en-US' ? en : zh)[key] ?? key)
        .replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(params?.[name] ?? '')),
      i18n: { language: i18nMock.language },
    }),
  };
});

vi.mock('@/hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    confirm: vi.fn(async () => true),
    ConfirmDialogPortal: () => null,
  }),
}));

vi.mock('@/lib/attachments', () => ({
  getAttachmentBlob: getAttachmentBlobMock,
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('./MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock('./MessageOutline', () => ({
  MessageOutline: () => null,
}));

vi.mock('./MessageErrorNotice', () => ({
  MessageErrorNotice: () => null,
}));

vi.mock('@/components/chat/ModelPickerDialog', () => ({
  ModelPickerDialog: () => null,
}));

vi.mock('@/components/ui/ProviderIcon', () => ({
  ProviderIcon: () => <div>provider-icon</div>,
}));

vi.mock('./PreviewableImage', () => ({
  PreviewableImage: () => <div>preview-image</div>,
}));

vi.mock('./ImageMessageCard', () => ({
  ImageMessageCard: () => <div>image-card</div>,
}));

vi.mock('./FileAttachmentCard', () => ({
  FileAttachmentCard: () => <div>file-card</div>,
}));

describe('MessageBubble context references', () => {
  beforeEach(() => {
    i18nMock.language = 'zh-CN';
  });

  it('用户消息会显示折叠页面元素引用卡，展开后显示结构化上下文', () => {
    const message: Message = {
      id: 'user-1',
      role: 'user',
      content: '翻译',
      contextReferences: [{
        id: 'ctx-1',
        kind: 'element',
        element: {
          kind: 'image',
          tagName: 'DIV',
          text: '被选中的页面元素内容',
          images: [{ url: 'https://example.com/picked.svg', name: 'picked.png' }],
        },
        source: { title: 'Bootstrap' },
        attachmentIds: ['img-1'],
      }],
      attachments: [{ type: 'image', id: 'img-1', name: 'webpack.png', mime: 'image/png', size: 3 }],
      createdAt: 1_730_000_000_000,
    };

    render(
      <MessageBubble
        message={message}
        onDelete={() => {}}
        onEdit={() => {}}
        isLast={false}
        isLoading={false}
      />,
    );

    expect(screen.getByText('页面元素引用')).toBeInTheDocument();
    expect(screen.getByText('图片 · div')).toBeInTheDocument();
    expect(screen.getByText('1 张图 · Bootstrap')).toBeInTheDocument();
    expect(screen.queryByText(/被选中的页面元素内容/)).not.toBeInTheDocument();
    expect(screen.queryByText('preview-image')).not.toBeInTheDocument();
    expect(getAttachmentBlobMock).not.toHaveBeenCalled();

    const card = screen.getByTestId('message-context-reference-card');
    const toggle = screen.getByTestId('message-context-reference-toggle');
    expect(card.className).toContain('focus-within:border-ring/50');
    expect(card.className).toContain('focus-within:ring-2');
    expect(toggle).toHaveAttribute('data-chat-scroll-stable-mutation', 'true');
    expect(toggle.className).toContain('focus-visible:outline-none');
    expect(toggle.className).toContain('focus-visible:ring-0');

    fireEvent.click(toggle);

    const body = screen.getByTestId('message-context-reference-body');
    expect(within(body).getByText('类型')).toBeInTheDocument();
    expect(within(body).getByText('来源')).toBeInTheDocument();
    expect(within(body).getByText('1 个附件已加入本次引用')).toBeInTheDocument();
    expect(within(body).queryByText('https://example.com/picked.svg')).not.toBeInTheDocument();
    expect(within(body).queryByText('被选中的页面元素内容')).not.toBeInTheDocument();
    expect(body).not.toHaveTextContent('页面元素引用：图片 · div');
    expect(body).not.toHaveTextContent('###');

    fireEvent.click(within(body).getByTestId('message-context-reference-full-toggle'));
    expect(screen.getByTestId('message-context-reference-full-content')).toHaveTextContent('被选中的页面元素内容');

    fireEvent.click(within(body).getByTestId('message-context-reference-technical-toggle'));
    const technical = screen.getByTestId('message-context-reference-technical-details');
    expect(technical).toHaveTextContent('picked.png');
    expect(technical).toHaveTextContent('https://example.com/picked.svg');
  });

  it('文本引用展开后默认只显示短预览，完整正文和技术字段二次展开', () => {
    const message: Message = {
      id: 'user-text-reference',
      role: 'user',
      content: '解释',
      contextReferences: [{
        id: 'ctx-text',
        kind: 'element',
        element: {
          kind: 'text',
          tagName: 'P',
          selector: 'main p.lead',
          text: 'Bootstrap selected content\n\nGet a jump on including Bootstrap source files.',
          charCount: 66,
        },
        source: { title: 'Bootstrap', url: 'https://getbootstrap.com/' },
        attachmentIds: [],
      }],
      createdAt: 1_730_000_000_000,
    };

    render(
      <MessageBubble
        message={message}
        onDelete={() => {}}
        onEdit={() => {}}
        isLast={false}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByTestId('message-context-reference-toggle'));

    const body = screen.getByTestId('message-context-reference-body');
    expect(within(body).getByText('约 66 字')).toBeInTheDocument();
    expect(screen.getByTestId('message-context-reference-text-preview')).toHaveTextContent('Bootstrap selected content Get a jump');
    expect(screen.queryByTestId('message-context-reference-text')).not.toBeInTheDocument();
    expect(within(body).queryByText('main p.lead')).not.toBeInTheDocument();
    expect(within(body).queryByText('https://getbootstrap.com/')).not.toBeInTheDocument();

    fireEvent.click(within(body).getByTestId('message-context-reference-full-toggle'));
    expect(screen.getByTestId('message-context-reference-text')).toHaveTextContent('Bootstrap selected content');
    expect(screen.getByTestId('message-context-reference-text')).toHaveTextContent('Get a jump on including Bootstrap source files.');

    fireEvent.click(within(body).getByTestId('message-context-reference-technical-toggle'));
    const technical = screen.getByTestId('message-context-reference-technical-details');
    expect(technical).toHaveTextContent('main p.lead');
    expect(technical).toHaveTextContent('https://getbootstrap.com/');
  });

  it('表格引用展开后默认显示紧凑预览，二级展开后显示完整原生表格', () => {
    const message: Message = {
      id: 'user-table-reference',
      role: 'user',
      content: '整理',
      contextReferences: [{
        id: 'ctx-table',
        kind: 'element',
        element: {
          kind: 'table',
          tagName: 'TABLE',
          table: {
            markdown: '| 项目 | 状态 |\n| --- | --- |\n| 选择元素 | 已重定位 |',
            headerCells: ['项目', '状态'],
            bodyRows: [['选择元素', '已重定位']],
            rows: 2,
            columns: 2,
          },
        },
        source: { title: 'Example Doc' },
        attachmentIds: [],
      }],
      createdAt: 1_730_000_000_000,
    };

    render(
      <MessageBubble
        message={message}
        onDelete={() => {}}
        onEdit={() => {}}
        isLast={false}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByTestId('message-context-reference-toggle'));

    const preview = screen.getByTestId('message-context-reference-table-preview');
    expect(within(preview).getByRole('columnheader', { name: '项目' })).toBeInTheDocument();
    expect(within(preview).getByRole('cell', { name: '选择元素' })).toBeInTheDocument();
    expect(screen.queryByTestId('message-context-reference-table')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('message-context-reference-full-toggle'));

    const table = screen.getByTestId('message-context-reference-table');
    expect(within(table).getByRole('columnheader', { name: '状态' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '已重定位' })).toBeInTheDocument();
    expect(screen.getByTestId('message-context-reference-full-content')).not.toHaveTextContent('页面元素引用：');
  });

  it('英文 UI 下展开元素引用卡不会混入扩展自有中文文案', () => {
    i18nMock.language = 'en-US';
    const message: Message = {
      id: 'user-2',
      role: 'user',
      content: 'Translate',
      contextReferences: [{
        id: 'ctx-1',
        kind: 'element',
        element: {
          kind: 'image',
          tagName: 'A',
          text: 'Selected page element content',
          images: [{ name: 'picked.png' }],
        },
        source: { title: 'Bootstrap' },
        attachmentIds: ['img-1'],
      }],
      attachments: [{ type: 'image', id: 'img-1', name: 'webpack.png', mime: 'image/png', size: 3 }],
      createdAt: 1_730_000_000_000,
    };

    render(
      <MessageBubble
        message={message}
        onDelete={() => {}}
        onEdit={() => {}}
        isLast={false}
        isLoading={false}
      />,
    );

    expect(screen.getByText('Page element')).toBeInTheDocument();
    expect(screen.getByText('Image · a')).toBeInTheDocument();
    expect(screen.getByText('1 images · Bootstrap')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('message-context-reference-toggle'));

    const body = screen.getByTestId('message-context-reference-body');
    expect(body).toHaveTextContent('Source');
    expect(body).toHaveTextContent('Bootstrap');
    expect(body).toHaveTextContent('1 attachments added to this reference');
    expect(body).not.toHaveTextContent('Selected page element content');
    expect(body).not.toHaveTextContent('Page element reference: Image · a');
    expect(body).not.toHaveTextContent(/页面元素引用|来源：|选择器：|图片|表格|文本|代码|视觉区域/);

    fireEvent.click(within(body).getByTestId('message-context-reference-full-toggle'));
    expect(screen.getByTestId('message-context-reference-full-content')).toHaveTextContent('Selected page element content');
  });

  it('用户消息存在 mentions 时会显示紧凑模型芯片并保留未知模型 fallback', () => {
    const message: Message = {
      id: 'user-mentions',
      role: 'user',
      content: '请分别回答',
      mentions: ['openai/gpt-5.4', 'unknown/model', 'openai/gpt-5.4'],
      createdAt: 1_730_000_000_000,
    };

    render(
      <MessageBubble
        message={message}
        onDelete={() => {}}
        onEdit={() => {}}
        isLast={false}
        isLoading={false}
        getModelLabel={(id) => (id === 'openai/gpt-5.4' ? 'GPT-5.4' : id)}
      />,
    );

    expect(screen.getByTestId('message-mentions')).toBeInTheDocument();
    expect(screen.getByText('@GPT-5.4')).toBeInTheDocument();
    expect(screen.getByText('@unknown/model')).toBeInTheDocument();
    expect(screen.getAllByText('@GPT-5.4')).toHaveLength(1);
    expect(screen.getByText('请分别回答')).toBeInTheDocument();
  });
});
