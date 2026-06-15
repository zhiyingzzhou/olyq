/**
 * 说明：`usePaintStore` Hook 模块。
 *
 * 职责：
 * - 承载 `usePaintStore` 相关的当前文件实现与模块边界；
 * - 对外暴露 `PaintingPatch`、`UsePaintStore`、`usePaintStore` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { createWithEqualityFn } from 'zustand/traditional';
import { subscribeWithSelector } from 'zustand/middleware';
import { deleteAttachments } from '@/lib/attachments';
import { registerPendingWriteFlusher } from '@/lib/storage/pending-write-flushers';
import { subscribeStoreReloadSignal } from '@/lib/storage/reload-signal';
import { writeBootstrapStoredJsonMirror } from '@/lib/storage/json-storage';
import { createId } from '@/lib/utils/id';
import { logger } from '@/lib/logger';
import {
  PAINT_WORKSPACE_BOOTSTRAP_KEY,
  readPaintWorkspaceBootstrapSeed,
  readPersistedPaintWorkspace,
  type Painting,
  type PaintingParams,
  type PaintWorkspaceSnapshot,
  writePersistedPaintWorkspace,
} from '@/lib/workspaces/paint-workspace';

export type { Painting, PaintingImageRef, PaintingParams } from '@/lib/workspaces/paint-workspace';

/** 导出类型：`PaintingPatch`。 */
export type PaintingPatch = Partial<Omit<Painting, 'id' | 'createdAt' | 'params'>> & {
  params?: Partial<PaintingParams>;
};

/**
 * 内部函数：`defaultTitleFromPrompt`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function defaultTitleFromPrompt(prompt: string) {
  const s = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (!s) return '未命名绘画';
  return s.length > 18 ? `${s.slice(0, 18)}…` : s;
}

/**
 * 内部函数：`collectAttachmentIdsFromPainting`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function collectAttachmentIdsFromPainting(painting: Painting) {
  return Array.from(new Set([
    ...painting.inputImages.map((x) => x.id),
    ...painting.outputImages.map((x) => x.id),
  ].filter(Boolean)));
}

/**
 * 内部函数：`collectReferencedAttachmentIds`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function collectReferencedAttachmentIds(list: Painting[]) {
  return new Set(list.flatMap((painting) => collectAttachmentIdsFromPainting(painting)));
}

let pendingSnapshot: PaintWorkspaceSnapshot | null = null;
let writeDrainPromise: Promise<void> | null = null;

/**
 * 内部函数：`schedulePersist`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function schedulePersist(snapshot: PaintWorkspaceSnapshot) {
  pendingSnapshot = snapshot;
  writeBootstrapStoredJsonMirror(PAINT_WORKSPACE_BOOTSTRAP_KEY, snapshot);
  if (writeDrainPromise) return;
  writeDrainPromise = (async () => {
    while (pendingSnapshot) {
      const next = pendingSnapshot;
      pendingSnapshot = null;
      await writePersistedPaintWorkspace(next);
    }
  })().finally(() => {
    writeDrainPromise = null;
    if (pendingSnapshot) schedulePersist(pendingSnapshot);
  });
}

/**
 * 内部函数：`flushPendingPaintWrites`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function flushPendingPaintWrites() {
  const inflight = writeDrainPromise;
  if (inflight) await inflight;
}

/**
 * 内部函数：`reloadPersistedSnapshot`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function reloadPersistedSnapshot(store: Pick<PaintStoreHook, 'setState'>) {
  const snapshot = await readPersistedPaintWorkspace();
  store.setState({
    paintings: snapshot.paintings,
    activePaintingId: snapshot.activePaintingId,
  });
}

interface PaintStore {
  paintings: Painting[];
  activePaintingId: string | null;
  reloadFromStorage: () => void;
  setActivePaintingId: (id: string | null) => void;
  createPainting: (seed?: Partial<Pick<Painting, 'model' | 'prompt' | 'params'>>) => string;
  patchPainting: (id: string, patch: PaintingPatch) => void;
  deletePainting: (id: string) => void;
  clearAll: () => void;
}

/**
 * 内部函数：`createPaintStore`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function createPaintStore() {
  const seed = readPaintWorkspaceBootstrapSeed();
  return createWithEqualityFn<PaintStore>()(
    subscribeWithSelector((set, get) => ({
      paintings: seed.paintings,
      activePaintingId: seed.activePaintingId,

      reloadFromStorage: () => {
        void reloadPersistedSnapshot(usePaintStore);
      },

      setActivePaintingId: (id) => {
        const next = typeof id === 'string' && id.trim() ? id.trim() : null;
        set({ activePaintingId: next });
        schedulePersist({ paintings: get().paintings, activePaintingId: next });
      },

      createPainting: (seedValue) => {
        const id = createId();
        const now = Date.now();
        const model = typeof seedValue?.model === 'string' ? seedValue.model.trim() : '';
        const prompt = typeof seedValue?.prompt === 'string' ? seedValue.prompt : '';
        const paramsSeed: Partial<PaintingParams> = seedValue?.params ?? {};

        const painting: Painting = {
          id,
          title: defaultTitleFromPrompt(prompt),
          model,
          prompt,
          params: {
            n: typeof paramsSeed.n === 'number' && Number.isFinite(paramsSeed.n) ? Math.max(1, Math.min(10, Math.floor(paramsSeed.n))) : 1,
            ...(typeof paramsSeed.size === 'string' && paramsSeed.size.trim() ? { size: paramsSeed.size.trim() } : {}),
            ...(typeof paramsSeed.aspectRatio === 'string' && paramsSeed.aspectRatio.trim() ? { aspectRatio: paramsSeed.aspectRatio.trim() } : {}),
            ...(typeof paramsSeed.seed === 'number' && Number.isFinite(paramsSeed.seed) ? { seed: Math.floor(paramsSeed.seed) } : {}),
            ...(typeof paramsSeed.quality === 'string' && paramsSeed.quality.trim() ? { quality: paramsSeed.quality.trim() } : {}),
            ...(typeof paramsSeed.providerOptionsJson === 'string' && paramsSeed.providerOptionsJson.trim() ? { providerOptionsJson: paramsSeed.providerOptionsJson.trim() } : {}),
          },
          inputImages: [],
          outputImages: [],
          createdAt: now,
          updatedAt: now,
        };

        const nextPaintings = [painting, ...get().paintings];
        set({ paintings: nextPaintings, activePaintingId: id });
        schedulePersist({ paintings: nextPaintings, activePaintingId: id });
        return id;
      },

      patchPainting: (id, patch) => {
        const targetId = String(id || '').trim();
        if (!targetId) return;
        const list = get().paintings;
        const index = list.findIndex((item) => item.id === targetId);
        if (index < 0) return;

        const current = list[index]!;
        const next: Painting = {
          ...current,
          ...patch,
          params: patch.params ? { ...current.params, ...patch.params } : current.params,
          updatedAt: Date.now(),
        };

        if (typeof patch.prompt === 'string' && defaultTitleFromPrompt(current.prompt) === current.title) {
          next.title = defaultTitleFromPrompt(patch.prompt);
        }

        const nextPaintings = [...list];
        nextPaintings[index] = next;
        set({ paintings: nextPaintings });
        schedulePersist({ paintings: nextPaintings, activePaintingId: get().activePaintingId });

        if (patch.inputImages || patch.outputImages) {
          const previousIds = new Set(collectAttachmentIdsFromPainting(current));
          const nextIds = new Set(collectAttachmentIdsFromPainting(next));
          const stillReferencedIds = collectReferencedAttachmentIds(nextPaintings);
          const removedIds = Array.from(previousIds).filter((attachmentId) => !nextIds.has(attachmentId) && !stillReferencedIds.has(attachmentId));
          if (removedIds.length > 0) {
            void deleteAttachments(removedIds).catch((error) => {
              logger.general.error('paint store cleanup patched attachments failed', error);
            });
          }
        }
      },

      deletePainting: (id) => {
        const targetId = String(id || '').trim();
        if (!targetId) return;
        const list = get().paintings;
        const target = list.find((item) => item.id === targetId);
        const nextPaintings = list.filter((item) => item.id !== targetId);

        if (target) {
          const stillReferencedIds = collectReferencedAttachmentIds(nextPaintings);
          const ids = collectAttachmentIdsFromPainting(target).filter((attachmentId) => !stillReferencedIds.has(attachmentId));
          if (ids.length > 0) {
            void deleteAttachments(ids).catch((error) => {
              logger.general.error('paint store cleanup deleted painting attachments failed', error);
            });
          }
        }

        const activePaintingId = get().activePaintingId;
        const nextActivePaintingId = activePaintingId === targetId ? (nextPaintings[0]?.id ?? null) : activePaintingId;
        set({ paintings: nextPaintings, activePaintingId: nextActivePaintingId });
        schedulePersist({ paintings: nextPaintings, activePaintingId: nextActivePaintingId });
      },

      clearAll: () => {
        const ids = Array.from(new Set(get().paintings.flatMap((painting) => collectAttachmentIdsFromPainting(painting))));
        if (ids.length > 0) {
          void deleteAttachments(ids).catch((error) => {
            logger.general.error('paint store cleanup cleared painting attachments failed', error);
          });
        }

        set({ paintings: [], activePaintingId: null });
        schedulePersist({ paintings: [], activePaintingId: null });
      },
    })),
  );
}

type PaintStoreHook = ReturnType<typeof createPaintStore>;

interface GlobalThisWithPaintStore {
  __olyqUsePaintStoreV1__?: PaintStoreHook;
  __olyqUsePaintStoreV1Inited__?: boolean;
}

const globalForPaintStore = globalThis as unknown as GlobalThisWithPaintStore;
const paintStore = globalForPaintStore.__olyqUsePaintStoreV1__ ?? createPaintStore();
globalForPaintStore.__olyqUsePaintStoreV1__ = paintStore;

/**
 * 内部函数：`initPaintStoreOnce`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function initPaintStoreOnce(store: PaintStoreHook): void {
  if (globalForPaintStore.__olyqUsePaintStoreV1Inited__) return;
  globalForPaintStore.__olyqUsePaintStoreV1Inited__ = true;

  registerPendingWriteFlusher('paint-workspace', flushPendingPaintWrites);
  subscribeStoreReloadSignal(() => {
    void reloadPersistedSnapshot(store);
  });
  void reloadPersistedSnapshot(store);
}

initPaintStoreOnce(paintStore);

type PaintStoreApi = Pick<
  PaintStoreHook,
  'getState' | 'setState' | 'subscribe' | 'getInitialState'
>;

/** 导出类型：`UsePaintStore`。 */
export type UsePaintStore = {
  <T>(selector: (state: PaintStore) => T, equalityFn?: (a: T, b: T) => boolean): T;
} & PaintStoreApi;

/**
 * 导出 Hook：`usePaintStore`。
 *
 * @remarks
 * 对外暴露可复用的状态、派生值或副作用封装，调用方应遵守 Hook 调用约束。
 */
export const usePaintStore: UsePaintStore = paintStore;
