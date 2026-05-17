// 简单测试HTML格式化和高亮功能

// 模拟formatHtml函数（复制自html-utils.ts）
function formatHtml(html) {
  let formatted = '';
  let indent = 0;
  const indentSize = 2;

  const voidTags = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);

  const blockTags = new Set([
    'address', 'article', 'aside', 'blockquote', 'canvas', 'dd', 'div',
    'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main',
    'nav', 'noscript', 'ol', 'p', 'pre', 'section', 'table', 'tfoot',
    'ul', 'video', 'tr', 'td', 'th', 'tbody', 'thead'
  ]);

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

      if (tagName && blockTags.has(tagName) && formatted.length > 0) {
        const lines = formatted.split('\n');
        if (lines[lines.length - 2] !== '') {
          formatted += '\n';
        }
      }

      formatted += ' '.repeat(indent * indentSize) + token + '\n';

      if (!isSelfClosing && tagName) {
        indent++;
      }

      const nextToken = tokens.slice(i + 1).find(t => t?.trim());
      if (tagName && blockTags.has(tagName) && nextToken) {
        const nextIsBlock = nextToken.match(/^<([a-zA-Z][a-zA-Z0-9-]*)/);
        if (nextIsBlock && blockTags.has(nextIsBlock[1].toLowerCase())) {
          formatted += '\n';
        }
      }
    } else {
      const text = token.replace(/\s+/g, ' ').trim();
      if (text) {
        formatted += ' '.repeat(indent * indentSize) + text + '\n';
      }
    }
  }

  return formatted.trim();
}

// 模拟highlightHtml函数
function highlightHtml(html) {
  let highlighted = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const placeholders = new Map();
  let placeholderId = 0;

  function addPlaceholder(content) {
    const key = `__PLACEHOLDER_${placeholderId++}__`;
    placeholders.set(key, content);
    return key;
  }

  highlighted = highlighted.replace(
    /(&lt;!--[\s\S]*?--&gt;)/g,
    (match) => addPlaceholder(`<span class="token comment">${match}</span>`)
  );

  highlighted = highlighted.replace(
    /(&lt;!DOCTYPE[^&]*?&gt;)/gi,
    (match) => addPlaceholder(`<span class="token doctype">${match}</span>`)
  );

  highlighted = highlighted.replace(
    /(&lt;!\[CDATA\[[\s\S]*?\]\]&gt;)/g,
    (match) => addPlaceholder(`<span class="token cdata">${match}</span>`)
  );

  highlighted = highlighted.replace(
    /(&lt;)(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^&]*?)(&gt;)/g,
    (match, lt, slash, tagName, attrs, gt) => {
      let processedAttrs = attrs;

      processedAttrs = processedAttrs.replace(
        /\s+([a-zA-Z-:]+)(=)/g,
        ' <span class="token attr-name">$1</span><span class="token punctuation">$2</span>'
      );

      processedAttrs = processedAttrs.replace(
        /"([^"]*)"/g,
        '<span class="token string">"$1"</span>'
      );

      processedAttrs = processedAttrs.replace(
        /'([^']*)'/g,
        '<span class="token string">\'$1\'</span>'
      );

      return `<span class="token punctuation">${lt}${slash}</span><span class="token tag">${tagName}</span>${processedAttrs}<span class="token punctuation">${gt}</span>`;
    }
  );

  placeholders.forEach((value, key) => {
    highlighted = highlighted.replace(key, value);
  });

  return highlighted;
}

// 测试用例
const testHtml = '<section><h1>标题</h1><p>这是一段文字<strong>加粗</strong>内容</p><div class="card"><img src="test.jpg"/><p>卡片内容</p></div><!-- 注释 --></section>';

console.log('=== 原始HTML ===');
console.log(testHtml);

console.log('\n=== 格式化后 ===');
const formatted = formatHtml(testHtml);
console.log(formatted);

console.log('\n=== 语法高亮后 ===');
const highlighted = highlightHtml(formatted);
console.log(highlighted.substring(0, 500) + '...');

console.log('\n=== 测试完成 ===');
