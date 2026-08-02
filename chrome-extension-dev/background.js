// Fast Toolkit Chrome Extension [DEV MODE] Background Service Worker

// 1. Configure declarativeNetRequest rules on install to strip framing headers for local server & production
chrome.runtime.onInstalled.addListener(() => {
  const targetRules = [
    {
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        responseHeaders: [
          { header: "X-Frame-Options", operation: "remove" },
          { header: "Frame-Options", operation: "remove" }
        ]
      },
      condition: {
        urlFilter: "*://127.0.0.1/*",
        resourceTypes: ["sub_frame"]
      }
    },
    {
      id: 2,
      priority: 1,
      action: {
        type: "modifyHeaders",
        responseHeaders: [
          { header: "X-Frame-Options", operation: "remove" },
          { header: "Frame-Options", operation: "remove" }
        ]
      },
      condition: {
        urlFilter: "*://localhost/*",
        resourceTypes: ["sub_frame"]
      }
    }
  ];

  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1, 2],
    addRules: targetRules
  }, () => {
    if (chrome.runtime.lastError) {
      console.error("DEV Mode DNR rules error:", chrome.runtime.lastError);
    } else {
      console.log("Fast Toolkit DEV DNR rules successfully applied to 127.0.0.1 and localhost.");
    }
  });
});

// 2. Open side panel when clicking the extension icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Error setting side panel behavior:", error));

// 3. Monitor Active Tab URL Changes for CRM Tickets (e.g., crm.tabby.sa/ticket/...)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    const isTicketUrl = changeInfo.url.includes('/ticket') || 
                        changeInfo.url.includes('tabby.sa') ||
                        changeInfo.url.includes('/tickets/');
    if (isTicketUrl) {
      console.log("Fast Toolkit DEV: Detected Ticket URL change ->", changeInfo.url);
      chrome.runtime.sendMessage({
        action: "resetTicketTimer",
        reason: "url_changed",
        newUrl: changeInfo.url
      }).catch(() => {
        // Ignore if sidepanel is not listening
      });
    }
  }
});
