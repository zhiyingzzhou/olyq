/**
 * 说明：`schema-migration-engine.spec` 持久化模块。
 *
 * 职责：
 * - 承载 `schema-migration-engine.spec` 相关的当前文件实现与模块边界；
 * - 为当前目录提供内聚的实现或视图装配能力；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  readPersistedPaintWorkspace,
  writePersistedPaintWorkspace,
} from '@/lib/workspaces/paint-workspace';
import { PROVIDERS_STORAGE_KEY } from '@/lib/ai/storage-keys';
import { writeBootstrapStoredJsonMirror } from '@/lib/storage/json-storage';
import { getStorageAdapter } from '@/lib/storage/storage-adapter';
import { readWorkspaceSnapshot, writeWorkspaceSnapshot } from './workspace-db';
import { runStartupPersistenceMigrations } from './schema-migration-engine';

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

describe('runStartupPersistenceMigrations', () => {
  beforeEach(async () => {
    localStorage.clear();
    await deleteDb('olyq.persistence.workspace.v1');
  });

  it('对当前 v1 workspace 数据重复执行也是幂等的', async () => {
    if (typeof indexedDB === 'undefined') return;

    await writePersistedPaintWorkspace({
      paintings: [{
      id: 'paint-1',
      title: 'paint-1',
      model: '',
      prompt: 'paint prompt',
      params: { n: 1 },
      inputImages: [],
      outputImages: [],
      createdAt: 1,
      updatedAt: 1,
      }],
      activePaintingId: 'paint-1',
    });

    await runStartupPersistenceMigrations();
    await runStartupPersistenceMigrations();

    await expect(readPersistedPaintWorkspace()).resolves.toMatchObject({
      activePaintingId: 'paint-1',
      paintings: [
        expect.objectContaining({ id: 'paint-1', title: 'paint-1' }),
      ],
    });
  });

  it('启动迁移会删除已下线的 Video 工作区持久化残留', async () => {
    await writeWorkspaceSnapshot('video.workspace.v1', {
      generations: [{ id: 'video-1' }],
      activeGenerationId: 'video-1',
    });
    writeBootstrapStoredJsonMirror('olyq.video.workspace.v1', {
      generations: [{ id: 'video-1' }],
      activeGenerationId: 'video-1',
    });

    await runStartupPersistenceMigrations();
    await runStartupPersistenceMigrations();

    await expect(readWorkspaceSnapshot('video.workspace.v1')).resolves.toBeNull();
    expect(localStorage.getItem('__olyq.bootstrap__.olyq.video.workspace.v1')).toBeNull();
  });

  it('启动迁移会拆分旧多模态开关，并为 OCR 家族补图片 hints 且保持幂等', async () => {
    await getStorageAdapter().set({
      [PROVIDERS_STORAGE_KEY]: [
        {
          id: 'together',
          name: 'Together',
          type: 'openai',
          apiOptions: {
            isNotSupportArrayContent: true,
          },
          models: [
            {
              id: 'deepseek-ai/deepseek-ocr-2',
              name: 'DeepSeek OCR 2',
              kindHint: 'chat',
              inputModalities: ['text'],
              outputModalities: ['text'],
              features: ['tool-call'],
              manualModelTypes: ['vision'],
            },
          ],
        },
      ],
    });

    await runStartupPersistenceMigrations();
    const firstSnapshot = await getStorageAdapter().get([PROVIDERS_STORAGE_KEY]);
    await runStartupPersistenceMigrations();
    const secondSnapshot = await getStorageAdapter().get([PROVIDERS_STORAGE_KEY]);

    expect(firstSnapshot[PROVIDERS_STORAGE_KEY]).toEqual([
      {
        id: 'together',
        name: 'Together',
        type: 'openai',
        apiOptions: {
          isNotSupportImageInput: true,
          isNotSupportFileInput: true,
        },
        models: [
          {
            id: 'deepseek-ai/deepseek-ocr-2',
            name: 'DeepSeek OCR 2',
            kindHint: 'multimodal-chat',
            inputModalities: ['text', 'image'],
            outputModalities: ['text'],
            features: ['tool-call', 'vision-input'],
            manualModelTypes: ['vision'],
          },
        ],
      },
    ]);
    expect(secondSnapshot[PROVIDERS_STORAGE_KEY]).toEqual(firstSnapshot[PROVIDERS_STORAGE_KEY]);
  });
});
