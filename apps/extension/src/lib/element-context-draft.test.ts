/**
 * 说明：`element-context-draft.test` 基础能力测试模块。
 *
 * 职责：
 * - 验证页面元素引用只保存结构化真源；
 * - 验证标题、摘要和 Markdown 会按当前语言即时生成；
 * - 守住 data URL / screenshot 这类不该持久化的大字段清理规则。
 */
import { describe, expect, it } from 'vitest';

import {
  buildElementContextRenderedContent,
  sanitizeElementActionPayload,
  type ElementContextTranslate,
} from './element-context-draft';
import { buildElementContextDetailModel } from './element-context-detail-model';
import type { ElementActionPayload } from '@/types/element-picker';

const dictionaries: Record<'zh-CN' | 'en-US', Record<string, string>> = {
  'zh-CN': {
    'elementContext.kind.image': '图片',
    'elementContext.kind.table': '表格',
    'elementContext.summary.image': '{{kind}} · {{tag}} · {{count}} 张图',
    'elementContext.summary.table': '{{kind}} · {{tag}} · {{rows}} 行 × {{columns}} 列',
    'elementContext.detail.label.type': '类型',
    'elementContext.detail.label.tag': '标签',
    'elementContext.detail.label.source': '来源',
    'elementContext.detail.label.url': 'URL',
    'elementContext.detail.label.selector': '选择器',
    'elementContext.detail.label.size': '规模',
    'elementContext.detail.value.tableSize': '{{rows}} 行 × {{columns}} 列',
    'elementContext.detail.value.regionSize': '{{width}} × {{height}} CSS px',
    'elementContext.detail.section.table': '表格',
    'elementContext.detail.empty.table': '(表格为空)',
    'elementContext.detail.generatedColumn': '列 {{index}}',
    'elementContext.detail.tableTruncated': "...(已截断，原表 {{rows}} 行)",
    'elementContext.detail.previewMoreRows': '仅预览前 {{count}} 行',
    'elementContext.markdown.heading': '页面元素引用：{{title}}',
    'elementContext.markdown.source': '来源：{{source}}',
    'elementContext.markdown.url': 'URL：{{url}}',
    'elementContext.markdown.selector': '选择器：{{selector}}',
    'elementContext.markdown.imageFallback': '图片 {{index}}',
    'elementContext.markdown.imageAttached': '[已作为附件加入]',
    'elementContext.markdown.imageAttachmentOnly': '(图片已作为附件加入)',
    'elementContext.markdown.generatedColumn': '列 {{index}}',
    'elementContext.markdown.tableTruncated': '...(已截断，原表 {{rows}} 行)',
  },
  'en-US': {
    'elementContext.kind.image': 'Image',
    'elementContext.kind.table': 'Table',
    'elementContext.summary.image': '{{kind}} · {{tag}} · {{count}} images',
    'elementContext.summary.table': '{{kind}} · {{tag}} · {{rows}} rows × {{columns}} columns',
    'elementContext.detail.label.type': 'Type',
    'elementContext.detail.label.tag': 'Tag',
    'elementContext.detail.label.source': 'Source',
    'elementContext.detail.label.url': 'URL',
    'elementContext.detail.label.selector': 'Selector',
    'elementContext.detail.label.size': 'Size',
    'elementContext.detail.value.tableSize': '{{rows}} rows × {{columns}} columns',
    'elementContext.detail.value.regionSize': '{{width}} × {{height}} CSS px',
    'elementContext.detail.section.table': 'Table',
    'elementContext.detail.empty.table': '(Table is empty)',
    'elementContext.detail.generatedColumn': 'Column {{index}}',
    'elementContext.detail.tableTruncated': "...(truncated, original table had {{rows}} rows)",
    'elementContext.detail.previewMoreRows': 'Previewing first {{count}} rows',
    'elementContext.markdown.heading': 'Page element reference: {{title}}',
    'elementContext.markdown.source': 'Source: {{source}}',
    'elementContext.markdown.url': 'URL: {{url}}',
    'elementContext.markdown.selector': 'Selector: {{selector}}',
    'elementContext.markdown.imageFallback': 'Image {{index}}',
    'elementContext.markdown.imageAttached': '[added as attachment]',
    'elementContext.markdown.imageAttachmentOnly': '(Image added as attachment)',
    'elementContext.markdown.generatedColumn': 'Column {{index}}',
    'elementContext.markdown.tableTruncated': "...(truncated, original table had {{rows}} rows)",
  },
};

/** 构造最小翻译函数。 */
function createT(language: 'zh-CN' | 'en-US'): ElementContextTranslate {
  return (key, params) => (dictionaries[language][key] ?? key)
    .replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(params?.[name] ?? ''));
}

describe('element-context-draft', () => {
  it('会按英文渲染图片元素引用，不混入扩展自有中文文案', () => {
    const payload: ElementActionPayload = {
      element: {
        kind: 'image',
        tagName: 'A',
        selector: 'a.hero',
        text: 'Selected element text',
        images: [{ name: 'picked.png' }],
      },
      source: { title: 'Example Page', url: 'https://example.com/page' },
    };

    const rendered = buildElementContextRenderedContent({ ...payload, attachmentIds: ['img-1'] }, createT('en-US'));

    expect(rendered.title).toBe('Image · a');
    expect(rendered.summary).toBe('Image · a · 1 images');
    expect(rendered.markdown).toContain('### Page element reference: Image · a');
    expect(rendered.markdown).toContain('Source: Example Page');
    expect(rendered.markdown).toContain('Selector: a.hero');
    expect(rendered.markdown).not.toMatch(/页面元素引用|来源：|选择器：|图片|表格|文本|代码|视觉区域/);
  });

  it('会按中文渲染表格自动列名和截断提示', () => {
    const payload: ElementActionPayload = {
      element: {
        kind: 'table',
        tagName: 'TABLE',
        table: {
          markdown: '',
          bodyRows: [['咖啡', '18']],
          generatedHeader: true,
          truncated: true,
          rows: 45,
          columns: 2,
        },
      },
    };

    const rendered = buildElementContextRenderedContent({ ...payload, attachmentIds: [] }, createT('zh-CN'));

    expect(rendered.markdown).toContain('| 列 1 | 列 2 |');
    expect(rendered.markdown).toContain('...(已截断，原表 45 行)');
  });

  it('会为历史引用卡生成不含 Markdown 标题的结构化详情模型', () => {
    const payload: ElementActionPayload = {
      element: {
        kind: 'table',
        tagName: 'TABLE',
        selector: 'main table.pricing',
        table: {
          markdown: '',
          bodyRows: [['咖啡', '18']],
          generatedHeader: true,
          rows: 1,
          columns: 2,
        },
      },
      source: { title: 'Example Page', url: 'https://example.com/page' },
    };

    const detail = buildElementContextDetailModel({ ...payload, attachmentIds: [] }, createT('zh-CN'));

    expect(detail.title).toBe('表格 · table');
    expect(detail.headerDetails).toEqual(['1 行 × 2 列', 'Example Page']);
    expect(detail.primaryMetadata).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: '来源', value: 'Example Page' }),
      expect.objectContaining({ label: '规模', value: '1 行 × 2 列' }),
    ]));
    expect(detail.advancedMetadata).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'URL', value: 'https://example.com/page', href: 'https://example.com/page' }),
      expect.objectContaining({ label: '选择器', value: 'main table.pricing' }),
    ]));
    expect(detail.preview).toEqual(expect.objectContaining({
      kind: 'table',
      headers: ['列 1', '列 2'],
      rows: [['咖啡', '18']],
    }));
    expect(detail.fullBody).toEqual(expect.objectContaining({
      kind: 'table',
      headers: ['列 1', '列 2'],
      rows: [['咖啡', '18']],
    }));
    expect(JSON.stringify(detail)).not.toContain('页面元素引用：');
    expect(JSON.stringify(detail)).not.toContain('###');
  });

  it('会清理 data URL、截图和旧字符串字段', () => {
    const sanitized = sanitizeElementActionPayload({
      element: {
        kind: 'image',
        tagName: 'IMG',
        title: '图片 · img',
        summary: '图片 · img · 1 张图',
        modelContext: '### 页面元素引用：图片 · img',
        images: [{ dataUrl: 'data:image/png;base64,AAAA', alt: '页面原文 alt', name: 'picked.png' }],
        visual: {
          rect: { x: 1, y: 2, width: 3, height: 4 },
          viewport: { width: 100, height: 100, scrollX: 0, scrollY: 0, devicePixelRatio: 1 },
          screenshot: { dataUrl: 'data:image/png;base64,BBBB' },
        },
      },
      source: { title: 'Example' },
    });

    expect(sanitized?.element).not.toHaveProperty('summary');
    expect(sanitized?.element).not.toHaveProperty('modelContext');
    expect(sanitized?.element.images?.[0]).not.toHaveProperty('dataUrl');
    expect(sanitized?.element.visual).toBeUndefined();
  });
});
