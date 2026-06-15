/**
 * 说明：`paint-workspace` 基础能力模块。
 *
 * 职责：
 * - 承载 `paint-workspace` 相关的当前文件实现与模块边界；
 * - 对外暴露 `PaintingImageRef`、`PaintingParams`、`Painting` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import {
  readBootstrapStoredJsonSeed,
  removeBootstrapStoredJsonMirror,
  writeBootstrapStoredJsonMirror,
} from '@/lib/storage/json-storage';
import { deleteWorkspaceSnapshot, readWorkspaceSnapshot, writeWorkspaceSnapshot } from '@/lib/persistence/workspace-db';
import { stripAttachmentRefsFromPaintingsStorage } from '@/lib/attachment-references';
import { isPlainRecord } from '@/lib/utils/type-guards';

/** 导出类型：`PaintingImageRef`。 */
export type PaintingImageRef = {
  id: string;
  name: string;
  mime: string;
  size: number;
};

/** 导出类型：`PaintingParams`。 */
export interface PaintingParams {
  n: number;
  size?: string;
  aspectRatio?: string;
  seed?: number;
  quality?: string;
  providerOptionsJson?: string;
}

/** 导出类型：`Painting`。 */
export type Painting = {
  id: string;
  title: string;
  model: string;
  prompt: string;
  params: PaintingParams;
  inputImages: PaintingImageRef[];
  outputImages: PaintingImageRef[];
  createdAt: number;
  updatedAt: number;
};

/** 导出类型：`PaintWorkspaceSnapshot`。 */
export type PaintWorkspaceSnapshot = {
  paintings: Painting[];
  activePaintingId: string | null;
};

/**
 * 导出常量：`PAINT_WORKSPACE_STORAGE_KEY`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const PAINT_WORKSPACE_STORAGE_KEY = 'paint.workspace.v1';
/**
 * 导出常量：`PAINT_WORKSPACE_BOOTSTRAP_KEY`。
 *
 * @remarks
 * 用于承载当前模块对外共享的常量、配置或可复用值。
 */
export const PAINT_WORKSPACE_BOOTSTRAP_KEY = 'olyq.paint.workspace.v1';

const EMPTY_SNAPSHOT: PaintWorkspaceSnapshot = {
  paintings: [],
  activePaintingId: null,
};

const encoder = new TextEncoder();

/**
 * 内部函数：`normalizeImageRef`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function normalizeImageRef(raw: unknown): PaintingImageRef | null {
  if (!isPlainRecord(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;
  return {
    id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'image',
    mime: typeof raw.mime === 'string' && raw.mime.trim() ? raw.mime.trim() : 'image/*',
    size: typeof raw.size === 'number' && Number.isFinite(raw.size) ? raw.size : 0,
  };
}

/**
 * 内部函数：`normalizePainting`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function normalizePainting(raw: unknown): Painting | null {
  if (!isPlainRecord(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;
  const model = typeof raw.model === 'string' ? raw.model.trim() : '';
  const prompt = typeof raw.prompt === 'string' ? raw.prompt : '';
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : '未命名绘画';

  const paramsRaw = isPlainRecord(raw.params) ? raw.params : {};
  const n = typeof paramsRaw.n === 'number' && Number.isFinite(paramsRaw.n) ? Math.max(1, Math.min(10, Math.floor(paramsRaw.n))) : 1;
  const size = typeof paramsRaw.size === 'string' && paramsRaw.size.trim() ? paramsRaw.size.trim() : undefined;
  const aspectRatio = typeof paramsRaw.aspectRatio === 'string' && paramsRaw.aspectRatio.trim() ? paramsRaw.aspectRatio.trim() : undefined;
  const seed = typeof paramsRaw.seed === 'number' && Number.isFinite(paramsRaw.seed) ? Math.floor(paramsRaw.seed) : undefined;
  const quality = typeof paramsRaw.quality === 'string' && paramsRaw.quality.trim() ? paramsRaw.quality.trim() : undefined;
  const providerOptionsJson = typeof paramsRaw.providerOptionsJson === 'string' && paramsRaw.providerOptionsJson.trim()
    ? paramsRaw.providerOptionsJson.trim()
    : undefined;

  const inputImages = Array.isArray(raw.inputImages) ? raw.inputImages.map(normalizeImageRef).filter(Boolean) as PaintingImageRef[] : [];
  const outputImages = Array.isArray(raw.outputImages) ? raw.outputImages.map(normalizeImageRef).filter(Boolean) as PaintingImageRef[] : [];

  const createdAt = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
  const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt;

  return {
    id,
    title,
    model,
    prompt,
    params: {
      n,
      ...(size ? { size } : {}),
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(seed !== undefined ? { seed } : {}),
      ...(quality ? { quality } : {}),
      ...(providerOptionsJson ? { providerOptionsJson } : {}),
    },
    inputImages,
    outputImages,
    createdAt,
    updatedAt,
  };
}

/**
 * 导出函数：`normalizePaintWorkspaceSnapshot`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function normalizePaintWorkspaceSnapshot(raw: unknown): PaintWorkspaceSnapshot {
  const record = isPlainRecord(raw) ? raw : {};
  const paintings = Array.isArray(record.paintings)
    ? record.paintings.map(normalizePainting).filter(Boolean) as Painting[]
    : [];
  const activePaintingId = typeof record.activePaintingId === 'string' && record.activePaintingId.trim()
    ? record.activePaintingId.trim()
    : null;
  return {
    paintings,
    activePaintingId: activePaintingId && paintings.some((entry) => entry.id === activePaintingId) ? activePaintingId : (paintings[0]?.id ?? null),
  };
}

/**
 * 内部函数：`readPersistedSnapshot`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
async function readPersistedSnapshot(): Promise<PaintWorkspaceSnapshot> {
  const snapshot = await readWorkspaceSnapshot<PaintWorkspaceSnapshot>(PAINT_WORKSPACE_STORAGE_KEY);
  return snapshot ? normalizePaintWorkspaceSnapshot(snapshot) : { ...EMPTY_SNAPSHOT };
}

/**
 * 导出函数：`readPaintWorkspaceBootstrapSeed`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function readPaintWorkspaceBootstrapSeed(): PaintWorkspaceSnapshot {
  return normalizePaintWorkspaceSnapshot(
    readBootstrapStoredJsonSeed<unknown>(PAINT_WORKSPACE_BOOTSTRAP_KEY, EMPTY_SNAPSHOT),
  );
}

/**
 * 导出函数：`readPersistedPaintWorkspace`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function readPersistedPaintWorkspace(): Promise<PaintWorkspaceSnapshot> {
  const snapshot = await readPersistedSnapshot();
  writeBootstrapStoredJsonMirror(PAINT_WORKSPACE_BOOTSTRAP_KEY, snapshot);
  return snapshot;
}

/**
 * 导出函数：`writePersistedPaintWorkspace`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function writePersistedPaintWorkspace(snapshot: PaintWorkspaceSnapshot): Promise<void> {
  const normalized = normalizePaintWorkspaceSnapshot(snapshot);
  await writeWorkspaceSnapshot(PAINT_WORKSPACE_STORAGE_KEY, normalized);
  writeBootstrapStoredJsonMirror(PAINT_WORKSPACE_BOOTSTRAP_KEY, normalized);
}

/**
 * 导出函数：`replacePersistedPaintWorkspace`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function replacePersistedPaintWorkspace(snapshot: PaintWorkspaceSnapshot): Promise<void> {
  await writePersistedPaintWorkspace(snapshot);
}

/**
 * 导出函数：`clearPersistedPaintWorkspace`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function clearPersistedPaintWorkspace(): Promise<void> {
  await deleteWorkspaceSnapshot(PAINT_WORKSPACE_STORAGE_KEY);
  removeBootstrapStoredJsonMirror(PAINT_WORKSPACE_BOOTSTRAP_KEY);
}

/**
 * 导出函数：`buildPaintWorkspaceExportSnapshot`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export function buildPaintWorkspaceExportSnapshot(
  snapshot: PaintWorkspaceSnapshot,
  options: { lite: boolean },
): PaintWorkspaceSnapshot {
  const normalized = normalizePaintWorkspaceSnapshot(snapshot);
  if (!options.lite) return normalized;

  const strippedPaintings = JSON.parse(
    stripAttachmentRefsFromPaintingsStorage(JSON.stringify(normalized.paintings)) ?? '[]',
  ) as Painting[];
  return normalizePaintWorkspaceSnapshot({
    paintings: strippedPaintings,
    activePaintingId: normalized.activePaintingId,
  });
}

/**
 * 导出函数：`summarizePaintWorkspace`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function summarizePaintWorkspace(): Promise<{ itemCount: number; bytes: number }> {
  const snapshot = await readPersistedSnapshot();
  return {
    itemCount: snapshot.paintings.length,
    bytes: encoder.encode(JSON.stringify(snapshot)).length,
  };
}
