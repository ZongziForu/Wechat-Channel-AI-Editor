// api.ts - 通用API调用层，支持Anthropic和OpenAI兼容接口

export interface ApiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  protocol: 'anthropic' | 'openai';
  customPrompt?: string;
  basePrompt?: string;
  maxTokens?: number;
}

// 系统提示词使用 String.fromCharCode 动态构建，避免被 ASCII 转义
const DEFAULT_SYSTEM_PROMPT = String.fromCharCode(
  0x4f60, 0x662f, 0x5fae, 0x4fe1, 0x516c, 0x4f17, 0x53f7, 0x6392, 0x7248, 0x4e13, 0x5bb6, 0x3002, 0x0a, 0x0a,
  0x3010, 0x5173, 0x952e, 0x89c4, 0x5219, 0x0020, 0x002d, 0x0020, 0x5fc5, 0x987b, 0x4e25, 0x683c, 0x9075, 0x5b88, 0x3011, 0x0a,
  0x0031, 0x002e, 0x0020, 0x76f4, 0x63a5, 0x8f93, 0x51fa, 0x0048, 0x0054, 0x004d, 0x004c, 0x4ee3, 0x7801, 0xff0c, 0x4ece, 0x7b2c, 0x4e00, 0x4e2a, 0x003c, 0x5f00, 0x59cb, 0xff0c, 0x5230, 0x6700, 0x540e, 0x4e00, 0x4e2a, 0x003e, 0x7ed3, 0x675f, 0x0a,
  0x0032, 0x002e, 0x0020, 0x7981, 0x6b62, 0x8f93, 0x51fa, 0x4efb, 0x4f55, 0x89e3, 0x91ca, 0x3001, 0x8bf4, 0x660e, 0x3001, 0x524d, 0x8a00, 0x3001, 0x540e, 0x8bb0, 0x0a,
  0x0033, 0x002e, 0x0020, 0x7981, 0x6b62, 0x4f7f, 0x7528, 0x004d, 0x0061, 0x0072, 0x006b, 0x0064, 0x006f, 0x0077, 0x006e, 0x4ee3, 0x7801, 0x5757, 0x6807, 0x8bb0, 0xff08, 0x5982, 0x0060, 0x0060, 0x0060, 0x0068, 0x0074, 0x006d, 0x006c, 0x6216, 0x0060, 0x0060, 0x0060, 0xff09, 0x0a,
  0x0034, 0x002e, 0x0020, 0x7981, 0x6b62, 0x8bf4, 0x201c, 0x7528, 0x6237, 0x7684, 0x8981, 0x6c42, 0x662f, 0x201d, 0x3001, 0x201c, 0x4ee5, 0x4e0b, 0x662f, 0x201d, 0x3001, 0x201c, 0x8fd9, 0x662f, 0x201d, 0x7b49, 0x4efb, 0x4f55, 0x4e2d, 0x6587, 0x8bf4, 0x660e, 0x0a,
  0x0035, 0x002e, 0x0020, 0x6240, 0x6709, 0x6837, 0x5f0f, 0x5fc5, 0x987b, 0x5185, 0x8054, 0xff08, 0x0073, 0x0074, 0x0079, 0x006c, 0x0065, 0x5c5e, 0x6027, 0xff09, 0xff0c, 0x4e0d, 0x4f7f, 0x7528, 0x5916, 0x90e8, 0x0043, 0x0053, 0x0053, 0x6216, 0x0063, 0x006c, 0x0061, 0x0073, 0x0073, 0x0a,
  0x0036, 0x002e, 0x0020, 0x6837, 0x5f0f, 0x5fc5, 0x987b, 0x517c, 0x5bb9, 0x5fae, 0x4fe1, 0x79fb, 0x52a8, 0x7aef, 0xff1a, 0x4f7f, 0x7528, 0x0070, 0x0078, 0x5355, 0x4f4d, 0xff0c, 0x907f, 0x514d, 0x0066, 0x006c, 0x0065, 0x0078, 0x002f, 0x0067, 0x0072, 0x0069, 0x0064, 0x590d, 0x6742, 0x5e03, 0x5c40, 0x0a,
  0x0037, 0x002e, 0x0020, 0x4fdd, 0x7559, 0x539f, 0x59cb, 0x5185, 0x5bb9, 0x548c, 0x7ed3, 0x6784, 0xff0c, 0x53ea, 0x4f18, 0x5316, 0x6837, 0x5f0f, 0x0a, 0x0a,
  0x3010, 0x8f93, 0x51fa, 0x683c, 0x5f0f, 0x793a, 0x4f8b, 0x3011, 0x0a,
  0x6b63, 0x786e, 0xff1a, 0x003c, 0x0064, 0x0069, 0x0076, 0x0020, 0x0073, 0x0074, 0x0079, 0x006c, 0x0065, 0x003d, 0x0022, 0x0063, 0x006f, 0x006c, 0x006f, 0x0072, 0x003a, 0x0020, 0x0072, 0x0065, 0x0064, 0x003b, 0x0022, 0x003e, 0x5185, 0x5bb9, 0x003c, 0x002f, 0x0064, 0x0069, 0x0076, 0x003e, 0x0a,
  0x9519, 0x8bef, 0xff1a, 0x4ee5, 0x4e0b, 0x662f, 0x4f18, 0x5316, 0x540e, 0x7684, 0x0048, 0x0054, 0x004d, 0x004c, 0x4ee3, 0x7801, 0xff1a, 0x0060, 0x0060, 0x0060, 0x0068, 0x0074, 0x006d, 0x006c, 0x003c, 0x0064, 0x0069, 0x0076, 0x003e, 0x002e, 0x002e, 0x002e, 0x003c, 0x002f, 0x0064, 0x0069, 0x0076, 0x003e, 0x0060, 0x0060, 0x0060, 0x0a, 0x0a,
  0x73b0, 0x5728, 0x5f00, 0x59cb, 0xff0c, 0x53ea, 0x8f93, 0x51fa, 0x0048, 0x0054, 0x004d, 0x004c, 0x4ee3, 0x7801, 0xff0c, 0x4e0d, 0x8981, 0x6709, 0x4efb, 0x4f55, 0x5176, 0x4ed6, 0x5185, 0x5bb9, 0x3002
);

// 增强规则（针对二次编辑和解释问题）
const ENHANCED_RULES = `

【绝对禁止 - 违反将导致失败】
1. 禁止在HTML标签之间插入任何解释、说明、注释
2. 禁止输出"我将..."、"我已经..."、"这里..."、"接下来..."、"首先..."、"然后..."、"最后..."等思考过程
3. 即使用户询问"为什么"、"如何"，也只输出HTML代码，不要回答问题
4. 二次编辑时，直接输出修改后的完整HTML，不要解释修改了什么
5. 不要输出任何自然语言文字，只输出HTML标签和标签内的内容文本

【错误示例 - 绝对不要这样做】
<div>内容1</div>

这里我优化了背景色，使其更协调。

<section>内容2</section>

【正确示例】
<div>内容1</div>
<section>内容2</section>`;

export function getSystemPrompt(customPrompt?: string): string {
  // 始终添加增强规则
  const basePrompt = DEFAULT_SYSTEM_PROMPT + ENHANCED_RULES;

  if (customPrompt) {
    return `${basePrompt}\n\n${customPrompt}`;
  }
  return basePrompt;
}

export async function getApiConfig(): Promise<ApiConfig> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['apiKey', 'baseUrl', 'model', 'protocol', 'customPrompt', 'maxTokens'], (result) => {
      resolve({
        apiKey: result.apiKey || '',
        baseUrl: result.baseUrl || 'https://api.anthropic.com',
        model: result.model || '',
        protocol: result.protocol || 'anthropic',
        customPrompt: result.customPrompt || '',
        basePrompt: DEFAULT_SYSTEM_PROMPT,
        maxTokens: result.maxTokens || 8192,
      });
    });
  });
}

// ========== AI响应清洗 ==========

/**
 * 部分清洗AI返回的内容（用于流式输出过程中）
 * 只做轻量级清洗，避免影响性能
 */
export function partialCleanAIResponse(response: string): string {
  let cleaned = response.trim();

  // 去除 Markdown 代码块标记
  cleaned = cleaned.replace(/^```html\s*/i, '');
  cleaned = cleaned.replace(/^```xml\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/i, '');
  cleaned = cleaned.replace(/```\s*$/i, '');

  // 去除开头的解释文字
  const htmlStart = cleaned.indexOf('<');
  if (htmlStart > 0) {
    const prefix = cleaned.slice(0, htmlStart).trim();
    // 如果前缀是中文说明文字，去掉它
    if (/[\u4e00-\u9fa5]/.test(prefix) && prefix.length < 100) {
      cleaned = cleaned.slice(htmlStart);
    }
  }

  // 去除常见的解释模式开头（轻量级）
  const quickPatterns = [
    /^(我将|我已经|我会|这里|接下来|首先)[^<\n]*\n+/gm,
    /^(根据|考虑到|为了)[^<\n]*\n+/gm,
  ];

  for (const pattern of quickPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned.trim();
}

/**
 * 清洗AI返回的内容，去除Markdown代码块、解释文字等
 */
export function cleanAIResponse(response: string): string {
  let cleaned = response.trim();

  // 去除 Markdown 代码块标记
  cleaned = cleaned.replace(/^```html\s*/i, '');
  cleaned = cleaned.replace(/^```xml\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/i, '');
  cleaned = cleaned.replace(/```\s*$/i, '');

  // 如果包含 <html> 或 <body> 标签，只取 body 内的内容
  const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    cleaned = bodyMatch[1].trim();
  }

  // 去除 XML/DOCTYPE 声明
  cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/i, '');
  cleaned = cleaned.replace(/<\?xml[^>]*\?>/i, '');

  // 去除开头的解释文字（通常以"以下是"、"这是"等开头）
  const htmlStart = cleaned.indexOf('<');
  if (htmlStart > 0) {
    const prefix = cleaned.slice(0, htmlStart).trim();
    // 如果前缀是中文说明文字，去掉它
    if (/[\u4e00-\u9fa5]/.test(prefix) && prefix.length < 100) {
      cleaned = cleaned.slice(htmlStart);
    }
  }

  // 去除结尾的解释文字
  const lastTagEnd = cleaned.lastIndexOf('>');
  if (lastTagEnd !== -1 && lastTagEnd < cleaned.length - 1) {
    const suffix = cleaned.slice(lastTagEnd + 1).trim();
    if (suffix && !suffix.includes('<')) {
      cleaned = cleaned.slice(0, lastTagEnd + 1);
    }
  }

  // 【新增】移除HTML标签之间的中文解释段落
  // 匹配模式：闭合标签 + 换行 + 纯文本（包含中文）+ 换行 + 开始标签
  cleaned = cleaned.replace(
    /(<\/[^>]+>)\s*\n+\s*([^<]*[\u4e00-\u9fa5][^<]*)\s*\n+\s*(<[^/][^>]*>)/g,
    '$1\n$3'
  );

  // 【新增】移除常见的解释模式开头的段落
  const explanationPatterns = [
    /^(我将|我已经|我会|这里|接下来|首先|然后|最后|现在)[^<\n]*\n+/gm,
    /^(根据|考虑到|为了|由于)[^<\n]*\n+/gm,
    /^(优化|调整|修改|更改|添加|删除)了?[^<\n]*\n+/gm,
  ];

  for (const pattern of explanationPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // 【新增】移除独立的中文解释行（不在HTML标签内的纯中文行）
  // 分行处理，保留HTML标签行，移除纯解释行
  const lines = cleaned.split('\n');
  const filteredLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 空行保留
    if (!line) {
      filteredLines.push(lines[i]);
      continue;
    }

    // 包含HTML标签的行保留
    if (line.includes('<') || line.includes('>')) {
      filteredLines.push(lines[i]);
      continue;
    }

    // 纯中文解释行（包含中文但不在标签内）
    if (/[\u4e00-\u9fa5]/.test(line) && line.length < 200) {
      // 检查是否是HTML标签内的文本内容
      // 如果前一行以开始标签结尾且后一行以闭合标签开始，则保留
      const prevLine = i > 0 ? filteredLines[filteredLines.length - 1]?.trim() : '';
      const nextLine = i < lines.length - 1 ? lines[i + 1]?.trim() : '';

      const prevEndsWithOpenTag = prevLine && />$/.test(prevLine) && !/<\//.test(prevLine);
      const nextStartsWithCloseTag = nextLine && /^<\//.test(nextLine);

      if (prevEndsWithOpenTag && nextStartsWithCloseTag) {
        // 这是标签内的文本内容，保留
        filteredLines.push(lines[i]);
      } else {
        // 这是解释文字，跳过
        console.log('[Clean] Removed explanation line:', line);
        continue;
      }
    } else {
      // 其他行保留
      filteredLines.push(lines[i]);
    }
  }

  cleaned = filteredLines.join('\n');

  // 验证是否是有效的 HTML（至少包含一个标签）
  if (!cleaned.includes('<')) {
    console.warn('[AI Response] No HTML tags found:', cleaned);
    throw new Error('AI 返回的内容不包含有效的 HTML 标签');
  }

  return cleaned.trim();
}

/**
 * 验证清洗后的内容是否有效
 */
function validateCleanedResponse(cleaned: string): { valid: boolean; reason?: string } {
  // 长度检查
  if (cleaned.length < 10) {
    return { valid: false, reason: 'AI 返回的内容过短，可能无效' };
  }

  // 基本标签完整性检查
  const openTags = (cleaned.match(/<[a-zA-Z][^>]*>/g) || []).length;
  const closeTags = (cleaned.match(/<\/[a-zA-Z][^>]*>/g) || []).length;

  // 自闭合标签数量
  const selfClosingTags = (cleaned.match(/<[a-zA-Z][^>]*\/>/g) || []).length;

  // 简单的平衡检查（不是很严格，但可发现明显问题）
  const unclosedTags = openTags - selfClosingTags - closeTags;
  if (unclosedTags > 2) {
    console.warn('[AI Response] Potentially unclosed tags:', { openTags, closeTags, selfClosingTags });
    // 警告但不阻止，因为AI可能有意省略闭合标签
  }

  return { valid: true };
}

/**
 * 带重试机制的AI调用
 */
export async function callAIWithRetry(
  userPrompt: string,
  htmlContent: string,
  maxRetries = 2,
  customSystemPrompt?: string,
  signal?: AbortSignal
): Promise<string> {
  let lastError: Error | null = null;

  for (let i = 0; i <= maxRetries; i++) {
    if (signal?.aborted) {
      throw new Error('用户已取消');
    }
    try {
      const response = await callAI(userPrompt, htmlContent, customSystemPrompt, signal);
      const cleaned = cleanAIResponse(response);

      // 验证清洗后的内容
      const validation = validateCleanedResponse(cleaned);
      if (!validation.valid) {
        throw new Error(validation.reason);
      }

      return cleaned;
    } catch (e) {
      lastError = e as Error;
      console.warn(`[AI Call] Attempt ${i + 1} failed:`, lastError.message);

      if (i < maxRetries) {
        // 在提示中添加更严格的要求
        userPrompt = userPrompt.replace(
          /\n\n【重要】.*$/s,
          ''
        ) + '\n\n【重要】请确保只返回纯 HTML 代码，不要包含任何解释、Markdown 标记或代码块。';
      }
    }
  }

  throw lastError || new Error('AI 调用失败');
}

// ========== 基础API调用 ==========

// 非流式调用（无缝模式用）
export async function callAI(userPrompt: string, htmlContent: string, customSystemPrompt?: string, signal?: AbortSignal): Promise<string> {
  const config = await getApiConfig();
  if (!config.apiKey) throw new Error('请先在设置页配置API Key');

  const isAnthropic = config.protocol === 'anthropic';
  const messages = [{ role: 'user', content: `${userPrompt}\n\n以下是需要处理的HTML：\n${htmlContent}` }];
  const baseUrl = config.baseUrl.replace(/\/$/, '');

  // 使用自定义系统提示词（如果有），否则使用默认
  const systemPrompt = customSystemPrompt || getSystemPrompt(config.customPrompt);

  if (isAnthropic) {
    const body: any = { max_tokens: config.maxTokens, system: systemPrompt, messages };
    if (config.model) body.model = config.model;
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`API错误: ${res.status}`);
    const data = await res.json();
    // 检测截断
    if (data.stop_reason === 'max_tokens') {
      throw new Error('AI 输出被截断：内容过长，超过当前 max_tokens 限制。建议分段处理、减少输入内容，或在设置中提高 max_tokens。');
    }
    return data.content?.[0]?.text || '';
  } else {
    if (!config.model) throw new Error('使用 OpenAI 兼容协议时必须填写模型名称，如 gpt-4 或 moonshot-v1-8k');
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: config.maxTokens,
      }),
      signal,
    });
    if (!res.ok) throw new Error(`API错误: ${res.status}`);
    const data = await res.json();
    // 检测截断
    if (data.choices?.[0]?.finish_reason === 'length') {
      throw new Error('AI 输出被截断：内容过长，超过当前 max_tokens 限制。建议分段处理、减少输入内容，或在设置中提高 max_tokens。');
    }
    return data.choices?.[0]?.message?.content || '';
  }
}

// 流式调用（手动确认模式用），onChunk 实时回调
export async function callAIStream(
  userPrompt: string,
  htmlContent: string,
  onChunk: (text: string) => void,
  customSystemPrompt?: string,
  signal?: AbortSignal
): Promise<void> {
  const config = await getApiConfig();
  if (!config.apiKey) throw new Error('请先在设置页配置API Key');

  const isAnthropic = config.protocol === 'anthropic';
  const messages = [{ role: 'user', content: `${userPrompt}\n\n以下是需要处理的HTML：\n${htmlContent}` }];
  const baseUrl = config.baseUrl.replace(/\/$/, '');

  // 使用自定义系统提示词（如果有），否则使用默认
  const systemPrompt = customSystemPrompt || getSystemPrompt(config.customPrompt);

  let res: Response;
  if (isAnthropic) {
    const body: any = { max_tokens: config.maxTokens, system: systemPrompt, messages, stream: true };
    if (config.model) body.model = config.model;
    res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal,
    });
  } else {
    if (!config.model) throw new Error('使用 OpenAI 兼容协议时必须填写模型名称，如 gpt-4 或 moonshot-v1-8k');
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        stream: true,
        max_tokens: config.maxTokens,
      }),
      signal,
    });
  }

  if (!res.ok) {
    const errorText = await res.text();
    console.error('[API Error]', res.status, errorText);
    throw new Error(`API错误: ${res.status} - ${errorText.slice(0, 200)}`);
  }

  if (!res.body) {
    throw new Error('响应没有内容');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let truncationDetected = false;

  while (true) {
    if (signal?.aborted) {
      reader.cancel();
      throw new Error('用户已取消');
    }
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // 保留未完成的行

    for (const line of lines) {
      const trimmed = line.trim();
      // 支持 "data: " (带空格) 和 "data:" (无空格) 两种格式
      if (!trimmed.startsWith('data:')) continue;

      // 去掉 "data:" 或 "data: " 前缀
      const data = trimmed.slice(5).trimStart();
      if (data === '[DONE]') {
        if (truncationDetected) {
          throw new Error('AI 输出被截断：内容过长，超过当前 max_tokens 限制。建议分段处理、减少输入内容，或在设置中提高 max_tokens。');
        }
        return;
      }

      try {
        const json = JSON.parse(data);
        // Anthropic 协议: json.delta.text
        // OpenAI 协议: json.choices[0].delta.content
        const text = json.delta?.text ?? json.choices?.[0]?.delta?.content ?? '';
        if (text) onChunk(text);

        // 检测截断：OpenAI 兼容协议会在最后一条 data 中返回 finish_reason: "length"
        const finishReason = json.choices?.[0]?.finish_reason;
        if (finishReason === 'length') {
          truncationDetected = true;
        }
        // 检测截断：Anthropic 流式协议通过 message_delta 事件返回 stop_reason: "max_tokens"
        if (json.type === 'message_delta' && json.delta?.stop_reason === 'max_tokens') {
          truncationDetected = true;
        }
      } catch {
        // 解析失败，忽略
      }
    }
  }

  // 处理缓冲区剩余内容
  if (buffer.trim().startsWith('data:')) {
    const data = buffer.trim().slice(5).trimStart();
    if (data && data !== '[DONE]') {
      try {
        const json = JSON.parse(data);
        const text = json.delta?.text ?? json.choices?.[0]?.delta?.content ?? '';
        if (text) onChunk(text);
      } catch {}
    }
  }
}
