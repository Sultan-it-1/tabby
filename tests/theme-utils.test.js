const test = require('node:test');
const assert = require('node:assert/strict');
const themes = require('../theme-utils');

test('ships five valid, uniquely named theme presets', () => {
    const presets = themes.getPresetList();
    assert.equal(presets.length, 5);
    assert.equal(new Set(presets.map(preset => preset.id)).size, presets.length);

    for (const preset of presets) {
        assert.equal(themes.resolveTheme({ themePreset: preset.id }), preset);
        assert.ok(themes.isValidHexColor(preset.accent));
        assert.ok(['light', 'dark'].includes(preset.mode));
    }
});

test('migrates an empty or legacy default theme to Midnight', () => {
    assert.equal(themes.normalizeSettings({}).themePreset, themes.DEFAULT_PRESET_ID);
    assert.deepEqual(
        themes.normalizeSettings({ mode: 'light', themeColor: '#00e676', pipTimerVisible: false }),
        {
            mode: themes.PRESETS.midnight.mode,
            themeColor: themes.PRESETS.midnight.accent,
            pipTimerVisible: false,
            themePreset: 'midnight'
        }
    );
});

test('preserves unrelated settings while normalizing a custom theme', () => {
    const normalized = themes.normalizeSettings({
        themePreset: 'custom',
        mode: 'light',
        themeColor: '#f43f5e',
        pipTimerVisible: false,
        futureSetting: 'keep-me'
    });

    assert.equal(normalized.themePreset, 'custom');
    assert.equal(normalized.mode, 'light');
    assert.equal(normalized.themeColor, '#F43F5E');
    assert.equal(normalized.pipTimerVisible, false);
    assert.equal(normalized.futureSetting, 'keep-me');
});

test('custom accents retain at least 3:1 contrast against their surface', () => {
    const light = themes.deriveCustomTheme('light', '#FFFFFF');
    const dark = themes.deriveCustomTheme('dark', '#000000');

    assert.ok(themes.contrastRatio(light.accent, light.surface) >= 3);
    assert.ok(themes.contrastRatio(dark.accent, dark.surface) >= 3);
});

test('button contrast always chooses the more legible light or dark text', () => {
    for (const color of ['#8B7CFF', '#34D399', '#38BDF8', '#F5B942', '#4F46E5', '#777777']) {
        const chosen = themes.getContrastColor(color);
        const alternative = chosen === '#FFFFFF' ? '#07100C' : '#FFFFFF';
        assert.ok(themes.contrastRatio(color, chosen) >= themes.contrastRatio(color, alternative));
    }
});
