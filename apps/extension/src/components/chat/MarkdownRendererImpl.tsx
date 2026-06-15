/**
 * 说明：`MarkdownRendererImpl` 组件模块。
 *
 * 职责：
 * - 承载 `MarkdownRendererImpl` 相关的当前文件实现与模块边界；
 * - 对外暴露 `MarkdownRenderer` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, ZoomIn } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { subscribeThemeChange } from '@/lib/theme';
import { MediaPreviewOverlay } from '@/components/chat/MediaPreviewOverlay';
import { MarkdownMermaidBlock } from './MarkdownMermaidBlock';
import { MarkdownLinkPreview } from './MarkdownLinkPreview';
import { reloadOnceForDynamicImportError } from './markdown-runtime-recovery';
import { logger } from '@/lib/logger';

/* ---------- Mermaid 渲染（懒加载） ---------- */

let katexStylesInstalled = false;
type CodeHighlightRuntime = {
  SyntaxHighlighter: typeof import('react-syntax-highlighter')['Prism'];
  oneDark: typeof import('react-syntax-highlighter/dist/esm/styles/prism')['oneDark'];
  oneLight: typeof import('react-syntax-highlighter/dist/esm/styles/prism')['oneLight'];
};
type MathRuntime = {
  remarkMath: typeof import('remark-math')['default'];
  rehypeKatex: typeof import('rehype-katex')['default'];
  ensureKatexStyles: () => void;
};

let codeHighlightRuntime: CodeHighlightRuntime | null = null;
let codeHighlightRuntimePromise: Promise<CodeHighlightRuntime> | null = null;
let mathRuntime: MathRuntime | null = null;
let mathRuntimePromise: Promise<MathRuntime> | null = null;

/**
 * 内部函数：`createKatexStylesInstaller`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function createKatexStylesInstaller(cssText: string) {
  return () => {
    if (katexStylesInstalled || typeof document === 'undefined') return;

    const existing = document.querySelector('style[data-olyq-katex="1"]');
    if (existing) {
      katexStylesInstalled = true;
      return;
    }

    const style = document.createElement('style');
    style.setAttribute('data-olyq-katex', '1');
    style.textContent = cssText;
    document.head.appendChild(style);
    katexStylesInstalled = true;
  };
}

/**
 * 内部函数：`loadCodeHighlightRuntime`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function loadCodeHighlightRuntime() {
  if (codeHighlightRuntime) return Promise.resolve(codeHighlightRuntime);
  codeHighlightRuntimePromise ??= Promise.all([
    import('react-syntax-highlighter/dist/esm/prism-async-light'),
    import('react-syntax-highlighter/dist/esm/styles/prism'),
  ])
    .then(([highlighterModule, stylesModule]) => {
      codeHighlightRuntime = {
        SyntaxHighlighter: highlighterModule.default as unknown as typeof import('react-syntax-highlighter')['Prism'],
        oneDark: stylesModule.oneDark,
        oneLight: stylesModule.oneLight,
      };
      return codeHighlightRuntime;
    })
    .catch((error) => {
      codeHighlightRuntimePromise = null;
      throw error;
    });
  return codeHighlightRuntimePromise;
}

/**
 * 内部函数：`loadMathRuntime`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function loadMathRuntime() {
  if (mathRuntime) return Promise.resolve(mathRuntime);
  mathRuntimePromise ??= Promise.all([
    import('remark-math'),
    import('rehype-katex'),
    import('katex/dist/katex.min.css?inline'),
  ])
    .then(([remarkMathModule, rehypeKatexModule, katexCssTextModule]) => {
      mathRuntime = {
        remarkMath: remarkMathModule.default,
        rehypeKatex: rehypeKatexModule.default,
        ensureKatexStyles: createKatexStylesInstaller(katexCssTextModule.default),
      };
      return mathRuntime;
    })
    .catch((error) => {
      mathRuntimePromise = null;
      throw error;
    });
  return mathRuntimePromise;
}

/**
 * 内部函数：`hasMarkdownCodeBlocks`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function hasMarkdownCodeBlocks(content: string) {
  return /```[\s\S]*?```|~~~[\s\S]*?~~~/.test(content);
}

/**
 * 内部函数：`hasMarkdownMath`。
 *
 * @remarks
 * 用于拆分当前文件中的局部处理步骤，输入输出、副作用和调用时机需结合同文件上下文理解。
 */
function hasMarkdownMath(content: string) {
  return /\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\$[^$\n]+\$/.test(content);
}

/* ---------- 代码块 ---------- */

/**
 * Markdown 代码块渲染器。
 *
 * @param props - 代码语言与内容。
 * @returns 带复制按钮和主题联动的语法高亮代码块。
 */
function CodeBlock({
  language,
  children,
  runtime,
}: {
  language: string;
  children: string;
  runtime: CodeHighlightRuntime | null;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  // 修复 UI-010：代码块主题跟随 light/dark 模式
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const off = subscribeThemeChange(() => setIsDark(document.documentElement.classList.contains('dark')));
    return () => off();
  }, []);

  /** 复制当前代码块文本。 */
  const copy = () => {
    void navigator.clipboard.writeText(children).catch(() => { /* clipboard unavailable */ });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const SyntaxHighlighter = runtime?.SyntaxHighlighter;

  return (
    <div className="relative group my-2 overflow-hidden rounded-md border border-border/60">
      <div className="flex items-center justify-between bg-muted/60 px-3 py-1 text-[11px] leading-4 text-muted-foreground">
        <span className="font-mono">{language || t('markdown.code')}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 transition-colors hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t('chat.copied') : t('chat.copy')}
        </button>
      </div>
      {SyntaxHighlighter ? (
        <SyntaxHighlighter
          style={isDark ? runtime.oneDark : runtime.oneLight}
          language={language || 'text'}
          PreTag="div"
          customStyle={{
            margin: 0,
            borderRadius: 0,
            fontSize: '0.8125rem',
            lineHeight: 1.55,
            overflowX: 'auto',
            padding: '0.65rem 0.85rem',
          }}
          showLineNumbers={children.includes('\n')}
        >
          {children}
        </SyntaxHighlighter>
      ) : (
        <pre className="m-0 overflow-x-auto whitespace-pre bg-muted/20 px-3 py-2 text-[13px] leading-5">
          <code>{children}</code>
        </pre>
      )}
    </div>
  );
}

/* ---------- 图片（支持点击放大） ---------- */

/**
 * Markdown 内联图片渲染器。
 *
 * @param props - 图片地址与可选说明文本。
 * @returns 带安全校验、失败兜底和点击放大的图片节点。
 */
function ImageRenderer({ src, alt }: { src?: string; alt?: string }) {
  const { t } = useTranslation();
  const [zoomed, setZoomed] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const url = String(src || '').trim();
  const caption = String(alt || '').trim();
  if (!url) return null;

  if (!isSafeImageSrc(url)) {
    return <span className="inline-flex items-center gap-1 text-sm text-muted-foreground italic">{t('markdown.imageBlockedUnsafe')}</span>;
  }

  if (loadError) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground italic">
        {t('markdown.imageLoadFailed', { alt: caption || url })}
      </span>
    );
  }

  return (
    <>
      <span className="relative inline-block my-2 group/img cursor-pointer" onClick={() => setZoomed(true)}>
        <img
          src={url}
          alt={caption}
          onError={() => setLoadError(true)}
          className="max-w-full max-h-[400px] rounded-lg border border-border/60 object-contain"
          loading="lazy"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/img:bg-black/20 rounded-lg transition-colors">
          <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover/img:opacity-80 transition-opacity" />
        </span>
      </span>
      <MediaPreviewOverlay
        open={zoomed}
        onClose={() => setZoomed(false)}
        ariaLabel={caption || t('chat.imagePreviewTitle')}
      >
        <img
          src={url}
          alt={caption}
          className="max-w-[92vw] max-h-[92vh] object-contain rounded-lg shadow-2xl"
        />
      </MediaPreviewOverlay>
    </>
  );
}

/* ---------- Markdown 渲染器 ---------- */

/** P-03 修复：isSafeImageSrc 提取到模块级，避免每次渲染重建 */
/**
 * 校验图片地址是否属于当前允许渲染的安全协议。
 *
 * @param raw - 原始图片地址。
 * @returns `true` 表示允许在消息里直接渲染。
 */
function isSafeImageSrc(raw: string) {
  const s = raw.trim();
  return (
    s.startsWith('data:image/') ||
    s.startsWith('blob:') ||
    s.startsWith('https://') ||
    s.startsWith('http://')
  );
}

/**
 * 导出组件：`MarkdownRenderer`。
 *
 * @remarks
 * 负责承载当前文件对应的界面渲染、交互编排和视图层边界。
 */
export const MarkdownRenderer = memo(function MarkdownRenderer({ content, idPrefix, isStreaming = false }: { content: string; idPrefix?: string; isStreaming?: boolean }) {
  const trimmed = useMemo(() => String(content || ''), [content]);
  const needsCodeHighlight = useMemo(() => hasMarkdownCodeBlocks(trimmed), [trimmed]);
  const needsMathRuntime = useMemo(() => hasMarkdownMath(trimmed), [trimmed]);
  const [codeRuntime, setCodeRuntime] = useState<CodeHighlightRuntime | null>(
    () => (needsCodeHighlight ? codeHighlightRuntime : null),
  );
  const [loadedMathRuntime, setLoadedMathRuntime] = useState<MathRuntime | null>(
    () => (needsMathRuntime ? mathRuntime : null),
  );
  const headingIndexRef = useRef(0);
  // 约束：每次渲染从 0 开始计数，保证同一段 markdown 的 heading id 稳定可预测
  headingIndexRef.current = 0;

  useEffect(() => {
    if (!needsCodeHighlight) {
      setCodeRuntime(null);
      return;
    }
    let cancelled = false;
    void loadCodeHighlightRuntime()
      .then((runtime) => {
        if (!cancelled) setCodeRuntime(runtime);
      })
      .catch((error) => {
        if (reloadOnceForDynamicImportError(error)) return;
        logger.general.error('markdown code highlight runtime load failed', error);
      });
    return () => {
      cancelled = true;
    };
  }, [needsCodeHighlight]);

  useEffect(() => {
    if (!needsMathRuntime) {
      setLoadedMathRuntime(null);
      return;
    }
    let cancelled = false;
    void loadMathRuntime()
      .then((runtime) => {
        runtime.ensureKatexStyles();
        if (!cancelled) setLoadedMathRuntime(runtime);
      })
      .catch((error) => {
        if (reloadOnceForDynamicImportError(error)) return;
        logger.general.error('markdown math runtime load failed', error);
      });
    return () => {
      cancelled = true;
    };
  }, [needsMathRuntime]);

  const remarkPlugins = useMemo<React.ComponentProps<typeof ReactMarkdown>['remarkPlugins']>(() => {
    if (!loadedMathRuntime) return [remarkGfm];
    return [remarkGfm, loadedMathRuntime.remarkMath];
  }, [loadedMathRuntime]);

  const rehypePlugins = useMemo<React.ComponentProps<typeof ReactMarkdown>['rehypePlugins']>(() => {
    if (!loadedMathRuntime) return [];
    return [[loadedMathRuntime.rehypeKatex, { strict: 'ignore', throwOnError: false }]];
  }, [loadedMathRuntime]);

  /** P-03 修复：components 对象用 useMemo 缓存，避免每次渲染重建 */
  const components = useMemo((): React.ComponentProps<typeof ReactMarkdown>['components'] => ({
        /**
     * 内部方法：`pre`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    pre({ children }) {
      // 按当前实现观感：react-markdown 的 fenced code 默认会包一层 <pre>。
      // 但我们已经在 <CodeBlock>/<MermaidBlock> 内实现了完整的容器（边框/标题/滚动），
      // 继续保留 <pre> 会被 Tailwind Typography（prose）强行套上深色背景和 padding，导致出现"黑色大底"。
      // 这里把 <pre> 降级为普通容器并用 not-prose 禁用 typography 样式。
      return <div className="not-prose">{children}</div>;
    },
        /**
     * 内部方法：`h1`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    h1({ children, className, ...props }) {
      const idx = headingIndexRef.current++;
      const id = idPrefix ? `${idPrefix}-h-${idx}` : undefined;
      return (
        <h1
          id={id}
          className={['scroll-mt-24', className].filter(Boolean).join(' ')}
          {...props}
        >
          {children}
        </h1>
      );
    },
        /**
     * 内部方法：`h2`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    h2({ children, className, ...props }) {
      const idx = headingIndexRef.current++;
      const id = idPrefix ? `${idPrefix}-h-${idx}` : undefined;
      return (
        <h2
          id={id}
          className={['scroll-mt-24', className].filter(Boolean).join(' ')}
          {...props}
        >
          {children}
        </h2>
      );
    },
        /**
     * 内部方法：`h3`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    h3({ children, className, ...props }) {
      const idx = headingIndexRef.current++;
      const id = idPrefix ? `${idPrefix}-h-${idx}` : undefined;
      return (
        <h3
          id={id}
          className={['scroll-mt-24', className].filter(Boolean).join(' ')}
          {...props}
        >
          {children}
        </h3>
      );
    },
        /**
     * 内部方法：`h4`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    h4({ children, className, ...props }) {
      const idx = headingIndexRef.current++;
      const id = idPrefix ? `${idPrefix}-h-${idx}` : undefined;
      return (
        <h4
          id={id}
          className={['scroll-mt-24', className].filter(Boolean).join(' ')}
          {...props}
        >
          {children}
        </h4>
      );
    },
        /**
     * 内部方法：`h5`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    h5({ children, className, ...props }) {
      const idx = headingIndexRef.current++;
      const id = idPrefix ? `${idPrefix}-h-${idx}` : undefined;
      return (
        <h5
          id={id}
          className={['scroll-mt-24', className].filter(Boolean).join(' ')}
          {...props}
        >
          {children}
        </h5>
      );
    },
        /**
     * 内部方法：`h6`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    h6({ children, className, ...props }) {
      const idx = headingIndexRef.current++;
      const id = idPrefix ? `${idPrefix}-h-${idx}` : undefined;
      return (
        <h6
          id={id}
          className={['scroll-mt-24', className].filter(Boolean).join(' ')}
          {...props}
        >
          {children}
        </h6>
      );
    },
        /**
     * 内部方法：`code`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const text = String(children).replace(/\n$/, '');

      if (match?.[1] === 'mermaid') {
        return <MarkdownMermaidBlock chart={text} isStreaming={isStreaming} />;
      }

      if (match || text.includes('\n')) {
        return <CodeBlock language={match?.[1] || ''} children={text} runtime={codeRuntime} />;
      }

      return (
        <code
          className="bg-muted/80 px-1.5 py-0.5 rounded text-sm font-mono border border-border/40"
          {...props}
        >
          {children}
        </code>
      );
    },
        /**
     * 内部方法：`img`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    img({ src, alt }) {
      return <ImageRenderer src={src} alt={alt} />;
    },
        /**
     * 内部方法：`table`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    table({ children }) {
      return (
        <div className="not-prose my-2 overflow-x-auto rounded-md border border-border/60">
          <table className="m-0 w-full min-w-full border-collapse text-sm">{children}</table>
        </div>
      );
    },
        /**
     * 内部方法：`thead`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    thead({ children }) {
      return <thead className="bg-muted/50">{children}</thead>;
    },
        /**
     * 内部方法：`tr`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    tr({ children, ...props }) {
      return <tr className="odd:bg-background even:bg-muted/20" {...props}>{children}</tr>;
    },
        /**
     * 内部方法：`th`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    th({ children }) {
      return (
        <th className="border-b border-border/60 px-2.5 py-1.5 text-left font-medium text-foreground/90">
          {children}
        </th>
      );
    },
        /**
     * 内部方法：`td`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    td({ children }) {
      return (
        <td className="border-b border-border/30 px-2.5 py-1.5 text-foreground/80">
          {children}
        </td>
      );
    },
        /**
     * 内部方法：`blockquote`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    blockquote({ children }) {
      return (
        <blockquote className="my-2 border-l-2 border-primary/50 pl-3 text-muted-foreground italic">
          {children}
        </blockquote>
      );
    },
        /**
     * 内部方法：`a`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    a({ href, children }) {
      return <MarkdownLinkPreview href={href}>{children}</MarkdownLinkPreview>;
    },
        /**
     * 内部方法：`hr`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    hr() {
      return <hr className="my-3 border-border/60" />;
    },
        /**
     * 内部方法：`ul`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    ul({ children }) {
      return <ul className="my-1.5 ml-4 list-disc space-y-0.5 marker:text-muted-foreground/60">{children}</ul>;
    },
        /**
     * 内部方法：`ol`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    ol({ children }) {
      return <ol className="my-1.5 ml-4 list-decimal space-y-0.5 marker:text-muted-foreground/60">{children}</ol>;
    },
        /**
     * 内部方法：`li`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    li({ children }) {
      return <li className="pl-1">{children}</li>;
    },
        /**
     * 内部方法：`input`。
     *
     * @remarks
     * 负责当前类或局部对象上的处理步骤，用来拆分主流程并收束状态变更边界。
     */
    input({ checked, ...props }) {
      return (
        <input
          type="checkbox"
          checked={checked}
          readOnly
          className="mr-2 rounded border-border accent-primary"
          {...props}
        />
      );
    },
  }), [codeRuntime, idPrefix, isStreaming]);

  return (
    <div className="markdown-body prose prose-sm dark:prose-invert max-w-none break-words">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        // 说明：KaTeX strict 默认会对"数学模式中的 Unicode 文本（例如中文标点/汉字）"输出 warn，
        // 容易在真实对话里刷屏影响排查其它问题。这里选择忽略 strict 报警，但仍渲染公式。
        // 备注：不影响"真正的语法错误"渲染（throwOnError=false）。
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {trimmed}
      </ReactMarkdown>
    </div>
  );
});

export default MarkdownRenderer;
