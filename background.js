// Relay CRAWL_PROGRESS from content script to popup (best-effort; popup may be closed).
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'CRAWL_PROGRESS') {
    chrome.runtime.sendMessage(msg).catch(() => {});
  }
});
