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
          { header: "X-Frame-Options", operation: "remove" }
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

// 2. Open or focus launcher.html when clicking the extension icon
chrome.action.onClicked.addListener(async () => {
  const launcherUrl = chrome.runtime.getURL("launcher.html");

  // Query all open tabs to check if launcher is already open
  chrome.tabs.query({}, (tabs) => {
    const existingTab = tabs.find(tab => tab.url === launcherUrl);

    if (existingTab) {
      // Focus existing tab
      chrome.tabs.update(existingTab.id, { active: true });
      if (existingTab.windowId) {
        chrome.windows.update(existingTab.windowId, { focused: true });
      }
    } else {
      // Create a new tab with the launcher page
      chrome.tabs.create({ url: "launcher.html" });
    }
  });
});
