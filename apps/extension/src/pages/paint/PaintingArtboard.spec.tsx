/**
 * 说明：`PaintingArtboard.spec` 页面模块。
 *
 * 职责：
 * - 覆盖绘画画板在空态、生成态、结果加载和失败时的视觉状态契约；
 * - 锁住参考项目生成覆盖层的 shimmer、动态文案和计时入口；
 * - 锁住已有结果再次生成时的顶部浮条，避免回退成居中遮罩；
 * - 确保结果缩略图选中状态不会因生成态改造丢失。
 *
 * 边界：
 * - 这里只 mock 附件 URL 和下载依赖；
 * - 不触发真实图片生成、IndexedDB 附件存储或浏览器下载。
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PaintingArtboard } from './PaintingArtboard';
import type { PaintingImageRef } from '@/hooks/usePaintStore';

const { attachmentStateMock } = vi.hoisted(() => ({
  attachmentStateMock: vi.fn(),
}));

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => ({
        'paint.generatingStatus': '正在生成中',
        'paint.preview': '预览',
        'paint.previewHint': '在下方输入提示词并点击「生成」，或先添加输入图片再进行编辑。',
        'paint.imageLoadFailed': '图片加载失败',
        'paint.loadingImage': '加载中…',
        'paint.download': '下载',
        'common.refresh': '刷新',
        'common.prev': '上一张',
        'common.next': '下一张',
      }[key] ?? key),
    }),
  };
});

vi.mock('@/hooks/useAttachmentObjectUrl', () => ({
  useAttachmentObjectUrl: (id: string | null) => attachmentStateMock(id),
}));

vi.mock('@/lib/export/download', () => ({
  downloadBlob: vi.fn(async () => undefined),
}));

vi.mock('@/lib/attachments', () => ({
  getAttachmentBlob: vi.fn(async () => new Blob(['image'], { type: 'image/png' })),
}));

const image: PaintingImageRef = {
  id: 'img-1',
  name: 'generated.png',
  mime: 'image/png',
  size: 12,
};

/** 渲染画板并提供默认的生成态展示字段。 */
function renderArtboard(overrides: Partial<React.ComponentProps<typeof PaintingArtboard>> = {}) {
  return render(
    <PaintingArtboard
      images={[]}
      index={0}
      onIndexChange={vi.fn()}
      isGenerating={false}
      prompt="一只在月光下写代码的猫，电影感构图"
      modelLabel="GPT Image"
      generationStartedAt={null}
      {...overrides}
    />,
  );
}

describe('PaintingArtboard', () => {
  it('空态使用参考生成覆盖层骨架并展示预览提示', () => {
    attachmentStateMock.mockReturnValue({ url: null, loading: false, error: null, reload: vi.fn() });

    const { container } = renderArtboard();

    expect(screen.getByText('预览')).toBeInTheDocument();
    expect(screen.getByText(/在下方输入提示词/)).toBeInTheDocument();
    expect(container.querySelector('[class*="paint-shimmer"]')).toBeInTheDocument();
  });

  it('生成态展示模型、提示词摘要和已用时', () => {
    attachmentStateMock.mockReturnValue({ url: null, loading: false, error: null, reload: vi.fn() });

    renderArtboard({ isGenerating: true, generationStartedAt: Date.now() - 125_000 });

    expect(screen.getByText(/正在生成中/)).toBeInTheDocument();
    expect(screen.getByText(/GPT Image/)).toBeInTheDocument();
    expect(screen.getByText(/一只在月光下写代码的猫/)).toBeInTheDocument();
    expect(screen.getByText('02:05')).toBeInTheDocument();
  });

  it('结果图片加载中复用生成覆盖层骨架', () => {
    attachmentStateMock.mockImplementation((id: string | null) => ({
      url: id ? 'blob:pending' : null,
      loading: false,
      error: null,
      reload: vi.fn(),
    }));

    const { container } = renderArtboard({ images: [image] });

    expect(container.querySelector('[class*="paint-shimmer"]')).toBeInTheDocument();
    expect(screen.getByText('1/1')).toBeInTheDocument();
  });

  it('已有结果再次生成时使用顶部浮条且不遮挡当前图片', () => {
    attachmentStateMock.mockImplementation((id: string | null) => ({
      url: id ? 'blob:ready' : null,
      loading: false,
      error: null,
      reload: vi.fn(),
    }));

    const { container } = renderArtboard({
      images: [image],
      isGenerating: true,
      generationStartedAt: Date.now() - 3_000,
    });
    fireEvent.load(screen.getByRole('img', { name: 'generated.png' }));

    const status = screen.getByRole('status');
    expect(within(status).getByText(/正在生成中/)).toBeInTheDocument();
    expect(within(status).getByText(/GPT Image/)).toBeInTheDocument();
    expect(screen.getByText('1/1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下载' })).toBeEnabled();
    expect(container.querySelector('[class*="paint-shimmer"]')).not.toBeInTheDocument();
  });

  it('结果图片失败时展示可恢复错误和刷新按钮', () => {
    attachmentStateMock.mockReturnValue({ url: null, loading: false, error: new Error('bad'), reload: vi.fn() });

    renderArtboard({ images: [image] });

    expect(screen.getByText('图片加载失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '刷新' })).toBeInTheDocument();
  });

  it('多结果缩略图保留选中态', () => {
    attachmentStateMock.mockImplementation((id: string | null) => ({
      url: id ? `blob:${id}` : null,
      loading: false,
      error: null,
      reload: vi.fn(),
    }));

    renderArtboard({
      images: [image, { ...image, id: 'img-2', name: 'second.png' }],
      index: 1,
    });

    const selectedThumb = screen.getByRole('button', { pressed: true });
    expect(selectedThumb).toHaveAccessibleName('second.png');
  });
});
