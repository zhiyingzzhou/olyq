/**
 * 说明：`useRenameableTopicRow.spec` 测试模块。
 *
 * 职责：
 * - 覆盖话题行单击选中 / 双击重命名的时间窗口判定；
 * - 锁定自动化环境下第二次 click `detail` 不可靠时的回归。
 *
 * 边界：
 * - 本文件只验证 hook 的本地交互时序，不承担 TopicSidebar 的完整集成回归。
 */
import { act, renderHook } from '@testing-library/react';
import type { MouseEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRenameableTopicRow } from './useRenameableTopicRow';

/**
 * 测试辅助函数：`createClickEvent`。
 *
 * @remarks
 * 构造满足 hook 判定所需最小字段的 click 事件对象，避免把测试耦合到真实 DOM。
 */
function createClickEvent(detail = 1) {
  return {
    detail,
    preventDefault: vi.fn(),
  } as unknown as MouseEvent<HTMLElement>;
}

describe('useRenameableTopicRow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-07T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('单击在双击窗口结束后才提交选中', () => {
    const onSelect = vi.fn();
    const onStartRename = vi.fn();
    const { result } = renderHook(() => useRenameableTopicRow({
      onSelect,
      onStartRename,
    }));

    act(() => {
      result.current.handleClick(createClickEvent());
    });

    act(() => {
      vi.advanceTimersByTime(279);
    });

    expect(onSelect).not.toHaveBeenCalled();
    expect(onStartRename).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onStartRename).not.toHaveBeenCalled();
  });

  it('两次快速 click 即使 detail 都是 1，也应该进入重命名', () => {
    const onSelect = vi.fn();
    const onStartRename = vi.fn();
    const { result } = renderHook(() => useRenameableTopicRow({
      onSelect,
      onStartRename,
    }));

    act(() => {
      result.current.handleClick(createClickEvent(1));
      vi.advanceTimersByTime(220);
      vi.setSystemTime(new Date('2026-04-07T10:00:00.220Z'));
      result.current.handleClick(createClickEvent(1));
    });

    expect(onStartRename).toHaveBeenCalledOnce();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('原生 dblclick 兜底也会取消待执行的单击选中', () => {
    const onSelect = vi.fn();
    const onStartRename = vi.fn();
    const { result } = renderHook(() => useRenameableTopicRow({
      onSelect,
      onStartRename,
    }));

    act(() => {
      result.current.handleClick(createClickEvent(1));
      vi.advanceTimersByTime(120);
      result.current.handleDoubleClick(createClickEvent(2));
    });

    expect(onStartRename).toHaveBeenCalledOnce();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onSelect).not.toHaveBeenCalled();
  });
});
