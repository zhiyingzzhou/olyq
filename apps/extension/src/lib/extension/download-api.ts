/**
 * 说明：`download-api` 扩展下载 contract 模块。
 *
 * 职责：
 * - 为导出、备份和附件下载提供统一的扩展下载入口；
 * - 集中承载 `chrome.downloads.download` 的运行时探测、Promise 化与失败降级；
 * - 避免 `lib/export/*` 继续分散探测浏览器下载 API。
 *
 * 边界：
 * - 这里只负责浏览器扩展下载 API 的访问，不负责 Blob URL 创建或 DOM 回退；
 * - 调用方仍然负责文件名清洗、对象 URL 生命周期与非扩展环境降级。
 */
import { getExtensionChromeApi } from './runtime-api';

/** 共享扩展下载请求。 */
export interface ExtensionDownloadRequest {
  /** 待下载资源地址。 */
  url: string;
  /** 建议文件名。 */
  filename: string;
  /** 是否显示浏览器原生另存为弹窗。 */
  saveAs?: boolean;
}

/**
 * 请求浏览器扩展下载 API 执行一次下载。
 *
 * 说明：
 * - 成功时返回 `true`，代表当前环境已接管下载；
 * - 若下载 API 不可用、被策略禁用、权限缺失或运行时直接报错，则返回 `false`；
 * - 调用方可在 `false` 时继续走 DOM `<a download>` 回退，而不需要各自重复探测。
 *
 * @param request - 下载请求。
 * @returns 当前环境是否已经成功接管下载。
 */
export async function requestExtensionDownload(
  request: ExtensionDownloadRequest,
): Promise<boolean> {
  const downloadsApi = getExtensionChromeApi()?.downloads;
  if (!downloadsApi?.download) return false;

  return await new Promise((resolve) => {
    try {
      downloadsApi.download(
        {
          url: request.url,
          filename: request.filename,
          saveAs: request.saveAs ?? true,
        },
        (downloadId) => {
          const lastError = getExtensionChromeApi()?.runtime?.lastError;
          if (lastError) {
            resolve(false);
            return;
          }
          resolve(typeof downloadId === 'number' && Number.isFinite(downloadId));
        },
      );
    } catch {
      resolve(false);
    }
  });
}
