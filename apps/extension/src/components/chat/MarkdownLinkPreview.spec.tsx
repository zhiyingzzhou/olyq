/**
 * 说明：`MarkdownLinkPreview.spec` 组件测试模块。
 *
 * 职责：
 * - 锁定聊天 Markdown 链接预览的 hover / focus 懒加载行为；
 * - 确认非 http/https 链接不触发后台预览请求；
 *
 * 边界：
 * - 本文件 mock Popover 壳体和后台 API，只验证当前组件契约。
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requestLinkPreviewMetadataMock } = vi.hoisted(() => ({
  requestLinkPreviewMetadataMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/extension/link-preview-api', () => ({
  requestLinkPreviewMetadata: requestLinkPreviewMetadataMock,
}));

vi.mock('@/components/ui/popover', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const ReactDom = await vi.importActual<typeof import('react-dom')>('react-dom');
  const OpenContext = React.createContext(false);
  return {
    Popover: ({ open, children }: { open?: boolean; children: React.ReactNode }) => (
      <OpenContext.Provider value={Boolean(open)}>{children}</OpenContext.Provider>
    ),
    PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    PopoverContent: ({
      children,
      onPointerEnter,
      onPointerLeave,
    }: {
      children: React.ReactNode;
      onPointerEnter?: React.PointerEventHandler<HTMLDivElement>;
      onPointerLeave?: React.PointerEventHandler<HTMLDivElement>;
    }) => {
      const open = React.useContext(OpenContext);
      if (!open) return null;
      return ReactDom.createPortal(
        <div
          data-testid="markdown-link-preview-popover"
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
        >
          {children}
        </div>,
        document.body,
      );
    },
  };
});

describe('MarkdownLinkPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * 构造后台链接预览成功响应。
   *
   * @param title - 预览标题。
   * @param url - 预览 URL。
   * @returns one-shot 成功响应。
   */
  function linkPreviewResponse(
    title: string,
    url = 'https://example.com/article',
    overrides: Partial<{
      readonly description: string | null;
      readonly imageUrl: string | null;
      readonly imageAlt: string | null;
      readonly siteName: string | null;
    }> = {},
  ) {
    return {
      ok: true,
      payload: {
        url,
        finalUrl: url,
        hostname: new URL(url).hostname,
        title,
        description: 'Example Description',
        imageUrl: null,
        imageAlt: null,
        siteName: 'Example',
        fetchedAt: 1,
        ...overrides,
      },
    };
  }

  /**
   * 构造可控 Promise，便于测试旧请求迟到的时序。
   *
   * @returns promise 与 resolve 控制器。
   */
  function createDeferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  /** 推进 React effect 与 Promise 微任务，避免 fake timer 测试依赖 Testing Library 轮询计时器。 */
  async function flushPendingMicrotasks() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  /**
   * 在 React `act` 内推进 fake timers。
   *
   * @param ms - 需要推进的毫秒数。
   */
  async function advanceTimers(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it('http 链接 hover 后才请求预览，并保留新开链接安全属性', async () => {
    requestLinkPreviewMetadataMock.mockResolvedValueOnce(linkPreviewResponse('Example Title'));
    const { MarkdownRenderer } = await import('./MarkdownRendererImpl');
    render(<MarkdownRenderer content="[Example](https://example.com/article)" />);

    const link = screen.getByRole('link', { name: 'Example' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByTestId('markdown-link-preview-popover')).not.toBeInTheDocument();
    expect(requestLinkPreviewMetadataMock).not.toHaveBeenCalled();

    fireEvent.pointerEnter(link);

    await waitFor(() => {
      expect(requestLinkPreviewMetadataMock).toHaveBeenCalledWith('https://example.com/article');
    });
    expect(await screen.findByText('Example Title')).toBeInTheDocument();
    expect(screen.getByText('Example Description')).toBeInTheDocument();
  });

  it('编码 URL 不会被 UI 整体 decode 后改写请求语义', async () => {
    const encodedUrl = 'https://example.com/a%2Fb?x=a%26b';
    requestLinkPreviewMetadataMock.mockResolvedValueOnce(linkPreviewResponse('Encoded Title', encodedUrl));
    const { MarkdownRenderer } = await import('./MarkdownRendererImpl');
    render(<MarkdownRenderer content={`[Encoded](${encodedUrl})`} />);

    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Encoded' }));

    await waitFor(() => {
      expect(requestLinkPreviewMetadataMock).toHaveBeenCalledWith(encodedUrl);
    });
    expect(await screen.findByText('Encoded Title')).toBeInTheDocument();
  });

  it('focus 触发的请求不返回时会在 UI deadline 后展示 fallback', async () => {
    vi.useFakeTimers();
    requestLinkPreviewMetadataMock.mockReturnValueOnce(new Promise(() => {}));
    const { MarkdownRenderer } = await import('./MarkdownRendererImpl');
    render(<MarkdownRenderer content="[Example](https://example.com/article)" />);

    fireEvent.focus(screen.getByRole('link', { name: 'Example' }));
    await flushPendingMicrotasks();

    expect(requestLinkPreviewMetadataMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('markdown-link-preview-loading')).toBeInTheDocument();
    expect(screen.getByText('markdown.linkPreview.loading')).toBeInTheDocument();

    await advanceTimers(6_500);

    expect(screen.getByTestId('markdown-link-preview-fallback')).toBeInTheDocument();
    expect(screen.getByText('markdown.linkPreview.unavailable')).toBeInTheDocument();
  });

  it('预览失败时展示稳定降级卡片', async () => {
    requestLinkPreviewMetadataMock.mockResolvedValueOnce({
      ok: true,
      payload: null,
      error: 'fetch-failed',
    });
    const { MarkdownRenderer } = await import('./MarkdownRendererImpl');
    render(<MarkdownRenderer content="[Example](https://example.com/article)" />);

    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Example' }));

    expect(await screen.findByTestId('markdown-link-preview-fallback')).toBeInTheDocument();
    expect(screen.getByText('markdown.linkPreview.unavailable')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/article')).toBeInTheDocument();
  });

  it('runtime 拒绝或无响应错误会进入稳定降级卡片', async () => {
    requestLinkPreviewMetadataMock.mockRejectedValueOnce(new Error('runtime.lastError'));
    const { MarkdownRenderer } = await import('./MarkdownRendererImpl');
    render(<MarkdownRenderer content="[Example](https://example.com/article)" />);

    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Example' }));

    expect(await screen.findByTestId('markdown-link-preview-fallback')).toBeInTheDocument();
    expect(screen.getByText('markdown.linkPreview.unavailable')).toBeInTheDocument();
  });

  it('预览图片加载失败只隐藏图片，不改变 metadata 成功态', async () => {
    requestLinkPreviewMetadataMock.mockResolvedValueOnce(linkPreviewResponse('Image Title', 'https://example.com/article', {
      imageAlt: 'Cover',
      imageUrl: 'https://cdn.example.com/cover.png',
    }));
    const { MarkdownRenderer } = await import('./MarkdownRendererImpl');
    render(<MarkdownRenderer content="[Example](https://example.com/article)" />);

    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Example' }));

    expect(await screen.findByText('Image Title')).toBeInTheDocument();
    const image = screen.getByRole('img', { name: 'Cover' });
    fireEvent.error(image);

    await waitFor(() => expect(screen.queryByRole('img', { name: 'Cover' })).not.toBeInTheDocument());
    expect(screen.getByText('Image Title')).toBeInTheDocument();
    expect(screen.queryByTestId('markdown-link-preview-fallback')).not.toBeInTheDocument();
  });

  it('超时后关闭再 hover 同一 URL 会重新请求', async () => {
    vi.useFakeTimers();
    requestLinkPreviewMetadataMock
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce(linkPreviewResponse('Recovered Title'));
    const { MarkdownRenderer } = await import('./MarkdownRendererImpl');
    render(<MarkdownRenderer content="[Example](https://example.com/article)" />);

    const link = screen.getByRole('link', { name: 'Example' });
    fireEvent.pointerEnter(link);
    await flushPendingMicrotasks();
    expect(requestLinkPreviewMetadataMock).toHaveBeenCalledTimes(1);
    await advanceTimers(6_500);
    expect(screen.getByTestId('markdown-link-preview-fallback')).toBeInTheDocument();

    fireEvent.pointerLeave(link);
    await advanceTimers(121);
    expect(screen.queryByTestId('markdown-link-preview-popover')).not.toBeInTheDocument();

    fireEvent.pointerEnter(link);
    await flushPendingMicrotasks();

    expect(requestLinkPreviewMetadataMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Recovered Title')).toBeInTheDocument();
  });

  it('旧 request 迟到时不会覆盖新一轮 hover 的结果', async () => {
    vi.useFakeTimers();
    const oldRequest = createDeferred<unknown>();
    requestLinkPreviewMetadataMock
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce(linkPreviewResponse('Fresh Title'));
    const { MarkdownRenderer } = await import('./MarkdownRendererImpl');
    render(<MarkdownRenderer content="[Example](https://example.com/article)" />);

    const link = screen.getByRole('link', { name: 'Example' });
    fireEvent.pointerEnter(link);
    await flushPendingMicrotasks();
    fireEvent.pointerLeave(link);
    await advanceTimers(121);
    fireEvent.pointerEnter(link);
    await flushPendingMicrotasks();

    expect(screen.getByText('Fresh Title')).toBeInTheDocument();
    oldRequest.resolve(linkPreviewResponse('Stale Title'));
    await flushPendingMicrotasks();

    expect(screen.getByText('Fresh Title')).toBeInTheDocument();
    expect(screen.queryByText('Stale Title')).not.toBeInTheDocument();
  });

  it('组件卸载后迟到响应不会写回已销毁的预览状态', async () => {
    const deferred = createDeferred<unknown>();
    requestLinkPreviewMetadataMock.mockReturnValueOnce(deferred.promise);
    const { MarkdownRenderer } = await import('./MarkdownRendererImpl');
    const { unmount } = render(<MarkdownRenderer content="[Example](https://example.com/article)" />);

    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Example' }));
    await flushPendingMicrotasks();
    expect(requestLinkPreviewMetadataMock).toHaveBeenCalledTimes(1);

    unmount();
    deferred.resolve(linkPreviewResponse('Late Title'));
    await flushPendingMicrotasks();

    expect(screen.queryByText('Late Title')).not.toBeInTheDocument();
  });

  it('多个不同链接各自创建独立预览请求', async () => {
    requestLinkPreviewMetadataMock
      .mockResolvedValueOnce(linkPreviewResponse('One Title', 'https://example.com/one'))
      .mockResolvedValueOnce(linkPreviewResponse('Two Title', 'https://example.org/two'));
    const { MarkdownRenderer } = await import('./MarkdownRendererImpl');
    render(<MarkdownRenderer content="[One](https://example.com/one) [Two](https://example.org/two)" />);

    fireEvent.pointerEnter(screen.getByRole('link', { name: 'One' }));
    expect(await screen.findByText('One Title')).toBeInTheDocument();
    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Two' }));

    await waitFor(() => {
      expect(requestLinkPreviewMetadataMock).toHaveBeenCalledWith('https://example.org/two');
    });
    expect(await screen.findByText('Two Title')).toBeInTheDocument();
  });

  it('多个相同链接实例也各自按打开动作创建请求', async () => {
    requestLinkPreviewMetadataMock
      .mockResolvedValueOnce(linkPreviewResponse('First Instance'))
      .mockResolvedValueOnce(linkPreviewResponse('Second Instance'));
    const { MarkdownRenderer } = await import('./MarkdownRendererImpl');
    render(<MarkdownRenderer content="[First](https://example.com/post) [Second](https://example.com/post)" />);

    fireEvent.pointerEnter(screen.getByRole('link', { name: 'First' }));
    expect(await screen.findByText('First Instance')).toBeInTheDocument();
    fireEvent.pointerEnter(screen.getByRole('link', { name: 'Second' }));

    await waitFor(() => {
      expect(requestLinkPreviewMetadataMock).toHaveBeenCalledTimes(2);
    });
    expect(requestLinkPreviewMetadataMock).toHaveBeenNthCalledWith(1, 'https://example.com/post');
    expect(requestLinkPreviewMetadataMock).toHaveBeenNthCalledWith(2, 'https://example.com/post');
    expect(await screen.findByText('Second Instance')).toBeInTheDocument();
  });

  it('非 http/https 链接保持普通链接且不请求预览', async () => {
    const { MarkdownRenderer } = await import('./MarkdownRendererImpl');
    render(<MarkdownRenderer content="[Mail](mailto:hello@example.com)" />);

    const link = screen.getByRole('link', { name: 'Mail' });
    fireEvent.pointerEnter(link);

    expect(link).not.toHaveAttribute('target');
    expect(requestLinkPreviewMetadataMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('markdown-link-preview-popover')).not.toBeInTheDocument();
  });
});
