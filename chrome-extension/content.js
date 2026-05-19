// Tabby Chrome Extension Content Script
// Runs inside the iframe of sultanops.com to optimize layout for PiP mode

(function () {
  // Check if this document is loaded inside an iframe
  if (window.self !== window.top) {
    // 1. We are framed! Let's inject layout adjustments to make it look like a seamless standalone app
    const style = document.createElement("style");
    style.id = "tabby-pip-optimizer";
    style.textContent = `
      /* Force body to fit the PiP viewport exactly */
      html, body {
        width: 100vw !important;
        height: 100vh !important;
        overflow: hidden !important;
        background: #0f0f0f !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      /* Force main container to occupy 100% of the PiP window with no borders/margins */
      .container, .app-container {
        width: 100vw !important;
        height: 100vh !important;
        max-width: 100vw !important;
        max-height: 100vh !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        margin: 0 !important;
        padding: 10px !important;
        box-sizing: border-box !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
      }

      /* Adjust internal scroll grids and area heights to fit the 480px height perfectly */
      .menu-grid {
        flex-grow: 1 !important;
        height: auto !important;
        max-height: calc(100vh - 75px) !important;
        overflow-y: auto !important;
      }

      /* Adjust sub-tool layouts (like note.html, card.html, simah.html, sticky.html) */
      .grid-container {
        max-height: calc(100vh - 120px) !important;
        overflow-y: auto !important;
      }
      
      textarea, .note-area {
        height: calc(100vh - 140px) !important;
        max-height: calc(100vh - 140px) !important;
      }

      /* Ensure modals inside PiP are centered and highly readable */
      .settings-modal, .usage-modal {
        top: 20px !important;
        left: 10px !important;
        right: 10px !important;
        bottom: 20px !important;
        max-height: calc(100vh - 40px) !important;
      }
    `;

    // Append styles
    if (document.head) {
      document.head.appendChild(style);
    } else {
      document.documentElement.appendChild(style);
    }

    // 2. Intercept and bypass Document PiP download restriction
    // Inject a script into the page context to monkey-patch HTMLAnchorElement.prototype.click
    const patchScript = document.createElement("script");
    patchScript.id = "tabby-download-bypass";
    patchScript.textContent = `
      (function() {
        const originalClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function() {
          if (this.download) {
            // Intercept download anchors (like the export backup button)
            const event = new CustomEvent("tabby-intercept-download", {
              detail: {
                url: this.href,
                filename: this.download
              }
            });
            window.dispatchEvent(event);
            return; // Intercepted, cancel native click to avoid silent PiP block
          }
          return originalClick.apply(this, arguments);
        };
      })();
    `;
    
    if (document.head) {
      document.head.appendChild(patchScript);
    } else {
      document.documentElement.appendChild(patchScript);
    }

    // Listen to intercepted download event from the page context
    window.addEventListener("tabby-intercept-download", async (e) => {
      const { url, filename } = e.detail;
      try {
        // Retrieve download content from Blob URL
        const response = await fetch(url);
        const contentText = await response.text();

        // Delegate the download to the extension launcher tab
        chrome.runtime.sendMessage({
          action: "performDownload",
          filename: filename,
          content: contentText
        });
      } catch (err) {
        console.error("Fast Toolkit: Failed to process intercepted download:", err);
      }
    });

    // 3. Dynamic Theme Synchronization with Outer Title Bar
    function sendThemeToOuterWindow() {
      const container = document.querySelector(".container, .app-container");
      if (container) {
        const computedStyle = window.getComputedStyle(container);
        const bgColor = computedStyle.backgroundColor;
        const borderColor = computedStyle.borderColor || computedStyle.borderBottomColor;
        const textColor = computedStyle.color;

        chrome.runtime.sendMessage({
          action: "syncTheme",
          bgColor: bgColor,
          borderColor: borderColor,
          textColor: textColor
        });
      }
    }

    // Run theme sync on initialization and at short delays to ensure DOM loads
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        sendThemeToOuterWindow();
        setTimeout(sendThemeToOuterWindow, 300);
      });
    } else {
      sendThemeToOuterWindow();
      setTimeout(sendThemeToOuterWindow, 300);
    }

    // Run theme sync once the full window (with settings.js and dynamic styles) has finished loading
    window.addEventListener("load", () => {
      sendThemeToOuterWindow();
      setTimeout(sendThemeToOuterWindow, 300);
      setTimeout(sendThemeToOuterWindow, 600);
    });

    // Run theme sync on clicks or interactions to capture light/dark theme switches immediately
    window.addEventListener("click", () => {
      setTimeout(sendThemeToOuterWindow, 100);
    });
    window.addEventListener("touchend", () => {
      setTimeout(sendThemeToOuterWindow, 100);
    });
  }
})();
