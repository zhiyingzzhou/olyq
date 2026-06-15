/**
 * 说明：`PageContextBarStyleCapture` 组件模块。
 *
 * 职责：
 * - 承载页面上下文状态条里的风格截图状态展示；
 * - 统一把隐藏截图摘要转换为顶部 badge 和预览弹窗区块；
 * - 只解释本轮截图是否作为临时视觉输入使用，不把截图暴露成聊天附件。
 *
 * 边界：
 * - 本组件不触发截图、不读取 browser-context store，也不改写 SW message payload；
 * - 降级原因仍来自 browser-context 传入的稳定 warning code；
 * - 截图资产继续保持隐藏上下文语义，UI 仅展示状态摘要。
 */
import type { TFunction } from 'i18next';
import { Camera } from 'lucide-react';
import type { BrowserContextStyleCapturePreview } from '@/lib/browser-context';

/** 风格截图状态展示组件的共享 props。 */
interface PageContextBarStyleCaptureProps {
  styleCapture: BrowserContextStyleCapturePreview | null;
  t: TFunction;
}

/** 归一化后的风格截图展示文案。 */
interface PageContextBarStyleCaptureText {
  detail: string;
  summary: string;
}

/**
 * 把隐藏截图状态转换成紧凑可读文案。
 *
 * @param styleCapture - 本轮 browser-context 写入的截图状态摘要。
 * @param t - 当前 i18n 翻译函数。
 * @returns 用于 badge 与预览区块的摘要和说明文案。
 */
function resolvePageContextBarStyleCaptureText(
  styleCapture: BrowserContextStyleCapturePreview,
  t: TFunction,
): PageContextBarStyleCaptureText {
  const summary = styleCapture.target === 'style-signals-only'
    ? t('pageContext.styleCapture.signalsOnly')
    : styleCapture.warningCode
      ? t('pageContext.styleCapture.warning')
      : styleCapture.frameCount > 0
        ? t('pageContext.styleCapture.attached', { count: styleCapture.frameCount })
        : styleCapture.requested
          ? t('pageContext.styleCapture.empty')
          : t('pageContext.styleCapture.signalsOnly');
  const detail = styleCapture.warningCode
    ? t('pageContext.styleCapture.warningWithCode', { code: styleCapture.warningCode })
    : styleCapture.target === 'vision-input'
      ? t('pageContext.styleCapture.hiddenInput')
      : t('pageContext.styleCapture.modelNotVision');

  return { detail, summary };
}

/**
 * 页面上下文状态条里的隐藏截图摘要 badge。
 *
 * @param props - 本轮风格截图状态和翻译函数。
 * @returns 有截图状态时返回紧凑 badge，否则返回 `null`。
 */
export function PageContextBarStyleCaptureBadge({ styleCapture, t }: PageContextBarStyleCaptureProps) {
  if (!styleCapture) return null;
  const text = resolvePageContextBarStyleCaptureText(styleCapture, t);

  return (
    <span className="page-context-style-capture-badge inline-flex min-w-0 max-w-[16rem] shrink items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
      <Camera className="h-3 w-3 shrink-0" />
      <span className="truncate">{text.summary}</span>
    </span>
  );
}

/**
 * 页面上下文预览弹窗里的隐藏截图状态区块。
 *
 * @param props - 本轮风格截图状态和翻译函数。
 * @returns 有截图状态时返回预览区块，否则返回 `null`。
 */
export function PageContextBarStyleCaptureSection({ styleCapture, t }: PageContextBarStyleCaptureProps) {
  if (!styleCapture) return null;
  const text = resolvePageContextBarStyleCaptureText(styleCapture, t);

  return (
    <section className="space-y-1.5">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {t('pageContext.styleCapture.title')}
      </div>
      <div className="rounded-xl border border-border/50 bg-muted/25 px-3 py-2 text-sm leading-6 text-foreground/85">
        <div className="flex items-start gap-2">
          <Camera className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div>{text.summary}</div>
            <div className="text-xs leading-5 text-muted-foreground">
              {text.detail}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
