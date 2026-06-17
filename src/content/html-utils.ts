// html-utils.ts - HTML格式化和语法高亮工具

/**
 * HTML格式化（prettify）- 紧凑版本
 * 将压缩的HTML展开为带缩进的可读格式（无多余空行，支持自动换行）
 */
export function formatHtml(html: string): string {
  let formatted = '';
  let indent = 0;
  const indentSize = 2;
  const MAX_LINE_LENGTH = 80;

  // 自闭合标签列表
  const voidTags = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);

  // 在单词边界处分割长文本
  function wrapText(text: string, baseIndent: string): string {
    if (text.length <= MAX_LINE_LENGTH) {
      return baseIndent + text;
    }

    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = baseIndent;

    for (const word of words) {
      if (!word) continue;
      if ((currentLine + word).length > MAX_LINE_LENGTH && currentLine !== baseIndent) {
        lines.push(currentLine.trimEnd());
        currentLine = baseIndent + word + ' ';
      } else {
        currentLine += word + ' ';
      }
    }

    if (currentLine.trim()) {
      lines.push(currentLine.trimEnd());
    }

    return lines.join('\n');
  }

  // 使用正则匹配：标签、注释、文本
  const tokens = html.split(/(<[^>]+>|<!--[\s\S]*?-->)/g);

  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i];
    if (!token) continue;

    // 去除首尾多余空白
    token = token.trim();
    if (!token) continue;

    if (token.startsWith('<!--')) {
      // HTML注释：单独一行
      formatted += ' '.repeat(indent * indentSize) + token + '\n';
    } else if (token.startsWith('</')) {
      // 闭合标签：先减少缩进，再写入
      const tagName = token.match(/<\/([a-zA-Z][a-zA-Z0-9-]*)/)?.[1]?.toLowerCase();
      if (tagName && !voidTags.has(tagName)) {
        indent = Math.max(0, indent - 1);
      }
      formatted += ' '.repeat(indent * indentSize) + token + '\n';
    } else if (token.startsWith('<')) {
      // 开始标签或自闭合标签
      const match = token.match(/<([a-zA-Z][a-zA-Z0-9-]*)/);
      const tagName = match?.[1]?.toLowerCase();
      const isVoidTag = tagName && voidTags.has(tagName);
      const isSelfClosing = token.endsWith('/>') || isVoidTag;

      // 直接写入，不加空行（紧凑格式）
      formatted += ' '.repeat(indent * indentSize) + token + '\n';

      if (!isSelfClosing && tagName) {
        indent++;
      }
    } else {
      // 文本内容
      const text = token.replace(/\s+/g, ' ').trim();
      if (text) {
        // 使用wrapText处理长文本自动换行
        const indented = wrapText(text, ' '.repeat(indent * indentSize));
        formatted += indented + '\n';
      }
    }
  }

  return formatted.trim();
}

/**
 * 压缩HTML（反向操作）
 * 将格式化的HTML压缩为单行
 */
export function minifyHtml(html: string): string {
  return html
    .replace(/>\s+</g, '><')     // 去除标签间空白
    .replace(/\n\s*/g, '')       // 去除换行和缩进
    .replace(/\s{2,}/g, ' ')     // 多个空格合并为一个
    .trim();
}
