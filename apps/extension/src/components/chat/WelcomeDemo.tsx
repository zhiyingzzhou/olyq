/**
 * 说明：`WelcomeDemo` 组件模块。
 *
 * 职责：
 * - 承载 `WelcomeDemo` 相关的当前文件实现与模块边界；
 * - 对外暴露 `WelcomeDemo` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
import { Sparkles } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useTranslation } from 'react-i18next';

const DEMO_CONTENT = `## 欢迎体验 AI 对话

我支持丰富的内容渲染，以下是一些示例：

---

### 代码高亮

支持多种语言的语法高亮、行号（超过 5 行自动显示）和一键复制：

\`\`\`typescript
interface User {
  id: string;
  name: string;
  avatar?: string;
}

async function fetchUser(id: string): Promise<User> {
  const res = await fetch(\`/api/users/\${id}\`);
  if (!res.ok) throw new Error('用户不存在');
  return res.json();
}
\`\`\`

\`\`\`python
# 快速排序算法
def quicksort(arr: list) -> list:
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)
\`\`\`

行内代码也支持：使用 \`npm install\` 安装依赖，运行 \`npm run dev\` 启动开发服务器。

---

### 数学公式

行内公式：质能方程 $E = mc^2$ 是物理学最著名的公式之一。

块级公式：

$$
\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}
$$

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

---

### 图片渲染

支持 Markdown 图片语法，点击可放大查看：

![示例图片](https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&h=300&fit=crop)

---

### 表格

| 功能 | 状态 | 描述 |
|------|:----:|------|
| Markdown 渲染 | 完成 | 完整的 GFM 支持 |
| 代码高亮 | 完成 | 多语言语法高亮 |
| 数学公式 | 完成 | KaTeX 渲染 |
| Mermaid 图表 | 完成 | 流程图、时序图等 |
| 图片预览 | 完成 | 点击放大查看 |
| 任务列表 | 完成 | 交互式复选框 |

---

### Mermaid 图表

\`\`\`mermaid
graph LR
    A[用户输入] --> B{消息类型}
    B -->|文本| C[Markdown 渲染]
    B -->|代码| D[语法高亮]
    B -->|公式| E[KaTeX 渲染]
    B -->|图表| F[Mermaid 渲染]
    C --> G[展示结果]
    D --> G
    E --> G
    F --> G
\`\`\`

---

### 任务列表

- [x] Markdown 基础渲染
- [x] GFM 扩展语法
- [x] 代码语法高亮
- [x] LaTeX 数学公式
- [x] Mermaid 图表
- [x] 图片预览放大
- [ ] 更多功能开发中…

---

### 其他格式

> 这是一段引用文字。好的设计是尽可能少的设计。
> — Dieter Rams

**加粗文本**、*斜体文本*、~~删除线~~，以及[超链接](https://example.com)都支持。
`;

/** WelcomeDemo 组件入参：仅用于开发者模式下验证渲染能力。 */
interface WelcomeDemoProps {
  /** 当前话题的模型展示名（用于顶部标签） */
  modelName?: string;
}

/**
 * 欢迎示例消息。
 *
 * 说明：
 * - 仅用于演示 Markdown、代码高亮、公式、表格和图片预览等渲染能力；
 * - 不参与真实话题数据流，也不会写入消息存储。
 */
export function WelcomeDemo({ modelName }: WelcomeDemoProps) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-3">
      <div className="olyq-brand-gradient-surface flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center shadow-sm">
        <Sparkles className="h-4 w-4 text-primary-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-sm font-medium text-foreground/80">{modelName || 'AI'}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-accent/80 text-muted-foreground">
            {t('developerPanel.rendering.title')}
          </span>
        </div>
        <div
          data-testid="welcome-demo-assistant-surface"
          className="rounded-2xl rounded-tl-sm bg-card border border-border/50 px-5 py-4 shadow-none"
        >
          <MarkdownRenderer content={DEMO_CONTENT} />
        </div>
      </div>
    </div>
  );
}
