/**
 * 说明：`download` 基础能力模块。
 *
 * 职责：
 * - 承载 `download` 相关的当前文件实现与模块边界；
 * - 对外暴露 `sanitizeFilename`、`downloadBlob`、`downloadText` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 文件下载与文件名处理工具。
 * - 扩展环境优先使用共享扩展下载 contract（支持 saveAs）
 * - 否则回退到 \<a download\>
 */
import { requestExtensionDownload } from '@/lib/extension/download-api';

/**
 * 将任意文件名清洗为浏览器下载 API 可接受的安全文件名。
 *
 * @param name - 原始文件名。
 * @returns 去除非法字符、控制字符并限制长度后的文件名；为空时回退为 `download`。
 */
export function sanitizeFilename(name: string): string {
  const replaced = String(name || '').replace(/[<>:"/\\|?*]/g, '_');
  let out = '';
  for (const ch of replaced) {
    const code = ch.charCodeAt(0);
    out += code >= 32 ? ch : '_';
  }
  const trimmed = out.trim() || 'download';
  return trimmed.slice(0, 80);
}

/**
 * 通过 DOM `\<a download\>` 触发文件下载。
 *
 * @param url - 已准备好的资源地址。
 * @param filename - 已清洗过的建议文件名。
 */
function triggerDomDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * 触发 Blob 下载。
 *
 * 优先使用共享扩展下载 contract，以支持浏览器原生另存为弹窗；
 * 若当前环境不是扩展页，或扩展下载能力不可用，则自动回退到 `\<a download\>`。
 *
 * @param blob - 待下载的二进制内容。
 * @param filename - 建议文件名，会先经过安全清洗。
 * @returns 下载任务触发完成后返回。
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const safeName = sanitizeFilename(filename);
  const url = URL.createObjectURL(blob);

  try {
    const handledByExtension = await requestExtensionDownload({
      url,
      filename: safeName,
      saveAs: true,
    });
    if (handledByExtension) {
      return;
    }
    triggerDomDownload(url, safeName);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

/**
 * 以文本内容构造 Blob 并复用通用下载流程。
 *
 * @param text - 原始文本内容。
 * @param filename - 建议文件名。
 * @param mime - Blob MIME 类型，默认使用 UTF-8 文本。
 * @returns 下载任务触发完成后返回。
 */
export async function downloadText(text: string, filename: string, mime = 'text/plain;charset=utf-8'): Promise<void> {
  const blob = new Blob([text], { type: mime });
  await downloadBlob(blob, filename);
}
