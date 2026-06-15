/**
 * 说明：`AssistantBrowserContent.drag-session.spec` 测试模块。
 *
 * 职责：
 * - 覆盖助手拖拽会话的快照冻结语义；
 * - 覆盖拖拽会话的最终落位索引解析。
 *
 * 边界：
 * - 本文件只验证纯函数；
 * - 不承担 React 渲染、真实 pointer 轨迹或 store 写入回归。
 */
import { describe, expect, it } from 'vitest';

import {
  createAssistantBrowserDragSessionSnapshot,
  resolveAssistantDropIndex,
} from './AssistantBrowserContent.drag-session';

describe('AssistantBrowserContent.drag-session', () => {
  it('createAssistantBrowserDragSessionSnapshot 会冻结 sortType 与 collapsedTags 副本', () => {
    const collapsedTags = {
      写作: true,
      开发: false,
    };

    const snapshot = createAssistantBrowserDragSessionSnapshot('tags', collapsedTags);

    expect(snapshot).toEqual({
      sortType: 'tags',
      collapsedTags: {
        写作: true,
        开发: false,
      },
    });
    expect(snapshot.collapsedTags).not.toBe(collapsedTags);
  });

  it('resolveAssistantDropIndex 优先使用 source.index，必要时再回退 target.index', () => {
    expect(resolveAssistantDropIndex({
      sourceIndex: 0,
      sourceInitialIndex: 3,
      targetIndex: 1,
    })).toBe(0);

    expect(resolveAssistantDropIndex({
      sourceIndex: 3,
      sourceInitialIndex: 3,
      targetIndex: 1,
    })).toBe(1);

    expect(resolveAssistantDropIndex({
      sourceIndex: 3,
      sourceInitialIndex: 3,
      targetIndex: 3,
    })).toBeNull();
  });

  it('resolveAssistantDropIndex 会忽略无效索引', () => {
    expect(resolveAssistantDropIndex({
      sourceIndex: -1,
      sourceInitialIndex: 2,
      targetIndex: null,
    })).toBeNull();

    expect(resolveAssistantDropIndex({
      sourceIndex: Number.NaN,
      sourceInitialIndex: 2,
      targetIndex: 4.2,
    })).toBeNull();
  });
});
