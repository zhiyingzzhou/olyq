/**
 * 说明：`useChatTranslation` 组件模块。
 *
 * 职责：
 * - 承载 `useChatTranslation` 相关的当前文件实现与模块边界；
 * - 对外暴露 `UseChatTranslationOptions`、`ChatTranslationMode`、`UseChatTranslationResult` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { toast } from '@/hooks/useToast';
import { blurActiveElement } from '@/components/ui/radix-auto-blur';
import { DEFAULT_SETTINGS } from '@/types/chat';
import { streamChatWithDeveloperMode as streamChat } from '@/lib/developer/stream-chat-with-developer-mode';
import { normalizeSupportedTranslationSelection } from '@/lib/chat/translation-languages';
import { formatI18nText } from '@/lib/i18n/format';

/** 输入区翻译控制器依赖的最小翻译函数签名。 */
type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

/**
 * 输入区翻译 hook 入参。
 */
export interface UseChatTranslationOptions {
  /**
   * 国际化函数。
   */
  t: TranslateFn;
  /**
   * 当前输入框文本。
   */
  text: string;
  /**
   * 更新输入框文本的回调。
   */
  setText: Dispatch<SetStateAction<string>>;
  /**
   * 输入框引用，用于翻译完成后恢复焦点。
   */
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /**
   * 当前聊天主流程是否在 loading。
   */
  isLoading: boolean;
  /**
   * 当前聊天模型。
   */
  currentModel?: string;
  /**
   * 当前可用模型 ID 列表。
   */
  availableModelIds: string[];
  /**
   * 支持的目标语言集合。
   */
  translateLanguages: string[];
  /**
   * 当前选中的目标语言。
   */
  translateTargetLanguage: string;
  /**
   * 显式指定的翻译模型。
   */
  translateModel?: string;
  /**
   * 点击翻译按钮前是否需要二次确认。
   */
  showTranslateConfirm: boolean;
  /**
   * 开始翻译前需要关闭的其它弹层。
   */
  closeAll: () => void;
}

/**
 * 翻译触发模式。
 */
export type ChatTranslationMode = 'button' | 'auto';

/**
 * 输入区翻译 hook 返回值。
 */
export interface UseChatTranslationResult {
  /**
   * 当前是否正在翻译。
   */
  isTranslating: boolean;
  /**
   * 翻译确认框是否打开。
   */
  translateConfirmOpen: boolean;
  /**
   * 归一化后的目标语言。
   */
  resolvedTranslateTargetLanguage: string;
  /**
   * 直接发起翻译流程。
   */
  runTranslate: (sourceText: string, mode: ChatTranslationMode) => Promise<void>;
  /**
   * 从按钮入口请求翻译，必要时先打开确认框。
   */
  requestTranslateFromButton: () => void;
  /**
   * 取消翻译确认。
   */
  cancelTranslateConfirm: () => void;
  /**
   * 确认后从按钮入口发起翻译。
   */
  confirmTranslateFromButton: () => void;
}

/**
 * 输入区翻译控制器。
 *
 * 负责根据当前语言设置调用轻量翻译 prompt，对输入框文本执行“只输出译文”的模型翻译，
 * 并处理确认框、剪贴板回退与翻译中止。
 *
 * @param options - 国际化、输入框状态与翻译配置。
 * @returns 翻译状态、确认框控制器与翻译动作。
 */
export function useChatTranslation({
  t,
  text,
  setText,
  inputRef,
  isLoading,
  currentModel,
  availableModelIds,
  translateLanguages,
  translateTargetLanguage,
  translateModel,
  showTranslateConfirm,
  closeAll,
}: UseChatTranslationOptions): UseChatTranslationResult {
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateConfirmOpen, setTranslateConfirmOpen] = useState(false);
  const translateAbortRef = useRef<AbortController | null>(null);
  const translateConfirmSourceRef = useRef('');

  /**
   * 归一化目标语言，保证最终一定是受支持的语言值。
   */
  const resolvedTranslateTargetLanguage = useMemo(() => {
    return normalizeSupportedTranslationSelection({
      languages: translateLanguages,
      targetLanguage: translateTargetLanguage,
      fallbackLanguages: [],
    }).targetLanguage ?? '';
  }, [translateLanguages, translateTargetLanguage]);

  useEffect(() => {
    return () => {
      translateAbortRef.current?.abort();
      translateAbortRef.current = null;
    };
  }, []);

  /**
   * 执行一次完整翻译流程。
   */
  const runTranslate = useCallback(async (sourceText: string, mode: ChatTranslationMode) => {
    const source = String(sourceText ?? '');
    if (!source.trim()) return;
    const lang = String(resolvedTranslateTargetLanguage || '').trim();
    if (!lang) return;
    if (isLoading || isTranslating) return;

    const model = String(translateModel || currentModel || availableModelIds[0] || DEFAULT_SETTINGS.defaultModel);

    translateAbortRef.current?.abort();
    const controller = new AbortController();
    translateAbortRef.current = controller;
    setIsTranslating(true);
    closeAll();

    if (mode === 'button') {
      try {
        await navigator.clipboard.writeText(source);
      } catch {
        // Clipboard is best-effort only.
      }
    }

    let out = '';
    const system = t('translation.inputSystemPrompt');
    const prompt = t('translation.inputUserPrompt', { language: lang, text: source });

    streamChat({
      developerSource: 'input-translation',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      model,
      temperature: 0.2,
      topP: 0.9,
      maxTokens: 2048,
      enableWebSearch: false,
      webSearchProviderId: undefined,
      signal: controller.signal,
      onDelta: (chunk) => {
        out += chunk;
      },
      onDone: () => {
        if (controller.signal.aborted) return;
        translateAbortRef.current = null;
        setIsTranslating(false);
        const result = out.trim();
        if (!result) {
          toast({ title: t('common.error'), description: t('common.error'), variant: 'destructive' });
          return;
        }
        setText(result);
        inputRef.current?.focus();
      },
      onError: (error) => {
        if (controller.signal.aborted) return;
        translateAbortRef.current = null;
        setIsTranslating(false);
        toast({ title: t('common.error'), description: formatI18nText(t, error), variant: 'destructive' });
      },
    });
  }, [
    availableModelIds,
    closeAll,
    currentModel,
    inputRef,
    isLoading,
    isTranslating,
    resolvedTranslateTargetLanguage,
    setText,
    t,
    translateModel,
  ]);

  /**
   * 从翻译按钮入口发起翻译；如开启确认框则先缓存原文。
   */
  const requestTranslateFromButton = useCallback(() => {
    if (!resolvedTranslateTargetLanguage) return;
    if (!text.trim() || isLoading || isTranslating) return;

    if (showTranslateConfirm) {
      /**
       * 说明：
       * - 翻译确认框从聊天输入区内触发时，输入框通常仍保持 focus；
       * - 若直接打开 Radix AlertDialog，sidepanel root 会在旧焦点还留在 textarea 时进入 `aria-hidden`；
       * - 这里先关闭输入区临时浮层并同步 blur 当前焦点，再进入确认框，避免 Chromium 输出
       *   “Blocked aria-hidden on an element because its descendant retained focus.” 警告。
       */
      closeAll();
      blurActiveElement();
      translateConfirmSourceRef.current = text;
      setTranslateConfirmOpen(true);
      return;
    }

    void runTranslate(text, 'button');
  }, [closeAll, isLoading, isTranslating, resolvedTranslateTargetLanguage, runTranslate, showTranslateConfirm, text]);

  /**
   * 取消翻译确认框。
   */
  const cancelTranslateConfirm = useCallback(() => {
    translateConfirmSourceRef.current = '';
    setTranslateConfirmOpen(false);
  }, []);

  /**
   * 确认后发起按钮翻译。
   */
  const confirmTranslateFromButton = useCallback(() => {
    const source = translateConfirmSourceRef.current || text;
    translateConfirmSourceRef.current = '';
    setTranslateConfirmOpen(false);
    void runTranslate(source, 'button');
  }, [runTranslate, text]);

  const result: UseChatTranslationResult = {
    isTranslating,
    translateConfirmOpen,
    resolvedTranslateTargetLanguage,
    runTranslate,
    requestTranslateFromButton,
    cancelTranslateConfirm,
    confirmTranslateFromButton,
  };
  return result;
}
