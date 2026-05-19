// Tabby PiP Launcher JavaScript Controller

// Global trackers accessible by all event listeners
let activePipWindow = null;
let activeHeaderBar = null;
let activeDivider = null;
let activePipBody = null;

document.addEventListener("DOMContentLoaded", () => {
  const btnLaunch = document.getElementById("btn-launch");
  const winWidthInput = document.getElementById("win-width");
  const winHeightInput = document.getElementById("win-height");
  const statusBox = document.getElementById("status-box");
  const supportError = document.getElementById("support-error");

  // 1. Check browser compatibility for Document Picture-in-Picture API
  if (!("documentPictureInPicture" in window)) {
    supportError.style.display = "block";
    btnLaunch.disabled = true;
    btnLaunch.style.opacity = "0.5";
    btnLaunch.style.cursor = "not-allowed";
    return;
  }

  // 2. Handle click to launch floating window
  btnLaunch.addEventListener("click", async () => {
    // If a window is already active, focus it
    if (activePipWindow) {
      activePipWindow.focus();
      return;
    }

    const width = parseInt(winWidthInput.value) || 320;
    const height = parseInt(winHeightInput.value) || 480;

    try {
      // Disable launcher button during activation
      btnLaunch.disabled = true;
      btnLaunch.innerText = "جاري فتح النافذة...";

      // Request Picture-in-Picture Window
      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: width,
        height: height,
      });

      activePipWindow = pipWindow;

      let isCollapsed = false;

      // Configure PiP Window Head Metadata
      pipWindow.document.title = "Tabby Always-on-Top";

      // Configure PiP Window Body Styling (Flex Column)
      const body = pipWindow.document.body;
      body.style.margin = "0";
      body.style.padding = "0";
      body.style.overflow = "hidden";
      body.style.backgroundColor = "#0f0f0f";
      body.style.width = "100vw";
      body.style.height = "100vh";
      body.style.display = "flex";
      body.style.flexDirection = "column";
      body.style.alignItems = "stretch";
      body.style.justifyContent = "stretch";

      activePipBody = body;

      // 1. Create a Premium Title/Header Bar matching the Website's Design
      const headerBar = pipWindow.document.createElement("div");
      headerBar.style.height = "32px";
      headerBar.style.minHeight = "32px";
      headerBar.style.background = "#0f0f0f"; // Match website body background exactly
      headerBar.style.display = "flex";
      headerBar.style.alignItems = "center";
      headerBar.style.justifyContent = "space-between";
      headerBar.style.padding = "0 12px";
      headerBar.style.color = "#eee";
      headerBar.style.fontFamily = "'Segoe UI', Tahoma, Geneva, sans-serif";
      headerBar.style.userSelect = "none";
      headerBar.style.boxSizing = "border-box";
      headerBar.style.width = "100%";
      headerBar.dir = "rtl";

      // 1.1 Create solid bottom divider matching the site's header border
      const divider = pipWindow.document.createElement("div");
      divider.style.height = "1px";
      divider.style.minHeight = "1px";
      divider.style.width = "100%";
      divider.style.background = "#2a2a2a"; // Match site's .header-row border
      divider.style.opacity = "1";

      activeHeaderBar = headerBar;
      activeDivider = divider;

      // 1.2 Title wrapper (combining pulsing green dot + clean text)
      const titleWrapper = pipWindow.document.createElement("div");
      titleWrapper.style.display = "flex";
      titleWrapper.style.alignItems = "center";
      titleWrapper.style.gap = "8px";

      // Live green pulsing status dot
      const pulseDot = pipWindow.document.createElement("span");
      pulseDot.style.width = "6px";
      pulseDot.style.height = "6px";
      pulseDot.style.borderRadius = "50%";
      pulseDot.style.backgroundColor = "#00e676";
      pulseDot.style.boxShadow = "0 0 8px #00e676";
      pulseDot.style.display = "inline-block";
      pulseDot.style.transition = "all 0.3s ease";

      // Inject custom keyframes for pulse animation if not already present in PiP document
      const pulseStyle = pipWindow.document.createElement("style");
      pulseStyle.textContent = `
        @keyframes pipPulse {
          0% { opacity: 0.5; transform: scale(0.95); }
          50% { opacity: 1; transform: scale(1.1); box-shadow: 0 0 10px currentColor; }
          100% { opacity: 0.5; transform: scale(0.95); }
        }
      `;
      pipWindow.document.head.appendChild(pulseStyle);
      pulseDot.style.animation = "pipPulse 2.2s infinite ease-in-out";

      const titleSpan = pipWindow.document.createElement("span");
      titleSpan.innerText = "Fast Toolkit";
      titleSpan.style.fontFamily = "'Outfit', 'Segoe UI', sans-serif";
      titleSpan.style.fontWeight = "700";
      titleSpan.style.fontSize = "11px";
      titleSpan.style.letterSpacing = "0.5px";
      titleSpan.style.color = "#ffffff";
      titleSpan.style.transition = "all 0.3s ease";

      titleWrapper.appendChild(pulseDot);
      titleWrapper.appendChild(titleSpan);

      // 1.3 Custom virtual minimize/expand button (Futuristic Pill Shape)
      const minBtn = pipWindow.document.createElement("button");
      minBtn.innerHTML = `
        <span style="font-size: 7px; margin-top: 1px;">➖</span>
        <span style="font-size: 10px; font-weight: 700; font-family: 'Cairo', 'Segoe UI', sans-serif; letter-spacing: -0.2px;">تصغير</span>
      `;
      minBtn.style.display = "flex";
      minBtn.style.alignItems = "center";
      minBtn.style.justifyContent = "center";
      minBtn.style.gap = "6px";
      minBtn.style.background = "rgba(255, 255, 255, 0.04)";
      minBtn.style.border = "1px solid rgba(255, 255, 255, 0.08)";
      minBtn.style.color = "#ccc";
      minBtn.style.borderRadius = "20px";
      minBtn.style.padding = "3px 12px";
      minBtn.style.cursor = "pointer";
      minBtn.style.outline = "none";
      minBtn.style.boxSizing = "border-box";
      minBtn.style.transition = "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)";
      minBtn.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.03)";

      minBtn.onmouseover = () => {
        if (!isCollapsed) {
          minBtn.style.background = "rgba(0, 230, 118, 0.08)";
          minBtn.style.border = "1px solid rgba(0, 230, 118, 0.25)";
          minBtn.style.color = "#00e676";
          minBtn.style.boxShadow = "0 0 10px rgba(0, 230, 118, 0.12)";
        } else {
          minBtn.style.background = "rgba(0, 176, 255, 0.12)";
          minBtn.style.border = "1px solid rgba(0, 176, 255, 0.4)";
          minBtn.style.color = "#00b0ff";
          minBtn.style.boxShadow = "0 0 10px rgba(0, 176, 255, 0.18)";
        }
        minBtn.style.transform = "translateY(-0.5px)";
      };
      
      minBtn.onmouseout = () => {
        if (!isCollapsed) {
          minBtn.style.background = "rgba(255, 255, 255, 0.04)";
          minBtn.style.border = "1px solid rgba(255, 255, 255, 0.08)";
          minBtn.style.color = "#ccc";
        } else {
          minBtn.style.background = "rgba(0, 176, 255, 0.06)";
          minBtn.style.border = "1px solid rgba(0, 176, 255, 0.25)";
          minBtn.style.color = "#00b0ff";
        }
        minBtn.style.boxShadow = "none";
        minBtn.style.transform = "none";
      };

      headerBar.appendChild(titleWrapper);
      headerBar.appendChild(minBtn);
      body.appendChild(headerBar);
      body.appendChild(divider);

      // Create and Configure the Iframe pointing to tabby.sultanops.com
      const iframe = pipWindow.document.createElement("iframe");
      iframe.src = "https://tabby.sultanops.com";
      iframe.style.width = "100%";
      iframe.style.height = "calc(100% - 33px)";
      iframe.style.border = "none";
      iframe.style.margin = "0";
      iframe.style.padding = "0";
      iframe.style.display = "block";
      iframe.setAttribute("allow", "clipboard-read; clipboard-write; camera; microphone; geolocation");

      // Append iframe to PiP Window Body
      body.appendChild(iframe);

      // Add a resize lock to prevent manual resizing and maintain exactly 320x480 (ignored when collapsed)
      let resizeTimeout = null;
      pipWindow.addEventListener("resize", () => {
        if (isCollapsed) return; // Do not resize-lock if collapsed
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          if (pipWindow.innerWidth !== 320 || pipWindow.innerHeight !== 480) {
            try {
              pipWindow.resizeTo(320, 480);
            } catch (e) {
              console.warn("Resize lock failed:", e);
            }
          }
        }, 150);
      });

      // Handle custom minimize/expand toggle click
      minBtn.addEventListener("click", () => {
        if (!isCollapsed) {
          isCollapsed = true;
          iframe.style.display = "none";
          divider.style.background = "#2a2a2a"; // Match site border color on collapse too
          
          minBtn.innerHTML = `
            <span style="font-size: 7px; margin-top: 1px;">➕</span>
            <span style="font-size: 10px; font-weight: 700; font-family: 'Cairo', 'Segoe UI', sans-serif; letter-spacing: -0.2px;">توسيع</span>
          `;
          minBtn.style.color = "#00b0ff";
          minBtn.style.borderColor = "rgba(0, 176, 255, 0.25)";
          minBtn.style.background = "rgba(0, 176, 255, 0.06)";

          pulseDot.style.backgroundColor = "#00b0ff";
          pulseDot.style.color = "#00b0ff";
          pulseDot.style.boxShadow = "0 0 8px #00b0ff";
          titleSpan.innerText = "الأدوات (مُصغّرة)";
          titleSpan.style.color = "#00b0ff";

          try {
            // Shrink window to a compact header-only size
            pipWindow.resizeTo(320, 78);
          } catch (e) {
            console.warn("Collapse failed:", e);
          }
        } else {
          isCollapsed = false;
          iframe.style.display = "block";
          divider.style.background = "#2a2a2a"; // Keep exact site border color

          minBtn.innerHTML = `
            <span style="font-size: 7px; margin-top: 1px;">➖</span>
            <span style="font-size: 10px; font-weight: 700; font-family: 'Cairo', 'Segoe UI', sans-serif; letter-spacing: -0.2px;">تصغير</span>
          `;
          minBtn.style.color = "#ccc";
          minBtn.style.borderColor = "rgba(255, 255, 255, 0.08)";
          minBtn.style.background = "rgba(255, 255, 255, 0.04)";

          pulseDot.style.backgroundColor = "#00e676";
          pulseDot.style.color = "#00e676";
          pulseDot.style.boxShadow = "0 0 8px #00e676";
          titleSpan.innerText = "Fast Toolkit";
          titleSpan.style.color = "#ffffff";

          try {
            // Expand window back to optimal size
            pipWindow.resizeTo(320, 480);
          } catch (e) {
            console.warn("Expand failed:", e);
          }
        }
      });

      // Update Launcher Page UI state
      statusBox.style.display = "block";
      btnLaunch.disabled = false;
      btnLaunch.style.background = "rgba(255, 255, 255, 0.05)";
      btnLaunch.style.border = "1px solid rgba(255, 255, 255, 0.1)";
      btnLaunch.style.color = "#fff";
      btnLaunch.style.boxShadow = "none";
      btnLaunch.innerHTML = `
        <span>التركيز على النافذة العائمة</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      `;

      // 3. Listen for window closure
      pipWindow.addEventListener("pagehide", () => {
        activePipWindow = null;
        activeHeaderBar = null;
        activeDivider = null;
        activePipBody = null;
        
        // Restore Launcher Page UI to original state
        statusBox.style.display = "none";
        btnLaunch.style.background = "var(--accent-gradient)";
        btnLaunch.style.border = "none";
        btnLaunch.style.color = "#0b0c10";
        btnLaunch.style.boxShadow = "0 8px 24px var(--glow)";
        btnLaunch.innerHTML = `
          <span>تشغيل النافذة العائمة (PiP)</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <rect x="12" y="12" width="9" height="9" rx="1" ry="1"/>
          </svg>
        `;
      });

    } catch (error) {
      console.error("Failed to open Picture-in-Picture window:", error);
      btnLaunch.disabled = false;
      btnLaunch.innerHTML = `<span>خطأ في التشغيل - أعد المحاولة</span>`;
      
      // Temporary warning display
      const originalText = btnLaunch.innerHTML;
      setTimeout(() => {
        btnLaunch.innerHTML = `
          <span>تشغيل النافذة العائمة (PiP)</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <rect x="12" y="12" width="9" height="9" rx="1" ry="1"/>
          </svg>
        `;
      }, 3000);
    }
  });
});

// 4. Listen to delegated download & theme sync requests from content.js running inside the PiP iframe
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "syncTheme") {
    const { bgColor, borderColor, textColor } = message;
    
    try {
      if (activeHeaderBar) {
        activeHeaderBar.style.backgroundColor = bgColor;
        
        // Find title text and update color to ensure readable contrast
        const titleSpan = activeHeaderBar.querySelector("span:nth-child(2)") || activeHeaderBar.querySelector("div > span:last-child");
        if (titleSpan) {
          titleSpan.style.color = textColor;
        }

        // Adjust control button style dynamically based on theme text color (light vs dark mode)
        const minBtn = activeHeaderBar.querySelector("button");
        if (minBtn) {
          const isLightMode = textColor === "rgb(17, 17, 17)" || textColor === "#111111" || textColor === "#111" || bgColor.includes("255") || bgColor.includes("243") || bgColor.includes("235");
          if (isLightMode) {
            minBtn.style.color = "#444";
            minBtn.style.background = "rgba(0, 0, 0, 0.05)";
            minBtn.style.borderColor = "rgba(0, 0, 0, 0.1)";
          } else {
            minBtn.style.color = "#ccc";
            minBtn.style.background = "rgba(255, 255, 255, 0.04)";
            minBtn.style.borderColor = "rgba(255, 255, 255, 0.08)";
          }
        }
      }
      if (activePipBody) {
        activePipBody.style.backgroundColor = bgColor;
      }
      if (activeDivider) {
        activeDivider.style.backgroundColor = borderColor;
      }
    } catch (err) {
      console.error("Fast Toolkit: Failed to sync dynamic theme:", err);
    }
  } else if (message.action === "performDownload") {
    const { filename, content } = message;
    
    try {
      // Create a Blob from the content text passed from the iframe
      const blob = new Blob([content], { type: "application/json" });
      
      // Perform the download using a virtual anchor inside the launcher tab context
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.style.display = "none";
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Clean up the object URL safely
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
      }, 100);
    } catch (err) {
      console.error("Fast Toolkit: Failed to process delegated download:", err);
    }
  }
});
