// sidepanel.tsx - AI排版助手侧边栏，含可折叠设置面板和富文本编辑支持
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { callAI, callAIStream, cleanAIResponse, partialCleanAIResponse, callAIWithRetry, getApiConfig } from '../utils/api';

// 预设提示词类型
interface Preset {
  id: string;
  label: string;
  prompt: string;
}

// 默认预设提示词
const DEFAULT_PRESETS: Preset[] = [
  { id: 'preset-1', label: '优化移动端排版', prompt: '优化以下HTML的移动端排版，确保在手机上显示美观' },
  { id: 'preset-2', label: '增加卡片样式', prompt: '为以下HTML内容添加卡片式布局样式，使用圆角和阴影' },
  { id: 'preset-3', label: '简化代码', prompt: '简化以下HTML代码，去除冗余标签，保持内容不变' },
];

// HTML语法高亮（简化版）
function highlightHtmlSimple(html: string): string {
  if (!html) return '';
  return html
    // 转义 HTML 特殊字符
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 标签高亮（绿色）
    .replace(/(&lt;\/?[a-zA-Z][a-zA-Z0-9]*)([^&]*?)(&gt;)/g,
      '<span class="tag">$1</span><span class="attr">$2</span><span class="tag">$3</span>')
    // 属性值高亮（蓝色）
    .replace(/("[^"]*")/g, '<span class="string">$1</span>')
    // 注释高亮（灰色）
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="comment">$1</span>');
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [protocol, setProtocol] = useState<'anthropic' | 'openai'>('anthropic');
  const [customPrompt, setCustomPrompt] = useState('');
  const [streamRenderHtml, setStreamRenderHtml] = useState(false);
  const [maxTokens, setMaxTokens] = useState(8192);
  const [saved, setSaved] = useState(false);

  // 预设管理相关状态
  const [customPresets, setCustomPresets] = useState<Preset[]>([]);
  const [newPresetLabel, setNewPresetLabel] = useState('');
  const [newPresetPrompt, setNewPresetPrompt] = useState('');
  const [showPresetsManager, setShowPresetsManager] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get(['apiKey', 'baseUrl', 'model', 'protocol', 'customPrompt', 'streamRenderHtml', 'customPresets', 'maxTokens'], (r) => {
      setApiKey(r.apiKey || '');
      setBaseUrl(r.baseUrl || 'https://api.anthropic.com');
      setModel(r.model || '');
      setProtocol(r.protocol || 'anthropic');
      setCustomPrompt(r.customPrompt || '');
      setStreamRenderHtml(r.streamRenderHtml || false);
      setCustomPresets(r.customPresets || DEFAULT_PRESETS);
      setMaxTokens(r.maxTokens || 8192);
    });
  }, []);

  function save() {
    chrome.storage.sync.set({ apiKey, baseUrl, model, protocol, customPrompt, streamRenderHtml, customPresets, maxTokens }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  // 添加新预设
  function addPreset() {
    if (!newPresetLabel.trim() || !newPresetPrompt.trim()) return;
    const newPreset: Preset = {
      id: `preset-${Date.now()}`,
      label: newPresetLabel.trim(),
      prompt: newPresetPrompt.trim()
    };
    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    chrome.storage.sync.set({ customPresets: updated });
    setNewPresetLabel('');
    setNewPresetPrompt('');
  }

  // 删除预设
  function deletePreset(id: string) {
    const updated = customPresets.filter(p => p.id !== id);
    setCustomPresets(updated);
    chrome.storage.sync.set({ customPresets: updated });
  }

  // 重置为默认预设
  function resetPresets() {
    if (confirm('确定要重置为默认预设吗？这将删除所有自定义预设。')) {
      setCustomPresets(DEFAULT_PRESETS);
      chrome.storage.sync.set({ customPresets: DEFAULT_PRESETS });
    }
  }

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <span>设置</span>
      </div>

      {/* 预设管理折叠面板 */}
      <div style={{ marginBottom: '15px', borderBottom: '1px solid #e0e0e0', paddingBottom: '10px' }}>
        <button
          onClick={() => setShowPresetsManager(!showPresetsManager)}
          style={{
            width: '100%',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            padding: '5px 0',
            cursor: 'pointer',
            fontSize: '12px',
            color: '#555',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>📝 预设提示词管理 ({customPresets.length})</span>
          <span>{showPresetsManager ? '▲' : '▼'}</span>
        </button>

        {showPresetsManager && (
          <div style={{ marginTop: '8px' }}>
            {/* 当前预设列表 */}
            <div style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '10px' }}>
              {customPresets.map(preset => (
                <div
                  key={preset.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '5px 8px',
                    background: '#f5f5f5',
                    borderRadius: '4px',
                    marginBottom: '4px',
                    fontSize: '12px'
                  }}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#555' }}>
                    {preset.label}
                  </span>
                  <button
                    onClick={() => deletePreset(preset.id)}
                    style={{
                      background: '#e74c3c',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      padding: '2px 6px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      marginLeft: '8px'
                    }}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>

            {/* 添加新预设表单 */}
            <div style={{ borderTop: '1px dashed #ddd', paddingTop: '10px' }}>
              <div style={{ fontSize: '12px', color: '#555', marginBottom: '6px' }}>添加新预设</div>
              <input
                type="text"
                placeholder="预设名称"
                value={newPresetLabel}
                onChange={e => setNewPresetLabel(e.target.value)}
                style={{ marginBottom: '8px' }}
              />
              <textarea
                placeholder="提示词内容"
                value={newPresetPrompt}
                onChange={e => setNewPresetPrompt(e.target.value)}
                rows={2}
                style={{ resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button
                  onClick={addPreset}
                  disabled={!newPresetLabel.trim() || !newPresetPrompt.trim()}
                  className="btn-save"
                  style={{ flex: 1, fontSize: '12px', padding: '5px' }}
                >
                  添加
                </button>
                <button
                  onClick={resetPresets}
                  style={{
                    padding: '5px 12px',
                    background: '#f0f0f0',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    color: '#555'
                  }}
                >
                  重置默认
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <label>接口协议
        <div className="protocol-switch">
          <button className={`btn-mode ${protocol === 'anthropic' ? 'active' : ''}`}
            onClick={() => setProtocol('anthropic')}>Anthropic</button>
          <button className={`btn-mode ${protocol === 'openai' ? 'active' : ''}`}
            onClick={() => setProtocol('openai')}>OpenAI 兼容</button>
        </div>
      </label>
      <label>API Key
        <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." />
      </label>
      <label>Base URL
        <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
          placeholder={protocol === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.moonshot.cn/v1'} />
      </label>
      <label style={{ position: 'relative' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          最大输出长度 (max_tokens)
          <span style={{ color: '#666', fontSize: '11px' }}>可选</span>
        </span>
        <input
          type="number"
          value={maxTokens}
          onChange={e => setMaxTokens(Math.max(1, parseInt(e.target.value, 10) || 8192))}
          placeholder="8192"
        />
        <small style={{ color: '#666', fontSize: '11px', display: 'block', marginTop: '2px' }}>
          数值越大 AI 可输出的内容越长。Kimi 建议 8192，Claude 建议 4096~8192
        </small>
      </label>
      <label style={{ position: 'relative' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          模型名称
          {protocol === 'openai' && (
            <span style={{ color: '#e74c3c', fontSize: '11px' }}>*必填</span>
          )}
          {protocol === 'anthropic' && (
            <span style={{ color: '#666', fontSize: '11px' }}>可选</span>
          )}
        </span>
        <input
          type="text"
          value={model}
          onChange={e => setModel(e.target.value)}
          placeholder={protocol === 'anthropic' ? '如：claude-opus-4-6（可选）' : '如：gpt-4、moonshot-v1-8k（必填）'}
          style={protocol === 'openai' && !model ? { borderColor: '#e74c3c' } : undefined}
        />
        {protocol === 'openai' && !model && (
          <small style={{ color: '#e74c3c', fontSize: '11px', display: 'block', marginTop: '2px' }}>
            OpenAI 兼容协议必须填写模型名称
          </small>
        )}
      </label>
      <label style={{ marginTop: '10px' }}>
        自定义系统提示词（可选）
        <textarea
          value={customPrompt}
          onChange={e => setCustomPrompt(e.target.value)}
          placeholder="在此处添加自定义要求，将追加到默认提示词后。例如：&#10;- 使用14px字体大小&#10;- 避免使用红色&#10;- 保持简洁风格"
          rows={4}
          style={{ fontSize: '12px', marginTop: '4px' }}
        />
        <small style={{ color: '#666', fontSize: '11px' }}>
          提示：默认提示词已包含基础规则，此处填写的内容将追加到默认提示词后
        </small>
      </label>

      <label style={{ marginTop: '15px', borderTop: '1px solid #e0e0e0', paddingTop: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
          <input
            type="checkbox"
            checked={streamRenderHtml}
            onChange={e => {
              const newValue = e.target.checked;
              setStreamRenderHtml(newValue);
              // 立即保存到 storage，确保设置实时生效
              chrome.storage.sync.set({ streamRenderHtml: newValue });
            }}
            style={{ marginTop: '2px' }}
          />
          <div>
            流式生成时实时渲染HTML预览（实验性）
            <small style={{ display: 'block', color: '#666', fontSize: '11px', marginTop: '2px' }}>
              开启后可在生成过程中预览渲染效果，但可能出现显示异常
            </small>
          </div>
        </div>
      </label>

      <button className="btn-save" onClick={save}>{saved ? '已保存 ✓' : '保存'}</button>
    </div>
  );
}

function SidePanel() {
  const [isHtmlMode, setIsHtmlMode] = useState(false);
  const [seamless, setSeamless] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const [showFullHtmlPreview, setShowFullHtmlPreview] = useState(false);
  const [streamRenderHtml, setStreamRenderHtml] = useState(false);
  const [presets, setPresets] = useState<Preset[]>(DEFAULT_PRESETS);

  // 选区相关状态
  const [selection, setSelection] = useState('');
  const [selectionHtml, setSelectionHtml] = useState('');
  const [fullHtml, setFullHtml] = useState(''); // 源码模式的完整HTML
  const [useSelection, setUseSelection] = useState(false);
  const [isRichTextSelection, setIsRichTextSelection] = useState(false);
  const [ancestorChain, setAncestorChain] = useState<string[]>([]);
  const [ancestorOuterHTMLs, setAncestorOuterHTMLs] = useState<string[]>([]);
  const [ancestorPaths, setAncestorPaths] = useState<string[][]>([]);
  const [selectionContext, setSelectionContext] = useState<any>(null);
  const [includeParentStyle, setIncludeParentStyle] = useState(false);
  const [targetLevel, setTargetLevel] = useState<number>(-1); // -1 表示未选择目标层级（默认选中内容）

  const accumulatedRef = useRef('');
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // 初始化时获取当前模式
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'WX_GET_MODE' }, (res) => {
          if (chrome.runtime.lastError) return;
          if (res?.active) setIsHtmlMode(true);
        });
      }
    });

    // 读取设置
    chrome.storage.sync.get(['streamRenderHtml'], (r) => {
      setStreamRenderHtml(r.streamRenderHtml || false);
    });

    // 读取自定义预设
    chrome.storage.sync.get(['customPresets'], (r) => {
      if (r.customPresets && Array.isArray(r.customPresets) && r.customPresets.length > 0) {
        setPresets(r.customPresets);
      } else {
        // 使用默认预设并保存到 storage
        setPresets(DEFAULT_PRESETS);
        chrome.storage.sync.set({ customPresets: DEFAULT_PRESETS });
      }
    });

    // Cleanup abort controller on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    // 监听设置变化，实时同步 streamRenderHtml 和自定义预设状态
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'sync' && changes.streamRenderHtml) {
        setStreamRenderHtml(changes.streamRenderHtml.newValue || false);
      }
      if (areaName === 'sync' && changes.customPresets) {
        const newPresets = changes.customPresets.newValue;
        if (newPresets && Array.isArray(newPresets) && newPresets.length > 0) {
          setPresets(newPresets);
        } else {
          setPresets(DEFAULT_PRESETS);
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const handler = (msg: any) => {
      if (msg.type === 'WX_HTML_MODE_CHANGE') {
        setIsHtmlMode(msg.active);
        setResult(''); setError('');
      }
      if (msg.type === 'WX_SELECTION_CHANGE') {
        const hasSelection = !!(msg.selected || msg.html);
        setSelection(msg.selected || '');
        setSelectionHtml(msg.html || '');
        setIsRichTextSelection(msg.isRichText);
        setAncestorChain(msg.ancestorChain || []);
        setAncestorOuterHTMLs(msg.ancestorOuterHTMLs || []);
        setAncestorPaths(msg.ancestorPaths || []);
        setSelectionContext(msg.context || null);
        // 选区变化时重置目标层级
        setTargetLevel(-1);

        // 保存源码模式的完整HTML用于预览
        if (msg.fullHtml) {
          setFullHtml(msg.fullHtml);
        }

        if (hasSelection) {
          setUseSelection(true);
        } else {
          setUseSelection(false);
        }
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  function getCurrentHtml(): Promise<{ html: string; isHtmlMode: boolean }> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'WX_GET_HTML' }, (res) => {
            resolve({ html: res?.html || '', isHtmlMode: res?.isHtmlMode || false });
          });
        } else resolve({ html: '', isHtmlMode: false });
      });
    });
  }

  function applyHtml(html: string, replaceSelection = false, targetLevelArg = -1, ancestorPathsArg: string[][] = []) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'WX_APPLY_HTML',
          html,
          replaceSelection,
          targetLevel: targetLevelArg,
          ancestorPaths: ancestorPathsArg
        }, (res) => {
          if (!res?.success) {
            // 根据失败原因提供更详细的提示
            if (res?.method === 'failed') {
              setError(
                '应用失败：无法找到原来的选区。\n\n' +
                '可能原因：\n' +
                '1. 您点击了其他地方，导致选区丢失\n' +
                '2. 原文内容已被修改或删除\n\n' +
                '建议：切换到HTML源码模式后重试，或手动复制下方代码粘贴到编辑器中。'
              );
              // 自动复制到剪贴板作为备选
              navigator.clipboard.writeText(html).then(() => {
                console.log('[Apply HTML] Content copied to clipboard');
              });
            } else {
              setError('应用失败，请尝试切换到源码模式后重试');
            }
          } else {
            console.log('[Apply HTML] Success with method:', res?.method);
            // 成功后清除保存的选区
            chrome.tabs.sendMessage(tabs[0].id, { type: 'WX_CLEAR_SAVED_SELECTION' });
          }
        });
      }
    });
  }

  // 构建AI提示上下文
  function buildAIContext(
    fullHtml: string,
    selectedText: string,
    selectedHtml: string,
    isRichText: boolean,
    context: any,
    includeParent: boolean,
    targetLevel: number,
    ancestorOuterHTMLs: string[]
  ): { content: string; contextPrompt: string; markerId?: string } {

    // 强制添加的禁止解释规则（所有场景都添加）
    const STRICT_NO_EXPLANATION = '\n\n【严格要求】只输出HTML代码，禁止输出任何解释、说明、思考过程、"我将..."、"这里..."等文字。';

    // 如果没有选区，返回完整HTML
    if (!selectedText && !selectedHtml) {
      return {
        content: fullHtml,
        contextPrompt: prompt + STRICT_NO_EXPLANATION
      };
    }

    // 富文本模式
    if (isRichText) {
      let content = '';
      let contextPrompt = prompt;

      // 如果指定了目标层级，使用该层级的元素 outerHTML
      if (targetLevel >= 0 && ancestorOuterHTMLs[targetLevel]) {
        content = ancestorOuterHTMLs[targetLevel];
        contextPrompt = `${prompt}\n\n注意：\n1. 请修改以下HTML元素，保持其标签名和主要类名不变\n2. 只输出这一个元素的完整HTML，不要包裹额外层级\n3. 不要输出任何解释文字`;
        return { content, contextPrompt: contextPrompt + STRICT_NO_EXPLANATION };
      }

      if (includeParent && context?.outerHTML) {
        // 包含父元素样式信息
        const styleInfo = context.computedStyle
          ? Object.entries(context.computedStyle)
              .map(([k, v]) => `${k}: ${v}`)
              .join('; ')
          : '';

        content = `【父元素样式】\n${styleInfo}\n\n【选中内容】\n${selectedHtml}`;

        contextPrompt = `${prompt}\n\n注意：\n1. 优化【选中内容】部分\n2. 考虑【父元素样式】保持协调性\n3. 只输出处理后的选中内容HTML，不需要包含父元素`;
      } else {
        content = selectedHtml;
        contextPrompt = `${prompt}\n\n注意：只输出优化后的HTML代码，不要包含解释。`;
      }

      return { content, contextPrompt: contextPrompt + STRICT_NO_EXPLANATION };
    }

    // 源码模式 - 使用标记精确定位
    const idx = fullHtml.indexOf(selectedText);
    if (idx !== -1) {
      const ctxBefore = fullHtml.slice(Math.max(0, idx - 300), idx);
      const ctxAfter = fullHtml.slice(idx + selectedText.length, idx + selectedText.length + 300);

      const content = `${ctxBefore}【需要处理的部分开始】${selectedText}【需要处理的部分结束】${ctxAfter}`;
      const contextPrompt = `${prompt}\n\n重要提示：\n1. 只需重点处理【需要处理的部分】\n2. 可适当调整周边内容以保持整体协调\n3. 输出必须包含完整的处理后内容（去掉【】标记）\n4. 不要破坏HTML标签结构`;

      return { content, contextPrompt: contextPrompt + STRICT_NO_EXPLANATION };
    }

    // 找不到匹配，使用完整HTML
    return {
      content: fullHtml,
      contextPrompt: prompt + STRICT_NO_EXPLANATION
    };
  }

  async function handleSend() {
    if (!prompt.trim()) return;

    // 在开始时读取最新的设置，确保使用当前保存的值
    const currentStreamRenderHtml = await new Promise<boolean>((resolve) => {
      chrome.storage.sync.get(['streamRenderHtml'], (r) => {
        resolve(r.streamRenderHtml || false);
      });
    });

    // 更新状态以确保渲染使用正确的模式
    setStreamRenderHtml(currentStreamRenderHtml);

    setLoading(true);
    setStreaming(true);
    setError('');
    setResult('');
    accumulatedRef.current = '';

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const { html: currentFullHtml, isHtmlMode: currentMode } = await getCurrentHtml();

      if (!currentFullHtml) {
        throw new Error('无法获取编辑器内容，请确保您在微信公众号编辑页面');
      }

      // 更新完整HTML状态
      setFullHtml(currentFullHtml);

      // 如果是富文本模式且使用选区，保存当前选区（用于手动确认模式）
      if (useSelection && isRichTextSelection && !currentMode) {
        await new Promise<void>((resolve) => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
              chrome.tabs.sendMessage(tabs[0].id, { type: 'WX_SAVE_SELECTION' }, (res) => {
                console.log('[Save Selection]', res);
                resolve();
              });
            } else {
              resolve();
            }
          });
        });
      }

      // 构建AI上下文
      const { content, contextPrompt } = buildAIContext(
        currentFullHtml,
        selection,
        selectionHtml,
        isRichTextSelection,
        selectionContext,
        includeParentStyle,
        targetLevel,
        ancestorOuterHTMLs
      );

      // 验证选区（富文本模式）
      if (useSelection && isRichTextSelection && !currentMode) {
        const validation = await new Promise<{ valid: boolean; reason?: string }>((resolve) => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
              chrome.tabs.sendMessage(tabs[0].id, { type: 'WX_VALIDATE_SELECTION' }, (res) => {
                resolve(res || { valid: true });
              });
            } else {
              resolve({ valid: true });
            }
          });
        });

        if (!validation.valid) {
          console.warn('[Selection Validation]', validation.reason);
          // 只警告，不阻止
        }
      }

      // 获取自定义系统提示词
      const config = await getApiConfig();
      const systemPrompt = config.customPrompt
        ? `${config.basePrompt || '你是微信公众号排版专家。'}\n\n${config.customPrompt}`
        : undefined;

      // 所有模式都使用流式传输以显示进度
      await callAIStream(contextPrompt, content, (chunk) => {
        accumulatedRef.current += chunk;
        // 实时清洗：移除明显的解释文字
        const partialCleaned = partialCleanAIResponse(accumulatedRef.current);
        setResult(partialCleaned);
      }, systemPrompt, abortControllerRef.current?.signal);

      // 流式完成后，完整清洗并应用结果
      const cleanedOutput = cleanAIResponse(accumulatedRef.current);
      setResult(cleanedOutput);

      if (seamless) {
        const output = cleanedOutput;
        // 应用结果
        if (useSelection) {
          if (isRichTextSelection && !currentMode) {
            // 富文本模式：替换选区或目标元素
            applyHtml(output, true, targetLevel, ancestorPaths);
          } else {
            // 源码模式：标记替换
            applyHtml(output, true, targetLevel, ancestorPaths);
          }
        } else {
          // 全局替换
          applyHtml(output, false, targetLevel, ancestorPaths);
        }
      }
    } catch (e: any) {
      if (e.message === '用户已取消') {
        // User cancelled, don't show error
        console.log('[AI] Request cancelled by user');
      } else {
        setError(e.message || '调用失败');
      }
    } finally {
      setLoading(false);
      setStreaming(false);
      abortControllerRef.current = null;
    }
  }

  function handleStop() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
    setStreaming(false);
  }

  // 获取选区显示的简短文本
  const getSelectionDisplay = () => {
    if (!selection && !selectionHtml) return null;
    const text = selection || selectionHtml.replace(/<[^>]+>/g, '');
    return text.length > 50 ? text.slice(0, 50) + '...' : text;
  };

  // 获取祖先链显示
  const getAncestorDisplay = () => {
    if (!ancestorChain || ancestorChain.length === 0) return '';
    return ancestorChain.slice(0, 3).join(' > ');
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">AI 排版助手</span>
        <button className="btn-settings" onClick={() => setShowSettings(v => !v)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '4px'}}>
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          {showSettings ? '收起设置' : '设置'}
        </button>
      </div>

      {showSettings && (
        <SettingsPanel
          onClose={() => {
            setShowSettings(false);
            // 立即重读设置，确保UI同步
            chrome.storage.sync.get(['streamRenderHtml'], (r) => {
              setStreamRenderHtml(r.streamRenderHtml || false);
            });
          }}
        />
      )}

      <div className="card-section">
        <div className="mode-indicator" style={{ marginBottom: '8px' }}>
          {isHtmlMode ? (
            <span className="mode-tag html-mode">HTML 源码模式</span>
          ) : (
            <span className="mode-tag rich-mode">富文本模式</span>
          )}
        </div>

        <div className="mode-switch">
          <span>模式切换</span>
          <button className={`btn-mode ${seamless ? 'active' : ''}`} onClick={() => setSeamless(true)}>无缝应用</button>
          <button className={`btn-mode ${!seamless ? 'active' : ''}`} onClick={() => setSeamless(false)}>手动确认</button>
        </div>
      </div>

      {/* 选区显示 */}
      {(selection || selectionHtml) && (
        <div className={`selection-hint ${useSelection ? 'active' : ''}`}>
          <div className="selection-header">
            <span className="selection-label">
              {isRichTextSelection ? '已选富文本片段' : '已选源码片段'}
            </span>
            <button
              className={`btn-toggle ${useSelection ? 'active' : ''}`}
              onClick={() => setUseSelection(v => !v)}
            >
              {useSelection ? '局部替换 ON' : '局部替换 OFF'}
            </button>
          </div>

          <div className="selection-content">
            <div className="selection-text" style={{ fontWeight: 500 }}>
              {getSelectionDisplay()}
            </div>

            {ancestorChain.length > 0 && (
              <div className="selection-ancestors">
                <span style={{ marginRight: '4px' }}>位置：</span>
                {ancestorChain.slice(0, 5).map((item, idx) => (
                  <span key={idx} style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <button
                      className={`ancestor-tag ${targetLevel === idx ? 'active' : ''}`}
                      onClick={() => setTargetLevel(idx)}
                      title={`点击选择「${item}」作为修改目标`}
                    >
                      {item}
                    </button>
                    {idx < ancestorChain.length - 1 && idx < 4 && (
                      <span style={{ margin: '0 2px', color: '#999' }}>&gt;</span>
                    )}
                  </span>
                ))}
              </div>
            )}

            {targetLevel >= 0 && ancestorChain[targetLevel] && (
              <div className="target-hint">
                <span>目标：{ancestorChain[targetLevel]}</span>
                <button
                  className="target-reset-btn"
                  onClick={() => setTargetLevel(-1)}
                >
                  重置为选中内容
                </button>
              </div>
            )}

            {isRichTextSelection && (
              <label className="selection-option" style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', marginBottom: '8px' }}>
                <input
                  type="checkbox"
                  checked={includeParentStyle}
                  onChange={e => setIncludeParentStyle(e.target.checked)}
                />
                包含父元素样式 (推荐)
              </label>
            )}

            <button
              className="btn-preview-toggle"
              onClick={() => setShowHtmlPreview(v => !v)}
            >
              {showHtmlPreview ? '隐藏 HTML 源码' : '预览 HTML 源码'}
            </button>

            {showHtmlPreview && selectionHtml && (
              <div className="html-preview">
                <pre
                  className="html-code"
                  dangerouslySetInnerHTML={{ __html: highlightHtmlSimple(selectionHtml) }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 源码模式完整HTML预览 */}
      {isHtmlMode && fullHtml && (
        <div className="full-html-preview-section">
          <button
            className="btn-preview-toggle full-preview-btn"
            onClick={() => setShowFullHtmlPreview(v => !v)}
          >
            {showFullHtmlPreview ? '▲ 隐藏完整代码' : '▼ 查看当前完整代码 (语法高亮)'}
          </button>

          {showFullHtmlPreview && (
            <div className="html-preview full-preview">
              <pre
                className="html-code"
                dangerouslySetInnerHTML={{ __html: highlightHtmlSimple(fullHtml) }}
              />
            </div>
          )}
        </div>
      )}

      {/* 提示没有选区 */}
      {!selection && !selectionHtml && !isHtmlMode && (
        <div className="selection-hint empty">
          <p>💡 在编辑器中选中文字，可开启局部精准排版</p>
        </div>
      )}

      <div className="card-section" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div className="presets">
          {presets.map(p => (
            <button key={p.id} className="btn-preset" onClick={() => setPrompt(p.prompt)}>{p.label}</button>
          ))}
        </div>

        <textarea className="prompt-input" placeholder="输入您的排版要求..." value={prompt}
          onChange={e => setPrompt(e.target.value)} rows={4} />

        {loading || streaming ? (
          <button className="btn-stop" onClick={handleStop}>
            ⏹ 停止生成
          </button>
        ) : (
          <button className="btn-send" onClick={handleSend} disabled={!prompt.trim()}>
            开始 AI 排版
          </button>
        )}
      </div>

      {error && <div className="error" style={{ background: '#fff1f0', border: '1px solid #ffccc7', padding: '8px', borderRadius: '4px', marginTop: '8px' }}>{error}</div>}

      {result && (
        <div className="result-area">
          {streaming ? (
            streamRenderHtml ? (
              <div key="render" className="result-preview streaming-render" dangerouslySetInnerHTML={{ __html: result }} />
            ) : (
              <div key="code" className="result-code">
                <div className="code-header">生成中...</div>
                <pre className="code-content">{result}</pre>
              </div>
            )
          ) : (
            <div key="final" className="result-preview" dangerouslySetInnerHTML={{ __html: result }} />
          )}
          {!seamless && !streaming && (
            <button className="btn-apply" onClick={() => applyHtml(result, useSelection, targetLevel, ancestorPaths)}>确认并应用到编辑器</button>
          )}
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<SidePanel />);
