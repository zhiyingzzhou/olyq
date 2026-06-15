/**
 * 说明：`chat-pipeline-activity` 后台 activity 归一化测试。
 *
 * 职责：
 * - 固化聊天前置 pipeline heartbeat 的唯一 owner 语义；
 * - 防止后台长任务再各自散落 interval、伪造正文或吞掉原始异常。
 */
import { describe, expect, it, vi } from 'vitest';

import {
  CHAT_PIPELINE_ACTIVITY_HEARTBEAT_MS,
  emitChatPipelineProgress,
  runWithChatPipelineHeartbeat,
} from './chat-pipeline-activity';

describe('chat-pipeline-activity', () => {
  it('任务开始时立即发送一次 progress，并在 pending 期间按固定间隔续发', async () => {
    vi.useFakeTimers();
    try {
      const emitProgress = vi.fn();
      let resolveTask!: (value: string) => void;
      const run = runWithChatPipelineHeartbeat(
        { requestId: 'req-activity', emitProgress },
        'tool-collection',
        () => new Promise<string>((resolve) => {
          resolveTask = resolve;
        }),
      );

      expect(emitProgress).toHaveBeenCalledTimes(1);
      expect(emitProgress).toHaveBeenCalledWith({ type: 'chat/progress', stage: 'tool-collection' });

      await vi.advanceTimersByTimeAsync(CHAT_PIPELINE_ACTIVITY_HEARTBEAT_MS);
      expect(emitProgress).toHaveBeenCalledTimes(2);

      resolveTask('ok');
      await expect(run).resolves.toBe('ok');

      await vi.advanceTimersByTimeAsync(CHAT_PIPELINE_ACTIVITY_HEARTBEAT_MS);
      expect(emitProgress).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('task reject 时原样抛出异常，并停止 heartbeat', async () => {
    vi.useFakeTimers();
    try {
      const emitProgress = vi.fn();
      let rejectTask!: (reason: Error) => void;
      const error = new Error('boom');
      const run = runWithChatPipelineHeartbeat(
        { requestId: 'req-reject', emitProgress },
        'web-search-execution',
        () => new Promise<never>((_, reject) => {
          rejectTask = reject;
        }),
      );

      rejectTask(error);
      await expect(run).rejects.toBe(error);

      await vi.advanceTimersByTimeAsync(CHAT_PIPELINE_ACTIVITY_HEARTBEAT_MS);
      expect(emitProgress).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Abort 后停止 heartbeat，但不替原任务改写 resolve 语义', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const emitProgress = vi.fn();
      let resolveTask!: (value: string) => void;
      const run = runWithChatPipelineHeartbeat(
        { requestId: 'req-abort', signal: controller.signal, emitProgress },
        'memory-tool-execution',
        () => new Promise<string>((resolve) => {
          resolveTask = resolve;
        }),
      );

      expect(emitProgress).toHaveBeenCalledTimes(1);
      controller.abort();
      await vi.advanceTimersByTimeAsync(CHAT_PIPELINE_ACTIVITY_HEARTBEAT_MS * 2);
      expect(emitProgress).toHaveBeenCalledTimes(1);

      resolveTask('still-original-result');
      await expect(run).resolves.toBe('still-original-result');
    } finally {
      vi.useRealTimers();
    }
  });

  it('signal 已经 aborted 时不发送 progress，也不启动 heartbeat', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      controller.abort();
      const emitProgress = vi.fn();

      await expect(runWithChatPipelineHeartbeat(
        { requestId: 'req-already-aborted', signal: controller.signal, emitProgress },
        'web-search-planning',
        async () => 'ok',
      )).resolves.toBe('ok');

      await vi.advanceTimersByTimeAsync(CHAT_PIPELINE_ACTIVITY_HEARTBEAT_MS);
      expect(emitProgress).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('emitChatPipelineProgress 只发送内部 progress 事件', () => {
    const emitProgress = vi.fn();

    emitChatPipelineProgress({ requestId: 'req-direct', emitProgress }, 'mcp-tool-listing');

    expect(emitProgress).toHaveBeenCalledWith({ type: 'chat/progress', stage: 'mcp-tool-listing' });
  });
});
