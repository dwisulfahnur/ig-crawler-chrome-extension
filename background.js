// Service worker — routes messages between content script and popup.
// The popup may be closed while crawling, so we persist progress to storage
// and the popup reads it when reopened.

chrome.runtime.onMessage.addListener((msg, sender) => {
  // Forward progress/done/error messages from content → popup (if open)
  if (["CRAWL_PROGRESS", "CRAWL_DONE", "CRAWL_ERROR"].includes(msg.type)) {
    chrome.runtime.sendMessage(msg).catch(() => {
      // Popup is closed — that's fine, data is already in storage
    });
  }
});
