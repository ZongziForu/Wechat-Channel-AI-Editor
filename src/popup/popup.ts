// popup.ts - 图形化设置页逻辑：读取/保存API配置到chrome.storage

const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
const baseUrlInput = document.getElementById('baseUrl') as HTMLInputElement;
const modelSelect = document.getElementById('model') as HTMLSelectElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLDivElement;

// 页面加载时读取已保存的配置
chrome.storage.sync.get(['apiKey', 'baseUrl', 'model'], (result) => {
  if (result.apiKey) apiKeyInput.value = result.apiKey;
  baseUrlInput.value = result.baseUrl || 'https://api.anthropic.com';
  if (result.model) modelSelect.value = result.model;
});

// 保存配置
saveBtn.addEventListener('click', () => {
  const config = {
    apiKey: apiKeyInput.value.trim(),
    baseUrl: baseUrlInput.value.trim() || 'https://api.anthropic.com',
    model: modelSelect.value,
  };
  chrome.storage.sync.set(config, () => {
    status.textContent = '已保存！';
    setTimeout(() => { status.textContent = ''; }, 2000);
  });
});
