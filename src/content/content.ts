// content.ts - 注入微信公众号编辑器，添加HTML源码模式切换按钮和富文本编辑支持

import { LazyHighlightEditor, createHtmlEditor } from './html-editor';
import { formatHtml, minifyHtml } from './html-utils';

let isHtmlMode = false;
let richEditor: Element | null = null;
let codeEditor: HTMLTextAreaElement | HTMLDivElement | null = null;
let toggleBtn: HTMLButtonElement | null = null;

// 当前选区标记ID（用于精确定位替换）
let currentMarkerId: string | null = null;

// 保存进入源码模式前的编辑器原始HTML，用于无修改时恢复
let originalHtml: string = '';
let originalRawHtml: string = '';  // 保存原始未格式化的HTML

// HTML编辑器实例
let htmlEditorInstance: LazyHighlightEditor | null = null;

// 保存的选区信息（用于手动确认模式）
let savedSelection: {
  range: Range | null;
  html: string;
  text: string;
  timestamp: number;
} | null = null;

// 构建节点路径（从编辑器根节点到目标节点）
function getNodePath(node: Node): string[] {
  const path: string[] = [];
  let current: Node | null = node;
  const editor = getEditorContent();

  while (current && current !== editor && current !== document.body) {
    const parent = current.parentNode;
    if (!parent) break;

    const siblings = Array.from(parent.childNodes);
    const index = siblings.indexOf(current as Node);
    path.unshift(index.toString());
    current = parent;
  }

  return path;
}

// 序列化选区（保存关键信息）
function serializeSelection(): {
  startContainerPath: string[];
  startOffset: number;
  endContainerPath: string[];
  endOffset: number;
  html: string;
  text: string;
} | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (range.collapsed) return null;

  // 克隆选区内容
  const fragment = range.cloneContents();
  const div = document.createElement('div');
  div.appendChild(fragment.cloneNode(true));

  return {
    startContainerPath: getNodePath(range.startContainer),
    startOffset: range.startOffset,
    endContainerPath: getNodePath(range.endContainer),
    endOffset: range.endOffset,
    html: div.innerHTML,
    text: selection.toString(),
  };
}

// 根据路径查找节点
function getNodeByPath(path: string[]): Node | null {
  const editor = getEditorContent();
  if (!editor) return null;

  let current: Node = editor;
  for (const index of path) {
    const children = current.childNodes;
    const idx = parseInt(index, 10);
    if (idx < 0 || idx >= children.length) {
      return null;
    }
    current = children[idx];
  }
  return current;
}

// 恢复选区
function restoreSelection(serialized: {
  startContainerPath: string[];
  startOffset: number;
  endContainerPath: string[];
  endOffset: number;
}): Range | null {
  try {
    const startContainer = getNodeByPath(serialized.startContainerPath);
    const endContainer = getNodeByPath(serialized.endContainerPath);

    if (!startContainer || !endContainer) {
      console.warn('[Restore Selection] Cannot find nodes by path');
      return null;
    }

    const range = document.createRange();
    range.setStart(startContainer, Math.min(serialized.startOffset, startContainer.textContent?.length || 0));
    range.setEnd(endContainer, Math.min(serialized.endOffset, endContainer.textContent?.length || 0));

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    return range;
  } catch (e) {
    console.error('[Restore Selection] Error:', e);
    return null;
  }
}

// 使用保存的选区替换内容
async function replaceWithSavedSelection(newHtml: string): Promise<{ success: boolean; method: string }> {
  // 1. 优先尝试使用保存的选区
  if (savedSelection?.range) {
    try {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedSelection.range);

      const success = await replaceRichTextSelection(newHtml);
      if (success) {
        savedSelection = null; // 清除保存的选区
        return { success: true, method: 'saved_range' };
      }
    } catch (e) {
      console.warn('[Replace Saved] Failed:', e);
    }
  }

  // 2. 尝试使用当前选区
  const currentSelection = window.getSelection();
  if (currentSelection && !currentSelection.isCollapsed) {
    const success = await replaceRichTextSelection(newHtml);
    if (success) {
      savedSelection = null;
      return { success: true, method: 'current_selection' };
    }
  }

  // 3. 尝试替换整个编辑器内容（全文替换）
  const editor = getEditorContent();
  if (editor) {
    try {
      editor.focus();

      // 方法1：完全清空并重建内容（最彻底）
      while (editor.firstChild) {
        editor.removeChild(editor.firstChild);
      }

      // 创建临时容器解析HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = newHtml;

      // 将解析后的节点插入编辑器
      while (tempDiv.firstChild) {
        editor.appendChild(tempDiv.firstChild);
      }

      // 触发编辑器同步事件
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('keyup', { bubbles: true }));

      savedSelection = null;
      return { success: true, method: 'dom_replace_full' };
    } catch (e) {
      console.warn('[Replace DOM] Failed, trying execCommand:', e);

      // 降级方案：使用 execCommand
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        selection?.removeAllRanges();
        selection?.addRange(range);

        document.execCommand('delete', false);
        const success = document.execCommand('insertHTML', false, newHtml);

        if (success) {
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          savedSelection = null;
          return { success: true, method: 'exec_command_full' };
        }
      } catch (e2) {
        console.warn('[Replace ExecCommand] Failed:', e2);
      }
    }
  }

  // 4. 所有方法都失败
  return { success: false, method: 'failed' };
}

// 安全的消息发送函数，处理扩展上下文失效的情况
function safeSendMessage(message: any, callback?: (response: any) => void): void {
  try {
    if (!chrome.runtime?.id) {
      console.warn('[Content] Extension context invalidated, message not sent:', message.type);
      return;
    }
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        if (chrome.runtime.lastError.message?.includes('context invalidated')) {
          return;
        }
        console.warn('[Content] sendMessage error:', chrome.runtime.lastError.message);
      }
      if (callback) callback(response);
    });
  } catch (e) {
    if (e instanceof Error && e.message?.includes('Extension context invalidated')) {
      console.warn('[Content] Extension context invalidated');
    } else {
      console.error('[Content] sendMessage failed:', e);
    }
  }
}

function notifyModeChange(active: boolean) {
  safeSendMessage({ type: 'WX_HTML_MODE_CHANGE', active });
}

// 获取正文内容区（ProseMirror 编辑器）
function getEditorContent(): HTMLElement | null {
  const all = document.querySelectorAll('[contenteditable]');

  // 收集所有有效的 ProseMirror 编辑器（排除 widget / placeholder）
  const candidates: HTMLElement[] = [];
  for (let i = 0; i < all.length; i++) {
    const el = all[i] as HTMLElement;
    if (
      el.className.includes('ProseMirror') &&
      !el.className.includes('widget') &&
      !el.className.includes('placeholder')
    ) {
      candidates.push(el);
    }
  }

  // 如果有多个候选，选择包含 <p> 标签最多的（正文编辑器特征）
  if (candidates.length > 1) {
    let best = candidates[0];
    let maxP = best.querySelectorAll('p').length;
    for (let i = 1; i < candidates.length; i++) {
      const pCount = candidates[i].querySelectorAll('p').length;
      if (pCount > maxP) {
        maxP = pCount;
        best = candidates[i];
      }
    }
    return best;
  }

  if (candidates.length === 1) return candidates[0];

  // fallback：返回最后一个非 widget/placeholder 的 contenteditable
  for (let i = all.length - 1; i >= 0; i--) {
    const el = all[i] as HTMLElement;
    if (!el.className.includes('widget') && !el.className.includes('placeholder')) {
      return el;
    }
  }

  return (all[1] || all[0]) as HTMLElement | null;
}

// 获取编辑器外层容器（用于插入 textarea）
function getEditorContainer(): Element | null {
  const content = getEditorContent();
  return content?.parentElement || document.querySelector('#js_editor') || content;
}

// 写入 HTML 到 contenteditable 编辑器，触发数据模型同步
function applyHtmlToEditor(html: string) {
  const el = getEditorContent();
  if (!el) return;

  // 保存原始滚动位置
  const scrollTop = el.scrollTop;

  el.focus();

  // 方法1：尝试直接清空并设置内容（最彻底）
  try {
    // 先清空所有内容
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }

    // 创建临时容器解析HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // 将解析后的节点插入编辑器
    while (tempDiv.firstChild) {
      el.appendChild(tempDiv.firstChild);
    }

    // 触发多种事件确保 ProseMirror 同步
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('keyup', { bubbles: true }));

    // 恢复滚动位置
    el.scrollTop = scrollTop;

    // 额外：尝试触发微信编辑器的保存机制
    setTimeout(() => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, 100);

    return;
  } catch (e) {
    console.warn('[Apply HTML] DOM manipulation failed, falling back to execCommand:', e);
  }

  // 方法2：降级方案 - 使用 execCommand
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  selection?.removeAllRanges();
  selection?.addRange(range);

  // 删除选中的内容
  document.execCommand('delete', false);

  // 插入新内容
  document.execCommand('insertHTML', false, html);

  // 触发多种事件确保 ProseMirror 同步
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('keyup', { bubbles: true }));

  // 恢复滚动位置
  el.scrollTop = scrollTop;

  // 额外：尝试触发微信编辑器的保存机制
  setTimeout(() => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, 100);
}

// 使用 Clipboard API 插入 HTML（ProseMirror 兼容方案）
async function insertHtmlViaClipboard(html: string): Promise<boolean> {
  try {
    // 检查权限
    if (!navigator.clipboard || !navigator.clipboard.write) {
      console.warn('[Clipboard API] Not available');
      return false;
    }

    // 检查是否运行在扩展上下文中（某些页面可能限制 Clipboard API）
    if (window.location.protocol === 'chrome-extension:') {
      console.warn('[Clipboard API] Not supported in chrome-extension pages');
      return false;
    }

    // 将 HTML 写入剪贴板
    const blob = new Blob([html], { type: 'text/html' });
    const textBlob = new Blob([html], { type: 'text/plain' });
    const clipboardItem = new ClipboardItem({
      'text/html': blob,
      'text/plain': textBlob
    });

    await navigator.clipboard.write([clipboardItem]);

    // 聚焦编辑器并粘贴
    const editor = getEditorContent();
    if (!editor) return false;
    editor.focus();

    // 触发粘贴命令
    const result = document.execCommand('paste');
    return result;
  } catch (e) {
    // 静默处理剪贴板权限错误，这是预期的行为在某些页面
    if (e instanceof DOMException) {
      if (e.name === 'NotAllowedError') {
        console.warn('[Clipboard Insert] Permission denied - falling back to DOM insertion');
      } else {
        console.warn('[Clipboard Insert] DOMException:', e.name);
      }
    } else {
      console.warn('[Clipboard Insert] Failed:', e instanceof Error ? e.message : e);
    }
    return false;
  }
}

// 生成唯一标记ID
function generateMarkerId(): string {
  return `__WX_EDIT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}__`;
}

// 在HTML中插入标记
function markSelectionInHtml(
  fullHtml: string,
  selectionStart: number,
  selectionEnd: number
): { markedHtml: string; markerId: string } {
  const markerId = generateMarkerId();
  const startMarker = `<!--${markerId}-->`;
  const endMarker = `<!--/${markerId}-->`;

  const markedHtml =
    fullHtml.slice(0, selectionStart) +
    startMarker +
    fullHtml.slice(selectionStart, selectionEnd) +
    endMarker +
    fullHtml.slice(selectionEnd);

  return { markedHtml, markerId };
}

// 使用标记替换内容
function applyReplacementWithMarker(
  fullHtml: string,
  markerId: string,
  newContent: string
): { newHtml: string; success: boolean } {
  const startMarker = `<!--${markerId}-->`;
  const endMarker = `<!--/${markerId}-->`;

  const startIdx = fullHtml.indexOf(startMarker);
  const endIdx = fullHtml.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    console.warn('[Marker Replace] Markers not found');
    return { newHtml: fullHtml, success: false };
  }

  const newHtml =
    fullHtml.slice(0, startIdx) +
    newContent +
    fullHtml.slice(endIdx + endMarker.length);

  return { newHtml, success: true };
}

// 简单的 HTML 语法高亮
function highlightHtmlSimple(html: string): string {
  return html
    // 转义 HTML 特殊字符
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 标签高亮（绿色）
    .replace(/(&lt;\/?[a-zA-Z][a-zA-Z0-9]*)([^&]*?)(&gt;)/g,
      '<span class="wx-hl-tag">$1</span><span class="wx-hl-attr">$2</span><span class="wx-hl-tag">$3</span>')
    // 属性值高亮（蓝色）
    .replace(/("[^"]*")/g, '<span class="wx-hl-string">$1</span>')
    // 注释高亮（灰色）
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="wx-hl-comment">$1</span>');
}

// 根据光标位置，自动扩展选区到完整的顶层标签块（改进版）
function expandSelectionToBlock(textarea: HTMLTextAreaElement, extend = false) {
  const val = textarea.value;
  const pos = textarea.selectionStart;
  const currentEnd = textarea.selectionEnd;

  // 使用 DOMParser 解析HTML以获得更准确的结构
  let start = pos;
  let end = currentEnd;

  try {
    // 先尝试简单的标签匹配
    while (start > 0) {
      if (val[start] === '<' && val[start + 1] !== '/') break;
      start--;
    }

    const tagMatch = val.slice(start).match(/^<([a-zA-Z][a-zA-Z0-9]*)/);
    if (!tagMatch) return;

    const tagName = tagMatch[1];

    // 避免匹配到自闭合标签内的符号
    if (['br', 'hr', 'img', 'input', 'meta', 'link'].includes(tagName.toLowerCase())) {
      // 对于自闭合标签，选中整个标签
      const tagEnd = val.indexOf('>', start);
      if (tagEnd !== -1) {
        end = tagEnd + 1;
      }
    } else {
      // 寻找闭合标签（简单计数）
      const closeTag = `</${tagName}>`;
      let depth = 1;
      let searchPos = start + 1;

      while (depth > 0 && searchPos < val.length) {
        const openIdx = val.indexOf(`<${tagName}`, searchPos);
        const closeIdx = val.indexOf(closeTag, searchPos);

        if (closeIdx === -1) break;

        if (openIdx !== -1 && openIdx < closeIdx) {
          // 找到开始标签，深度+1
          depth++;
          searchPos = openIdx + 1;
        } else {
          // 找到闭合标签，深度-1
          depth--;
          if (depth === 0) {
            end = closeIdx + closeTag.length;
          }
          searchPos = closeIdx + 1;
        }
      }
    }

    if (extend && currentEnd > pos) {
      textarea.setSelectionRange(Math.min(textarea.selectionStart, start), Math.max(currentEnd, end));
    } else {
      textarea.setSelectionRange(start, end);
    }

    // 记录当前选区和标记
    currentMarkerId = generateMarkerId();

  } catch (e) {
    console.error('[Expand Selection] Error:', e);
    // 降级到原始简单逻辑
    const tagName = tagMatch?.[1];
    if (tagName) {
      const closeTag = `</${tagName}>`;
      const closeIdx = val.indexOf(closeTag, pos);
      const simpleEnd = closeIdx !== -1 ? closeIdx + closeTag.length : currentEnd;
      textarea.setSelectionRange(start, simpleEnd);
    }
  }

  notifySelection();
}

function notifySelection() {
  if (!codeEditor) {
    // 如果不是源码模式，检查富文本选区
    notifyRichTextSelection();
    return;
  }

  // textarea 模式
  if (codeEditor instanceof HTMLTextAreaElement) {
    const { selectionStart, selectionEnd } = codeEditor;
    const selected = codeEditor.value.slice(selectionStart, selectionEnd).trim();

    // 记录选区位置用于精确替换
    if (selected) {
      currentMarkerId = generateMarkerId();
    }

    safeSendMessage({
      type: 'WX_SELECTION_CHANGE',
      selected,
      selectionStart,
      selectionEnd,
      isRichText: false
    });
  }
}

// ========== 富文本模式功能 ==========

// 获取富文本编辑器中的选区信息
function getRichTextSelection(): {
  html: string;
  text: string;
  container: Element | null;
  isValid: boolean;
  ancestorChain: string[];
  ancestorOuterHTMLs: string[];
  ancestorPaths: string[][];
} {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return { html: '', text: '', container: null, isValid: false, ancestorChain: [], ancestorOuterHTMLs: [], ancestorPaths: [] };
  }

  const range = selection.getRangeAt(0);
  if (range.collapsed) {
    return { html: '', text: '', container: null, isValid: false, ancestorChain: [], ancestorOuterHTMLs: [], ancestorPaths: [] };
  }

  // 克隆选区内容
  const fragment = range.cloneContents();
  const div = document.createElement('div');
  div.appendChild(fragment);

  // 获取共同祖先容器
  const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer as Element
    : range.commonAncestorContainer.parentElement;

  // 获取祖先链、outerHTML 和节点路径
  const ancestorChain: string[] = [];
  const ancestorOuterHTMLs: string[] = [];
  const ancestorPaths: string[][] = [];
  let current: Element | null = container;
  let depth = 0;
  while (current && depth < 5) {
    const tagName = current.tagName?.toLowerCase() || 'text';
    const className = current.className ? `.${current.className.split(' ').join('.')}` : '';
    ancestorChain.push(`${tagName}${className}`);
    ancestorOuterHTMLs.push(current.outerHTML);
    ancestorPaths.push(getNodePath(current));
    current = current.parentElement;
    depth++;
  }

  return {
    html: div.innerHTML,
    text: selection.toString(),
    container,
    isValid: true,
    ancestorChain,
    ancestorOuterHTMLs,
    ancestorPaths
  };
}

// 获取选区的完整上下文
function getRichTextSelectionContext(container: Element | null): {
  outerHTML: string;
  parentTag: string;
  parentClass: string;
  computedStyle: Record<string, string>;
} {
  if (!container) {
    return { outerHTML: '', parentTag: '', parentClass: '', computedStyle: {} };
  }

  const parent = container.parentElement;
  let computedStyle: Record<string, string> = {};

  if (parent) {
    const style = window.getComputedStyle(parent);
    // 只取关键样式属性
    const keyStyles = ['background-color', 'color', 'font-size', 'text-align', 'padding', 'margin'];
    keyStyles.forEach(key => {
      computedStyle[key] = style.getPropertyValue(key);
    });
  }

  return {
    outerHTML: container.outerHTML,
    parentTag: parent?.tagName?.toLowerCase() || '',
    parentClass: parent?.className || '',
    computedStyle
  };
}

// 通知富文本选区变化
function notifyRichTextSelection() {
  const selection = getRichTextSelection();
  if (!selection.isValid) {
    safeSendMessage({
      type: 'WX_SELECTION_CHANGE',
      selected: '',
      html: '',
      isRichText: true,
      ancestorChain: [],
      ancestorOuterHTMLs: [],
      ancestorPaths: []
    });
    return;
  }

  const context = getRichTextSelectionContext(selection.container);

  safeSendMessage({
    type: 'WX_SELECTION_CHANGE',
    selected: selection.text,
    html: selection.html,
    isRichText: true,
    ancestorChain: selection.ancestorChain,
    ancestorOuterHTMLs: selection.ancestorOuterHTMLs,
    ancestorPaths: selection.ancestorPaths,
    context: {
      outerHTML: context.outerHTML,
      parentTag: context.parentTag,
      parentClass: context.parentClass,
      computedStyle: context.computedStyle
    }
  });
}

// 在富文本编辑器中替换选区内容
async function replaceRichTextSelection(newHtml: string): Promise<boolean> {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  if (range.collapsed) return false;

  // 尝试使用 Clipboard API
  const clipboardSuccess = await insertHtmlViaClipboard(newHtml);
  if (clipboardSuccess) {
    return true;
  }

  // 降级方案：直接 DOM 操作
  console.log('[Replace Selection] Falling back to DOM insertion');

  try {
    // 删除选区内容
    range.deleteContents();

    // 创建临时容器解析新HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newHtml;

    // 插入新内容
    const fragment = document.createDocumentFragment();
    while (tempDiv.firstChild) {
      fragment.appendChild(tempDiv.firstChild);
    }
    range.insertNode(fragment);

    // 触发编辑器同步
    const editor = getEditorContent();
    if (editor) {
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('keyup', { bubbles: true }));
    }

    return true;
  } catch (e) {
    console.error('[Replace Selection] Failed:', e);
    return false;
  }
}

// 通过路径替换目标元素（用于目标层级模式）
function replaceTargetElement(path: string[], newHtml: string): { success: boolean; method: string } {
  try {
    const targetElement = getNodeByPath(path);
    if (!targetElement || !(targetElement instanceof Element)) {
      console.warn('[Replace Target] Cannot find target element by path');
      return { success: false, method: 'failed' };
    }

    // 解析新HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newHtml.trim();

    // 确保只有一个根节点
    if (tempDiv.childNodes.length !== 1) {
      console.warn('[Replace Target] New HTML must have exactly one root element');
      // 如果有多个子节点，尝试用第一个元素节点
      const firstElement = tempDiv.querySelector('*');
      if (!firstElement) {
        return { success: false, method: 'failed' };
      }
      targetElement.replaceWith(firstElement);
    } else {
      targetElement.replaceWith(tempDiv.firstChild);
    }

    // 触发编辑器同步
    const editor = getEditorContent();
    if (editor) {
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('keyup', { bubbles: true }));

      // 额外：尝试触发微信编辑器的保存机制
      setTimeout(() => {
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));
      }, 100);
    }

    return { success: true, method: 'target_element' };
  } catch (e) {
    console.error('[Replace Target] Failed:', e);
    return { success: false, method: 'failed' };
  }
}

// 验证选区是否适合替换
function validateRichTextSelection(): { valid: boolean; reason?: string } {
  const sel = getRichTextSelection();
  if (!sel.isValid) {
    return { valid: false, reason: '没有有效的选区' };
  }

  // 检查选区是否跨越多个块级元素
  const parser = new DOMParser();
  const doc = parser.parseFromString(sel.html, 'text/html');
  const blockElements = doc.body.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, section, article, header, footer');

  if (blockElements.length > 1) {
    return {
      valid: true, // 仍然允许，但给出警告
      reason: '选区包含多个块级元素，可能导致格式问题'
    };
  }

  return { valid: true };
}

// 监听富文本编辑器选区变化
let selectionChangeTimer: number | null = null;
function setupRichTextSelectionListener() {
  const editor = getEditorContent();
  if (!editor) return;

  const handleSelectionChange = () => {
    if (isHtmlMode) return; // 源码模式下不处理

    // 防抖
    if (selectionChangeTimer) {
      clearTimeout(selectionChangeTimer);
    }
    selectionChangeTimer = window.setTimeout(() => {
      notifyRichTextSelection();
    }, 200);
  };

  // 监听选区变化事件
  document.addEventListener('selectionchange', handleSelectionChange);

  // 监听鼠标抬起事件（选区结束）
  editor.addEventListener('mouseup', handleSelectionChange);

  // 监听键盘事件（Shift+方向键选区）
  editor.addEventListener('keyup', (e) => {
    if (e.shiftKey) {
      handleSelectionChange();
    }
  });
}

// ========== 源码模式功能 ==========

function enterHtmlMode() {
  const contentEl = getEditorContent();
  const containerEl = getEditorContainer();
  if (!contentEl || !containerEl) return;

  richEditor = contentEl;
  const html = contentEl.innerHTML;

  // 保存原始HTML（未格式化），用于无修改时恢复
  originalRawHtml = html;
  originalHtml = html;

  // 隐藏富文本编辑器
  contentEl.style.display = 'none';

  // 创建新的分层HTML编辑器
  htmlEditorInstance = createHtmlEditor(
    containerEl as HTMLElement,
    html,
    // onChange 回调
    (value) => {
      // 发送完整HTML到侧边栏
      safeSendMessage({
        type: 'WX_SELECTION_CHANGE',
        selected: '',
        isRichText: false,
        fullHtml: value
      });
    },
    // onSelectionChange 回调
    (selected, start, end) => {
      safeSendMessage({
        type: 'WX_SELECTION_CHANGE',
        selected,
        selectionStart: start,
        selectionEnd: end,
        isRichText: false,
        fullHtml: htmlEditorInstance?.getValue() || ''
      });
    }
  );

  // 支持通过 codeEditor 变量访问（保持向后兼容）
  codeEditor = htmlEditorInstance.getTextarea();

  // 添加双击选区扩展（选整个标签块）
  const textarea = htmlEditorInstance.getTextarea();
  textarea.addEventListener('dblclick', (e) => {
    expandSelectionToBlock(textarea, (e as MouseEvent).shiftKey);
  });

  isHtmlMode = true;
  if (toggleBtn) toggleBtn.textContent = '退出源码模式';
  notifyModeChange(true);

  // 发送初始HTML到侧边栏
  safeSendMessage({
    type: 'WX_SELECTION_CHANGE',
    selected: '',
    isRichText: false,
    fullHtml: html
  });
}

function exitHtmlMode() {
  if (!richEditor || !htmlEditorInstance) return;

  const newHtml = htmlEditorInstance.getValue();

  // 销毁HTML编辑器实例
  htmlEditorInstance.destroy();
  htmlEditorInstance = null;
  codeEditor = null;

  (richEditor as HTMLElement).style.display = '';

  // 如果内容没有修改，直接恢复，不触发编辑器更新
  // 注意：这里比较的是格式化后的内容和原始内容
  // 如果用户只是格式化但没有实质修改，也视为无修改
  if (newHtml === originalHtml || newHtml === formatHtml(originalRawHtml)) {
    console.log('[Exit HTML Mode] No changes, skipping update');
    isHtmlMode = false;
    if (toggleBtn) toggleBtn.textContent = '切换HTML源码';
    notifyModeChange(false);
    setupRichTextSelectionListener();
    return;
  }

  // 内容有修改，应用新内容
  // 将格式化后的HTML压缩回紧凑形式（可选，取决于需求）
  // const compressedHtml = minifyHtml(newHtml);
  applyHtmlToEditor(newHtml);

  isHtmlMode = false;
  if (toggleBtn) toggleBtn.textContent = '切换HTML源码';
  notifyModeChange(false);

  // 重新设置富文本选区监听
  setupRichTextSelectionListener();
}

function injectToggleButton() {
  if (document.getElementById('wx-html-toggle-btn')) return;
  const toolbar =
    document.querySelector('.edui-toolbar') ||
    document.querySelector('[class*="toolbar"]') ||
    document.querySelector('.tool_area');
  if (!toolbar) return;

  toggleBtn = document.createElement('button');
  toggleBtn.id = 'wx-html-toggle-btn';
  toggleBtn.textContent = '切换HTML源码';
  Object.assign(toggleBtn.style, {
    marginLeft: '8px', padding: '4px 10px', background: '#07c160',
    color: '#fff', border: 'none', borderRadius: '4px',
    cursor: 'pointer', fontSize: '13px', verticalAlign: 'middle',
  });
  toggleBtn.addEventListener('click', () => {
    isHtmlMode ? exitHtmlMode() : enterHtmlMode();
  });
  toolbar.appendChild(toggleBtn);
}

// ========== 消息处理 ==========

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // 应用HTML到编辑器
  if (msg.type === 'WX_APPLY_HTML') {
    if (isHtmlMode && htmlEditorInstance) {
      // 源码模式：替换编辑器内容
      const currentValue = htmlEditorInstance.getValue();

      if (msg.replaceSelection && msg.markerId) {
        const { newHtml, success } = applyReplacementWithMarker(
          currentValue,
          msg.markerId,
          msg.html
        );
        if (success) {
          htmlEditorInstance.setValue(newHtml);
          sendResponse({ success: true });
        } else {
          // 标记替换失败，尝试字符串匹配
          const textarea = htmlEditorInstance.getTextarea();
          const { selectionStart, selectionEnd } = textarea;
          const val = htmlEditorInstance.getValue();
          const newValue = val.slice(0, selectionStart) + msg.html + val.slice(selectionEnd);
          htmlEditorInstance.setValue(newValue);
          sendResponse({ success: true, fallback: true });
        }
      } else {
        htmlEditorInstance.setValue(msg.html);
        sendResponse({ success: true });
      }
    } else {
      // 富文本模式
      // 如果指定了目标层级，使用目标元素替换
      if (typeof msg.targetLevel === 'number' && msg.targetLevel >= 0 && msg.ancestorPaths && msg.ancestorPaths[msg.targetLevel]) {
        const path = msg.ancestorPaths[msg.targetLevel];
        const result = replaceTargetElement(path, msg.html);
        console.log('[Apply HTML] Target element replace:', result);
        sendResponse(result);
      } else {
        // 尝试使用保存的选区替换
        replaceWithSavedSelection(msg.html).then(({ success, method }) => {
          console.log('[Apply HTML] Method:', method, 'Success:', success);
          sendResponse({ success, method });
        });
        return true; // 保持通道开启，等待异步响应
      }
    }
  }

  // 获取当前HTML
  if (msg.type === 'WX_GET_HTML') {
    let html = '';
    if (isHtmlMode && htmlEditorInstance) {
      html = htmlEditorInstance.getValue();
    } else {
      // 富文本模式下直接取正文编辑器内容，避免容器过大包含标题/作者
      const editor = getEditorContent();
      html = editor?.innerHTML || '';
    }
    sendResponse({ html, isHtmlMode });
  }

  // 获取当前模式
  if (msg.type === 'WX_GET_MODE') {
    sendResponse({ active: isHtmlMode });
  }

  // 验证富文本选区
  if (msg.type === 'WX_VALIDATE_SELECTION') {
    const result = validateRichTextSelection();
    sendResponse(result);
  }

  // 保存当前选区（用于手动确认模式）
  if (msg.type === 'WX_SAVE_SELECTION') {
    const serialized = serializeSelection();
    if (serialized) {
      // 尝试直接保存Range对象（同一页面内有效）
      const selection = window.getSelection();
      savedSelection = {
        range: selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null,
        html: serialized.html,
        text: serialized.text,
        timestamp: Date.now(),
      };
      sendResponse({ saved: true, text: serialized.text });
    } else {
      sendResponse({ saved: false, reason: 'no_valid_selection' });
    }
  }

  // 清除保存的选区
  if (msg.type === 'WX_CLEAR_SAVED_SELECTION') {
    savedSelection = null;
    sendResponse({ cleared: true });
  }
});

// ========== 初始化 ==========

const observer = new MutationObserver(() => {
  if (getEditorContainer()) {
    injectToggleButton();
    setupRichTextSelectionListener();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
injectToggleButton();

// 初始设置富文本监听
setupRichTextSelectionListener();
