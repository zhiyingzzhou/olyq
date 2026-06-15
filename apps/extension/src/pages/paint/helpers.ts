/**
 * 说明：`helpers` 页面模块。
 *
 * 职责：
 * - 承载 `helpers` 相关的当前文件实现与模块边界；
 * - 对外暴露 `isImageSize`、`isImageAspectRatio`、`buildEffectivePaintPrompt` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import type { PaintingImageRef } from '@/hooks/usePaintStore';
import { putImageAttachment } from '@/lib/attachments';

/**
 * 判断字符串是否符合 `宽x高` 的图片尺寸格式。
 *
 * 说明：
 * - 这里只做字符串格式守卫，不校验具体尺寸是否在模型支持范围内；
 * - 用于把表单输入安全缩窄成模板字面量类型。
 */
export function isImageSize(v: string): v is `${number}x${number}` {
  return /^\d+x\d+$/.test(v);
}

/**
 * 判断字符串是否符合 `宽:高` 的图片宽高比格式。
 *
 * 说明：
 * - 与 `isImageSize` 一样，只负责类型守卫，不负责业务合法性判断；
 * - 主要用于画板页的尺寸/比例输入归一化。
 */
export function isImageAspectRatio(v: string): v is `${number}:${number}` {
  return /^\d+:\d+$/.test(v);
}

/**
 * 构建本次生图实际发送的提示词。
 *
 * 说明：
 * - 全局生图提示词作为前缀，始终拼在用户提示词前面；
 * - 任一侧为空时直接回退另一侧，避免产生空段落。
 */
export function buildEffectivePaintPrompt(prefix: string, prompt: string) {
  const a = String(prefix || '').trim();
  const b = String(prompt || '').trim();
  if (!a) return b;
  if (!b) return a;
  return `${a}\n\n${b}`;
}

/** 根据全局默认生图模型构造新建绘图任务的种子数据。 */
export function buildDefaultPaintingSeed(defaultImageModel?: string) {
  const model = String(defaultImageModel || '').trim();
  return model ? { model } : undefined;
}

/**
 * 把用户选择/拖入的 File 入库为附件引用。
 * - 只在绘画 store 中保存最小引用结构
 * - 二进制实际存放在 attachments IDB
 */
export async function fileToImageRef(file: File): Promise<PaintingImageRef> {
  const ref = await putImageAttachment({
    blob: file,
    name: file.name || 'image',
    mime: file.type || 'image/*',
  });

  return {
    id: ref.id,
    name: ref.name,
    mime: ref.mime,
    size: ref.size,
  };
}
