/**
 * 说明：`image-gen-runtime` 基础能力模块。
 *
 * 职责：
 * - 承载 `image-gen-runtime` 相关的当前文件实现与模块边界；
 * - 对外暴露 `generateImagesRuntime` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { generateImages } from './image-gen';

type GenerateImagesFn = typeof generateImages;
type GenerateImagesParams = Parameters<GenerateImagesFn>[0];
type GenerateImagesResult = Awaited<ReturnType<GenerateImagesFn>>;

/**
 * 按需加载图片生成运行时。
 *
 * 说明：
 * - 图片生成只会由明确的用户动作触发；
 * - 将其从聊天区与 Paint 页冷启动路径中剥离，避免把 port 编排、下载与权限兜底逻辑提前打进首包。
 */
export async function generateImagesRuntime(params: GenerateImagesParams): Promise<GenerateImagesResult> {
  const { generateImages } = await import('./image-gen');
  return await generateImages(params);
}
