/**
 * 说明：`file-transfer` 基础能力模块。
 *
 * 职责：
 * - 承载 `file-transfer` 相关的当前文件实现与模块边界；
 * - 对外暴露 `hasFilesInDataTransfer`、`extractFilesFromDataTransfer`、`isImageFile` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 拖拽/粘贴文件工具（DataTransfer/ClipboardData）
 *
 * 背景：
 * - 不同平台/浏览器对 `DataTransfer` 的填充并不一致：
 *   1) 有的会在 `types` 里包含 "Files"
 *   2) 有的只在 `items` 里提供 file item
 *   3) 有的在 dragenter/dragover 时 `files.length === 0`，仅在 drop 时才可取到
 *
 * 目标：
 * - 在 UI 里可靠判断“这次交互是否携带文件”，以便：
 *   - 正确 `preventDefault()` 让 drop 生效
 *   - 显示拖拽高亮态（可投放反馈）
 * - 在 drop/paste 时可靠提取 File 列表，供业务层做类型过滤与入库处理
 *
 * 说明：
 * - 本模块只负责“取文件”，不做图片转码/入库等业务逻辑。
 */

/**
 * 判断 DataTransfer 是否包含文件。
 *
 * 适用场景：
 * - dragenter/dragover：决定是否 `preventDefault()`（否则 drop 可能不会触发）
 * - UI：决定是否展示“可投放”视觉状态
 */
export function hasFilesInDataTransfer(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  if (dt.files && dt.files.length > 0) return true;
  const types = Array.from(dt.types ?? []);
  if (types.includes('Files')) return true;
  const items = Array.from(dt.items ?? []);
  return items.some((it) => it.kind === 'file');
}

/**
 * 从 DataTransfer 中提取文件列表。
 *
 * 规则：
 * - 优先使用 `dt.files`（最直接、最稳定）
 * - 若为空则从 `dt.items` 兜底提取（部分浏览器只填 items）
 */
export function extractFilesFromDataTransfer(dt: DataTransfer | null | undefined): File[] {
  if (!dt) return [];
  const direct = Array.from(dt.files ?? []);
  if (direct.length > 0) return direct;
  const items = Array.from(dt.items ?? []);
  const fromItems: File[] = [];
  for (const it of items) {
    if (it.kind !== 'file') continue;
    const file = it.getAsFile();
    if (file) fromItems.push(file);
  }
  return fromItems;
}

/**
 * 判断一个 File 是否为图片文件（按 MIME 前缀判断）。
 *
 * 注意：
 * - 仅按 `file.type` 判断，部分系统拖入的文件可能没有 type（此时会返回 false）。
 * - 业务层如需更强兜底（例如按扩展名猜测），应在上层实现，避免本工具引入过多策略。
 */
export function isImageFile(file: File): boolean {
  return Boolean(file && typeof file.type === 'string' && file.type.startsWith('image/'));
}

