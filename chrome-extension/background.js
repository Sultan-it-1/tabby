// Fast Toolkit Chrome Extension Background Service Worker

// 1. Configure declarativeNetRequest rules on install to strip framing headers
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
        urlFilter: "*://*.sultanops.com/*",
        resourceTypes: ["sub_frame"]
      }
    }
  ];

  // Update dynamic rules safely
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: targetRules
  }, () => {
    if (chrome.runtime.lastError) {
      console.error("Error setting rules:", chrome.runtime.lastError);
    } else {
      console.log("Fast Toolkit DNR rules successfully applied to strip security headers.");
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
      console.log("Fast Toolkit: Detected Ticket URL change ->", changeInfo.url);
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


