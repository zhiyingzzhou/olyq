/**
 * 说明：`PaintMainWorkspace` 主工作区布局模块。
 *
 * 职责：
 * - 承载 Paint 中央画板与底部提示词输入区域；
 * - 在 expanded 与 compact 两种布局中复用同一主工作区结构；
 * - 保持画板预览、生成态和提示词交互由外层 Paint 页面注入。
 *
 * 边界：
 * - 本文件不读取 store、不调用生成链路，也不修改绘图记录；
 * - 仅负责稳定的主工作区排列和测试锚点。
 */
import type { PaintingImageRef } from '@/hooks/usePaintStore';

import { PaintPromptComposer } from './PaintPromptComposer';
import { PaintingArtboard } from './PaintingArtboard';

/** Paint 主工作区属性。 */
interface PaintMainWorkspaceProps {
  /** 当前输出图片列表。 */
  readonly images: PaintingImageRef[];
  /** 当前预览索引。 */
  readonly previewIndex: number;
  /** 预览索引变更回调。 */
  readonly onPreviewIndexChange: (index: number) => void;
  /** 当前是否正在生成。 */
  readonly isGenerating: boolean;
  /** 当前提示词。 */
  readonly prompt: string;
  /** 画板生成态展示的模型名称。 */
  readonly artboardModelLabel: string;
  /** 底部提示词输入区展示的模型名称。 */
  readonly composerModelLabel: string;
  /** 当前生成任务开始时间。 */
  readonly generationStartedAt: number | null;
  /** 生成按钮回调。 */
  readonly onGenerate: () => void;
  /** 提示词变更回调。 */
  readonly onPromptChange: (value: string) => void;
  /** 停止生成回调。 */
  readonly onStop: () => void;
}

/**
 * Paint 主工作区。
 *
 * @param props - 由 Paint 页面注入的业务状态和回调。
 */
export function PaintMainWorkspace({
  images,
  previewIndex,
  onPreviewIndexChange,
  isGenerating,
  prompt,
  artboardModelLabel,
  composerModelLabel,
  generationStartedAt,
  onGenerate,
  onPromptChange,
  onStop,
}: PaintMainWorkspaceProps) {
  return (
    <div className="h-full flex flex-col min-h-0" data-testid="paint-main-workspace">
      <div className="flex-1 min-h-0 p-3">
        <PaintingArtboard
          images={images}
          index={previewIndex}
          onIndexChange={onPreviewIndexChange}
          isGenerating={isGenerating}
          prompt={prompt}
          modelLabel={artboardModelLabel}
          generationStartedAt={generationStartedAt}
        />
      </div>

      <div className="px-3 pb-3">
        <PaintPromptComposer
          isGenerating={isGenerating}
          modelLabel={composerModelLabel}
          prompt={prompt}
          onGenerate={onGenerate}
          onPromptChange={onPromptChange}
          onStop={onStop}
        />
      </div>
    </div>
  );
}
