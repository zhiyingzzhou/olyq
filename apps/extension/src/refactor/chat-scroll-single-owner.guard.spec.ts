/**
 * 说明：`chat-scroll-single-owner.guard.spec` 源码模块。
 *
 * 职责：
 * - 把主聊天区“虚拟化门面单一滚动 owner”固化成静态 guard；
 * - 禁止 `chat-area` 运行时代码在 `useChatAreaVirtualizer.ts` 之外直接写 DOM 滚动；
 * - 禁止 `loadedCount / visibleMessages / visibleStartIndex` 这类第二窗口化状态回流。
 *
 * 边界：
 * - compare 卡片内部联动滚动是独立已锁定真源，不属于本 guard 范围；
 * - 测试文件不在本 guard 范围内。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHAT_AREA_ROOT = 'components/chat/chat-area';
const CHAT_SEARCH_EFFECTS_FILE = 'components/chat/hooks/useChatSearchDomEffects.ts';
const CHAT_UTILS_FILE = 'lib/chat/chat-utils.ts';
const SCROLL_OWNER_FILE = 'components/chat/chat-area/useChatAreaVirtualizer.ts';
const DIRECT_SCROLL_WRITE_PATTERN = /(?:\.\s*scrollTop\s*(?:=|\+=|-=)|\.\s*scrollTo\s*\()/;
const DOUBLE_WINDOWING_PATTERN = /\b(?:loadedCount|visibleMessages|visibleStartIndex)\b/;
const MIXED_NAVIGATION_PATTERN = /\b(?:queueExternalJump|requestJumpToMessage)\b/;

/**
 * 递归列出某个运行时目录下的 TypeScript 源文件。
 *
 * @param relativeDirectory - 相对 `src` 的目录。
 * @returns 非测试运行时代码路径列表。
 */
function listRuntimeFiles(relativeDirectory: string): string[] {
  const absoluteDirectory = path.join(SRC_ROOT, relativeDirectory);
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) return listRuntimeFiles(relativePath);
    if (!entry.isFile()) return [];
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (/\.(spec|test)\.(ts|tsx)$/.test(entry.name)) return [];
    return [relativePath];
  });
}

/**
 * 读取主聊天滚动相关的运行时代码文件。
 *
 * @returns 当前 guard 覆盖的源文件路径。
 */
function listGuardedChatScrollFiles() {
  return [
    ...listRuntimeFiles(CHAT_AREA_ROOT),
    CHAT_SEARCH_EFFECTS_FILE,
    CHAT_UTILS_FILE,
  ];
}

describe('chat scroll single-owner guard', () => {
  it('forbids direct DOM scroll writes outside the chat virtualizer facade', () => {
    const offenders = listGuardedChatScrollFiles()
      .filter((relativePath) => relativePath !== SCROLL_OWNER_FILE)
      .filter((relativePath) => {
        const sourceText = fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');
        return DIRECT_SCROLL_WRITE_PATTERN.test(sourceText);
      })
      .map((relativePath) => (
        `${relativePath}: 主聊天滚动写入只能走 useChatAreaVirtualizer 门面，禁止外层直接 scrollTop/scrollTo`
      ));

    expect(offenders).toEqual([]);
  });

  it('forbids reintroducing loadedCount based double-windowing in the main chat path', () => {
    const offenders = listGuardedChatScrollFiles()
      .filter((relativePath) => {
        const sourceText = fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');
        return DOUBLE_WINDOWING_PATTERN.test(sourceText);
      })
      .map((relativePath) => (
        `${relativePath}: 主聊天完整历史必须直接进入 TanStack Virtual row model，禁止恢复 loadedCount/visibleMessages/visibleStartIndex`
      ));

    expect(offenders).toEqual([]);
  });

  it('forbids routing ask navigation back through the old search/external jump queue', () => {
    const offenders = listGuardedChatScrollFiles()
      .filter((relativePath) => {
        const sourceText = fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');
        return MIXED_NAVIGATION_PATTERN.test(sourceText);
      })
      .map((relativePath) => (
        `${relativePath}: 主聊天 ask 锚点导航必须直接走 virtualizer anchor jump，不得恢复 queueExternalJump/requestJumpToMessage 混合链路`
      ));

    expect(offenders).toEqual([]);
  });
});
