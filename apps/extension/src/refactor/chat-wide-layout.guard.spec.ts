/**
 * 说明：`chat-wide-layout.guard` 源码模块。
 *
 * 职责：
 * - 固化主聊天页面容器的宽度契约；
 * - 防止聊天列表和输入区重新回到窄居中的 `max-w-4xl` 页面级限制；
 * - 要求消息列表、加载态和输入区共享同一条受控阅读列，避免宽屏假铺满。
 *
 * 边界：
 * - 本 guard 只检查主聊天阅读列真源；
 * - user / assistant lane 的细节仍由 MessageBubble 组件测试覆盖。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 读取源码文件内容。
 *
 * @param relativePath - 相对 `src` 的文件路径。
 * @returns 源码文本。
 */
function readSource(relativePath: string) {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');
}

describe('chat wide layout guard', () => {
  it('主聊天阅读列使用统一 64rem 宽度常量', () => {
    const sourceText = readSource('components/chat/chat-layout-classes.ts');

    expect(sourceText).toContain("CHAT_READING_COLUMN_CLASS = 'mx-auto w-full max-w-[64rem]'");
  });

  it('聊天列表与加载态不再使用页面级 max-w-4xl 限制', () => {
    const sourceText = readSource('components/chat/chat-area/ChatAreaContent.tsx');

    expect(sourceText).toContain('data-testid="chat-virtual-content"');
    expect(sourceText).not.toContain('max-w-4xl');
    expect(sourceText).toContain('CHAT_READING_COLUMN_CLASS');
  });

  it('聊天输入区外壳不再使用页面级 max-w-4xl 限制', () => {
    const sourceText = readSource('components/chat/chat-input/ChatInputLayout.tsx');

    expect(sourceText).not.toContain('max-w-4xl');
    expect(sourceText).toContain('CHAT_READING_COLUMN_CLASS');
  });

  it('assistant 普通消息 lane 不再使用相对 85% 撑宽屏', () => {
    const sourceText = readSource('components/chat/message-bubble/useMessageBubbleView.tsx');

    expect(sourceText).not.toContain('w-full max-w-[85%]');
    expect(sourceText).toContain('w-fit max-w-[min(72%,42rem)]');
  });

  it('Markdown 代码块使用内部横向滚动，不强制长行换行', () => {
    const sourceText = readSource('components/chat/MarkdownRendererImpl.tsx');

    expect(sourceText).not.toContain('wrapLongLines');
    expect(sourceText).toContain("overflowX: 'auto'");
    expect(sourceText).toContain('overflow-x-auto whitespace-pre');
  });
});
