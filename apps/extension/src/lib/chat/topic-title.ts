/**
 * 说明：`topic-title` 基础能力模块。
 *
 * 职责：
 * - 承载 `topic-title` 相关的当前文件实现与模块边界；
 * - 对外暴露 `finalizeTopicTitle` 等公开能力，供同层或上层模块复用；
 *
 * 边界：
 * - 本文件只处理当前模块职责，不在这里扩散无关的跨域编排。
 */
/**
 * 话题标题生成：模型输出清洗与本地兜底
 *
 * 背景：
 * - 部分 OpenAI-compatible 网关/平台不支持 `response_format` / structured outputs；
 * - 若直接依赖 AI SDK 的结构化输出（generateObject），会出现告警甚至解析失败；
 *
 * 因此：标题生成统一走“纯文本输出”，再在本地做确定性清洗与兜底，最终产出 `{ title }`。
 */

type JsonObject = Record<string, unknown>;

/**
 * 去除代码块围栏标记，保留内部正文。
 *
 * 说明：
 * - 模型有时会把 JSON 包在带语言标记的代码围栏里输出；
 * - 标题解析只需要内部内容，因此这里先把围栏剥掉。
 */
function stripCodeFenceMarkers(raw: string): string {
  // 仅移除 ```lang 与 ``` 标记，保留内部内容，便于从代码块中提取 JSON。
  return raw
    .replace(/```[a-zA-Z0-9_-]*\s*\n?/g, '')
    .replace(/```/g, '');
}

/**
 * 从任意文本中提取第一个完整 JSON 对象片段。
 *
 * 说明：
 * - 通过简单状态机处理字符串转义，避免被对象内部的 `{`、`}` 干扰；
 * - 只返回最外层首个完整对象，不尝试解析数组或多个并列对象。
 */
function extractFirstJsonObjectString(raw: string): string | null {
  const s = raw;
  const start = s.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        continue;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
      if (depth < 0) return null;
    }
  }

  return null;
}

/** 尝试从 JSON 输出中读取 `title` 字段。 */
function tryParseTitleFromJson(raw: string): string | null {
  const cleaned = stripCodeFenceMarkers(raw).trim();
  const candidateJson = extractFirstJsonObjectString(cleaned);
  if (!candidateJson) return null;

  try {
    const parsed = JSON.parse(candidateJson) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as JsonObject;
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    return title || null;
  } catch {
    return null;
  }
}

/**
 * 归一化模型产出的标题候选文本。
 *
 * 说明：
 * - 会优先尝试 JSON `title`，其次回退到纯文本第一行；
 * - 同时会移除常见前缀、引号、句号等噪声，并截断到产品约束长度。
 */
function normalizeTitleCandidate(raw: string): string {
  const fromJson = tryParseTitleFromJson(raw);
  let s = (fromJson ?? stripCodeFenceMarkers(String(raw ?? ''))).replace(/\r\n/g, '\n');

  // 取首个非空行，避免“多行解释”污染标题。
  const firstLine = s
    .split('\n')
    .map((x) => x.trim())
    .find((x) => x.length > 0);
  s = firstLine ?? '';

  // 移除常见前缀（模型可能输出“标题：xxx”）。
  s = s.replace(/^(?:标题|title)\s*[:：]\s*/i, '');

  // 去掉引号、句号、冒号（按产品约束）。
  s = s.replace(/["'“”‘’「」『』:.。：]/g, '');

  // 折叠空白
  s = s.replace(/\s+/g, ' ').trim();

  // 尽量落在 8~18 字：这里做“上限裁剪”，下限由有效性判断兜底。
  if (s.length > 18) s = s.slice(0, 18);

  return s;
}

/** 判断标题候选是否明显无效。 */
function isLikelyBadTitle(title: string): boolean {
  const t = String(title || '').trim();
  if (!t) return true;
  if (t.length < 2) return true;

  // 纯数字或类似 “[15]” 这种明显不是标题的输出
  if (/^\[?\d+\]?$/.test(t)) return true;

  // 仅符号/标点
  if (/^[\p{P}\p{S}\s]+$/u.test(t)) return true;

  return false;
}

/**
 * 从对话采样文本中提取一个尽量合理的本地兜底标题。
 *
 * 说明：
 * - 优先使用第一条用户消息的正文；
 * - 若用户消息只剩附件提示，也保留该提示，保证至少生成非空标题候选。
 */
function deriveTitleFromSample(sample: string): string {
  const lines = String(sample || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

  const roleLineRe = /^(用户|user|User)\s*[:：]\s*(.+)$/;
  for (const line of lines) {
    const m = roleLineRe.exec(line);
    if (!m) continue;
    const content = m[2].trim();
    if (!content) continue;
    // 去掉“（图片×1）/（文件×1）”这类附件提示，优先使用文本语义。
    const withoutAttachmentHint = content.replace(/（(?:图片×\d+|文件×\d+)(?:，(?:图片×\d+|文件×\d+))*）/g, '').trim();
    if (withoutAttachmentHint) return withoutAttachmentHint;
    // 若用户消息只有附件提示，也保留（至少比空好）。
    return content;
  }

  // 兜底：取第一行并去掉角色前缀
  const first = lines[0] ?? '';
  return first.replace(/^(?:用户|助手|系统)\s*[:：]\s*/i, '').trim();
}

/**
 * 从模型输出 + 对话采样中产出最终标题。
 *
 * 策略：
 * 1) 优先使用模型输出（纯文本或 JSON）；
 * 2) 若模型输出无效，使用 sample 的首条用户消息作为本地兜底；
 * 3) 仍无效则返回空字符串（由上层决定报错或跳过）。
 */
export function finalizeTopicTitle(modelText: string, sample: string): string {
  const fromModel = normalizeTitleCandidate(modelText);
  if (!isLikelyBadTitle(fromModel)) return fromModel;

  const fromSample = normalizeTitleCandidate(deriveTitleFromSample(sample));
  if (!isLikelyBadTitle(fromSample)) return fromSample;

  return '';
}
