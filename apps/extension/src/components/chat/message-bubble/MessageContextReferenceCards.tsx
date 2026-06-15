/**
 * 说明：`MessageContextReferenceCards` 组件模块。
 *
 * 职责：
 * - 在用户消息历史中展示发送时附带的页面元素引用；
 * - 默认折叠，只在用户主动展开时渲染结构化详情；
 * - 保持用户消息正文、复制和导出语义不被引用内容污染。
 *
 * 边界：
 * - 本组件只消费已经持久化到消息上的 `contextReferences`；
 * - 不解析 `modelContext`，不读取附件实体，不触发发送链路。
 */
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useCallback, useState } from 'react';

import {
  buildElementContextDetailModel,
  type ElementContextDetailBody,
  type ElementContextMetadataItem,
  type ElementContextDetailPreview,
} from '@/lib/element-context-detail-model';
import type { MessageContextReference } from '@/types/chat';

interface MessageContextReferenceCardsProps {
  /** 当前用户消息 ID，用于生成展开区域的稳定 DOM ID。 */
  readonly messageId: string;
  /** 当前消息携带的上下文引用列表。 */
  readonly references?: MessageContextReference[];
  /** 国际化函数。 */
  readonly t: TFunction;
}

/**
 * 把任意消息 ID / 引用 ID 收敛成可放进 `aria-controls` 的 DOM id 片段。
 *
 * @param value - 原始标识。
 * @returns 仅包含安全字符的 id 片段。
 */
function toDomIdPart(value: string) {
  return String(value || 'context').replace(/[^a-zA-Z0-9_-]+/g, '-');
}

/**
 * 渲染结构化键值元数据。
 *
 * @param props - 元数据列表。
 * @returns 紧凑的 description list。
 */
function ReferenceMetadataList({ items }: { readonly items: ElementContextMetadataItem[] }) {
  if (items.length === 0) return null;

  return (
    <dl className="grid min-w-0 grid-cols-[3.75rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[11px] leading-4">
      {items.map((item) => (
        <div key={`${item.label}:${item.value}`} className="contents">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className={item.monospace ? 'min-w-0 break-all font-mono text-[11px] text-foreground/85' : 'min-w-0 break-words text-foreground/85'}>
            {item.href ? (
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                {item.value}
              </a>
            ) : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * 渲染保持原始换行的文本片段。
 *
 * @param props - 文本内容与可选测试标识。
 * @returns 适合正文、代码兜底和视觉说明的文本面板。
 */
function ReferencePreformattedText({ text, testId }: { readonly text: string; readonly testId?: string }) {
  return (
    <pre
      data-testid={testId}
      className="max-h-52 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/30 px-2 py-1.5 text-[11px] leading-5 text-foreground/90"
    >
      {text}
    </pre>
  );
}

/**
 * 渲染表格类型元素的详情主体。
 *
 * @param props - 表格详情主体和国际化函数。
 * @returns 原生 HTML 表格或结构缺失时的文本兜底。
 */
function ReferenceTableBody({ body, t }: { readonly body: Extract<ElementContextDetailBody, { kind: 'table' }>; readonly t: TFunction }) {
  if (!body.headers?.length || !body.rows?.length) {
    return <ReferencePreformattedText text={body.fallbackText || t('elementContext.detail.empty.table')} testId="message-context-reference-table-fallback" />;
  }

  return (
    <div className="min-w-0 overflow-x-auto rounded-md border border-border/60" data-testid="message-context-reference-table">
      <table className="min-w-full border-collapse text-[11px]">
        <thead className="bg-muted/45 text-foreground/90">
          <tr>
            {body.headers.map((header, index) => (
              <th key={`${index}:${header}`} className="border-b border-border/60 px-2 py-1.5 text-left font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-background even:bg-muted/20">
              {body.headers?.map((_, columnIndex) => (
                <td key={columnIndex} className="border-b border-border/40 px-2 py-1.5 align-top text-foreground/85">
                  {row[columnIndex] || ''}
                </td>
              ))}
            </tr>
          ))}
          {body.truncatedNotice ? (
            <tr>
              <td colSpan={body.headers.length} className="px-2 py-1.5 text-muted-foreground">
                {body.truncatedNotice}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 渲染表格类型元素的一级短预览。
 *
 * @param props - 表格预览主体和国际化函数。
 * @returns 最多三行的紧凑原生表格。
 */
function ReferenceTablePreview({ preview, t }: { readonly preview: Extract<ElementContextDetailPreview, { kind: 'table' }>; readonly t: TFunction }) {
  if (!preview.headers?.length || !preview.rows?.length) {
    return <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">{preview.fallbackText || t('elementContext.detail.empty.table')}</p>;
  }

  return (
    <div className="min-w-0 overflow-x-auto" data-testid="message-context-reference-table-preview">
      <table className="min-w-full border-collapse text-[11px] leading-4">
        <thead className="text-muted-foreground">
          <tr>
            {preview.headers.map((header, index) => (
              <th key={`${index}:${header}`} className="border-b border-border/50 px-1.5 py-1 text-left font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {preview.headers?.map((_, columnIndex) => (
                <td key={columnIndex} className="border-b border-border/30 px-1.5 py-1 align-top text-foreground/85">
                  {row[columnIndex] || ''}
                </td>
              ))}
            </tr>
          ))}
          {preview.truncatedNotice ? (
            <tr>
              <td colSpan={preview.headers.length} className="px-1.5 py-1 text-muted-foreground">
                {preview.truncatedNotice}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 渲染一级摘要预览，避免默认展开时出现大块正文面板。
 *
 * @param props - 预览主体和国际化函数。
 * @returns 单行或两行的短内容预览。
 */
function ReferencePreview({ preview, t }: { readonly preview: ElementContextDetailPreview; readonly t: TFunction }) {
  if (preview.kind === 'table') return <ReferenceTablePreview preview={preview} t={t} />;
  return <p data-testid={`message-context-reference-${preview.kind}-preview`} className="line-clamp-2 min-w-0 text-[11px] leading-4 text-foreground/85">{preview.text}</p>;
}

/**
 * 根据元素类型渲染展开态主体。
 *
 * @param props - 详情主体和国际化函数。
 * @returns 类型专用内容视图。
 */
function ReferenceBody({ body, t }: { readonly body: ElementContextDetailBody; readonly t: TFunction }) {
  if (body.kind === 'table') return <ReferenceTableBody body={body} t={t} />;
  if (body.kind === 'code') {
    return (
      <pre
        data-testid="message-context-reference-code"
        className="max-h-64 min-w-0 overflow-auto rounded-md bg-muted/35 px-2.5 py-1.5 text-[11px] leading-5 text-foreground/90"
      >
        <code className="whitespace-pre-wrap break-words">{body.text}</code>
      </pre>
    );
  }
  if (body.kind === 'image') {
    return body.description
      ? <ReferencePreformattedText text={body.description} testId="message-context-reference-image-description" />
      : <p className="text-[11px] text-muted-foreground">{t('elementContext.detail.empty.image')}</p>;
  }
  if (body.kind === 'visual') {
    return body.description
      ? <ReferencePreformattedText text={body.description} testId="message-context-reference-visual-description" />
      : <p className="text-[11px] text-muted-foreground">{t('elementContext.detail.empty.visual')}</p>;
  }
  return <ReferencePreformattedText text={body.text} testId="message-context-reference-text" />;
}

/** 判断二级“完整内容”是否有必要展示。 */
function hasFullContent(body: ElementContextDetailBody) {
  if (body.kind === 'table') return Boolean(body.headers?.length || body.rows?.length || body.fallbackText);
  if (body.kind === 'image' || body.kind === 'visual') return Boolean(body.description);
  return Boolean(body.text);
}

/** 切换二级 disclosure 的小按钮。 */
function DetailToggleButton({
  expanded,
  controls,
  onClick,
  children,
  testId,
}: {
  readonly expanded: boolean;
  readonly controls: string;
  readonly onClick: () => void;
  readonly children: string;
  readonly testId: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      data-chat-scroll-stable-mutation="true"
      data-testid={testId}
      className="rounded-md border border-border/60 px-2 py-1 text-[11px] leading-4 text-muted-foreground transition-colors hover:bg-muted/45 hover:text-foreground"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * 导出组件：`MessageContextReferenceCards`。
 *
 * @param props - 消息 ID、引用卡列表和国际化函数。
 * @returns 页面元素引用卡列表。
 */
export function MessageContextReferenceCards({ messageId, references, t }: MessageContextReferenceCardsProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [fullContentIds, setFullContentIds] = useState<Set<string>>(() => new Set());
  const [technicalIds, setTechnicalIds] = useState<Set<string>>(() => new Set());
  const visibleReferences = Array.isArray(references)
    ? references.filter((reference) => reference?.kind === 'element' && reference.element)
    : [];

  const toggleExpanded = useCallback((referenceId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(referenceId)) next.delete(referenceId);
      else next.add(referenceId);
      return next;
    });
  }, []);

  const toggleFullContent = useCallback((referenceId: string) => {
    setFullContentIds((current) => {
      const next = new Set(current);
      if (next.has(referenceId)) next.delete(referenceId);
      else next.add(referenceId);
      return next;
    });
  }, []);

  const toggleTechnical = useCallback((referenceId: string) => {
    setTechnicalIds((current) => {
      const next = new Set(current);
      if (next.has(referenceId)) next.delete(referenceId);
      else next.add(referenceId);
      return next;
    });
  }, []);

  if (visibleReferences.length === 0) return null;

  return (
    <div className="mb-2 flex w-full flex-col gap-2" data-testid="message-context-reference-list">
      {visibleReferences.map((reference, index) => {
        const expanded = expandedIds.has(reference.id);
        const buttonLabel = expanded ? t('message.collapseContextReference') : t('message.expandContextReference');
        const detail = buildElementContextDetailModel(reference, t);
        const bodyId = `msg-${toDomIdPart(messageId)}-context-${index}-${toDomIdPart(reference.id)}`;
        const fullContentId = `${bodyId}-full`;
        const technicalId = `${bodyId}-technical`;
        const fullExpanded = fullContentIds.has(reference.id);
        const technicalExpanded = technicalIds.has(reference.id);
        const canShowFullContent = hasFullContent(detail.fullBody);
        const canShowTechnical = detail.advancedMetadata.length > 0;

        return (
          <section
            key={reference.id}
            data-testid="message-context-reference-card"
            className="min-w-0 overflow-hidden rounded-lg border border-border/70 bg-card/80 text-card-foreground shadow-sm transition-[border-color,box-shadow] focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/30"
          >
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={bodyId}
              aria-label={buttonLabel}
              data-chat-scroll-stable-mutation="true"
              data-testid="message-context-reference-toggle"
              className="flex w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              onClick={() => toggleExpanded(reference.id)}
            >
              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex-shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {t('message.contextReference')}
                  </span>
                  <span className="truncate text-xs font-medium text-foreground">{detail.title}</span>
                </span>
                {detail.headerDetails.length > 0 ? (
                  <span className="mt-0.5 block truncate text-[11px] leading-4 text-muted-foreground/80">{detail.headerDetails.join(' · ')}</span>
                ) : null}
              </span>
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground" aria-hidden="true">
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </span>
            </button>
            {expanded ? (
              <div
                id={bodyId}
                className="space-y-1.5 border-t border-border/60 bg-background/80 px-2.5 py-1.5"
                data-testid="message-context-reference-body"
              >
                <section className="min-w-0" aria-label={t('elementContext.detail.section.metadata')}>
                  <ReferenceMetadataList items={detail.primaryMetadata} />
                </section>
                <section className="min-w-0" aria-label={t('elementContext.detail.section.preview')}>
                  <ReferencePreview preview={detail.preview} t={t} />
                </section>
                {(canShowFullContent || canShowTechnical) ? (
                  <div className="flex flex-wrap gap-1.5">
                    {canShowFullContent ? (
                      <DetailToggleButton
                        expanded={fullExpanded}
                        controls={fullContentId}
                        testId="message-context-reference-full-toggle"
                        onClick={() => toggleFullContent(reference.id)}
                      >
                        {fullExpanded ? t('elementContext.detail.hideFullContent') : t('elementContext.detail.showFullContent')}
                      </DetailToggleButton>
                    ) : null}
                    {canShowTechnical ? (
                      <DetailToggleButton
                        expanded={technicalExpanded}
                        controls={technicalId}
                        testId="message-context-reference-technical-toggle"
                        onClick={() => toggleTechnical(reference.id)}
                      >
                        {technicalExpanded ? t('elementContext.detail.hideTechnicalDetails') : t('elementContext.detail.showTechnicalDetails')}
                      </DetailToggleButton>
                    ) : null}
                  </div>
                ) : null}
                {fullExpanded && canShowFullContent ? (
                  <section id={fullContentId} className="min-w-0" aria-label={t('elementContext.detail.section.content')} data-testid="message-context-reference-full-content">
                    <ReferenceBody body={detail.fullBody} t={t} />
                  </section>
                ) : null}
                {technicalExpanded && canShowTechnical ? (
                  <section id={technicalId} className="min-w-0 rounded-md bg-muted/20 px-2 py-1.5" aria-label={t('elementContext.detail.section.technical')} data-testid="message-context-reference-technical-details">
                    <ReferenceMetadataList items={detail.advancedMetadata} />
                  </section>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
