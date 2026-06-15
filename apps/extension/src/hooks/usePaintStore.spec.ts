/**
 * 说明：`usePaintStore.spec` Hook 模块。
 *
 * 职责：
 * - 承载 `usePaintStore.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteAttachmentsMock } = vi.hoisted(() => ({
  deleteAttachmentsMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/attachments', () => ({
  deleteAttachments: deleteAttachmentsMock,
}));

import { usePaintStore, type Painting } from './usePaintStore';

/**
 * 测试辅助函数：`deleteDb`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function deleteDb(name: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * 测试辅助函数：`createPainting`。
 *
 * @remarks
 * 用于当前测试或 E2E 文件中的场景搭建、事件驱动或断言准备，不作为运行时代码复用。
 */
function createPainting(overrides: Partial<Painting>): Painting {
  return {
    id: 'paint-1',
    title: 'demo',
    model: '',
    prompt: '',
    params: { n: 1 },
    inputImages: [],
    outputImages: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('usePaintStore attachment cleanup', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    await deleteDb('olyq.persistence.workspace.v1');
    usePaintStore.setState({ paintings: [], activePaintingId: null });
  });

  it('删除输入图时会回收已不再引用的附件', () => {
    usePaintStore.setState({
      paintings: [
        createPainting({
          inputImages: [{ id: 'att-input-1', name: 'input.png', mime: 'image/png', size: 1 }],
        }),
      ],
      activePaintingId: 'paint-1',
    });

    usePaintStore.getState().patchPainting('paint-1', { inputImages: [] });

    expect(deleteAttachmentsMock).toHaveBeenCalledWith(['att-input-1']);
  });

  it('覆盖输出图时只回收旧的未引用附件', () => {
    usePaintStore.setState({
      paintings: [
        createPainting({
          id: 'paint-1',
          outputImages: [{ id: 'shared-output', name: 'old.png', mime: 'image/png', size: 1 }],
        }),
        createPainting({
          id: 'paint-2',
          outputImages: [{ id: 'shared-output', name: 'old.png', mime: 'image/png', size: 1 }],
        }),
      ],
      activePaintingId: 'paint-1',
    });

    usePaintStore.getState().patchPainting('paint-1', {
      outputImages: [{ id: 'new-output', name: 'new.png', mime: 'image/png', size: 1 }],
    });

    expect(deleteAttachmentsMock).not.toHaveBeenCalledWith(['shared-output']);

    usePaintStore.getState().patchPainting('paint-2', { outputImages: [] });

    expect(deleteAttachmentsMock).toHaveBeenCalledWith(['shared-output']);
  });

  it('删除绘画记录时不会删除仍被其他绘画引用的附件', () => {
    usePaintStore.setState({
      paintings: [
        createPainting({
          id: 'paint-1',
          outputImages: [{ id: 'shared-output', name: 'shared.png', mime: 'image/png', size: 1 }],
        }),
        createPainting({
          id: 'paint-2',
          outputImages: [{ id: 'shared-output', name: 'shared.png', mime: 'image/png', size: 1 }],
        }),
      ],
      activePaintingId: 'paint-1',
    });

    usePaintStore.getState().deletePainting('paint-1');

    expect(deleteAttachmentsMock).not.toHaveBeenCalledWith(['shared-output']);
  });
});
