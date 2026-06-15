/**
 * 说明：`chat-passive-surface-shadow.guard` 源码模块。
 *
 * 职责：
 * - 固化主聊天默认路径里的被动 surface 平面视觉契约；
 * - 防止 Tailwind 阴影 token 升级或局部样式回退再次把输入框、普通 AI 消息和欢迎/过程块渲染成浮起卡片。
 *
 * 边界：
 * - 本 guard 只检查主聊天默认阅读与输入路径的被动 surface；
 * - 附件预览、引用卡、compare 列卡、popover、modal、bottom banner 和选中态属于显式卡片/浮层/状态语义，不在本 guard 范围内。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(SRC_ROOT, '..');

/** 读取仓库源码文件。 */
function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

/**
 * 截取 marker 附近的源码片段。
 *
 * 静态 guard 只需要确认目标 surface 的 class contract，截取局部片段可以避免误伤同文件内
 * 其它有明确对象语义的阴影，例如附件缩略图和删除按钮。
 */
function snippetFrom(sourceText: string, marker: string, radius = 420) {
  const index = sourceText.indexOf(marker);
  expect(index, `missing marker: ${marker}`).toBeGreaterThanOrEqual(0);
  return sourceText.slice(index, index + marker.length + radius);
}

describe('chat passive surface shadow guard', () => {
  it('主聊天默认被动 surface 不使用 Tailwind shadow utility', () => {
    const guardedSnippets = [
      snippetFrom(
        readRepoFile('src/components/chat/message-bubble/useMessageBubbleView.tsx'),
        'border border-border/50 bg-card px-4 py-3 shadow-none',
      ),
      snippetFrom(
        readRepoFile('src/components/chat/message-bubble/useMessageBubbleView.tsx'),
        'border border-border/60 bg-card px-3.5 py-2.5 text-foreground shadow-none',
        360,
      ),
      snippetFrom(
        readRepoFile('src/components/chat/WebSearchResultsBlock.tsx'),
        'mb-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2 shadow-none',
      ),
      snippetFrom(
        readRepoFile('src/components/chat/WebSearchResultsBlock.tsx'),
        'mb-2 overflow-hidden rounded-xl border border-border/50 bg-muted/20 shadow-none',
      ),
      snippetFrom(
        readRepoFile('src/components/chat/WelcomeDemo.tsx'),
        'data-testid="welcome-demo-assistant-surface"',
      ),
      snippetFrom(
        readRepoFile('src/components/chat/WelcomeEmptyState.tsx'),
        'data-testid="welcome-empty-state-panel"',
      ),
      snippetFrom(
        readRepoFile('src/components/chat/WelcomeEmptyState.tsx'),
        'data-testid="welcome-empty-state-feature-card"',
      ),
      snippetFrom(
        readRepoFile('src/components/chat/chat-input/ChatInputLayout.tsx'),
        'data-chat-composer-shell',
      ),
    ];

    for (const snippet of guardedSnippets) {
      expect(snippet).toContain('shadow-none');
      expect(snippet).not.toContain('shadow-sm');
      expect(snippet).not.toContain('shadow-md');
      expect(snippet).not.toContain('group-hover:shadow-md');
    }
  });
});
