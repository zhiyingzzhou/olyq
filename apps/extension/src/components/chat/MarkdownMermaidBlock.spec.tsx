/**
 * 说明：`MarkdownMermaidBlock.spec` 组件模块。
 *
 * 职责：
 * - 覆盖 Mermaid 在流式阶段的源码占位与最终失败回退契约；
 * - 防止 Mermaid 底层 SVG 报错再次直接暴露到消息气泡里。
 *
 * 边界：
 * - 这里只验证 Mermaid block 自己的展示语义；
 * - 不重复覆盖 ReactMarkdown 的解析细节。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownMermaidBlock } from './MarkdownMermaidBlock';

const { clipboardWriteTextMock, mermaidInitializeMock, mermaidRenderMock, toastMock } = vi.hoisted(() => ({
  clipboardWriteTextMock: vi.fn(),
  mermaidInitializeMock: vi.fn(),
  mermaidRenderMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/hooks/useToast', () => ({
  toast: toastMock,
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: mermaidInitializeMock,
    render: mermaidRenderMock,
  },
}));

describe('MarkdownMermaidBlock', () => {
  beforeEach(() => {
    clipboardWriteTextMock.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: clipboardWriteTextMock,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the source card during streaming without calling mermaid.render', () => {
    render(<MarkdownMermaidBlock chart={'flowchart TD\nA-->B'} isStreaming />);

    expect(screen.getByText('markdown.mermaidRenderAfterStream')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'markdown.mermaidViewDiagram' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'markdown.mermaidViewSource' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/flowchart TD/)).toBeInTheDocument();
    expect(mermaidInitializeMock).not.toHaveBeenCalled();
    expect(mermaidRenderMock).not.toHaveBeenCalled();
  });

  it('renders the diagram after streaming finishes and allows switching back to the source', async () => {
    mermaidRenderMock.mockResolvedValue({ svg: '<svg width="320" height="160"><title>diagram</title></svg>' });

    const { rerender } = render(<MarkdownMermaidBlock chart={'flowchart TD\nA-->B'} isStreaming />);

    rerender(<MarkdownMermaidBlock chart={'flowchart TD\nA-->B'} isStreaming={false} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'markdown.mermaidPreview' })).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'markdown.mermaidViewDiagram' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'markdown.mermaidViewSource' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('markdown.mermaidViewReady')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'common.copy' })).not.toBeInTheDocument();
    expect(mermaidInitializeMock).toHaveBeenCalledWith(expect.objectContaining({
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false,
      flowchart: { useMaxWidth: true },
      sequence: { useMaxWidth: true },
    }));
    const svg = document.querySelector('.olyq-mermaid-diagram svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 320 160');
    expect(svg).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
    expect(svg).toHaveClass('olyq-mermaid-svg');
    expect(svg).toHaveStyle({
      '--olyq-mermaid-natural-width': '320px',
      '--olyq-mermaid-natural-height': '160px',
      '--olyq-mermaid-readable-width': '320px',
    });

    fireEvent.click(screen.getByRole('button', { name: 'markdown.mermaidViewSource' }));

    expect(screen.getByText(/flowchart TD/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'markdown.mermaidPreview' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'markdown.mermaidViewSource' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'common.copy' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'common.copy' }));

    await waitFor(() => {
      expect(clipboardWriteTextMock).toHaveBeenCalledWith('flowchart TD\nA-->B');
    });
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      description: 'message.copiedPlain',
    }));

    fireEvent.click(screen.getByRole('button', { name: 'markdown.mermaidViewDiagram' }));

    expect(screen.getByRole('button', { name: 'markdown.mermaidPreview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'markdown.mermaidViewDiagram' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'common.copy' })).not.toBeInTheDocument();
  });

  it('keeps wide charts readable inline by preserving a wider SVG size for horizontal scrolling', async () => {
    mermaidRenderMock.mockResolvedValue({
      svg: '<svg width="1680" height="240" viewBox="0 0 1680 240"><text>Project Timeline</text></svg>',
    });

    render(<MarkdownMermaidBlock chart={'gantt\ntitle Project Timeline'} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'markdown.mermaidPreview' })).toBeInTheDocument();
    });

    const scrollContainer = document.querySelector('.olyq-mermaid-inline-scroll');
    const trigger = screen.getByRole('button', { name: 'markdown.mermaidPreview' });
    const svg = document.querySelector('.olyq-mermaid-diagram svg');
    const hoverLayer = document.querySelector('.olyq-mermaid-preview-hover-layer');

    expect(scrollContainer).toBeInTheDocument();
    expect(trigger).toHaveClass('olyq-mermaid-inline-trigger', 'max-w-none');
    expect(trigger).toHaveStyle({
      '--olyq-mermaid-natural-width': '1680px',
      '--olyq-mermaid-natural-height': '240px',
      '--olyq-mermaid-readable-width': '1200px',
    });
    expect(hoverLayer).toBeInTheDocument();
    expect(trigger).toContainElement(hoverLayer as HTMLElement);
    expect(svg).toHaveStyle({
      '--olyq-mermaid-natural-width': '1680px',
      '--olyq-mermaid-natural-height': '240px',
      '--olyq-mermaid-readable-width': '1200px',
    });
  });

  it('falls back to the source card instead of exposing raw SVG NaN errors', async () => {
    mermaidRenderMock.mockRejectedValueOnce(new Error('Error: <line> attribute x1: Expected length, "NaN".'));

    render(<MarkdownMermaidBlock chart={'sequenceDiagram\nAlice->>Bob: Hi'} />);

    await waitFor(() => {
      expect(screen.getByText('markdown.mermaidRenderFallback')).toBeInTheDocument();
    });

    expect(mermaidInitializeMock).toHaveBeenCalled();
    expect(mermaidRenderMock).toHaveBeenCalled();
    expect(screen.getByText(/sequenceDiagram/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'markdown.mermaidViewDiagram' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Expected length/)).not.toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});
