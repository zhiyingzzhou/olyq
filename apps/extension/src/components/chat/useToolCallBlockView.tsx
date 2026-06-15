/**
 * 说明：`useToolCallBlockView` 组件模块。
 *
 * 职责：
 * - 承载 `useToolCallBlockView` 相关的当前文件实现与模块边界；
 * - 对外暴露 `ToolCallBlockProps`、`useToolCallBlockView` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Clock, Copy, Loader2, Wrench } from 'lucide-react';
import type { ToolCallInfo } from '@/types/chat';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/useToast';
import { formatI18nText } from '@/lib/i18n/format';
import { TraceDisclosure } from './TraceDisclosure';

/** 工具调用区块入参 */
export interface ToolCallBlockProps {
  /** 当前消息中产生的工具调用列表 */
  toolCalls: ToolCallInfo[];
  /** 中止当前工具执行。 */
  onAbort?: (toolCallId: string) => void;
}

/**
 * 在助手消息气泡中渲染工具调用区块：
 * - 展示工具名、参数、状态（调用中/完成）与结果
 */
export function useToolCallBlockView({ toolCalls, onAbort }: ToolCallBlockProps) {
  if (!toolCalls.length) return null;

  return (
    <div data-skip-search="true" className="space-y-1.5 mb-2">
      {toolCalls.map((tc) => (
        <GenericToolCard key={tc.toolCallId} tc={tc} onAbort={onAbort} />
      ))}
    </div>
  );
}

/**
 * 生成工具展示名。
 *
 * @param key - 原始工具名。
 * @returns 更适合 UI 展示的名称。
 */
function toolDisplayName(key: string) {
  if (!key.includes('__')) return key;
  if (!key.startsWith('builtin__')) return key.split('__').slice(1).join('__');
  return key;
}

/**
 * 推断工具类型徽章。
 *
 * @param toolName - 原始工具名。
 * @returns UI 展示的短徽章文本。
 */
function toolKindBadge(toolName: string) {
  if (toolName.startsWith('native__')) return 'NATIVE';
  if (toolName.startsWith('builtin__')) return 'BUILTIN';
  if (toolName.startsWith('mcp__')) return 'MCP';
  if (toolName.includes('__')) return 'TOOL';
  return 'TOOL';
}

/**
 * 把工具调用状态映射为图标、颜色和文案 key。
 *
 * @param status - 工具调用当前状态。
 */
function statusMeta(status: ToolCallInfo['status']) {
  switch (status) {
    case 'calling':
      return { icon: Loader2, color: 'text-blue-600', labelKey: 'chat.toolStatus.calling', spin: true } as const;
    case 'done':
      return { icon: CheckCircle2, color: 'text-green-600', labelKey: 'chat.toolStatus.done' } as const;
    case 'expired':
      return { icon: Clock, color: 'text-amber-600', labelKey: 'chat.toolStatus.expired' } as const;
    case 'cancelled':
      return { icon: Ban, color: 'text-muted-foreground', labelKey: 'chat.toolStatus.cancelled' } as const;
    case 'error':
    default:
      return { icon: AlertTriangle, color: 'text-destructive', labelKey: 'chat.toolStatus.error' } as const;
  }
}

/**
 * 将任意值转成适合复制/展示的 JSON 文本。
 *
 * @param value - 原始值。
 * @returns 格式化后的字符串。
 */
function copyJson(value: unknown): string {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

/** 判断工具调用输入是否为空。 */
function isEmptyToolInput(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0;
}

/** 读取普通对象字段。 */
function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** 提取 provider-hosted 搜索工具的查询词和来源数量。 */
function extractNativeSearchSummary(tc: ToolCallInfo): { query?: string; sourceCount?: number } | null {
  if (!tc.toolName.startsWith('native__')) return null;
  const resultRecord = readRecord(tc.result);
  const argsRecord = readRecord(tc.args);
  const action = readRecord(resultRecord?.action);
  const query = typeof action?.query === 'string' && action.query.trim()
    ? action.query.trim()
    : typeof resultRecord?.query === 'string' && resultRecord.query.trim()
      ? resultRecord.query.trim()
      : typeof argsRecord?.query === 'string' && argsRecord.query.trim()
        ? argsRecord.query.trim()
        : undefined;
  const resultSources = resultRecord?.sources;
  const sourceCount = Array.isArray(resultSources)
    ? resultSources.length
    : Array.isArray(tc.result)
      ? tc.result.length
      : undefined;
  if (!query && sourceCount === undefined) return null;
  return { query, sourceCount };
}

/** 通用工具卡片。 */
function GenericToolCard({
  tc,
  onAbort,
}: {
  tc: ToolCallInfo;
  onAbort?: (toolCallId: string) => void;
}) {
  const { t } = useTranslation();
  const meta = statusMeta(tc.status);
  const Icon = meta.icon;

  const [expanded, setExpanded] = useState(() => tc.status === 'calling');
  useEffect(() => {
    if (tc.status === 'calling') setExpanded(true);
    if (tc.status === 'done' || tc.status === 'error' || tc.status === 'expired' || tc.status === 'cancelled') setExpanded(false);
  }, [tc.status]);

  const displayName = toolDisplayName(tc.toolName);
  const badge = toolKindBadge(tc.toolName);
  const canAbort = tc.status === 'calling';
  const errorText = tc.error ? formatI18nText(t, tc.error) : '';
  const nativeSearchSummary = extractNativeSearchSummary(tc);
  const hasEmptyInput = isEmptyToolInput(tc.args);

  /** 复制当前工具调用的完整调试载荷。 */
  const handleCopy = async () => {
    const payload = {
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      status: tc.status,
      args: tc.args,
      result: tc.result,
      error: tc.error,
    };
    try {
      await navigator.clipboard.writeText(copyJson(payload));
      toast({ title: t('chat.copied'), description: t('chat.toolCopied') });
    } catch {
      toast({ title: t('common.error'), description: t('sidebar.clipboardFailed'), variant: 'destructive' });
    }
  };

  return (
    <TraceDisclosure
      open={expanded}
      onOpenChange={setExpanded}
      className="text-xs"
      leading={(
        <>
          <Icon className={`h-3.5 w-3.5 ${meta.color} ${('spin' in meta && meta.spin) ? 'animate-spin' : ''}`} />
          <Wrench className="h-3 w-3" />
        </>
      )}
      title={displayName}
      titleClassName="font-mono"
      trailing={(
        <>
          <span className="rounded-md border border-border/60 bg-background/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {badge}
          </span>
          <span className="text-[11px] text-muted-foreground/80">{t(meta.labelKey)}</span>
        </>
      )}
      contentClassName="space-y-2"
    >
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={handleCopy}
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          {t('chat.copy')}
        </Button>
        {canAbort && (
          <Button
            size="sm"
            variant="secondary"
            className="h-8"
            data-testid="tool-abort"
            onClick={() => onAbort?.(tc.toolCallId)}
          >
            {t('chat.toolAbort')}
          </Button>
        )}
      </div>

      <div className="min-w-0">
        <span className="text-muted-foreground/60">{t('chat.toolInput')}：</span>
        {hasEmptyInput ? (
          <span className="ml-1 text-muted-foreground">{t('chat.toolInputEmpty')}</span>
        ) : (
          <pre className="mt-0.5 min-w-0 max-h-40 overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs leading-relaxed text-muted-foreground">
            {copyJson(tc.args)}
          </pre>
        )}
      </div>
      {nativeSearchSummary ? (
        <div className="grid gap-1 rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-xs text-muted-foreground">
          {nativeSearchSummary.query ? (
            <div className="min-w-0">
              <span className="text-muted-foreground/60">{t('chat.toolSearchQuery')}：</span>
              <span className="break-words [overflow-wrap:anywhere]">{nativeSearchSummary.query}</span>
            </div>
          ) : null}
          {nativeSearchSummary.sourceCount !== undefined ? (
            <div>
              <span className="text-muted-foreground/60">{t('chat.toolSearchSources')}：</span>
              <span>{nativeSearchSummary.sourceCount}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {tc.status === 'done' && tc.result !== undefined && (
        <div className="min-w-0">
          <span className="text-muted-foreground/60">{t('chat.result')}：</span>
          <pre className="mt-0.5 min-w-0 max-h-40 overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs leading-relaxed text-muted-foreground">
            {copyJson(tc.result)}
          </pre>
        </div>
      )}
      {(tc.status === 'error' || tc.status === 'expired' || tc.status === 'cancelled') && errorText && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {errorText}
        </div>
      )}
    </TraceDisclosure>
  );
}
