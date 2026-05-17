// 点击扩展图标时打开侧边栏
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// 转发 content script 的消息到侧边栏
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'WX_HTML_MODE_CHANGE' || msg.type === 'WX_SELECTION_CHANGE') {
    chrome.runtime.sendMessage(msg).catch(() => {});
  }
});
