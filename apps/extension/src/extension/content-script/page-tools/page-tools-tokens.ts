/**
 * 说明：网页工具 page-facing 设计 token。
 *
 * 职责：
 * - 集中维护 Shadow DOM 宿主层级、截图标注色板和尺寸档；
 * - 让 React UI、命令式 controller 与 Tailwind 配置共享同一组语义化视觉值；
 * - 保持现有视觉值不漂移，只改变常量归属。
 *
 * 边界：
 * - 本模块只导出无副作用常量；
 * - 不访问 DOM、不读取 runtime、不写入存储。
 */
import tokenData from './page-tools-tokens.json';

/** Page tools Shadow host 的最高层级。 */
export const PAGE_TOOLS_HOST_Z_INDEX = tokenData.pageToolsHostZIndex;

/** 截图标注默认色板；顺序必须保持当前 UI 视觉与测试契约。 */
export const SCREENSHOT_ANNOTATION_COLORS = tokenData.screenshotAnnotationColors as readonly string[];

/** 矩形、圆形、箭头和画笔使用的小中大描边尺寸档。 */
export const SCREENSHOT_MARK_SIZE_TIERS = tokenData.screenshotMarkSizeTiers as readonly number[];

/** 马赛克独立使用的小中大像素块尺寸档，不跟随描边工具线宽。 */
export const SCREENSHOT_MOSAIC_SIZE_TIERS = tokenData.screenshotMosaicSizeTiers as readonly number[];

/** 文字标注字号档位，覆盖常见截图文字工具尺寸。 */
export const SCREENSHOT_TEXT_FONT_SIZES = tokenData.screenshotTextFontSizes as readonly number[];

/** Tailwind 配置消费的 page tools token 快照。 */
export const PAGE_TOOLS_TAILWIND_TOKENS = tokenData.tailwindTokens;
