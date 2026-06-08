(function () {
    // === إعدادات مطور الموقع (Developer Config) ===
    // استبدل هذا القيمة بمعرف العميل الخاص بمشروعك في Google Cloud لتمكين المزامنة السحابية للجميع
    const GOOGLE_CLIENT_ID = "391323775541-770j7b9e1bgtv57fnhi77cgcc10mnojp.apps.googleusercontent.com";
    window.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;

    // Apply expanded state to document element instantly to prevent page transition flickering
    document.documentElement.classList.add('expanded');

    const defaultSettings = {
        mode: 'light',
        themeColor: '#007aff'
    };

    let savedSettings = null;
    try {
        const stored = localStorage.getItem('fastToolkitSettings');
        if (stored) {
            savedSettings = JSON.parse(stored);
        }
    } catch (e) { }

    const settings = { ...defaultSettings, ...savedSettings };

    function hexToRgb(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 255, b: 0 };
    }

    const root = document.documentElement;
    const rgb = hexToRgb(settings.themeColor);

    let containerBg, containerBorder, textColor, itemBg, itemBorder;

    if (settings.mode === 'light') {
        // Create soft light colors based on the theme color
        containerBg = `rgb(${Math.round(rgb.r * 0.08 + 255 * 0.92)}, ${Math.round(rgb.g * 0.08 + 255 * 0.92)}, ${Math.round(rgb.b * 0.08 + 255 * 0.92)})`;
        containerBorder = `rgb(${Math.round(rgb.r * 0.2 + 255 * 0.8)}, ${Math.round(rgb.g * 0.2 + 255 * 0.8)}, ${Math.round(rgb.b * 0.2 + 255 * 0.8)})`;
        itemBg = '#ffffff';
        itemBorder = containerBorder;
        textColor = '#111111';

        root.style.setProperty('--bg', '#0f0f0f'); // Keep outside body dark
        root.style.setProperty('--card-bg', itemBg);
        root.style.setProperty('--text', textColor);
        root.style.setProperty('--border', itemBorder);
    } else {
        containerBg = '#111111';
        containerBorder = '#222222';
        itemBg = '#1a1a1a';
        itemBorder = '#333333';
        textColor = '#eeeeee';

        root.style.setProperty('--bg', '#0f0f0f');
        root.style.setProperty('--card-bg', itemBg);
        root.style.setProperty('--text', textColor);
        root.style.setProperty('--border', itemBorder);
    }

    // Store for PiP usage
    window._appContainerBg = containerBg;

    // Apply Theme Color
    root.style.setProperty('--accent-green', settings.themeColor);

    // Apply Container Size and Overrides
    const styleId = 'dynamic-settings-styles';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        if (document.head) {
            document.head.appendChild(styleEl);
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                document.head.appendChild(styleEl);
            });
        }
    }

    let styleRules = `
        .container, .app-container {
            width: 230px !important;
            height: 300px !important;
            background: ${containerBg} !important;
            border-color: ${containerBorder} !important;
            color: ${textColor} !important;
            position: relative !important;
        }
        .container.expanded, .app-container.expanded,
        .expanded .container, .expanded .app-container {
            width: 320px !important;
            height: 480px !important;
        }
        .container.ready, .app-container.ready,
        .ready .container, .ready .app-container {
            transition: width 0.3s ease, height 0.3s ease !important;
        }

        /* === Expanded state: scale up all content === */
        .expanded .header h1, .expanded .header-row h1 { font-size: 18px !important; }
        .expanded .header p { font-size: 11px !important; }
        .expanded .title { font-size: 14px !important; }
        .expanded .desc { font-size: 10px !important; }
        .expanded .menu-item { padding: 9px 12px !important; gap: 10px !important; }
        .expanded .icon { font-size: 20px !important; }
        .expanded .footer { font-size: 10px !important; }
        .expanded .nav-btn { font-size: 12px !important; padding: 5px 8px !important; }
        .expanded .add-main-btn { font-size: 12px !important; padding: 5px 8px !important; }
        .expanded .container-switch-btn { font-size: 12px !important; min-width: 55px !important; }

        /* note.html chips & sections */
        .expanded .chip { font-size: 13px !important; padding: 11px 3px !important; }
        .expanded .section-label { font-size: 12px !important; }
        .expanded .section-header { margin: 6px 0 3px !important; }
        .expanded .grid-container { gap: 5px !important; }
        .expanded .backup-btn { font-size: 12px !important; padding: 7px !important; }
        .expanded .status { font-size: 12px !important; }
        .expanded .search-input { font-size: 12px !important; height: 24px !important; }

        /* card.html */
        .expanded .paste-zone { font-size: 13px !important; padding: 16px 6px !important; }
        .expanded #output { font-size: 13px !important; padding: 8px !important; }
        .expanded #output-edit { font-size: 13px !important; padding: 7px !important; }
        .expanded .action-btn { font-size: 12px !important; padding: 7px !important; }
        .expanded .lock-label { font-size: 11px !important; }
        .expanded .gateway-chip { font-size: 13px !important; padding: 8px 3px !important; }

        /* sticky.html */
        .expanded .note-area { font-size: 13px !important; padding: 10px !important; }
        .expanded .btn { font-size: 12px !important; padding: 8px !important; }

        /* settings.html */
        .expanded .setting-group label { font-size: 12px !important; }
        .expanded .color-btn { width: 24px !important; height: 24px !important; }
        .expanded .action-btn.btn-reset, .expanded .btn-reset { font-size: 12px !important; padding: 8px !important; }

        /* simah.html */
        .expanded .section-title { font-size: 11px !important; }
        .expanded .scan-zone p { font-size: 11px !important; }
        .expanded .card, .expanded .final-card { font-size: 11px !important; }
        .expanded .status-bar { font-size: 11px !important; }
        .expanded .expand-btn, .expanded .ai-btn, .expanded .upload-btn, .expanded .settings-btn, .expanded .usage-btn { font-size: 11px !important; padding: 5px 7px !important; }

        /* Modals scaled state */
        .expanded .settings-modal, .expanded .usage-modal { top: 45px !important; left: 12px !important; right: 12px !important; padding: 12px !important; border-radius: 12px !important; }
        .expanded .usage-modal { bottom: 40px !important; }
        .expanded .usage-title { font-size: 14px !important; margin-bottom: 8px !important; padding-bottom: 6px !important; }
        .expanded .usage-card { padding: 8px !important; border-radius: 8px !important; }
        .expanded .usage-card-label { font-size: 10px !important; margin-bottom: 4px !important; }
        .expanded .usage-card-value { font-size: 16px !important; }
        .expanded .usage-card-sub { font-size: 9px !important; }
        .expanded .usage-section-title { font-size: 11px !important; margin: 10px 0 6px 0 !important; }
        .expanded .usage-row { padding: 6px 8px !important; font-size: 11px !important; }
        .expanded .usage-bar-container { padding: 8px 10px !important; border-radius: 8px !important; }
        .expanded .usage-bar-track { height: 8px !important; border-radius: 4px !important; margin-top: 6px !important; }
        .expanded .usage-bar-fill { border-radius: 4px !important; }
        .expanded .usage-close-btn { padding: 6px !important; font-size: 11px !important; margin-top: 8px !important; border-radius: 6px !important; }
        .expanded .settings-modal input { padding: 8px !important; font-size: 12px !important; border-radius: 6px !important; margin-bottom: 10px !important; }
        .expanded .provider-tab { padding: 6px !important; font-size: 11px !important; border-radius: 6px !important; }
        .expanded .provider-tabs { margin-bottom: 10px !important; }
        .expanded .settings-modal-btns button { padding: 6px !important; font-size: 11px !important; border-radius: 6px !important; }
    `;

    // PiP layout overrides inside the iframe
    if (window.self !== window.top) {
        styleRules += `
            html, body {
                width: 100vw !important;
                height: 100vh !important;
                overflow: hidden !important;
                background: ${containerBg} !important;
                margin: 0 !important;
                padding: 0 !important;
            }
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
            .menu-grid {
                flex-grow: 1 !important;
                height: auto !important;
                max-height: calc(100vh - 75px) !important;
                overflow-y: auto !important;
            }
            .grid-container {
                max-height: calc(100vh - 120px) !important;
                overflow-y: auto !important;
            }
            textarea, .note-area {
                height: calc(100vh - 140px) !important;
                max-height: calc(100vh - 140px) !important;
            }
            .settings-modal, .usage-modal {
                top: 20px !important;
                left: 10px !important;
                right: 10px !important;
                bottom: 20px !important;
                max-height: calc(100vh - 40px) !important;
            }
            #pipFloatingBtn {
                display: none !important;
            }
        `;
    } else {
        styleRules += `
            #pipFloatingBtn {
                position: fixed;
                bottom: 12px;
                left: 12px;
                width: 34px;
                height: 34px;
                background: ${settings.mode === 'light' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(30, 30, 30, 0.75)'};
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 1px solid ${settings.mode === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.15)'};
                border-radius: 50%;
                color: ${settings.themeColor};
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 9999;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            #pipFloatingBtn:hover {
                transform: scale(1.1) translateY(-2px);
                background: ${settings.themeColor};
                color: ${settings.mode === 'light' && settings.themeColor !== '#00ff00' && settings.themeColor !== '#00e5ff' ? '#fff' : '#111'};
                border-color: ${settings.themeColor};
                box-shadow: 0 6px 16px ${settings.themeColor}66;
            }
            #pipFloatingBtn:active {
                transform: scale(0.95);
            }
        `;
    }

    if (settings.mode === 'light') {
        styleRules += `
            /* Overrides for hardcoded dark colors in various tools */
            .header p, .footer, .footer b, .desc { color: #555 !important; }
            .menu-item:hover { background: #fff !important; }
            
            .nav-btn, .action-btn, .chip { background: ${itemBg} !important; border-color: ${itemBorder} !important; color: ${textColor} !important; }
            .nav-btn:hover, .action-btn:hover, .chip:hover { background: #f8f8f8 !important; border-color: var(--accent-green) !important; color: #000 !important; }
            
            .paste-zone { background: ${itemBg} !important; border-color: ${itemBorder} !important; color: #666 !important; }
            .paste-zone.active { background: #fff !important; border-color: var(--accent-green) !important; color: var(--accent-green) !important; }
            
            #output { background: #fff !important; border-color: ${itemBorder} !important; color: ${textColor} !important; font-weight: bold; }
            #output-edit { background: #fff !important; color: ${textColor} !important; border-color: var(--accent-green) !important; }
            
            .lock-label { color: #555 !important; }
            .slider { background-color: ${itemBorder} !important; border-color: #aaa !important; }
            input:checked+.slider { background-color: var(--accent-green) !important; border-color: var(--accent-green) !important; }
            hr { border-top-color: ${itemBorder} !important; }
            
            textarea { background: #fff !important; color: ${textColor} !important; border-color: ${itemBorder} !important; }
            
            .size-inputs input { background: #fff !important; color: ${textColor} !important; border-color: ${itemBorder} !important; }
            .size-input-wrapper span { color: #555 !important; }
            
            /* Fix for Simah tool */
            .expand-btn, .ai-btn, .upload-btn, .settings-btn, #globalExpandBtn { background: ${itemBg} !important; border-color: ${itemBorder} !important; color: ${textColor} !important; }
            .expand-btn:hover, .ai-btn:hover, .upload-btn:hover, .settings-btn:hover, #globalExpandBtn:hover { background: #fff !important; border-color: var(--accent-green) !important; color: #000 !important; }
            .ai-btn.active { background: var(--accent-green) !important; color: #000 !important; border-color: var(--accent-green) !important; }
            .card { background: ${itemBg} !important; border: 1px solid ${itemBorder} !important; border-left: 3px solid #ffcc00 !important; }
            .final-card { background: ${itemBg} !important; border: 1px solid ${itemBorder} !important; border-left: 3px solid var(--accent-green) !important; }
            .final-card.copied { background: #e0e0e0 !important; border-left-color: #999 !important; }
            .final-card.copied .final-value { color: #888 !important; }
            .visual-check { background: #fff !important; }
            .edit-input { background: #fff !important; color: ${textColor} !important; border-color: ${itemBorder} !important; }
            .scan-zone { background: ${itemBg} !important; }
            .settings-modal { background: ${itemBg} !important; border-color: ${containerBorder} !important; box-shadow: 0 4px 15px rgba(0,0,0,0.1) !important; }
            .settings-modal input { background: #fff !important; color: ${textColor} !important; border-color: ${itemBorder} !important; }
            .provider-tab { background: #fff !important; border-color: ${itemBorder} !important; color: #888 !important; }
            .provider-tab.active { background: var(--accent-green) !important; color: #000 !important; border-color: var(--accent-green) !important; }
            .close-key-btn { background: #fff !important; color: #555 !important; border: 1px solid ${itemBorder} !important; }
            .close-key-btn:hover { background: #f0f0f0 !important; color: #111 !important; }
            .save-key-btn { background: var(--accent-green) !important; color: #000 !important; border: none !important; }
            .usage-btn { background: ${itemBg} !important; border-color: ${itemBorder} !important; color: ${textColor} !important; }
            .usage-btn:hover { background: #fff !important; border-color: var(--accent-green) !important; }
            .usage-modal { background: ${itemBg} !important; border-color: ${containerBorder} !important; box-shadow: 0 4px 15px rgba(0,0,0,0.1) !important; }
            .usage-card { background: #fff !important; border-color: ${itemBorder} !important; }
            .usage-bar-container { background: #fff !important; border-color: ${itemBorder} !important; }
            .usage-close-btn { background: #fff !important; color: #555 !important; border-color: ${itemBorder} !important; }
            .usage-close-btn:hover { background: #f0f0f0 !important; color: #111 !important; }
            .char-counter { background: #e0e0e0 !important; color: ${textColor} !important; }
            .speed-toggle-btn { background: #fff !important; color: ${textColor} !important; border-color: ${itemBorder} !important; }
            .speed-toggle-btn:hover { background: #eee !important; color: #000 !important; }

            /* Fixes for note.html text colors in light mode */
            .search-input { background: #fff !important; color: ${textColor} !important; border-color: ${itemBorder} !important; }
            .add-main-btn, .container-switch-btn, .sort-btn, .status { color: ${textColor} !important; }
            .add-main-btn { border-color: ${itemBorder} !important; background: transparent !important; }
            .add-item-trigger { color: ${textColor} !important; }
            .modal-content { background: ${itemBg} !important; border-color: ${containerBorder} !important; }
            .modal-content input, .modal-content textarea { background: #fff !important; color: ${textColor} !important; border-color: ${itemBorder} !important; }
            .backup-btn { background: #fff !important; color: #555 !important; border-color: ${itemBorder} !important; }
            .backup-btn:hover { background: #f0f0f0 !important; color: #111 !important; }
        `;
    }

    styleEl.innerHTML = styleRules;

    // Make settings available globally
    window.fastToolkitSettings = settings;

    // ==========================================
    // === NATIVE PICTURE-IN-PICTURE CONTROLLER ===
    // ==========================================
    let activePipWindow = null;

    // Monkey-patch downloads inside the iframe context
    if (window.self !== window.top) {
        const originalClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
            if (this.download) {
                try {
                    const openerWindow = window.parent.opener || window.opener;
                    if (openerWindow) {
                        // Fetch content of the blob/URL and trigger it in the opener context
                        fetch(this.href)
                            .then(res => res.text())
                            .then(text => {
                                const blob = new openerWindow.Blob([text], { type: "application/json" });
                                const a = openerWindow.document.createElement("a");
                                a.href = openerWindow.URL.createObjectURL(blob);
                                a.download = this.download;
                                a.style.display = "none";
                                openerWindow.document.body.appendChild(a);
                                a.click();
                                openerWindow.document.body.removeChild(a);
                                setTimeout(() => openerWindow.URL.revokeObjectURL(a.href), 100);
                            })
                            .catch(err => console.error("PiP download fetch failed:", err));
                        return; // Cancel native PiP click
                    }
                } catch (err) {
                    console.error("PiP download delegation failed:", err);
                }
            }
            return originalClick.apply(this, arguments);
        };
    }

    // Sync header/titlebar theme dynamically from iframe
    function syncThemeToPipWindow() {
        try {
            const pDoc = window.parent.document;
            const headerBar = pDoc.getElementById('pipHeaderBar');
            const titleSpan = pDoc.getElementById('pipTitleSpan');
            const minBtn = pDoc.getElementById('pipMinBtn');
            const divider = pDoc.getElementById('pipDivider');
            const pBody = pDoc.body;

            if (headerBar || pBody) {
                const accentColor = settings.themeColor;
                const isLight = settings.mode === 'light';
                const currentText = isLight ? "#111" : "#fff";

                if (headerBar) headerBar.style.backgroundColor = "transparent";
                if (pBody) {
                    const bgColor = window._appContainerBg || (isLight ? '#f0f0f0' : '#111111');
                    pBody.style.backgroundColor = bgColor;
                    pBody.ownerDocument.documentElement.style.backgroundColor = bgColor;
                }
                if (titleSpan) {
                    titleSpan.style.color = currentText;
                    const pulseDot = headerBar.querySelector(".pip-pulse-dot");
                    if (pulseDot) {
                        pulseDot.style.backgroundColor = accentColor;
                        pulseDot.style.boxShadow = `0 0 8px ${accentColor}`;
                    }
                }
                if (divider) {
                    divider.style.backgroundColor = isLight ? "#ccc" : "#2a2a2a";
                }
                if (minBtn) {
                    if (isLight) {
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
        } catch (e) {
            console.warn("Theme sync to PiP failed:", e);
        }
    }

    function showOpenerOverlay() {
        let overlay = document.getElementById("pipOpenerOverlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "pipOpenerOverlay";
            const isLight = settings.mode === 'light';
            const bg = isLight ? "#f0f2f5" : "#0f0f0f";
            const textColor = isLight ? "#111" : "#fff";
            const cardBg = isLight ? "#ffffff" : "#1a1a1a";
            const border = isLight ? "rgba(0,0,0,0.1)" : "#333";
            const accent = settings.themeColor;

            overlay.style.cssText = `
                position: fixed;
                inset: 0;
                background: ${bg};
                background-image: ${isLight ? 
                    `radial-gradient(at 10% 20%, rgba(0, 122, 255, 0.03) 0px, transparent 50%), radial-gradient(at 90% 80%, rgba(0, 230, 118, 0.03) 0px, transparent 50%)` :
                    `radial-gradient(at 10% 20%, rgba(0, 230, 118, 0.05) 0px, transparent 50%), radial-gradient(at 90% 80%, rgba(0, 176, 255, 0.05) 0px, transparent 50%)`
                };
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: 'Cairo', 'Segoe UI', sans-serif;
                color: ${textColor};
                padding: 20px;
                box-sizing: border-box;
                opacity: 0;
                transition: opacity 0.3s ease;
            `;

            overlay.innerHTML = `
                <div style="
                    background: ${cardBg};
                    border: 1px solid ${border};
                    padding: 30px;
                    border-radius: 20px;
                    max-width: 400px;
                    width: 100%;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, ${isLight ? '0.1' : '0.5'}), inset 0 1px 0 rgba(255, 255, 255, 0.05);
                    text-align: center;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 15px;
                ">
                    <div style="font-size: 50px; filter: drop-shadow(0 0 10px ${accent}66); margin-bottom: 5px; animation: float 4s ease-in-out infinite;">📌</div>
                    <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: ${accent};">FAST TOOLKIT</h2>
                    <p style="margin: 0; font-size: 14px; color: ${isLight ? '#555' : '#aaa'}; line-height: 1.6;">
                        النافذة العائمة (PiP) نشطة حالياً دائماً في المقدمة!
                    </p>
                    <div style="display: flex; flex-direction: column; width: 100%; gap: 10px; margin-top: 15px;">
                        <button id="pipOverlayFocusBtn" style="
                            background: ${accent};
                            color: ${isLight && accent !== '#00ff00' && accent !== '#00e5ff' ? '#fff' : '#0b0c10'};
                            border: none;
                            border-radius: 12px;
                            padding: 12px;
                            font-size: 14px;
                            font-weight: 700;
                            cursor: pointer;
                            box-shadow: 0 4px 15px ${accent}66;
                            transition: all 0.2s;
                        ">التركيز على النافذة العائمة</button>
                        <button id="pipOverlayCloseBtn" style="
                            background: rgba(255, 255, 255, 0.05);
                            color: ${textColor};
                            border: 1px solid ${border};
                            border-radius: 12px;
                            padding: 12px;
                            font-size: 14px;
                            font-weight: 700;
                            cursor: pointer;
                            transition: all 0.2s;
                        ">إغلاق النافذة العائمة</button>
                    </div>
                    <p style="font-size: 11px; color: ${isLight ? '#888' : '#666'}; margin: 10px 0 0 0;">
                        💡 يرجى عدم إغلاق هذه الصفحة لتستمر النافذة العائمة بالعمل.
                    </p>
                </div>
            `;
            document.body.appendChild(overlay);

            // Bind events
            document.getElementById("pipOverlayFocusBtn").addEventListener("click", () => {
                const openerWin = window;
                if (openerWin.activePipWindow) openerWin.activePipWindow.focus();
            });
            document.getElementById("pipOverlayCloseBtn").addEventListener("click", () => {
                const openerWin = window;
                if (openerWin.activePipWindow) openerWin.activePipWindow.close();
            });
        }
        
        overlay.offsetHeight; // force reflow
        overlay.style.opacity = "1";
    }

    function hideOpenerOverlay() {
        const overlay = document.getElementById("pipOpenerOverlay");
        if (overlay) {
            overlay.style.opacity = "0";
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, 300);
        }
    }

    async function launchPip() {
        if (!("documentPictureInPicture" in window)) {
            if (window.location.protocol === "file:") {
                alert("عذراً، ميزة النافذة العائمة (PiP) تتطلب تشغيل الموقع عبر خادم محلي (localhost) أو رابط آمن (HTTPS)، ولا تعمل عند فتح ملف HTML كـ file:// مباشرة. يرجى رفع الموقع أو تشغيل سيرفر محلي لتجربتها.");
            } else {
                alert("عذراً، متصفحك أو هذا الرابط لا يدعم ميزة النافذة العائمة (PiP). يرجى استخدام متصفح Google Chrome إصدار 116 وما فوق.");
            }
            return;
        }

        if (window.activePipWindow) {
            window.activePipWindow.focus();
            return;
        }

        try {
            const width = 320;
            const height = 480;

            const pipWindow = await window.documentPictureInPicture.requestWindow({
                width: width,
                height: height,
            });

            window.activePipWindow = pipWindow;

            // Setup PiP Document
            pipWindow.document.title = "Fast Toolkit Always-on-Top";

            const body = pipWindow.document.body;
            body.style.margin = "0";
            body.style.padding = "0";
            body.style.overflow = "hidden";
            // Use the exact same containerBg computed by applySettings
            const pipBgColor = window._appContainerBg || (settings.mode === 'light' ? '#f0f0f0' : '#111111');
            body.style.backgroundColor = pipBgColor;
            // Fix browser default white on html element
            pipWindow.document.documentElement.style.backgroundColor = pipBgColor;
            pipWindow.document.documentElement.style.margin = "0";
            pipWindow.document.documentElement.style.padding = "0";
            body.style.width = "100vw";
            body.style.height = "100vh";
            body.style.display = "flex";
            body.style.flexDirection = "column";
            body.style.alignItems = "stretch";
            body.style.justifyContent = "stretch";

            // Custom header bar
            const headerBar = pipWindow.document.createElement("div");
            headerBar.id = "pipHeaderBar";
            headerBar.style.height = "38px";
            headerBar.style.minHeight = "38px";
            headerBar.style.display = "flex";
            headerBar.style.alignItems = "center";
            headerBar.style.justifyContent = "space-between";
            headerBar.style.padding = "0 14px";
            headerBar.style.userSelect = "none";
            headerBar.style.boxSizing = "border-box";
            headerBar.style.width = "100%";
            headerBar.dir = "rtl";

            // Pulse dot + Title
            const titleWrapper = pipWindow.document.createElement("div");
            titleWrapper.style.display = "flex";
            titleWrapper.style.alignItems = "center";
            titleWrapper.style.gap = "6px";
            titleWrapper.dir = "ltr"; // For "Fast Toolkit ●" layout

            const pulseDot = pipWindow.document.createElement("span");
            pulseDot.className = "pip-pulse-dot";
            pulseDot.style.width = "6px";
            pulseDot.style.height = "6px";
            pulseDot.style.borderRadius = "50%";
            pulseDot.style.backgroundColor = settings.themeColor;
            pulseDot.style.boxShadow = `0 0 8px ${settings.themeColor}`;
            pulseDot.style.display = "inline-block";

            // Pulse style
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
            titleSpan.id = "pipTitleSpan";
            titleSpan.innerText = "";
            titleSpan.style.fontFamily = "'Outfit', 'Segoe UI', sans-serif";
            titleSpan.style.fontWeight = "600";
            titleSpan.style.fontSize = "12px";
            titleSpan.style.letterSpacing = "0.3px";

            // Append in LTR order: Title then Dot
            titleWrapper.appendChild(titleSpan);
            titleWrapper.appendChild(pulseDot);

            // Minimize button
            const minBtn = pipWindow.document.createElement("button");
            minBtn.id = "pipMinBtn";
            minBtn.innerHTML = `
                <span style="font-weight: 700; font-family: 'Cairo', 'Segoe UI', sans-serif; font-size: 11px; letter-spacing: 0.2px;">تصغير</span>
                <span style="font-size: 13px; color: #7c4dff; font-weight: bold; line-height: 1; margin-top: -1px;">—</span>
            `;
            minBtn.style.display = "flex";
            minBtn.style.alignItems = "center";
            minBtn.style.justifyContent = "center";
            minBtn.style.gap = "8px";
            minBtn.style.borderRadius = "20px";
            minBtn.style.padding = "4px 14px";
            minBtn.style.cursor = "pointer";
            minBtn.style.outline = "none";
            minBtn.style.border = "1px solid";
            minBtn.style.boxSizing = "border-box";
            minBtn.style.transition = "all 0.25s ease";

            const btnStyle = pipWindow.document.createElement("style");
            btnStyle.textContent = `
                #pipMinBtn {
                    -webkit-tap-highlight-color: transparent;
                }
                #pipMinBtn:focus, #pipMinBtn:focus-visible {
                    outline: none;
                }
                #pipMinBtn:active {
                    transform: scale(0.94);
                    opacity: 0.8;
                }
            `;
            pipWindow.document.head.appendChild(btnStyle);

            let isCollapsed = false;

            // Apply style dynamically
            const isLight = settings.mode === 'light';
            
            if (isLight) {
                headerBar.style.backgroundColor = "transparent";
                titleSpan.style.color = "#111";
                minBtn.style.color = "#222";
                minBtn.style.background = "rgba(0,0,0,0.06)";
                minBtn.style.borderColor = "rgba(0,0,0,0.12)";
                minBtn.onmouseover = () => { minBtn.style.background = "rgba(0,0,0,0.12)"; };
                minBtn.onmouseout = () => { minBtn.style.background = "rgba(0,0,0,0.06)"; };
            } else {
                headerBar.style.backgroundColor = "transparent";
                titleSpan.style.color = "#eee";
                minBtn.style.color = "#eee";
                minBtn.style.background = "#1e1e1e";
                minBtn.style.borderColor = "#333";
                minBtn.onmouseover = () => { minBtn.style.background = "#2a2a2a"; };
                minBtn.onmouseout = () => { minBtn.style.background = "#1e1e1e"; };
            }

            headerBar.appendChild(titleWrapper);
            headerBar.appendChild(minBtn);
            body.appendChild(headerBar);

            // Iframe
            const iframe = pipWindow.document.createElement("iframe");
            iframe.id = "pipIframe";
            iframe.src = window.location.href; // open this current page!
            iframe.style.width = "100%";
            iframe.style.height = "calc(100% - 38px)";
            iframe.style.border = "none";
            iframe.style.margin = "0";
            iframe.style.padding = "0";
            iframe.style.display = "block";
            iframe.style.backgroundColor = "transparent";
            iframe.setAttribute("allow", "clipboard-read; clipboard-write; camera; microphone; geolocation");
            body.appendChild(iframe);

            // Resize lock
            let resizeTimeout = null;
            pipWindow.addEventListener("resize", () => {
                if (isCollapsed) return;
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

            // Minimize toggle click handler
            minBtn.addEventListener("click", () => {
                if (!isCollapsed) {
                    isCollapsed = true;
                    iframe.style.display = "none";
                    minBtn.innerHTML = `
                        <span style="font-size: 7px; margin-top: 1px;">➕</span>
                        <span style="font-size: 10px; font-weight: 700; font-family: 'Cairo', 'Segoe UI', sans-serif; letter-spacing: -0.2px;">توسيع</span>
                    `;
                    titleSpan.innerText = "";
                    try {
                        pipWindow.resizeTo(320, 78);
                    } catch (e) {
                        console.warn("Collapse failed:", e);
                    }
                } else {
                    isCollapsed = false;
                    iframe.style.display = "block";
                    minBtn.innerHTML = `
                        <span style="font-size: 7px; margin-top: 1px;">➖</span>
                        <span style="font-size: 10px; font-weight: 700; font-family: 'Cairo', 'Segoe UI', sans-serif; letter-spacing: -0.2px;">تصغير</span>
                    `;
                    titleSpan.innerText = "";
                    try {
                        pipWindow.resizeTo(320, 480);
                    } catch (e) {
                        console.warn("Expand failed:", e);
                    }
                }
            });

            // Listen for keyboard shortcuts inside the parent PiP window context too
            pipWindow.addEventListener("keydown", (e) => {
                const shortcuts = window.getFastToolkitShortcuts();
                if (!shortcuts.enabled) return;
                
                const pressedKey = e.key.toLowerCase();
                if (pressedKey === shortcuts.pipToggle.toLowerCase()) {
                    e.preventDefault();
                    minBtn.click();
                }
            });

            showOpenerOverlay();

            pipWindow.addEventListener("pagehide", () => {
                window.activePipWindow = null;
                hideOpenerOverlay();
            });

        } catch (error) {
            console.error("Failed to open Picture-in-Picture window:", error);
        }
    }

    function injectPipBtn() {
        if (document.getElementById('pipBtn') || document.getElementById('pipFloatingBtn')) return;
        if (window.self !== window.top) return;

        const isLight = settings.mode === 'light';

        // 1. Check for index.html header actions wrapper
        const headerActions = document.querySelector('.header-actions');
        if (headerActions) {
            const btn = document.createElement('button');
            btn.id = 'pipBtn';
            btn.title = 'تشغيل النافذة العائمة (PiP)';
            btn.style.cssText = `
                background: none;
                border: none;
                color: #555;
                cursor: pointer;
                padding: 2px 3px;
                line-height: 1;
                transition: color 0.2s;
                font-size: 14px;
                display: flex;
                align-items: center;
            `;
            btn.innerHTML = '📌';
            btn.onmouseover = () => btn.style.color = 'var(--accent-green, #00c864)';
            btn.onmouseout = () => btn.style.color = '#555';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                launchPip();
            });
            headerActions.appendChild(btn);
            return;
        }

        // 2. Check for other tool pages header row (like note.html, card.html, simah.html, sticky.html)
        const headerRight = document.querySelector('.header-right, .home-row');
        const header = document.querySelector('.header');
        
        if (headerRight || header) {
            const btn = document.createElement('button');
            btn.id = 'pipBtn';
            btn.className = 'nav-btn';
            btn.title = 'تشغيل النافذة العائمة (PiP)';
            btn.innerHTML = '📌';
            btn.style.fontSize = '12px';
            btn.style.display = 'inline-flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.cursor = 'pointer';
            
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                launchPip();
            });

            if (headerRight) {
                // In note.html, place it before the search icon or home icon
                btn.style.marginLeft = '4px';
                headerRight.insertBefore(btn, headerRight.firstChild);
            } else if (header) {
                // In sticky.html/simah.html, insert after the first child (the back button)
                header.insertBefore(btn, header.firstChild.nextSibling);
            }
            return;
        }

        // 3. Fallback: FAB (Floating Action Button) in the viewport
        const btn = document.createElement('div');
        btn.id = 'pipFloatingBtn';
        btn.title = 'تشغيل النافذة العائمة (PiP)';
        btn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <rect x="12" y="12" width="9" height="9" rx="1" ry="1"/>
            </svg>
        `;
        btn.addEventListener('click', launchPip);
        document.body.appendChild(btn);
    }

    // === Global Expand/Collapse ===
    function applyExpand() {
        document.documentElement.classList.add('expanded');
        document.querySelectorAll('.container, .app-container').forEach(el => {
            el.classList.add('expanded');
        });
    }

    // Apply immediately when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            applyExpand();
            if (window.self === window.top) {
                injectPipBtn();
                // Register Service Worker
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.register('sw.js')
                        .then(() => console.log('Fast Toolkit: PWA Service Worker registered'))
                        .catch(err => console.warn('Fast Toolkit: Service Worker registration failed:', err));
                }
                // Inject Manifest Link
                if (!document.querySelector('link[rel="manifest"]')) {
                    const link = document.createElement('link');
                    link.rel = 'manifest';
                    link.href = 'manifest.json';
                    document.head.appendChild(link);
                }
            }
            if (window.self !== window.top) {
                syncThemeToPipWindow();
            }
            setTimeout(() => {
                document.documentElement.classList.add('ready');
                document.querySelectorAll('.container, .app-container').forEach(el => el.classList.add('ready'));
            }, 50);
        });
    } else {
        applyExpand();
        if (window.self === window.top) {
            injectPipBtn();
            // Register Service Worker
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('sw.js')
                    .then(() => console.log('Fast Toolkit: PWA Service Worker registered'))
                    .catch(err => console.warn('Fast Toolkit: Service Worker registration failed:', err));
            }
            // Inject Manifest Link
            if (!document.querySelector('link[rel="manifest"]')) {
                const link = document.createElement('link');
                link.rel = 'manifest';
                link.href = 'manifest.json';
                document.head.appendChild(link);
            }
        }
        if (window.self !== window.top) {
            syncThemeToPipWindow();
        }
        setTimeout(() => {
            document.documentElement.classList.add('ready');
            document.querySelectorAll('.container, .app-container').forEach(el => el.classList.add('ready'));
        }, 50);
    }

    // Global toggle function available to all pages
    window.fastToolkitToggleExpand = function () {
        return true;
    };

    window.fastToolkitSetExpand = function (shouldExpand) {
        document.documentElement.classList.add('expanded');
        document.querySelectorAll('.container, .app-container').forEach(el => {
            el.classList.add('ready');
            el.classList.add('expanded');
        });
    };

    window.getFastToolkitShortcuts = function () {
        const defaultShortcuts = {
            enabled: true,
            nav1: "1",
            nav2: "2",
            nav3: "3",
            nav4: "4",
            nav5: "5",
            navHome: "h",
            search: "/",
            sort: "s",
            tab: "t",
            ai: "a",
            settings: "s",
            usage: "u",
            clear: "c",
            edit: "e",
            pipToggle: "p"
        };
        try {
            const stored = localStorage.getItem('fastToolkitShortcuts');
            if (stored) {
                return { ...defaultShortcuts, ...JSON.parse(stored) };
            }
        } catch (e) { }
        return defaultShortcuts;
    };

    // Global Navigation Shortcuts
    document.addEventListener('keydown', (e) => {
        const shortcuts = window.getFastToolkitShortcuts();
        if (!shortcuts.enabled) return;

        const activeEl = document.activeElement;
        const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
        if (isInput) return;

        // Ctrl+Shift+D لتبديل Dark/Light Mode
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            fastToolkitToggleTheme();
            return;
        }

        // Ignore if any modifier key is pressed (to not override browser shortcuts)
        if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

        const pressedKey = e.key.toLowerCase();
        if (pressedKey === shortcuts.pipToggle.toLowerCase()) {
            if (window.self !== window.top) {
                try {
                    const minBtn = window.parent.document.getElementById('pipMinBtn');
                    if (minBtn) {
                        e.preventDefault();
                        minBtn.click();
                        return;
                    }
                } catch (err) {
                    console.warn("PiP toggle from iframe keydown failed:", err);
                }
            }
        }

        if (pressedKey === shortcuts.nav1.toLowerCase()) {
            if (!window.location.pathname.endsWith('note.html')) window.location.href = 'note.html';
        } else if (pressedKey === shortcuts.nav2.toLowerCase()) {
            if (!window.location.pathname.endsWith('simah.html')) window.location.href = 'simah.html';
        } else if (pressedKey === shortcuts.nav3.toLowerCase()) {
            if (!window.location.pathname.endsWith('card.html')) window.location.href = 'card.html';
        } else if (pressedKey === shortcuts.nav4.toLowerCase()) {
            if (!window.location.pathname.endsWith('sticky.html')) window.location.href = 'sticky.html';
        } else if (pressedKey === shortcuts.nav5.toLowerCase()) {
            if (!window.location.pathname.endsWith('cia.html')) window.location.href = 'cia.html';
        } else if (pressedKey === shortcuts.navHome.toLowerCase()) {
            if (!window.location.pathname.endsWith('index.html') && !window.location.pathname.endsWith('/')) {
                window.location.href = 'index.html';
            }
        } else if (pressedKey === '?') {
            e.preventDefault();
            showShortcutsOverlay();
        }
    });

    // ====== Dark/Light Mode Toggle ======
    function fastToolkitToggleTheme() {
        let s;
        try { s = JSON.parse(localStorage.getItem('fastToolkitSettings') || '{}'); } catch { s = {}; }
        const newMode = (s.mode === 'dark') ? 'light' : 'dark';
        s.mode = newMode;
        localStorage.setItem('fastToolkitSettings', JSON.stringify(s));

        const root = document.documentElement;
        const themeColor = s.themeColor || '#007aff';

        // إعادة تطبيق الألوان فوراً
        if (newMode === 'dark') {
            root.style.setProperty('--bg', '#0f0f0f');
            root.style.setProperty('--card-bg', '#1a1a1a');
            root.style.setProperty('--text', '#eeeeee');
            root.style.setProperty('--border', '#333333');
        } else {
            const hex = themeColor;
            const r = parseInt(hex.slice(1,3),16)||0, g = parseInt(hex.slice(3,5),16)||0, b = parseInt(hex.slice(5,7),16)||0;
            root.style.setProperty('--bg', '#0f0f0f');
            root.style.setProperty('--card-bg', '#ffffff');
            root.style.setProperty('--text', '#111111');
            root.style.setProperty('--border', `rgb(${Math.round(r*.2+255*.8)},${Math.round(g*.2+255*.8)},${Math.round(b*.2+255*.8)})`);
        }

        // تحديث الحاويات بخلفية جديدة
        const styleEl = document.getElementById('dynamic-settings-styles');
        if (styleEl) {
            const bg = newMode === 'dark' ? '#111111' : '#ffffff';
            const border = newMode === 'dark' ? '#222222' : '#dddddd';
            const textC = newMode === 'dark' ? '#eeeeee' : '#111111';
            styleEl.textContent = styleEl.textContent
                .replace(/background: #[0-9a-fA-F]{6,8} !important; \/\* container-bg \*\//g, `background: ${bg} !important; /* container-bg */`);
        }

        // إظهار toast سريع
        const toast = document.createElement('div');
        toast.textContent = newMode === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode';
        toast.style.cssText = `
            position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
            background:#222;color:#fff;padding:6px 14px;border-radius:20px;
            font-size:11px;font-weight:bold;z-index:999999;
            border:1px solid #444;box-shadow:0 4px 12px rgba(0,0,0,0.5);
            opacity:1;transition:opacity 0.4s;
        `;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 1200);
    }
    window.fastToolkitToggleTheme = fastToolkitToggleTheme;

    // ====== Shortcuts Visual Overlay ======
    function showShortcutsOverlay() {
        // إغلاق إن كانت مفتوحة
        const existing = document.getElementById('ftShortcutsOverlay');
        if (existing) { existing.remove(); return; }

        const shortcuts = window.getFastToolkitShortcuts();
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-green').trim() || '#00ff00';

        const groups = [
            {
                title: '🧭 التنقل',
                items: [
                    { key: shortcuts.navHome, desc: 'الرئيسية' },
                    { key: shortcuts.nav1, desc: 'الملاحظات' },
                    { key: shortcuts.nav2, desc: 'سيمة' },
                    { key: shortcuts.nav3, desc: 'كارد سكانر' },
                    { key: shortcuts.nav4, desc: 'الستيكي نوت' },
                    { key: shortcuts.nav5, desc: 'CIA Maker' },
                ]
            },
            {
                title: '⚡ الصفحة الحالية',
                items: [
                    { key: shortcuts.ai || 'a', desc: 'تبديل AI' },
                    { key: shortcuts.settings || 's', desc: 'الإعدادات' },
                    { key: shortcuts.usage || 'u', desc: 'الاستهلاك' },
                    { key: shortcuts.clear || 'c', desc: 'مسح البيانات' },
                    { key: shortcuts.edit || 'e', desc: 'تعديل' },
                    { key: shortcuts.pipToggle || 'p', desc: 'تبديل PiP' },
                ]
            },
            {
                title: '📝 ملاحظات',
                items: [
                    { key: 'Ctrl+↵', desc: 'نسخ الملاحظة' },
                    { key: 'Ctrl+⌫', desc: 'مسح الملاحظة' },
                    { key: 'Ctrl+Tab', desc: 'ملاحظة تالية' },
                    { key: 'Ctrl+⇧+N', desc: 'ملاحظة جديدة' },
                ]
            },
            {
                title: '🔑 عام',
                items: [
                    { key: '?', desc: 'هذه القائمة' },
                    { key: 'Ctrl+⇧+D', desc: 'تبديل Dark/Light' },
                    { key: 'Esc', desc: 'إغلاق النوافذ' },
                ]
            }
        ];

        const overlay = document.createElement('div');
        overlay.id = 'ftShortcutsOverlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(0,0,0,0.85); backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
            font-family: 'Segoe UI', sans-serif; direction: rtl;
        `;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        const box = document.createElement('div');
        box.style.cssText = `
            background: #111; border: 1px solid #333; border-radius: 12px;
            padding: 16px; min-width: 260px; max-width: 320px; max-height: 90vh;
            overflow-y: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.9);
            scrollbar-width: thin;
        `;

        const title = document.createElement('div');
        title.style.cssText = `font-size: 11px; font-weight: bold; color: ${accent}; text-align: center; margin-bottom: 12px; letter-spacing: 1px; text-transform: uppercase;`;
        title.textContent = '⌨️ اختصارات لوحة المفاتيح';
        box.appendChild(title);

        groups.forEach(group => {
            const groupTitle = document.createElement('div');
            groupTitle.style.cssText = `font-size: 8px; color: #666; font-weight: bold; margin: 8px 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;`;
            groupTitle.textContent = group.title;
            box.appendChild(groupTitle);

            group.items.forEach(item => {
                const row = document.createElement('div');
                row.style.cssText = `display: flex; justify-content: space-between; align-items: center; padding: 3px 6px; border-radius: 4px; margin-bottom: 2px;`;
                row.onmouseover = () => row.style.background = '#1a1a1a';
                row.onmouseout = () => row.style.background = 'transparent';

                const desc = document.createElement('span');
                desc.style.cssText = `font-size: 9px; color: #aaa;`;
                desc.textContent = item.desc;

                const keyBadge = document.createElement('kbd');
                keyBadge.style.cssText = `
                    font-size: 9px; font-family: monospace; font-weight: bold;
                    background: #1e1e1e; color: ${accent}; border: 1px solid #333;
                    border-bottom: 2px solid #444; border-radius: 4px;
                    padding: 1px 6px; white-space: nowrap;
                `;
                keyBadge.textContent = item.key;

                row.appendChild(desc);
                row.appendChild(keyBadge);
                box.appendChild(row);
            });
        });

        const hint = document.createElement('div');
        hint.style.cssText = `font-size: 7px; color: #444; text-align: center; margin-top: 10px; padding-top: 8px; border-top: 1px solid #222;`;
        hint.textContent = 'اضغط ? أو Esc أو انقر خارج الإطار للإغلاق';
        box.appendChild(hint);

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // إغلاق بـ Escape
        const escClose = (ev) => { if (ev.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escClose); } };
        document.addEventListener('keydown', escClose);
    }

    window.showShortcutsOverlay = showShortcutsOverlay;
})();
