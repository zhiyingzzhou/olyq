/**
 * 说明：WebDAV 远端备份版本列表模块。
 *
 * 职责：
 * - 对用户配置的 WebDAV 目录执行 `PROPFIND Depth: 1`；
 * - 只返回当前 Olyq 备份 ZIP 版本，不把同步状态 JSON 或其它文件混进恢复入口；
 * - 为 WebDAV 恢复和最大快照数清理提供同一份远端版本真源。
 */
import { I18nError } from '@/lib/i18n/error';
import {
  inferBackupProfileFromName,
  isBackupArchiveKey,
  sortRemoteBackupVersions,
  type RemoteBackupVersion,
} from '@/lib/remote-backup-versions';
import { normalizeWebDavBase, normalizeWebDavPath } from '@/lib/sync/cloud-sync';

/** WebDAV 备份目录访问配置。 */
export interface WebDavBackupListConfig {
  /** WebDAV 服务入口地址，可携带服务端固定路径。 */
  url: string;
  /** 用户配置的远端目录。 */
  path: string;
  /** 可选 HTTP Basic Auth 请求头。 */
  authHeader?: string;
}

/**
 * 构建 WebDAV 备份 ZIP 所在目录 URL。
 *
 * @param url - WebDAV 服务入口地址。
 * @param path - 用户配置的目录或文件路径。
 * @returns 以 `/` 结尾的 WebDAV 目录 URL。
 */
export function buildWebDavBackupDirectoryUrl(url: string, path: string) {
  const base = normalizeWebDavBase(url);
  const rawPath = normalizeWebDavPath(path) || '/olyq';
  return `${base}${rawPath.replace(/\/+$/, '')}/`;
}

/**
 * 从 WebDAV XML 文档中读取节点文本。
 *
 * @param root - XML 节点。
 * @param localName - 标签本地名。
 * @returns 节点文本；不存在时返回空串。
 */
function readXmlText(root: Element, localName: string): string {
  return root.getElementsByTagNameNS('*', localName)[0]?.textContent?.trim() ?? '';
}

/**
 * 执行 WebDAV 目录列表请求并解析为远端备份版本。
 *
 * @param config - WebDAV 目录、认证配置。
 * @returns 按最近修改时间倒序排列的备份版本列表。
 */
export async function listWebDavBackupVersions(config: WebDavBackupListConfig): Promise<RemoteBackupVersion[]> {
  const directoryUrl = buildWebDavBackupDirectoryUrl(config.url, config.path);
  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<d:propfind xmlns:d="DAV:"><d:prop><d:getlastmodified/><d:getcontentlength/><d:creationdate/></d:prop></d:propfind>';
  const response = await fetch(directoryUrl, {
    method: 'PROPFIND',
    headers: {
      Depth: '1',
      'Content-Type': 'text/xml; charset=utf-8',
      ...(config.authHeader ? { Authorization: config.authHeader } : {}),
    },
    body,
  });

  const text = await response.text().catch(() => '');
  if (!response.ok) {
    const detail = text.trim();
    throw new I18nError(
      'errors.httpRequestFailedWithDetail',
      { detail: detail ? `HTTP ${response.status}: ${detail}` : `HTTP ${response.status}` },
      { cause: { status: response.status, text } },
    );
  }

  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const responses = Array.from(doc.getElementsByTagNameNS('*', 'response'));
  const directory = new URL(directoryUrl);
  const versions = responses
    .map((entry): RemoteBackupVersion | null => {
      const href = readXmlText(entry, 'href');
      if (!href || href.endsWith('/')) return null;

      const name = decodeURIComponent(href.split('/').filter(Boolean).pop() || '');
      if (!isBackupArchiveKey(name)) return null;

      const modifiedText = readXmlText(entry, 'getlastmodified') || readXmlText(entry, 'creationdate');
      const lastModified = Date.parse(modifiedText);
      const size = Number.parseInt(readXmlText(entry, 'getcontentlength') || '0', 10);
      const fileUrl = new URL(href, directoryUrl);
      if (fileUrl.origin !== directory.origin || !fileUrl.pathname.startsWith(directory.pathname)) return null;
      const url = fileUrl.toString();

      return {
        name,
        key: url,
        url,
        lastModified: Number.isFinite(lastModified) ? lastModified : 0,
        size: Number.isFinite(size) ? size : 0,
        profile: inferBackupProfileFromName(name),
      };
    })
    .filter((item): item is RemoteBackupVersion => Boolean(item));

  return sortRemoteBackupVersions(versions);
}
