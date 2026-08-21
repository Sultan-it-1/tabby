(function () {
    const PIP_SESSION_KEY = 'fastToolkit_isPipContext';
    const FIREBASE_BOOTSTRAP_SEEDS_KEY = 'fastToolkit_bootstrap_seeded_values_v1';

    function recordFirebaseBootstrapSeed(key, value) {
        try {
            const parsed = JSON.parse(localStorage.getItem(FIREBASE_BOOTSTRAP_SEEDS_KEY) || '{}');
            const entries = parsed && parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {};
            entries[key] = String(value);
            localStorage.setItem(FIREBASE_BOOTSTRAP_SEEDS_KEY, JSON.stringify({ entries }));
        } catch (e) { }
    }
    try {
        const hasPipMarker = new URLSearchParams(window.location.search).get('fastToolkitPip') === '1' || window.name === 'fast-toolkit-pip';
        if (hasPipMarker) sessionStorage.setItem(PIP_SESSION_KEY, 'true');
        window.fastToolkitIsPip = hasPipMarker || sessionStorage.getItem(PIP_SESSION_KEY) === 'true';
    } catch (e) {
        window.fastToolkitIsPip = false;
    }

    // === إعدادات مطور الموقع (Developer Config) ===
    // استبدل هذا القيمة بمعرف العميل الخاص بمشروعك في Google Cloud لتمكين المزامنة السحابية للجميع
    const GOOGLE_CLIENT_ID = "391323775541-770j7b9e1bgtv57fnhi77cgcc10mnojp.apps.googleusercontent.com";
    window.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;

    const AI_SECRET_KEYS = new Set(['simah_ai_key', 'simah_groq_key']);

    function getAiSecret(key) {
        if (!AI_SECRET_KEYS.has(key)) return '';
        try {
            const sessionValue = sessionStorage.getItem(key);
            if (sessionValue !== null) return sessionValue;

            const localValue = localStorage.getItem(key);
            if (localValue !== null) {
                // Keep the browser value as a compatibility mirror. Once the
                // user is signed in, Firebase sync makes the cloud copy the
                // authority and restores it after a browser storage reset.
                sessionStorage.setItem(key, localValue);
                return localValue;
            }
            return '';
        } catch (e) {
            return '';
        }
    }

    function setAiSecret(key, value) {
        if (!AI_SECRET_KEYS.has(key)) return;
        try {
            if (value) {
                sessionStorage.setItem(key, value);
                localStorage.setItem(key, value);
            } else {
                sessionStorage.removeItem(key);
                localStorage.removeItem(key);
            }
        } catch (e) { }

        const cloud = window.FastToolkitFirebase;
        if (!cloud) return;
        if (value && typeof cloud.saveCloudData === 'function') {
            cloud.saveCloudData(key, value);
        } else if (!value && typeof cloud.removeCloudData === 'function') {
            cloud.removeCloudData(key);
        }
    }

    window.fastToolkitGetAiSecret = getAiSecret;
    window.fastToolkitSetAiSecret = setAiSecret;

    window.fastToolkitRemoveSyncedStorageKey = function (key) {
        const cloud = window.FastToolkitFirebase;
        if (cloud && typeof cloud.removeCloudData === 'function') {
            return cloud.removeCloudData(key);
        }
        try { localStorage.removeItem(key); } catch (e) { }
        return true;
    };

    // Apply expanded and full-window states to document element instantly to prevent page transition flickering
    document.documentElement.classList.add('expanded');
    const path = window.location.pathname;
    const isIndexPage = path.endsWith('index.html') || path.endsWith('/') || path === '' || !path.includes('.html');
    const storedFullWindow = localStorage.getItem('fastToolkit_full_window');
    if (isIndexPage || storedFullWindow !== 'false') {
        document.documentElement.classList.add('full-window');
        localStorage.setItem('fastToolkit_full_window', 'true');
        if (storedFullWindow === null) recordFirebaseBootstrapSeed('fastToolkit_full_window', 'true');
    }

    const themeApi = window.FastToolkitThemes;
    if (!themeApi) throw new Error('FastToolkitThemes is required before settings.js');

    const defaultSettings = themeApi.normalizeSettings(null);
    let savedSettings = null;
    let storedSettingsText = '';
    try {
        storedSettingsText = localStorage.getItem('fastToolkitSettings') || '';
        savedSettings = storedSettingsText ? JSON.parse(storedSettingsText) : null;
    } catch (e) {
        savedSettings = null;
    }

    const settings = themeApi.normalizeSettings(savedSettings);
    try {
        const normalizedText = JSON.stringify(settings);
        if (normalizedText !== storedSettingsText) {
            localStorage.setItem('fastToolkitSettings', normalizedText);
            if (!storedSettingsText) recordFirebaseBootstrapSeed('fastToolkitSettings', normalizedText);
        }
    } catch (e) { }

    const root = document.documentElement;
    root.classList.add('modern-ui', 'ui-booting');

    // Keep the first frame covered until all synchronous page enhancements
    // (expanded sizing, quick navigation and PiP controls) have settled.
    // This prevents the compact legacy layout from flashing before the final
    // full-window layout. The timer is a safety fallback if load never fires.
    let uiRevealQueued = false;
    let uiRevealTimer = null;

    function finishToolkitUiBoot() {
        if (uiRevealTimer !== null) {
            clearTimeout(uiRevealTimer);
            uiRevealTimer = null;
        }
        root.classList.remove('ui-booting');
        root.classList.add('ui-ready');
    }

    function revealToolkitUi() {
        if (uiRevealQueued || !root.classList.contains('ui-booting')) return;
        uiRevealQueued = true;
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => requestAnimationFrame(finishToolkitUiBoot));
        } else {
            setTimeout(finishToolkitUiBoot, 0);
        }
    }

    uiRevealTimer = setTimeout(finishToolkitUiBoot, 2500);
    if (document.readyState === 'complete') {
        revealToolkitUi();
    } else {
        window.addEventListener('load', revealToolkitUi, { once: true });
    }

    // The themed pages load this stylesheet as a blocking <link> in <head>.
    // Keep a late fallback for any standalone consumer, but never move an
    // existing link after first paint because changing cascade order causes
    // a visible size/theme flash during navigation.
    function ensureThemeStylesheet() {
        if (document.getElementById('fast-toolkit-theme-styles')) return;
        const themeStylesheet = document.createElement('link');
        themeStylesheet.id = 'fast-toolkit-theme-styles';
        themeStylesheet.rel = 'stylesheet';
        themeStylesheet.href = `theme.css?v=${typeof APP_VERSION !== 'undefined' ? APP_VERSION : '1.0.0'}`;
        document.head.appendChild(themeStylesheet);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureThemeStylesheet, { once: true });
    } else {
        ensureThemeStylesheet();
    }

    let activeTheme;
    let containerBg;
    let containerBorder;
    let textColor;
    let itemBg;
    let itemBorder;
    let settingsPreviewSnapshot = null;

    function applyThemeVariables(nextSettings) {
        activeTheme = themeApi.resolveTheme(nextSettings);
        const accentRgb = themeApi.hexToRgb(activeTheme.accent);
        const secondaryRgb = themeApi.hexToRgb(activeTheme.secondary);
        const accentContrast = themeApi.getContrastColor(activeTheme.accent);

        containerBg = activeTheme.panel;
        containerBorder = activeTheme.border;
        itemBg = activeTheme.surface;
        itemBorder = activeTheme.border;
        textColor = activeTheme.text;

        root.dataset.themePreset = activeTheme.id;
        root.dataset.themeMode = activeTheme.mode;
        root.style.colorScheme = activeTheme.mode;
        root.style.setProperty('--app-background', activeTheme.background);
        root.style.setProperty('--app-shell', activeTheme.shell);
        root.style.setProperty('--app-panel', activeTheme.panel);
        root.style.setProperty('--app-surface', activeTheme.surface);
        root.style.setProperty('--app-elevated', activeTheme.elevated);
        root.style.setProperty('--app-border', activeTheme.border);
        root.style.setProperty('--app-shadow', activeTheme.mode === 'light'
            ? '0 20px 55px rgba(29, 43, 68, .15)'
            : '0 22px 65px rgba(0, 0, 0, .42)');
        root.style.setProperty('--text-muted', activeTheme.muted);
        root.style.setProperty('--accent', activeTheme.accent);
        root.style.setProperty('--secondary', activeTheme.secondary);
        root.style.setProperty('--accent-rgb', `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`);
        root.style.setProperty('--secondary-rgb', `${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}`);
        root.style.setProperty('--accent-contrast', accentContrast);

        // Legacy aliases used by the existing tools.
        root.style.setProperty('--bg', activeTheme.background);
        root.style.setProperty('--card-bg', activeTheme.surface);
        root.style.setProperty('--text', activeTheme.text);
        root.style.setProperty('--border', activeTheme.border);
        root.style.setProperty('--accent-green', activeTheme.accent);
        root.style.setProperty('--accent-green-rgb', `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`);
        root.style.setProperty('--accent-blue', activeTheme.secondary);

        window._appContainerBg = activeTheme.panel;
        window.fastToolkitActiveTheme = activeTheme;

        const themeMeta = document.querySelector('meta[name="theme-color"]');
        if (themeMeta) themeMeta.setAttribute('content', activeTheme.background);
        return activeTheme;
    }

    function readLatestStoredSettings() {
        try {
            const parsed = JSON.parse(localStorage.getItem('fastToolkitSettings') || 'null');
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function applySettingsState(nextSettings, source = 'local') {
        const normalized = themeApi.normalizeSettings(nextSettings);
        Object.keys(settings).forEach(key => delete settings[key]);
        Object.assign(settings, normalized);
        applyThemeVariables(settings);
        window.fastToolkitSettings = settings;

        syncThemeToPipWindow();
        try {
            window.dispatchEvent(new CustomEvent('fasttoolkit:settingschange', {
                detail: { settings: { ...settings }, theme: { ...activeTheme }, source }
            }));
        } catch (e) { }
        return settings;
    }

    function saveSettingsPatch(patch) {
        const latest = readLatestStoredSettings();
        settingsPreviewSnapshot = null;
        const normalized = applySettingsState({ ...settings, ...latest, ...patch }, 'save');
        try { localStorage.setItem('fastToolkitSettings', JSON.stringify(normalized)); } catch (e) { }
        return normalized;
    }

    function previewSettingsPatch(patch) {
        if (!settingsPreviewSnapshot) settingsPreviewSnapshot = { ...settings };
        return applySettingsState({ ...settings, ...patch }, 'preview');
    }

    function cancelSettingsPreview() {
        if (!settingsPreviewSnapshot) return settings;
        const snapshot = settingsPreviewSnapshot;
        settingsPreviewSnapshot = null;
        return applySettingsState(snapshot, 'preview-cancel');
    }

    applyThemeVariables(settings);
    window.fastToolkitSaveSettings = saveSettingsPatch;
    window.fastToolkitPreviewSettings = previewSettingsPatch;
    window.fastToolkitCancelSettingsPreview = cancelSettingsPreview;
    window.fastToolkitThemePresets = themeApi.PRESETS;

    window.addEventListener('storage', event => {
        if (event.key !== 'fastToolkitSettings') return;
        let incoming = null;
        try { incoming = event.newValue ? JSON.parse(event.newValue) : null; } catch (e) { }
        settingsPreviewSnapshot = null;
        applySettingsState(incoming, 'storage');
    });

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

    // === Universal Quick Access Tools Navigation Bar Injection ===
    function injectQuickToolsBar() {
        if (document.getElementById('quickToolsBar')) return;

        const container = document.querySelector('.app-container') || document.querySelector('.container');
        if (!container) return;

        const bar = document.createElement('div');
        bar.id = 'quickToolsBar';
        bar.className = 'quick-tools-bar';
        bar.setAttribute('aria-label', 'التنقل السريع بين الأدوات');

        const tools = [
            { href: 'note.html', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>', title: 'نسخ سريع' },
            { href: 'simah.html', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9m6 10V5m6 14v-7m4 7H2"/></svg>', title: 'سمة' },
            { href: 'card.html', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="13" rx="2"/><path d="M3 9h18M7 14h3"/><circle cx="17" cy="15" r="2.5"/></svg>', title: 'Card Scan' },
            { href: 'sticky.html', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14a2 2 0 0 1 2 2v10l-6 6H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M15 21v-6h6"/></svg>', title: 'Sticky Notes' },
            { href: 'cia.html', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4"/></svg>', title: 'CIA Maker' },
            { href: 'date.html', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>', title: 'Date Helper' },
            { href: 'index.html', icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></svg>', title: 'الرئيسية' }
        ];

        const currentPath = window.location.pathname.split('/').pop() || 'index.html';
        // Don't render quick tools bar on Home page (index.html)
        if (currentPath === 'index.html' || currentPath === '' || window.location.pathname.endsWith('/')) return;


        tools.forEach(tool => {
            const btn = document.createElement('a');
            btn.href = tool.href;
            btn.title = tool.title;
            btn.setAttribute('aria-label', tool.title);
            btn.innerHTML = tool.icon;
            
            const isActive = currentPath === tool.href || (currentPath === '' && tool.href === 'index.html');
            btn.className = `quick-tool-btn${isActive ? ' active' : ''}`;
            if (isActive) btn.setAttribute('aria-current', 'page');

            bar.appendChild(btn);
        });

        container.insertBefore(bar, container.firstChild);

        // Hide duplicate original Home button in subpages since Quick Access Bar handles Home navigation
        document.querySelectorAll('a[href="index.html"]').forEach(btn => {
            if (btn.parentNode && btn.parentNode.id !== 'quickToolsBar' && !btn.classList.contains('settings-back-btn')) {
                btn.style.display = 'none';
            }
        });
    }


    function initHeaderExtensions() {
        injectQuickToolsBar();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHeaderExtensions);
    } else {
        initHeaderExtensions();
    }



    let styleRules = `
        .container, .app-container {
            width: 230px !important;
            height: 300px !important;
            background: var(--app-panel) !important;
            border-color: var(--app-border) !important;
            color: var(--text) !important;
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

        /* === Modern Button Micro-Animations & Press Feedback === */
        button, .btn, .nav-btn, .action-btn, .chip, .menu-item, .checkout-search-btn, .checkout-mode-toggle, .add-main-btn {
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        button:active, .btn:active, .nav-btn:active, .action-btn:active, .chip:active, .menu-item:active, .checkout-search-btn:active, .checkout-mode-toggle:active {
            transform: scale(0.95) !important;
        }

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

        /* === Full Window / Split Screen Mode (High Priority Override) === */
        html.full-window, body.full-window {
            width: 100% !important;
            height: 100vh !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            display: flex !important;
            align-items: stretch !important;
            justify-content: stretch !important;
            background: var(--app-panel) !important;
        }

        html.full-window .container,
        html.full-window .app-container,
        body.full-window .container,
        body.full-window .app-container,
        html.expanded.full-window .container,
        html.expanded.full-window .app-container,
        .container.full-window,
        .app-container.full-window {
            width: 100% !important;
            height: 100vh !important;
            min-width: 100% !important;
            min-height: 100vh !important;
            max-width: 100% !important;
            max-height: 100vh !important;
            border-radius: 0 !important;
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 12px 14px !important;
            box-sizing: border-box !important;
            flex-grow: 1 !important;
        }

        html.full-window .menu-grid,
        body.full-window .menu-grid {
            display: grid !important;
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)) !important;
            align-content: start !important;
            gap: 10px !important;
            max-height: calc(100vh - 90px) !important;
            overflow-y: auto !important;
            padding-right: 4px !important;
        }
    `;

    // PiP layout overrides inside the iframe
    if (window.self !== window.top) {
        styleRules += `
            html, body {
                width: 100vw !important;
                height: 100vh !important;
                overflow: hidden !important;
                background: var(--app-panel) !important;
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
                background: var(--app-elevated);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 1px solid var(--app-border);
                border-radius: 50%;
                color: var(--accent);
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
                background: var(--accent);
                color: var(--accent-contrast);
                border-color: var(--accent);
                box-shadow: 0 6px 16px rgba(var(--accent-rgb), .32);
            }
            #pipFloatingBtn:active {
                transform: scale(0.95);
            }
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
            const pipHost = window.self !== window.top ? window.parent : window.activePipWindow;
            if (!pipHost || !pipHost.document) return;
            const pDoc = pipHost.document;
            const headerBar = pDoc.getElementById('pipHeaderBar');
            const titleSpan = pDoc.getElementById('pipTitleSpan');
            const minBtn = pDoc.getElementById('pipMinBtn');
            const divider = pDoc.getElementById('pipDivider');
            const timerSpan = pDoc.getElementById('pipTimerSpan');
            const visibilityBtn = pDoc.getElementById('pipTimerVisibilityBtn');
            const pBody = pDoc.body;

            if (headerBar || pBody) {
                const currentTheme = window.fastToolkitActiveTheme || themeApi.resolveTheme(settings);
                const accentColor = currentTheme.accent;
                const currentText = currentTheme.text;

                pDoc.documentElement.style.setProperty('--pip-accent', currentTheme.accent);
                pDoc.documentElement.style.setProperty('--pip-accent-contrast', themeApi.getContrastColor(currentTheme.accent));
                pDoc.documentElement.style.setProperty('--pip-panel', currentTheme.panel);
                pDoc.documentElement.style.setProperty('--pip-surface', currentTheme.surface);
                pDoc.documentElement.style.setProperty('--pip-elevated', currentTheme.elevated);
                pDoc.documentElement.style.setProperty('--pip-border', currentTheme.border);
                pDoc.documentElement.style.setProperty('--pip-text', currentTheme.text);
                pDoc.documentElement.style.setProperty('--pip-muted', currentTheme.muted);

                if (headerBar) headerBar.style.backgroundColor = currentTheme.panel;
                if (pBody) {
                    const bgColor = currentTheme.panel;
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
                    divider.style.backgroundColor = currentTheme.border;
                }
                if (minBtn) {
                    minBtn.style.color = currentTheme.text;
                    minBtn.style.background = currentTheme.surface;
                    minBtn.style.borderColor = currentTheme.border;
                }
                if (timerSpan && Number(timerSpan.dataset.minutes || '0') < 7) {
                    timerSpan.style.color = currentTheme.accent;
                }
                if (timerSpan) {
                    timerSpan.style.backgroundColor = currentTheme.surface;
                    timerSpan.style.borderColor = currentTheme.border;
                }
                if (visibilityBtn) visibilityBtn.style.color = currentTheme.muted;
            }
        } catch (e) {
            console.warn("Theme sync to PiP failed:", e);
        }
    }

    let pipOverlayReturnFocus = null;
    let pipLaunchInProgress = false;

    function showOpenerOverlay() {
        let overlay = document.getElementById("pipOpenerOverlay");
        if (!overlay) {
            pipOverlayReturnFocus = document.activeElement;
            overlay = document.createElement("div");
            overlay.id = "pipOpenerOverlay";
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('aria-labelledby', 'pipOverlayTitle');
            overlay.innerHTML = `
                <div class="pip-overlay-card">
                    <span class="pip-overlay-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><rect x="11" y="11" width="10" height="10" rx="2"/></svg>
                    </span>
                    <span class="brand-kicker">Always on top</span>
                    <h2 id="pipOverlayTitle">النافذة العائمة تعمل الآن</h2>
                    <p>يمكنك متابعة أدواتك فوق أي نافذة أخرى أثناء العمل.</p>
                    <div class="pip-overlay-actions">
                        <button id="pipOverlayFocusBtn" class="primary">الانتقال إلى النافذة</button>
                        <button id="pipOverlayCloseBtn">إغلاق النافذة</button>
                    </div>
                    <small>أبقِ هذه الصفحة مفتوحة لاستمرار النافذة العائمة.</small>
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
            overlay.addEventListener('keydown', event => {
                const focusBtn = document.getElementById('pipOverlayFocusBtn');
                const closeBtn = document.getElementById('pipOverlayCloseBtn');
                if (event.key === 'Escape') {
                    event.preventDefault();
                    if (window.activePipWindow) window.activePipWindow.close();
                    return;
                }
                if (event.key !== 'Tab' || !focusBtn || !closeBtn) return;
                if (event.shiftKey && document.activeElement === focusBtn) {
                    event.preventDefault();
                    closeBtn.focus();
                } else if (!event.shiftKey && document.activeElement === closeBtn) {
                    event.preventDefault();
                    focusBtn.focus();
                }
            });
        }
        
        overlay.offsetHeight; // force reflow
        overlay.classList.add('visible');
        requestAnimationFrame(() => document.getElementById('pipOverlayFocusBtn')?.focus());
    }

    function hideOpenerOverlay() {
        const overlay = document.getElementById("pipOpenerOverlay");
        if (overlay) {
            overlay.classList.remove('visible');
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
                const returnTarget = pipOverlayReturnFocus && pipOverlayReturnFocus.isConnected
                    ? pipOverlayReturnFocus
                    : document.getElementById('pipBtn');
                if (returnTarget && typeof returnTarget.focus === 'function') returnTarget.focus();
                pipOverlayReturnFocus = null;
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
            if (!window.activePipWindow.closed) {
                try {
                    window.activePipWindow.focus();
                    return;
                } catch (e) {
                    window.activePipWindow = null;
                }
            } else {
                window.activePipWindow = null;
            }
        }

        // A paste/upload path can notify several parts of the page almost at
        // once. requestWindow must never run concurrently for the same event.
        if (pipLaunchInProgress) return;
        pipLaunchInProgress = true;

        try {
            const width = 320;
            const height = 480;

            const pipWindow = await window.documentPictureInPicture.requestWindow({
                width: width,
                height: height,
            });

            window.activePipWindow = pipWindow;
            pipWindow.isPip = true;
            pipWindow.addEventListener('pagehide', () => { window.activePipWindow = null; });
            pipWindow.addEventListener('beforeunload', () => { window.activePipWindow = null; });

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
            pulseDot.style.backgroundColor = activeTheme.accent;
            pulseDot.style.boxShadow = `0 0 8px ${activeTheme.accent}`;
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
                <span style="font-size: 13px; color: currentColor; font-weight: bold; line-height: 1; margin-top: -1px;">—</span>
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
                #pipMinBtn:focus-visible {
                    outline: 2px solid var(--pip-accent);
                    outline-offset: 2px;
                }
                #pipMinBtn:active {
                    transform: scale(0.94);
                    opacity: 0.8;
                }
                #pipTimerVisibilityBtn:focus-visible {
                    opacity: 1 !important;
                    outline: 2px solid var(--pip-accent);
                    outline-offset: 1px;
                }
            `;
            pipWindow.document.head.appendChild(btnStyle);

            let isCollapsed = false;

            const getCurrentPipTheme = () => window.fastToolkitActiveTheme || themeApi.resolveTheme(settings);
            headerBar.style.backgroundColor = "transparent";
            minBtn.onmouseover = () => { minBtn.style.background = getCurrentPipTheme().elevated; };
            minBtn.onmouseout = () => { minBtn.style.background = getCurrentPipTheme().surface; };

            // Timer & Actions Wrapper
            const middleWrapper = pipWindow.document.createElement("div");
            middleWrapper.style.display = "flex";
            middleWrapper.style.alignItems = "center";
            middleWrapper.style.gap = "4px";
            middleWrapper.dir = "ltr";
            middleWrapper.style.flex = "1";
            middleWrapper.style.justifyContent = "center";
            middleWrapper.style.height = "100%"; // Ensures it's easily hoverable
            
            // Hover logic to show eye icon
            middleWrapper.onmouseenter = () => {
                visibilityBtn.style.opacity = "1";
            };
            middleWrapper.onmouseleave = () => {
                visibilityBtn.style.opacity = "0";
            };

            // Timer display container (clickable part)
            const timerContainer = pipWindow.document.createElement("div");
            timerContainer.style.display = "flex";
            timerContainer.style.alignItems = "center";
            timerContainer.style.cursor = "pointer";
            timerContainer.title = "اضغط لتصفير العداد";
            timerContainer.style.transition = "transform 0.2s, filter 0.2s";
            timerContainer.onmouseover = () => { timerContainer.style.filter = "brightness(1.2)"; };
            timerContainer.onmouseout = () => { timerContainer.style.filter = "brightness(1)"; };

            // Timer display (Premium Glassmorphic Badge)
            const timerSpan = pipWindow.document.createElement("span");
            timerSpan.id = "pipTimerSpan";
            timerSpan.style.fontFamily = "'Outfit', 'Segoe UI', monospace";
            timerSpan.style.fontWeight = "700";
            timerSpan.style.fontSize = "13px";
            timerSpan.style.letterSpacing = "0.5px";
            timerSpan.style.color = getCurrentPipTheme().accent;
            timerSpan.style.padding = "2px 8px";
            timerSpan.style.borderRadius = "8px";
            timerSpan.style.backgroundColor = getCurrentPipTheme().surface;
            timerSpan.style.border = `1px solid ${getCurrentPipTheme().border}`;
            timerSpan.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.1)";
            timerSpan.style.transition = "all 0.3s ease";
            timerSpan.innerText = "00:00";

            timerContainer.appendChild(timerSpan);

            // Visibility Button
            const visibilityBtn = pipWindow.document.createElement("button");
            visibilityBtn.id = "pipTimerVisibilityBtn";
            visibilityBtn.title = "إخفاء/إظهار العداد";
            visibilityBtn.style.background = "none";
            visibilityBtn.style.border = "none";
            visibilityBtn.style.color = getCurrentPipTheme().muted;
            visibilityBtn.style.cursor = "pointer";
            visibilityBtn.style.padding = "4px";
            visibilityBtn.style.borderRadius = "50%";
            visibilityBtn.style.display = "flex";
            visibilityBtn.style.alignItems = "center";
            visibilityBtn.style.justifyContent = "center";
            visibilityBtn.style.transition = "all 0.3s ease";
            visibilityBtn.style.opacity = "0"; // hidden by default
            
            visibilityBtn.onmouseover = () => {
                const currentTheme = getCurrentPipTheme();
                visibilityBtn.style.color = currentTheme.accent;
                visibilityBtn.style.backgroundColor = currentTheme.elevated;
            };
            visibilityBtn.onmouseout = () => {
                visibilityBtn.style.color = getCurrentPipTheme().muted;
                visibilityBtn.style.backgroundColor = "transparent";
            };

            const eyeOpenSVG = `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
            const eyeClosedSVG = `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

            if (typeof settings.pipTimerVisible === 'undefined') {
                settings.pipTimerVisible = true;
            }

            function updateVisibility() {
                if (settings.pipTimerVisible) {
                    timerContainer.style.display = "flex";
                    visibilityBtn.innerHTML = eyeOpenSVG;
                    visibilityBtn.style.transform = "scale(1)";
                } else {
                    timerContainer.style.display = "none";
                    visibilityBtn.innerHTML = eyeClosedSVG;
                    visibilityBtn.style.transform = "scale(0.9)";
                }
                
                // Keep visible if currently hovered
                if (middleWrapper.matches(':hover')) {
                    visibilityBtn.style.opacity = "1";
                } else {
                    visibilityBtn.style.opacity = "0";
                }
            }
            updateVisibility();

            visibilityBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                saveSettingsPatch({ pipTimerVisible: !settings.pipTimerVisible });
                updateVisibility();
            });

            middleWrapper.appendChild(visibilityBtn);
            middleWrapper.appendChild(timerContainer);

            // Smart Ticket Timer Logic
            let pipTimerSeconds = 0;
            let pipTimerInterval = null;
            let lastTicketTimeStr = "00:00";
            let ticketCount = 0;
            let idleSeconds = 0;
            const IDLE_LIMIT = 180; // 3 minutes idle threshold

            function formatDuration(sec) {
                const m = Math.floor(sec / 60);
                const s = sec % 60;
                return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            }

            function updateTimerTooltip() {
                if (ticketCount > 0) {
                    timerContainer.title = `اضغط للتصفير | التكت السابق: ${lastTicketTimeStr} | إجمالي تكتات الجلسة: ${ticketCount}`;
                } else {
                    timerContainer.title = `اضغط لتصفير العداد | سيتم التصفير تلقائياً عند النسخ أو إنجاز التكت`;
                }
            }

            function updateTimerDisplay() {
                const m = Math.floor(pipTimerSeconds / 60);
                const s = pipTimerSeconds % 60;
                timerSpan.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                timerSpan.dataset.minutes = String(m);
                const currentTheme = getCurrentPipTheme();

                timerSpan.style.animation = "none";
                if (m >= 16) {
                    timerSpan.style.color = currentTheme.mode === 'light' ? "#B91C1C" : "#FB7185";
                    timerSpan.style.animation = "pipPulse 0.8s infinite ease-in-out"; // blink
                } else if (m >= 14) {
                    timerSpan.style.color = currentTheme.mode === 'light' ? "#DC2626" : "#FDA4AF";
                } else if (m >= 10) {
                    timerSpan.style.color = currentTheme.mode === 'light' ? "#A16207" : "#FACC15";
                } else if (m >= 7) {
                    timerSpan.style.color = currentTheme.mode === 'light' ? "#C2410C" : "#FB923C";
                } else {
                    timerSpan.style.color = currentTheme.accent;
                }
            }

            function resetSmartTicketTimer(reason = 'manual') {
                if (pipTimerSeconds > 1) {
                    lastTicketTimeStr = formatDuration(pipTimerSeconds);
                    ticketCount++;
                }
                pipTimerSeconds = 0;
                idleSeconds = 0;
                updateTimerDisplay();
                updateTimerTooltip();

                // Flash feedback pulse
                timerSpan.style.transform = "scale(1.18)";
                timerSpan.style.boxShadow = `0 0 12px ${getCurrentPipTheme().accent}99`;
                setTimeout(() => {
                    timerSpan.style.transform = "scale(1)";
                    timerSpan.style.boxShadow = "inset 0 1px 0 rgba(255,255,255,0.1)";
                }, 200);
            }

            // Click manual reset
            timerContainer.addEventListener("click", () => {
                resetSmartTicketTimer('manual');
            });

            // Smart Auto-Reset on Copy or Action in any window
            const handleSmartCopy = () => {
                resetSmartTicketTimer('copy');
            };

            window.addEventListener("copy", handleSmartCopy);
            if (pipWindow) {
                pipWindow.addEventListener("copy", handleSmartCopy);
            }

            // Listen to broad click events for copy buttons
            const handleGlobalClick = (e) => {
                const target = e.target.closest && e.target.closest('button, .copy-btn, .menu-item, [data-action="copy"]');
                if (target) {
                    const text = (target.innerText || '').toLowerCase();
                    if (text.includes('نسخ') || text.includes('copy') || target.classList.contains('copy-btn')) {
                        resetSmartTicketTimer('button');
                    }
                }
            };
            document.addEventListener('click', handleGlobalClick);

            // Listen for Ticket URL Navigation / Change events from Extension or SidePanel
            const handleTimerMessage = (e) => {
                if (e.data && (e.data.action === "resetTicketTimer" || e.data.action === "ticketUrlChanged")) {
                    resetSmartTicketTimer(e.data.reason || "url_changed");
                }
            };
            window.addEventListener("message", handleTimerMessage);

            let handleRuntimeTimerMessage = null;
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
                handleRuntimeTimerMessage = (msg) => {
                    if (msg && msg.action === "resetTicketTimer") {
                        resetSmartTicketTimer(msg.reason || "url_changed");
                    }
                };
                chrome.runtime.onMessage.addListener(handleRuntimeTimerMessage);
            }


            // Inactivity Reset Listener
            const resetIdle = () => {
                idleSeconds = 0;
            };
            window.addEventListener("mousemove", resetIdle);
            window.addEventListener("keydown", resetIdle);

            // Main 1s Timer Loop with Inactivity Pause
            pipTimerInterval = setInterval(() => {
                idleSeconds++;
                if (idleSeconds < IDLE_LIMIT) {
                    pipTimerSeconds++;
                    updateTimerDisplay();
                } else {
                    // Dim timer to signal auto-pause during idle
                    timerSpan.style.opacity = "0.4";
                }
            }, 1000);


            headerBar.appendChild(titleWrapper);
            headerBar.appendChild(middleWrapper);
            headerBar.appendChild(minBtn);
            body.appendChild(headerBar);
            syncThemeToPipWindow();

            // Iframe
            const iframe = pipWindow.document.createElement("iframe");
            iframe.id = "pipIframe";
            const pipUrl = new URL(window.location.href);
            pipUrl.searchParams.set('fastToolkitPip', '1');
            iframe.src = pipUrl.toString();
            iframe.name = 'fast-toolkit-pip';
            iframe.style.width = "100%";
            iframe.style.height = "calc(100% - 38px)";
            iframe.style.border = "none";
            iframe.style.margin = "0";
            iframe.style.padding = "0";
            iframe.style.display = "block";
            iframe.style.backgroundColor = "transparent";
            iframe.setAttribute("allow", "clipboard-read; clipboard-write; camera; microphone; geolocation");
            iframe.addEventListener('load', () => {
                try {
                    for (const key of AI_SECRET_KEYS) {
                        const value = getAiSecret(key);
                        if (value) iframe.contentWindow.sessionStorage.setItem(key, value);
                    }
                } catch (e) { }
            });
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
                        <span style="font-size: 14px; line-height: 1;">+</span>
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
                        <span style="font-size: 14px; line-height: 1;">−</span>
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
                clearInterval(pipTimerInterval);
                window.removeEventListener("copy", handleSmartCopy);
                pipWindow.removeEventListener("copy", handleSmartCopy);
                document.removeEventListener("click", handleGlobalClick);
                window.removeEventListener("message", handleTimerMessage);
                window.removeEventListener("mousemove", resetIdle);
                window.removeEventListener("keydown", resetIdle);
                if (handleRuntimeTimerMessage && typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.removeListener) {
                    chrome.runtime.onMessage.removeListener(handleRuntimeTimerMessage);
                }
                window.activePipWindow = null;
                hideOpenerOverlay();
            });

        } catch (error) {
            console.error("Failed to open Picture-in-Picture window:", error);
        } finally {
            pipLaunchInProgress = false;
        }
    }

    function getFullWindowIcon(isFull) {
        return isFull
            ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5"/></svg>'
            : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5"/></svg>';
    }

    function toggleFullWindow() {
        const isFull = document.documentElement.classList.contains('full-window');
        setFullWindowState(!isFull);
    }

    function setFullWindowState(enable) {
        if (enable) {
            document.documentElement.classList.add('full-window');
            if (document.body) document.body.classList.add('full-window');
            document.querySelectorAll('.container, .app-container').forEach(el => el.classList.add('full-window'));
            localStorage.setItem('fastToolkit_full_window', 'true');
        } else {
            document.documentElement.classList.remove('full-window');
            if (document.body) document.body.classList.remove('full-window');
            document.querySelectorAll('.container, .app-container').forEach(el => el.classList.remove('full-window'));
            localStorage.setItem('fastToolkit_full_window', 'false');
        }

        const fullBtn = document.getElementById('fullWindowBtn');
        if (fullBtn) {
            fullBtn.innerHTML = getFullWindowIcon(enable);
            fullBtn.title = enable ? 'إلغاء التكبير (الحجم العادي)' : 'تكبير الصفحة (لوضع تقسيم العرض)';
            fullBtn.setAttribute('aria-label', fullBtn.title);
        }
    }
    window.toggleFullWindow = toggleFullWindow;
    window.launchPip = launchPip;
    window.closePip = function() {
        if (window.activePipWindow) {
            window.activePipWindow.close();
            // Let the pagehide event handler do the cleanup (it clears activePipWindow and overlay)
        }
    };

    function injectPipBtn() {
        if (document.getElementById('pipBtn') || document.getElementById('pipFloatingBtn')) return;
        if (window.self !== window.top) return;

        // 1. Check for index.html header actions wrapper
        const headerActions = document.querySelector('.header-actions');
        if (headerActions) {
            const btn = document.createElement('button');
            btn.id = 'pipBtn';
            btn.className = 'header-icon-btn';
            btn.title = 'تشغيل النافذة العائمة (PiP)';
            btn.setAttribute('aria-label', 'تشغيل النافذة العائمة');
            btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><rect x="11" y="11" width="10" height="10" rx="2"/></svg>';
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
            btn.setAttribute('aria-label', 'تشغيل النافذة العائمة');
            btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><rect x="11" y="11" width="10" height="10" rx="2"/></svg>';
            btn.style.display = 'inline-flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.cursor = 'pointer';
            
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                launchPip();
            });

            let fullBtn = null;
            if (window.location.pathname.includes('settings.html')) {
                fullBtn = document.createElement('button');
                fullBtn.id = 'fullWindowBtn';
                fullBtn.className = 'nav-btn';
                const isFull = document.documentElement.classList.contains('full-window');
                fullBtn.title = isFull ? 'إلغاء التكبير (الحجم العادي)' : 'تكبير الصفحة (لوضع تقسيم العرض)';
                fullBtn.setAttribute('aria-label', fullBtn.title);
                fullBtn.innerHTML = getFullWindowIcon(isFull);
                fullBtn.style.fontSize = '12px';
                fullBtn.style.display = 'inline-flex';
                fullBtn.style.alignItems = 'center';
                fullBtn.style.justifyContent = 'center';
                fullBtn.style.cursor = 'pointer';
                fullBtn.style.marginLeft = '4px';
                fullBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    toggleFullWindow();
                });
            }

            if (headerRight) {
                // In note.html, place it before the search icon or home icon
                btn.style.marginLeft = '4px';
                if (fullBtn) headerRight.insertBefore(fullBtn, headerRight.firstChild);
                headerRight.insertBefore(btn, headerRight.firstChild);
            } else if (header) {
                // In sticky.html/simah.html, insert after the first child (the back button)
                if (fullBtn) header.insertBefore(fullBtn, header.firstChild.nextSibling);
                header.insertBefore(btn, header.firstChild.nextSibling);
            }
            return;
        }

        // 3. Fallback: FAB (Floating Action Button) in the viewport
        const btn = document.createElement('button');
        btn.id = 'pipFloatingBtn';
        btn.type = 'button';
        btn.title = 'تشغيل النافذة العائمة (PiP)';
        btn.setAttribute('aria-label', 'تشغيل النافذة العائمة');
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
        const path = window.location.pathname;
        const isIndexPage = path.endsWith('index.html') || path.endsWith('/') || path === '' || !path.includes('.html');
        const isFull = isIndexPage || localStorage.getItem('fastToolkit_full_window') !== 'false';
        if (isFull) {
            document.documentElement.classList.add('full-window');
            if (document.body) document.body.classList.add('full-window');
        }
        document.querySelectorAll('.container, .app-container').forEach(el => {
            el.classList.add('expanded');
            if (isFull) el.classList.add('full-window');
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
                    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
                        .then(registration => {
                            registration.update().catch(() => { });
                            console.log('Fast Toolkit: PWA Service Worker registered');
                        })
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
                navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
                    .then(registration => {
                        registration.update().catch(() => { });
                        console.log('Fast Toolkit: PWA Service Worker registered');
                    })
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
        document.documentElement.classList.add('expanded');
        document.querySelectorAll('.container, .app-container').forEach(el => {
            el.classList.add('ready');
            el.classList.add('expanded');
        });
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
            nav6: "6",
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
        } else if (pressedKey === shortcuts.nav6.toLowerCase()) {
            if (!window.location.pathname.endsWith('date.html')) window.location.href = 'date.html';
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
        const newMode = settings.mode === 'dark' ? 'light' : 'dark';
        saveSettingsPatch({ mode: newMode, themePreset: 'custom' });

        // إظهار toast سريع
        const toast = document.createElement('div');
        toast.textContent = newMode === 'dark' ? 'تم تفعيل الوضع الداكن' : 'تم تفعيل الوضع الفاتح';
        toast.style.cssText = `
            position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
            background:var(--app-elevated);color:var(--text);padding:7px 14px;border-radius:999px;
            font-size:11px;font-weight:bold;z-index:999999;
            border:1px solid var(--app-border);box-shadow:0 12px 30px rgba(0,0,0,.24);
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
                    { key: shortcuts.nav6, desc: 'Date Helper' },
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
