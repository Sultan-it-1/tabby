// Fast Toolkit Chrome Extension Content Script
// Runs inside the iframe of sultanops.com to optimize layout for PiP mode

(function () {
  // Check if this document is loaded inside an iframe
  if (window.self !== window.top) {
    // 1. We are framed! Let's inject layout adjustments to make it look like a seamless standalone app
    const style = document.createElement("style");
    style.id = "pip-optimizer";
    style.textContent = `
      /* Force body to fit the SidePanel viewport seamlessly with no gaps */
      html, body {
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      /* Force main container to occupy 100% of the SidePanel window with zero borders/margins */
      .container, .app-container {
        width: 100% !important;
        height: 100% !important;
        min-width: 100% !important;
        min-height: 100% !important;
        max-width: 100% !important;
        max-height: 100% !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        margin: 0 !important;
        padding: 16px !important;
        box-sizing: border-box !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
      }

      /* Seamless background sync to eliminate any dark border gaps */
      body {
        background: inherit !important;
      }

      /* Adjust internal scroll grids and area heights to fit SidePanel viewport */
      .menu-grid {
        flex-grow: 1 !important;
        height: auto !important;
        max-height: calc(100vh - 80px) !important;
        overflow-y: auto !important;
        padding: 4px 2px !important;
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

      /* Ensure modals inside SidePanel are centered and highly readable */
      .settings-modal, .usage-modal {
        top: 10px !important;
        left: 10px !important;
        right: 10px !important;
        bottom: 10px !important;
        max-height: calc(100vh - 20px) !important;
      }

    `;

    // Append styles
    if (document.head) {
      document.head.appendChild(style);
    } else {
      document.documentElement.appendChild(style);
    }

    // Inject Smart Ticket Timer Widget into page header
    function injectSmartTimerWidget() {
      if (document.getElementById("ext-smart-timer")) return;

      const headerRight = document.querySelector(".header-right") || 
                          document.querySelector(".header-actions") || 
                          document.querySelector(".header-row") ||
                          document.querySelector(".header");

      if (!headerRight) return;

      const timerWrapper = document.createElement("div");
      timerWrapper.id = "ext-smart-timer";
      timerWrapper.style.cssText = "display:inline-flex;align-items:center;gap:4px;cursor:pointer;margin-right:6px;user-select:none;vertical-align:middle;";
      timerWrapper.title = "اضغط لتصفير العداد | يتصفير تلقائياً عند النسخ أو تغير رابط التكت";

      const eyeOpenSVG = `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
      const eyeClosedSVG = `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

      const eyeBtn = document.createElement("button");
      eyeBtn.style.cssText = "background:none;border:none;color:inherit;cursor:pointer;padding:2px;display:inline-flex;align-items:center;opacity:0.75;transition:all 0.2s;outline:none;";
      eyeBtn.title = "إخفاء / إظهار العداد";
      eyeBtn.innerHTML = eyeOpenSVG;

      const timerBadge = document.createElement("span");
      timerBadge.id = "ext-smart-timer-text";
      timerBadge.title = "اضغط لتصفير العداد";
      timerBadge.style.cssText = "font-family:'Outfit','Segoe UI',monospace;font-weight:700;font-size:12px;color:#00e676;padding:2px 8px;border-radius:6px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);transition:all 0.3s ease;cursor:pointer;";
      timerBadge.innerText = "00:00";

      let isTimerVisible = localStorage.getItem("fastToolkit_timer_visible") !== "false";

      function updateEyeVisibility() {
        if (isTimerVisible) {
          timerBadge.style.display = "inline-block";
          eyeBtn.innerHTML = eyeOpenSVG;
          timerWrapper.style.opacity = "1";
          timerWrapper.style.pointerEvents = "auto";
        } else {
          timerBadge.style.display = "none";
          eyeBtn.innerHTML = eyeClosedSVG;
          timerWrapper.style.opacity = "0"; // completamente مخفي!
        }
      }
      updateEyeVisibility();

      // Show subtle eye icon on header hover if hidden so user can easily restore it
      headerRight.addEventListener("mouseenter", () => {
        if (!isTimerVisible) {
          timerWrapper.style.opacity = "0.7";
        }
      });
      headerRight.addEventListener("mouseleave", () => {
        if (!isTimerVisible) {
          timerWrapper.style.opacity = "0";
        }
      });

      eyeBtn.onclick = (e) => {
        e.stopPropagation();
        isTimerVisible = !isTimerVisible;
        localStorage.setItem("fastToolkit_timer_visible", isTimerVisible);
        updateEyeVisibility();
      };

      timerBadge.onclick = (e) => {
        e.stopPropagation();
        resetTimer("manual");
      };

      timerWrapper.appendChild(eyeBtn);
      timerWrapper.appendChild(timerBadge);

      headerRight.insertBefore(timerWrapper, headerRight.firstChild);


      let seconds = 0;
      let lastTicketTime = "00:00";
      let totalTickets = 0;
      let idleSeconds = 0;

      function updateDisplay() {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        timerBadge.innerText = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      }

      function resetTimer(reason) {
        if (seconds > 1) {
          const m = Math.floor(seconds / 60);
          const s = seconds % 60;
          lastTicketTime = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
          totalTickets++;
          timerBadge.title = `اضغط للتصفير | التكت السابق: ${lastTicketTime} | إجمالي التكتات: ${totalTickets}`;
        }
        seconds = 0;
        idleSeconds = 0;
        updateDisplay();

        timerBadge.style.transform = "scale(1.2)";
        setTimeout(() => { timerBadge.style.transform = "scale(1)"; }, 200);
      }


      setInterval(() => {
        idleSeconds++;
        if (idleSeconds < 180) {
          seconds++;
          updateDisplay();
        }
      }, 1000);

      window.addEventListener("mousemove", () => { idleSeconds = 0; });
      window.addEventListener("keydown", () => { idleSeconds = 0; });
      window.addEventListener("copy", () => resetTimer("copy"));

      // Listen for message from background script when CRM Ticket URL changes
      window.addEventListener("message", (e) => {
        if (e.data && (e.data.action === "resetTicketTimer" || e.data.action === "ticketUrlChanged")) {
          resetTimer("url_changed");
        }
      });

      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((msg) => {
          if (msg && msg.action === "resetTicketTimer") {
            resetTimer("url_changed");
          }
        });
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", injectSmartTimerWidget);
    } else {
      injectSmartTimerWidget();
    }


    // 2. Intercept and bypass Document PiP download restriction
    // ONLY activate inside a real Document PiP window (not regular iframes)
    // We detect a PiP window by checking if the parent window has documentPictureInPicture
    // and this window is its pipWindow.
    const isInsidePiP = (() => {
      try {
        // In a Document PiP window, window.opener exists and points to the opener tab
        // Also, documentPictureInPicture API will NOT exist inside the PiP window itself
        // But the opener tab's documentPictureInPicture.window === this window
        return window.opener !== null && typeof window.opener !== "undefined";
      } catch (e) {
        return false;
      }
    })();

    if (isInsidePiP) {
      // Inject a script into the page context to monkey-patch HTMLAnchorElement.prototype.click
      const patchScript = document.createElement("script");
      patchScript.id = "download-bypass";
      patchScript.textContent = `
        (function() {
          const originalClick = HTMLAnchorElement.prototype.click;
          HTMLAnchorElement.prototype.click = function() {
            if (this.download) {
              // Intercept download anchors (like the export backup button)
              const event = new CustomEvent("intercept-download", {
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

          // Also intercept programmatic anchor clicks via addEventListener (for cases using click event)
          document.addEventListener("click", function(e) {
            const anchor = e.target.closest("a[download]");
            if (anchor) {
              e.preventDefault();
              const event = new CustomEvent("intercept-download", {
                detail: {
                  url: anchor.href,
                  filename: anchor.download
                }
              });
              window.dispatchEvent(event);
            }
          }, true);
        })();
      `;
      
      if (document.head) {
        document.head.appendChild(patchScript);
      } else {
        document.documentElement.appendChild(patchScript);
      }

      // Listen to intercepted download event from the page context
      window.addEventListener("intercept-download", async (e) => {
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

      // Use MutationObserver to detect theme/class/style changes efficiently
      // This replaces multiple setTimeouts and click listeners — fires only when needed
      function startThemeObserver() {
        const target = document.body || document.documentElement;
        const observer = new MutationObserver(() => {
          sendThemeToOuterWindow();
        });
        observer.observe(target, {
          attributes: true,
          attributeFilter: ["class", "style", "data-theme"],
          subtree: false
        });
      }

      // Run theme sync on init
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          sendThemeToOuterWindow();
          startThemeObserver();
        });
      } else {
        sendThemeToOuterWindow();
        startThemeObserver();
      }

      // Also sync after full page load (dynamic CSS or settings.js may apply late)
      window.addEventListener("load", () => {
        sendThemeToOuterWindow();
      });
    }
  }
})();
