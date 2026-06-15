/**
 * 说明：`useAttachmentObjectUrl` Hook 模块。
 *
 * 职责：
 * - 承载 `useAttachmentObjectUrl` 相关的当前文件实现与模块边界；
 * - 对外暴露 `UseAttachmentObjectUrlResult`、`useAttachmentObjectUrl` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAttachmentBlob } from '@/lib/attachments';

/** `useAttachmentObjectUrl` 的返回结构。 */
export interface UseAttachmentObjectUrlResult {
  /** 当前可直接挂到 `\<img\>` / `\<audio\>` / `\<video\>` 上的 Object URL。 */
  url: string;
  /** 是否仍在从附件库读取 Blob。 */
  loading: boolean;
  /** 错误信息；空字符串表示当前没有错误。 */
  error: string;
  /** 触发重新读取同一个附件。 */
  reload: () => void;
}

/**
 * useAttachmentObjectUrl
 *
 * 从附件库（IndexedDB）读取 Blob，并生成可用于 \<img\> 的 Object URL。
 *
 * 为什么需要这个 hook：
 * - 附件存储在 IndexedDB，读取是异步的；UI 需要一个稳定的“加载中/失败/成功”状态机
 * - Object URL 需要在合适的时机 revoke，否则会造成内存泄漏
 * - 组件可能在读取过程中卸载/切换 ID，需要避免 setState on unmounted
 *
 * 说明：
 * - 只负责：读取 + 生成 URL + 生命周期清理
 * - 不负责：图片解码完成（onLoad/onError）、缩略图裁剪、业务提示等
 */
export function useAttachmentObjectUrl(attachmentId: string | null): UseAttachmentObjectUrlResult {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  /** 强制刷新的版本号；每次递增都会触发重新读取同一附件。 */
  const [rev, setRev] = useState(0);
  /** 当前活动 Object URL 的 ref，用于跨 effect 生命周期统一 revoke。 */
  const urlRef = useRef<string>('');

  /**
   * 释放当前缓存的 Object URL。
   *
   * 说明：
   * - 同一时刻只维护一条活动 URL，避免附件切换时遗留旧引用；
   * - `revokeObjectURL` 即使遇到异常也不影响后续读取流程。
   */
  const revokeCurrentUrl = useCallback(() => {
    const cur = urlRef.current;
    if (!cur) return;
    try { URL.revokeObjectURL(cur); } catch { /* ignore */ }
    urlRef.current = '';
  }, []);

  /** 强制刷新当前附件，常用于附件重建后重新取 Blob。 */
  const reload = useCallback(() => setRev((x) => x + 1), []);

  useEffect(() => {
    // 每次切换目标附件时先清理旧 URL，避免“串图”与泄漏。
    revokeCurrentUrl();
    setUrl('');
    setError('');

    const id = typeof attachmentId === 'string' ? attachmentId.trim() : '';
    if (!id) {
      setLoading(false);
      return;
    }

    // alive 标记用于屏蔽异步回调晚到时的越界 setState。
    let alive = true;
    setLoading(true);

    void (async () => {
      try {
        const blob = await getAttachmentBlob(id);
        if (!alive) return;
        if (!blob) {
          setError('attachment_not_found');
          setLoading(false);
          return;
        }

        const nextUrl = URL.createObjectURL(blob);
        urlRef.current = nextUrl;
        setUrl(nextUrl);
        setLoading(false);
      } catch (e: unknown) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e ?? ''));
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [attachmentId, revokeCurrentUrl, rev]);

  // 卸载时兜底清理 URL，避免组件销毁后遗留 Blob URL 占用内存。
  useEffect(() => {
    return () => revokeCurrentUrl();
  }, [revokeCurrentUrl]);

  return {
    url,
    loading,
    error,
    reload,
  };
}
