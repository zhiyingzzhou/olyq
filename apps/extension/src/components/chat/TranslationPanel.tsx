/**
 * 说明：`TranslationPanel` 组件模块。
 *
 * 职责：
 * - 承载 `TranslationPanel` 相关的当前文件实现与模块边界；
 * - 对外暴露 `TranslationPanel` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowRightLeft, Copy, Check, Loader2, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TooltipAction } from '@/components/ui/tooltip-action';
import { streamChatWithDeveloperMode as streamChat } from '@/lib/developer/stream-chat-with-developer-mode';
import { useTranslation } from 'react-i18next';
import { formatI18nText } from '@/lib/i18n/format';

const LANGUAGES = [
  { id: 'auto', labelKey: 'translation.languages.auto' },
  { id: 'zh', labelKey: 'translation.languages.zh' },
  { id: 'en', labelKey: 'translation.languages.en' },
  { id: 'ja', labelKey: 'translation.languages.ja' },
  { id: 'ko', labelKey: 'translation.languages.ko' },
  { id: 'fr', labelKey: 'translation.languages.fr' },
  { id: 'de', labelKey: 'translation.languages.de' },
  { id: 'es', labelKey: 'translation.languages.es' },
  { id: 'ru', labelKey: 'translation.languages.ru' },
  { id: 'pt', labelKey: 'translation.languages.pt' },
  { id: 'ar', labelKey: 'translation.languages.ar' },
] as const;

/** 语言 ID（来自 LANGUAGES 常量） */
type LangId = (typeof LANGUAGES)[number]['id'];

/**
 * 把语言 ID 转成展示文案。
 *
 * @param id - 语言 ID。
 * @returns 人类可读的语言名称。
 */
function langLabel(t: (key: string) => string, id: string) {
  const language = LANGUAGES.find((l) => l.id === id);
  return language ? t(language.labelKey) : id;
}

/** 翻译面板入参。 */
interface Props {
  /** 用于发起翻译请求的模型（"providerId/modelId"） */
  model: string;
  /** 关闭面板回调 */
  onClose: () => void;
}

/**
 * 翻译面板。
 *
 * @param props - 翻译模型与关闭回调。
 * @returns 双栏翻译输入/输出界面。
 */
export function TranslationPanel({ model, onClose }: Props) {
  const { t } = useTranslation();
  const [source, setSource] = useState('');
  const [result, setResult] = useState('');
  const [sourceLang, setSourceLang] = useState<LangId>('auto');
  const [targetLang, setTargetLang] = useState<LangId>('zh');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  /** 瑕疵-11 修复：alive 标记，防止 unmount 后 setState */
  const aliveRef = useRef(true);

  useEffect(() => {
    return () => {
      aliveRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const translate = useCallback(() => {
    const text = source.trim();
    if (!text) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setResult('');
    setLoading(true);

    const fromLabel = sourceLang === 'auto' ? t('translation.autoDetectSource') : `${t('translation.sourceIs')}${langLabel(t, sourceLang)}`;
    const toLabel = langLabel(t, targetLang);
    const prompt = [
      `${t('translation.promptRole')}${fromLabel}${t('translation.promptTranslateTo')}${toLabel}${t('translation.promptPeriod')}`,
      `${t('translation.promptRequirements')}`,
      `- ${t('translation.promptOnlyResult')}`,
      `- ${t('translation.promptKeepFormat')}`,
      `- ${t('translation.promptKeepTone')}`,
      '',
      text,
    ].join('\n');

    let buf = '';
    void streamChat({
      developerSource: 'translation-panel',
      messages: [{ role: 'user', content: prompt }],
      model,
      temperature: 0.3,
      topP: 0.9,
      maxTokens: 4096,
      signal: controller.signal,
      onDelta: (chunk) => {
        buf += chunk;
        if (aliveRef.current) setResult(buf);
      },
      onDone: () => { if (aliveRef.current) setLoading(false); },
      onError: (err) => {
        if (!aliveRef.current) return;
        setLoading(false);
        if (err.key !== 'errors.cancelled' && err.key !== 'chat.generationCancelled') {
          setResult((prev) => prev + `\n\n[${t('common.error')}] ${formatI18nText(t, err)}`);
        }
      },
    });
  }, [model, source, sourceLang, t, targetLang]);

  /** 中止当前翻译流。 */
  const stop = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  /**
   * 交换源语言与目标语言，并在已有结果时把译文回填到原文区。
   */
  const swap = () => {
    if (sourceLang === 'auto') return;
    const prevSource = sourceLang;
    setSourceLang(targetLang);
    setTargetLang(prevSource);
    if (result) {
      setSource(result);
      setResult('');
    }
  };

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 复制当前译文到剪贴板。 */
  const copyResult = () => {
    if (!result) return;
    navigator.clipboard.writeText(result).catch(() => { /* clipboard unavailable */ });
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => { copyTimerRef.current = null; setCopied(false); }, 2000);
  };

  return (
    <div data-testid="translation-panel" className="flex-1 flex flex-col min-w-0">
      {/* 头部 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-background/50 backdrop-blur-sm">
        <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-sm">{t('translation.title')}</span>
        <div className="flex-1" />
        <TooltipAction tooltip={t('common.close')}>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </TooltipAction>
      </div>

      {/* 语言选择 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Select value={sourceLang} onValueChange={(v) => setSourceLang(v as LangId)}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.id} value={l.id} className="text-xs">
                {t(l.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <TooltipAction tooltip={t('translation.swap')}>
          <button
            onClick={swap}
            disabled={sourceLang === 'auto'}
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
          </button>
        </TooltipAction>

        <Select value={targetLang} onValueChange={(v) => setTargetLang(v as LangId)}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LANGUAGES.filter((l) => l.id !== 'auto').map((l) => (
              <SelectItem key={l.id} value={l.id} className="text-xs">{t(l.labelKey)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 双栏区域 */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* 原文 */}
        <div className="flex-1 min-h-0 p-3 border-b border-border">
          <Textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder={t('translation.inputPlaceholder')}
            className="h-full resize-none border-0 bg-transparent focus-visible:ring-0 text-sm"
          />
        </div>

        {/* 译文 */}
        <div className="flex-1 min-h-0 p-3 bg-muted/20 relative">
          <div className="h-full overflow-y-auto text-sm whitespace-pre-wrap">
            {result || (
              <span className="text-muted-foreground/50">{t('translation.resultPlaceholder')}</span>
            )}
          </div>
          {result && (
            <TooltipAction tooltip={copied ? t('chat.copied') : t('chat.copy')}>
              <button
                onClick={copyResult}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/80 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors border border-border/50"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </TooltipAction>
          )}
        </div>
      </div>

      {/* 底部 */}
      <div className="flex items-center gap-2 px-4 py-2 border-t border-border">
        {loading ? (
          <Button size="sm" variant="destructive" onClick={stop} className="text-xs">
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> {t('chat.stop')}
          </Button>
        ) : (
          <Button size="sm" onClick={translate} disabled={!source.trim()} className="text-xs">
            {t('translation.translate')}
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {source.length > 0 ? t('translation.charsCount', { count: source.length }) : ''}
        </span>
      </div>
    </div>
  );
}
