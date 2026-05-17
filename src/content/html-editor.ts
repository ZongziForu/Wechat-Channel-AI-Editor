// html-editor.ts - CodeMirror 6 HTML 编辑器
// 替换原有的延迟高亮方案，提供专业的代码编辑体验

import { EditorView, keymap, ViewUpdate } from '@codemirror/view';
import { EditorState, Extension } from '@codemirror/state';
import { html } from '@codemirror/lang-html';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { lineNumbers, highlightActiveLineGutter } from '@codemirror/view';
import { defaultHighlightStyle, syntaxHighlighting, bracketMatching } from '@codemirror/language';
import { highlightSelectionMatches } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { formatHtml } from './html-utils';

export interface LazyHighlightEditorOptions {
  initialHtml: string;
  height?: string;
  highlightDelay?: number;  // 保留参数用于兼容，实际不再使用
  onChange?: (value: string) => void;
  onSelectionChange?: (selection: string, start: number, end: number) => void;
}

export class LazyHighlightEditor {
  private container: HTMLDivElement;
  private view: EditorView;
  private options: Required<LazyHighlightEditorOptions>;
  private textareaProxy: HTMLTextAreaElement;

  // 默认配置
  private static readonly DEFAULT_OPTIONS: Omit<Required<LazyHighlightEditorOptions>, 'initialHtml'> = {
    height: '600px',
    highlightDelay: 0, // CodeMirror 实时高亮，无需延迟
    onChange: () => {},
    onSelectionChange: () => {},
  };

  constructor(container: HTMLElement, options: LazyHighlightEditorOptions) {
    this.options = {
      ...LazyHighlightEditor.DEFAULT_OPTIONS,
      ...options,
    };

    this.container = document.createElement('div');
    this.container.className = 'wx-cm-editor-container';
    this.container.style.cssText = `
      position: relative;
      width: 100%;
      height: ${this.options.height};
      min-height: 400px;
      border: 2px solid #07c160;
      border-radius: 4px;
      overflow: hidden;
      background: #fff;
    `;

    // 创建一个模拟的 textarea 用于兼容
    this.textareaProxy = document.createElement('textarea');
    this.textareaProxy.style.display = 'none';
    this.container.appendChild(this.textareaProxy);

    // 初始化 CodeMirror
    this.view = this.createEditor();
    this.container.appendChild(this.view.dom);

    container.appendChild(this.container);
    this.injectStyles();
  }

  /**
   * 创建 CodeMirror 编辑器实例
   */
  private createEditor(): EditorView {
    const formatted = formatHtml(this.options.initialHtml);

    // 自定义主题扩展
    const customTheme = EditorView.theme({
      '&': {
        fontSize: '13px',
        height: '100%',
      },
      '.cm-content': {
        fontFamily: '"Monaco", "Menlo", "Consolas", "Courier New", monospace',
        lineHeight: '1.6',
        padding: '12px',
        tabSize: '2',
      },
      '.cm-gutters': {
        fontFamily: '"Monaco", "Menlo", "Consolas", "Courier New", monospace',
        fontSize: '12px',
        lineHeight: '1.6',
        backgroundColor: '#f5f5f5',
        borderRight: '1px solid #e0e0e0',
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(7, 193, 96, 0.05)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'rgba(7, 193, 96, 0.1)',
      },
      '.cm-cursor': {
        borderLeftColor: '#07c160',
        borderLeftWidth: '2px',
      },
      '.cm-selectionBackground': {
        backgroundColor: 'rgba(7, 193, 96, 0.2)',
      },
      '&.cm-focused .cm-selectionBackground': {
        backgroundColor: 'rgba(7, 193, 96, 0.25)',
      },
      '.cm-matchingBracket': {
        backgroundColor: 'rgba(7, 193, 96, 0.2)',
        outline: '1px solid rgba(7, 193, 96, 0.4)',
      },
      '.cm-nonmatchingBracket': {
        backgroundColor: 'rgba(255, 0, 0, 0.1)',
        outline: '1px solid rgba(255, 0, 0, 0.3)',
      },
    }, { dark: false });

    // 监听变化的扩展
    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        const value = this.view.state.doc.toString();
        this.textareaProxy.value = value;
        this.options.onChange(value);
      }

      if (update.selectionSet) {
        this.notifySelectionChange();
      }
    });

    const state = EditorState.create({
      doc: formatted,
      extensions: [
        // 基础功能
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),

        // HTML 语言支持
        html(),

        // 语法高亮
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),

        // 键盘快捷键
        keymap.of([
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
          ...closeBracketsKeymap,
        ]),

        // 自定义主题
        customTheme,

        // 变化监听
        updateListener,

        // 编辑器配置
        EditorView.lineWrapping,
      ],
    });

    return new EditorView({
      state,
      parent: this.container,
    });
  }

  /**
   * 注入样式
   */
  private injectStyles() {
    const styleId = 'wx-cm-editor-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* CodeMirror 编辑器容器 */
      .wx-cm-editor-container {
        position: relative;
      }

      .wx-cm-editor-container .cm-editor {
        height: 100%;
      }

      .wx-cm-editor-container .cm-scroller {
        overflow: auto;
      }

      /* 自定义滚动条样式 */
      .wx-cm-editor-container .cm-scroller::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }
      .wx-cm-editor-container .cm-scroller::-webkit-scrollbar-track {
        background: #f1f1f1;
      }
      .wx-cm-editor-container .cm-scroller::-webkit-scrollbar-thumb {
        background: #c1c1c1;
        border-radius: 5px;
      }
      .wx-cm-editor-container .cm-scroller::-webkit-scrollbar-thumb:hover {
        background: #a1a1a1;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * 通知选区变化
   */
  private notifySelectionChange() {
    const { from, to } = this.view.state.selection.main;
    const selected = this.view.state.doc.sliceString(from, to).trim();
    this.options.onSelectionChange(selected, from, to);
  }

  /**
   * 获取当前值
   */
  getValue(): string {
    return this.view.state.doc.toString();
  }

  /**
   * 设置值
   */
  setValue(value: string) {
    const formatted = formatHtml(value);
    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: formatted,
      },
    });
  }

  /**
   * 获取编辑器元素（兼容旧接口，返回隐藏的 textarea）
   */
  getTextarea(): HTMLTextAreaElement {
    return this.textareaProxy;
  }

  /**
   * 聚焦
   */
  focus() {
    this.view.focus();
  }

  /**
   * 销毁编辑器
   */
  destroy() {
    this.view.destroy();
    this.container.remove();

    // 清理样式（如果没有其他编辑器实例）
    const styleId = 'wx-cm-editor-styles';
    const style = document.getElementById(styleId);
    if (style && !document.querySelector('.wx-cm-editor-container')) {
      style.remove();
    }
  }
}

/**
 * 创建编辑器的便捷函数
 */
export function createHtmlEditor(
  container: HTMLElement,
  initialHtml: string,
  onChange?: (value: string) => void,
  onSelectionChange?: (selection: string, start: number, end: number) => void
): LazyHighlightEditor {
  return new LazyHighlightEditor(container, {
    initialHtml,
    onChange,
    onSelectionChange,
  });
}

// 保持向后兼容的导出
export { formatHtml } from './html-utils';

// 为了兼容旧代码中的 highlightHtml，提供一个简单实现
export function highlightHtml(html: string): string {
  // CodeMirror 不需要手动高亮，返回原字符串即可
  return html;
}
