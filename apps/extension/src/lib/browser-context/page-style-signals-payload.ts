/**
 * 说明：`page-style-signals-payload` 页面风格 signals payload 辅助模块。
 *
 * 职责：
 * - 提供 `PageStyleSignalsPayload` 的唯一深拷贝实现；
 * - 让 content script 与 browser-context snapshot 共用同一份 payload clone 逻辑；
 * - 把纯数据级 helper 留在无 DOM、无运行时副作用的共享层。
 *
 * 边界：
 * - 本模块只处理 payload 克隆，不接触 DOM、截图、存储或消息通信；
 * - 若后续 `PageStyleSignalsPayload` 结构扩展，唯一允许在这里补齐 clone 字段；
 * - 不在这里引入 browser-context runtime 依赖，保持 content script 可安全复用。
 */
import type { PageStyleSignalsPayload } from '@/types/sw-messages';

/**
 * 深拷贝页面设计信号，避免调用方意外回写内容脚本缓存或 topic 级 snapshot。
 *
 * @param signals - 原始页面设计信号。
 * @returns 可安全返回给调用方的防御性拷贝。
 */
export function clonePageStyleSignalsPayload(signals: PageStyleSignalsPayload): PageStyleSignalsPayload {
  return {
    ...signals,
    page: {
      ...signals.page,
      borderColors: [...signals.page.borderColors],
      shadowSamples: [...signals.page.shadowSamples],
      radiusSamples: [...signals.page.radiusSamples],
    },
    typography: {
      ...signals.typography,
      bodyFontFamilies: [...signals.typography.bodyFontFamilies],
      headingFontFamilies: [...signals.typography.headingFontFamilies],
      buttonFontFamilies: [...signals.typography.buttonFontFamilies],
      headingFontSizes: [...signals.typography.headingFontSizes],
      buttonFontSizes: [...signals.typography.buttonFontSizes],
      fontWeights: [...signals.typography.fontWeights],
    },
    layout: {
      ...signals.layout,
      sectionGapSamples: [...signals.layout.sectionGapSamples],
    },
    components: {
      ...signals.components,
      buttonStyles: [...signals.components.buttonStyles],
      cardStyles: [...signals.components.cardStyles],
      inputStyles: [...signals.components.inputStyles],
      tagStyles: [...signals.components.tagStyles],
      navStyles: [...signals.components.navStyles],
    },
    decoration: {
      ...signals.decoration,
    },
    samples: {
      ...signals.samples,
      headings: [...signals.samples.headings],
      sectionSelectors: [...signals.samples.sectionSelectors],
      cardSelectors: [...signals.samples.cardSelectors],
    },
  };
}
