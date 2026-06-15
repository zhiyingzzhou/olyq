/**
 * 说明：`local-backup-file` 基础能力模块。
 *
 * 职责：
 * - 承载 `local-backup-file` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ExportDirPermissionMode`、`ensureExportDirPermission`、`exportBackupBlobToDirectory` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/** 导出类型：`ExportDirPermissionMode`。 */
export type ExportDirPermissionMode = 'query' | 'request';

type PermissionCapableHandle = FileSystemDirectoryHandle & {
  queryPermission?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
};

/**
 * 导出函数：`ensureExportDirPermission`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function ensureExportDirPermission(
  handle: FileSystemDirectoryHandle,
  mode: ExportDirPermissionMode,
): Promise<boolean> {
  const fsHandle = handle as PermissionCapableHandle;
  if (typeof fsHandle.queryPermission !== 'function') return true;

  try {
    const current = await fsHandle.queryPermission({ mode: 'readwrite' });
    if (current === 'granted') return true;
    if (mode !== 'request' || typeof fsHandle.requestPermission !== 'function') return false;
    const next = await fsHandle.requestPermission({ mode: 'readwrite' });
    return next === 'granted';
  } catch {
    return false;
  }
}

/**
 * 导出函数：`exportBackupBlobToDirectory`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function exportBackupBlobToDirectory(
  handle: FileSystemDirectoryHandle,
  fileName: string,
  blob: Blob,
  options?: { permissionMode?: ExportDirPermissionMode },
): Promise<boolean> {
  const allowed = await ensureExportDirPermission(handle, options?.permissionMode ?? 'request');
  if (!allowed) return false;
  const fileHandle = await handle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return true;
}

/**
 * 导出函数：`removeBackupFileFromDirectory`。
 *
 * @remarks
 * 为外部模块提供当前文件的公开能力，输入输出与副作用边界应结合实现理解。
 */
export async function removeBackupFileFromDirectory(
  handle: FileSystemDirectoryHandle,
  fileName: string,
  options?: { permissionMode?: ExportDirPermissionMode },
): Promise<boolean> {
  const allowed = await ensureExportDirPermission(handle, options?.permissionMode ?? 'request');
  if (!allowed) return false;
  await handle.removeEntry(fileName);
  return true;
}
