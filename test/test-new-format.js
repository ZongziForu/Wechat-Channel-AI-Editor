// 测试新的紧凑格式

// 新的formatHtml实现（紧凑版本）
function formatHtml(html) {
  let formatted = '';
  let indent = 0;
  const indentSize = 2;
  const MAX_LINE_LENGTH = 80;

  const voidTags = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);

  const inlineTags = new Set([
    'a', 'abbr', 'acronym', 'b', 'bdo', 'big', 'br', 'cite', 'code',
    'dfn', 'em', 'i', 'img', 'input', 'kbd', 'label', 'map', 'object',
    'q', 'samp', 'script', 'select', 'small', 'span', 'strong', 'sub',
    'sup', 'textarea', 'time', 'tt', 'var'
  ]);

  function wrapText(text, baseIndent) {
    if (text.length <= MAX_LINE_LENGTH) {
      return baseIndent + text;
    }

    const words = text.split(/\s+/);
    const lines = [];
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

  const tokens = html.split(/(<[^>]+>|<!--[\s\S]*?-->)/g);

  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i];
    if (!token) continue;

    token = token.trim();
    if (!token) continue;

    if (token.startsWith('<!--')) {
      formatted += ' '.repeat(indent * indentSize) + token + '\n';
    } else if (token.startsWith('</')) {
      const tagName = token.match(/<\/([a-zA-Z][a-zA-Z0-9-]*)/)?.[1]?.toLowerCase();
      if (tagName && !voidTags.has(tagName)) {
        indent = Math.max(0, indent - 1);
      }
      formatted += ' '.repeat(indent * indentSize) + token + '\n';
    } else if (token.startsWith('<')) {
      const match = token.match(/<([a-zA-Z][a-zA-Z0-9-]*)/);
      const tagName = match?.[1]?.toLowerCase();
      const isVoidTag = tagName && voidTags.has(tagName);
      const isSelfClosing = token.endsWith('/>') || isVoidTag;

      // 紧凑格式：不加空行
      formatted += ' '.repeat(indent * indentSize) + token + '\n';

      if (!isSelfClosing && tagName) {
        indent++;
      }
    } else {
      const text = token.replace(/\s+/g, ' ').trim();
      if (text) {
        const indented = wrapText(text, ' '.repeat(indent * indentSize));
        formatted += indented + '\n';
      }
    }
  }

  return formatted.trim();
}

// 测试用例
const testHtml = '<section><h1>标题</h1><p>这是一段文字<strong>加粗</strong>内容</p><div class="card"><img src="test.jpg"/><p>卡片内容</p></div><!-- 注释 --></section>';

console.log('=== 原始HTML ===');
console.log(testHtml);

console.log('\n=== 新的紧凑格式化 ===');
const formatted = formatHtml(testHtml);
console.log(formatted);

console.log('\n=== 格式化结果统计 ===');
console.log(`行数: ${formatted.split('\n').length}`);
console.log(`字符数: ${formatted.length}`);
