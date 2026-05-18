(function () {
    const defaultSettings = {
        mode: 'light',
        width: 230,
        height: 300,
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
        .container:not(.expanded), .app-container:not(.expanded) {
            width: ${settings.width}px !important;
            height: ${settings.height}px !important;
        }
        .container, .app-container {
            background: ${containerBg} !important;
            border-color: ${containerBorder} !important;
            color: ${textColor} !important;
        }
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
            .expand-btn, .ai-btn, .upload-btn, .settings-btn { background: ${itemBg} !important; border-color: ${itemBorder} !important; color: ${textColor} !important; }
            .expand-btn:hover, .ai-btn:hover, .upload-btn:hover, .settings-btn:hover { background: #fff !important; border-color: var(--accent-green) !important; color: #000 !important; }
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
})();
