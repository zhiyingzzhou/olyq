/**
 * 说明：`MessageOutline` 组件模块。
 *
 * 职责：
 * - 承载 `MessageOutline` 相关的当前文件实现与模块边界；
 * - 对外暴露 `OutlineHeading`、`MessageOutline` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useMemo, useState } from 'react';

/**
 * 将 Markdown 行内语法粗略剥离为纯文本。
 *
 * @param mdRaw - 原始 Markdown 文本。
 * @returns 适合用作大纲标题的纯文本内容。
 */
function markdownInlineToPlainText(mdRaw: string) {
  let s = String(mdRaw || '');
  if (!s) return '';
  s = s.replace(/`([^`]+)`/g, '$1');
  s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  s = s.replace(/(\*\*|__)(.*?)\1/g, '$2');
  s = s.replace(/(\*|_)(.*?)\1/g, '$2');
  s = s.replace(/~~(.*?)~~/g, '$1');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/[ \t]+/g, ' ');
  return s.trim();
}

/**
 * 对选择器中的 ID 片段做转义。
 *
 * @param value - 原始选择器值。
 * @returns 可安全用于 `querySelector` 的转义结果。
 */
function cssEscape(value: string) {
  const v = String(value || '');
  const esc = (globalThis as unknown as { CSS?: { escape?: (s: string) => string } }).CSS?.escape;
  if (typeof esc === 'function') return esc(v);
  return v.replace(/["\\]/g, '\\$&');
}

/**
 * 单个 Markdown 标题在消息大纲中的投影结构。
 *
 * 说明：
 * - `id` 会和渲染后的标题节点保持一一对应，供目录点击跳转；
 * - `level` 与 `text` 用于还原层级缩进和展示文案。
 */
export type OutlineHeading = {
  /** 渲染到消息 DOM 中的标题锚点 ID。 */
  readonly id: string;
  /** 标题层级，范围为 1-6。 */
  readonly level: number;
  /** 标题纯文本内容。 */
  readonly text: string;
};

/**
 * 从 Markdown 文本中提取标题大纲。
 *
 * @param markdown - 原始 Markdown。
 * @param idPrefix - 当前消息的锚点前缀。
 * @returns 可直接用于渲染目录导航的标题列表。
 */
function extractHeadings(markdown: string, idPrefix: string): OutlineHeading[] {
  const src = String(markdown || '').replace(/\r\n/g, '\n');
  if (!src.trim()) return [];

  const lines = src.split('\n');
  let inFence = false;
  const out: OutlineHeading[] = [];

  for (const line of lines) {
    const l = String(line || '');
    if (/^```/.test(l)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(l);
    if (!m) continue;

    const level = m[1]!.length;
    let text = String(m[2] || '').trim();
    // 去掉 markdown 的 closing #（例如 "## Title ##"）
    text = text.replace(/\s+#+\s*$/, '').trim();
    const plain = markdownInlineToPlainText(text);
    if (!plain) continue;

    const idx = out.length;
    out.push({ id: `${idPrefix}-h-${idx}`, level, text: plain });
  }

  return out;
}

/** 消息大纲组件属性。 */
interface MessageOutlineProps {
  /** 当前消息的 Markdown 内容。 */
  readonly markdown: string;
  /** 消息级锚点前缀，用于生成唯一标题 ID。 */
  readonly idPrefix: string;
  /** 实际消息内容容器，用于查找标题节点并滚动定位。 */
  readonly containerRef: React.RefObject<HTMLElement | null>;
}

/**
 * 消息正文大纲导航。
 *
 * 从 Markdown 标题中提取目录，在 hover 时展示可点击面板，
 * 让用户快速跳转到长消息中的某个章节。
 */
export function MessageOutline({ markdown, idPrefix, containerRef }: MessageOutlineProps) {
  const headings = useMemo(() => extractHeadings(markdown, idPrefix), [idPrefix, markdown]);
  /** 当前高亮跳转中的标题 ID。 */
  const [activeId, setActiveId] = useState<string | null>(null);

  if (headings.length === 0) return null;

  /**
   * 跳转到指定标题。
   *
   * @param hid - 目标标题锚点 ID。
   */
  const jump = (hid: string) => {
    const root = containerRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`#${cssEscape(hid)}`);
    if (!el) return;
    setActiveId(hid);
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    window.setTimeout(() => setActiveId(null), 1200);
  };

  return (
    <div className="absolute right-2 top-3 bottom-3 flex items-start">
      <div className="relative">
        {/* 默认只展示紧凑层级点，避免长消息一直占用过多视觉空间。 */}
        <div className="flex flex-col items-end gap-1.5 opacity-50 group-hover:opacity-100 transition-opacity">
          {headings.slice(0, 14).map((h) => (
            <span
              key={h.id}
              className="block w-1.5 h-1.5 rounded-full bg-muted-foreground/70"
              style={{ marginLeft: Math.min(14, (h.level - 1) * 4) }}
            />
          ))}
          {headings.length > 14 && (
            <span className="block w-1 h-1 rounded-full bg-muted-foreground/40" />
          )}
        </div>

        {/* hover 后再展开完整目录面板，保持默认阅读干扰最小。 */}
        <div className="absolute right-0 top-0 w-64 max-h-56 overflow-y-auto rounded-lg border border-border/60 bg-popover/90 backdrop-blur shadow-lg p-2 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200">
          <div className="space-y-0.5">
            {headings.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => jump(h.id)}
                className={`w-full text-left text-xs px-2 py-1 rounded-md transition-colors ${
                  activeId === h.id ? 'bg-primary/15 text-primary' : 'hover:bg-accent'
                }`}
              >
                <span
                  className="block truncate"
                  style={{ paddingLeft: Math.min(20, (h.level - 1) * 10) }}
                  title={h.text}
                >
                  {h.text}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
