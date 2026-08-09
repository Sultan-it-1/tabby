(function (root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.FastToolkitThemes = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const DEFAULT_PRESET_ID = 'cloud';

    const PRESETS = Object.freeze({
        midnight: Object.freeze({
            id: 'midnight',
            name: 'ليلي',
            description: 'بنفسجي هادئ بعمق كحلي',
            mode: 'dark',
            accent: '#8B7CFF',
            secondary: '#22D3EE',
            background: '#070A12',
            shell: '#0A0F1B',
            panel: '#0E1524',
            surface: '#141D2F',
            elevated: '#1A2539',
            border: '#27344B',
            text: '#F5F7FC',
            muted: '#96A2B8'
        }),
        aurora: Object.freeze({
            id: 'aurora',
            name: 'أورورا',
            description: 'أخضر زمردي بلمسة بنفسجية',
            mode: 'dark',
            accent: '#34D399',
            secondary: '#A78BFA',
            background: '#06100D',
            shell: '#091713',
            panel: '#0D201A',
            surface: '#122A22',
            elevated: '#18372D',
            border: '#285044',
            text: '#F2FBF7',
            muted: '#91ADA2'
        }),
        ocean: Object.freeze({
            id: 'ocean',
            name: 'محيط',
            description: 'أزرق عميق وواضح',
            mode: 'dark',
            accent: '#38BDF8',
            secondary: '#2DD4BF',
            background: '#05101A',
            shell: '#081824',
            panel: '#0C2232',
            surface: '#112D40',
            elevated: '#173A50',
            border: '#28536A',
            text: '#F1F9FD',
            muted: '#90ACBC'
        }),
        graphite: Object.freeze({
            id: 'graphite',
            name: 'جرافيت',
            description: 'محايد فاخر بلمسة ذهبية',
            mode: 'dark',
            accent: '#F5B942',
            secondary: '#A3E635',
            background: '#0A0B0D',
            shell: '#101114',
            panel: '#17191D',
            surface: '#1E2126',
            elevated: '#282C32',
            border: '#3B4048',
            text: '#FAFAF8',
            muted: '#A6A7A3'
        }),
        cloud: Object.freeze({
            id: 'cloud',
            name: 'نهاري',
            description: 'فاتح ونظيف للعمل الطويل',
            mode: 'light',
            accent: '#4F46E5',
            secondary: '#0891B2',
            background: '#E9EEF6',
            shell: '#F2F5FA',
            panel: '#F8FAFD',
            surface: '#FFFFFF',
            elevated: '#F2F5FA',
            border: '#D6DEEA',
            text: '#172033',
            muted: '#69758A'
        })
    });

    function isValidHexColor(value) {
        return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
    }

    function normalizeHex(value, fallback) {
        return isValidHexColor(value) ? value.toUpperCase() : fallback;
    }

    function hexToRgb(hex) {
        const normalized = normalizeHex(hex, '#000000');
        return {
            r: parseInt(normalized.slice(1, 3), 16),
            g: parseInt(normalized.slice(3, 5), 16),
            b: parseInt(normalized.slice(5, 7), 16)
        };
    }

    function rgbToHex(rgb) {
        const channel = value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
        return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`.toUpperCase();
    }

    function mixColors(first, second, secondWeight) {
        const a = hexToRgb(first);
        const b = hexToRgb(second);
        const weight = Math.max(0, Math.min(1, Number(secondWeight) || 0));
        return rgbToHex({
            r: a.r * (1 - weight) + b.r * weight,
            g: a.g * (1 - weight) + b.g * weight,
            b: a.b * (1 - weight) + b.b * weight
        });
    }

    function relativeLuminance(hex) {
        const rgb = hexToRgb(hex);
        const linearize = channel => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
    }

    function contrastRatio(first, second) {
        const firstLuminance = relativeLuminance(first);
        const secondLuminance = relativeLuminance(second);
        const lighter = Math.max(firstLuminance, secondLuminance);
        const darker = Math.min(firstLuminance, secondLuminance);
        return (lighter + 0.05) / (darker + 0.05);
    }

    function getContrastColor(hex) {
        const dark = '#07100C';
        const light = '#FFFFFF';
        return contrastRatio(hex, dark) >= contrastRatio(hex, light) ? dark : light;
    }

    function ensureContrast(foreground, background, minimumRatio) {
        const safeForeground = normalizeHex(foreground, PRESETS[DEFAULT_PRESET_ID].accent);
        const safeBackground = normalizeHex(background, '#FFFFFF');
        const targetRatio = Math.max(1, Number(minimumRatio) || 3);
        if (contrastRatio(safeForeground, safeBackground) >= targetRatio) return safeForeground;

        const target = relativeLuminance(safeBackground) > 0.5 ? '#000000' : '#FFFFFF';
        for (let step = 1; step <= 20; step += 1) {
            const candidate = mixColors(safeForeground, target, step / 20);
            if (contrastRatio(candidate, safeBackground) >= targetRatio) return candidate;
        }
        return target;
    }

    function deriveCustomTheme(mode, color) {
        const safeMode = mode === 'light' ? 'light' : 'dark';
        const requestedAccent = normalizeHex(color, PRESETS[DEFAULT_PRESET_ID].accent);

        if (safeMode === 'light') {
            const accent = ensureContrast(requestedAccent, '#FFFFFF', 3);
            return {
                id: 'custom',
                name: 'مخصص',
                description: 'ألوانك الخاصة',
                mode: 'light',
                accent,
                secondary: mixColors(accent, '#0891B2', 0.45),
                background: mixColors('#EEF2F7', accent, 0.035),
                shell: mixColors('#F5F7FB', accent, 0.025),
                panel: mixColors('#FAFBFD', accent, 0.018),
                surface: '#FFFFFF',
                elevated: mixColors('#F3F5F9', accent, 0.035),
                border: mixColors('#D8E0EA', accent, 0.12),
                text: '#172033',
                muted: '#69758A'
            };
        }

        const surface = mixColors('#171D27', requestedAccent, 0.075);
        const accent = ensureContrast(requestedAccent, surface, 3);

        return {
            id: 'custom',
            name: 'مخصص',
            description: 'ألوانك الخاصة',
            mode: 'dark',
            accent,
            secondary: mixColors(accent, '#22D3EE', 0.5),
            background: mixColors('#07090D', accent, 0.035),
            shell: mixColors('#0B0E14', accent, 0.055),
            panel: mixColors('#10151E', accent, 0.07),
            surface,
            elevated: mixColors('#202733', accent, 0.08),
            border: mixColors('#313A48', accent, 0.14),
            text: '#F5F7FC',
            muted: '#9BA6B8'
        };
    }

    function normalizeSettings(value) {
        const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        const requestedPreset = typeof source.themePreset === 'string' ? source.themePreset : '';

        if (PRESETS[requestedPreset]) {
            const preset = PRESETS[requestedPreset];
            return {
                ...source,
                themePreset: preset.id,
                mode: preset.mode,
                themeColor: preset.accent
            };
        }

        const mode = source.mode === 'light' || source.mode === 'dark' ? source.mode : null;
        const color = isValidHexColor(source.themeColor) ? source.themeColor.toUpperCase() : null;
        const isLegacyDefault = !requestedPreset && mode === 'light' && ['#00E676', '#00FF00', '#007AFF'].includes(color);

        if ((!mode && !color) || isLegacyDefault) {
            const preset = PRESETS[DEFAULT_PRESET_ID];
            return {
                ...source,
                themePreset: preset.id,
                mode: preset.mode,
                themeColor: preset.accent
            };
        }

        return {
            ...source,
            themePreset: 'custom',
            mode: mode || 'dark',
            themeColor: color || PRESETS[DEFAULT_PRESET_ID].accent
        };
    }

    function resolveTheme(settings) {
        const normalized = normalizeSettings(settings);
        return PRESETS[normalized.themePreset] || deriveCustomTheme(normalized.mode, normalized.themeColor);
    }

    function getPresetList() {
        return Object.values(PRESETS);
    }

    return Object.freeze({
        DEFAULT_PRESET_ID,
        PRESETS,
        isValidHexColor,
        hexToRgb,
        mixColors,
        relativeLuminance,
        contrastRatio,
        getContrastColor,
        ensureContrast,
        deriveCustomTheme,
        normalizeSettings,
        resolveTheme,
        getPresetList
    });
});
