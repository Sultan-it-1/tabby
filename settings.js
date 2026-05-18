(function () {
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
            transition: width 0.3s ease, height 0.3s ease;
            position: relative !important;
        }
        .container.expanded, .app-container.expanded {
            width: 320px !important;
            height: 480px !important;
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

    // === Global Expand/Collapse ===
    const isExpanded = localStorage.getItem('fastToolkitExpanded') === 'true';
    const expandSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
    const shrinkSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/></svg>';

    function applyExpand() {
        document.querySelectorAll('.container, .app-container').forEach(el => {
            if (isExpanded) {
                el.classList.add('expanded');
            } else {
                el.classList.remove('expanded');
            }
        });
    }

    function injectExpandButton() {
        // لا تضيف الزر إذا كان موجود مسبقاً (مثل simah.html)
        if (document.getElementById('globalExpandBtn')) return;
        if (document.getElementById('expandBtn')) return;

        const header = document.querySelector('.header, .header-row, .home-row');
        if (!header) return;

        const btn = document.createElement('button');
        btn.id = 'globalExpandBtn';
        btn.title = isExpanded ? 'تقليص الواجهة' : 'توسيع الواجهة';
        btn.innerHTML = isExpanded ? shrinkSvg : expandSvg;
        btn.style.cssText = 'background:#252525;border:1px solid #444;color:var(--accent-green);padding:4px;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:0.2s;';
        btn.addEventListener('mouseenter', () => { btn.style.borderColor = 'var(--accent-green)'; });
        btn.addEventListener('mouseleave', () => { btn.style.borderColor = '#444'; });
        btn.addEventListener('click', function () {
            const next = window.fastToolkitToggleExpand();
            btn.innerHTML = next ? shrinkSvg : expandSvg;
            btn.title = next ? 'تقليص الواجهة' : 'توسيع الواجهة';
        });

        header.insertBefore(btn, header.firstChild);
    }

    // Apply immediately when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { applyExpand(); injectExpandButton(); });
    } else {
        applyExpand();
        injectExpandButton();
    }

    // Global toggle function available to all pages
    window.fastToolkitToggleExpand = function () {
        const current = localStorage.getItem('fastToolkitExpanded') === 'true';
        const next = !current;
        window.fastToolkitSetExpand(next);
        return next;
    };

    window.fastToolkitSetExpand = function (shouldExpand) {
        localStorage.setItem('fastToolkitExpanded', shouldExpand);
        document.querySelectorAll('.container, .app-container').forEach(el => {
            if (shouldExpand) {
                el.classList.add('expanded');
            } else {
                el.classList.remove('expanded');
            }
        });
        const btn = document.getElementById('globalExpandBtn') || document.getElementById('expandBtn');
        if (btn) {
            btn.innerHTML = shouldExpand ? shrinkSvg : expandSvg;
            btn.title = shouldExpand ? 'تقليص الواجهة' : 'توسيع الواجهة';
        }
    };
})();
