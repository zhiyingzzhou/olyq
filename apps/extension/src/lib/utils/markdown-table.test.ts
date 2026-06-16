/**
 * 说明：`markdown-table.test` Markdown 表格工具测试。
 *
 * 职责：
 * - 固化表格 cell 的管道符、反斜杠和空白规整语义；
 * - 防止各模块恢复局部正则替换造成不完整转义。
 */
import { describe, expect, it } from 'vitest';

import { escapeMarkdownTableCell } from './markdown-table';

describe('markdown-table', () => {
  it('按字符转义反斜杠和竖线，并压缩空白', () => {
    expect(escapeMarkdownTableCell('  A | B \\\\ C\nD  ')).toBe('A \\| B \\\\\\\\ C D');
  });
});
