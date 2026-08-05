const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const themedPages = [
    'index.html',
    'settings.html',
    'note.html',
    'simah.html',
    'card.html',
    'sticky.html',
    'cia.html',
    'date.html',
    'download.html'
];

test('every themed page loads theme utilities before the shared settings runtime', () => {
    for (const page of themedPages) {
        const html = read(page);
        const themeIndex = html.indexOf('theme-utils.js');
        const settingsIndex = html.indexOf('settings.js');
        assert.ok(themeIndex >= 0, `${page} must load theme-utils.js`);
        assert.ok(settingsIndex > themeIndex, `${page} must load theme-utils.js before settings.js`);
    }
});

test('the theme runtime and stylesheet are available offline despite cache-busting queries', () => {
    const worker = read('sw.js');
    assert.match(worker, /["']\.\/theme-utils\.js["']/);
    assert.match(worker, /["']\.\/theme\.css["']/);
    assert.match(worker, /caches\.match\(event\.request,\s*\{\s*ignoreSearch:\s*true\s*\}\)/);
    assert.match(worker, /cache\.put\(canonicalRequest,\s*networkResponse\)/);
});

test('settings exposes accessible presets and live shared theme updates', () => {
    const settingsHtml = read('settings.html');
    const settingsRuntime = read('settings.js');
    assert.match(settingsHtml, /id="themePresetGrid"[^>]+role="radiogroup"/);
    assert.match(settingsHtml, /role',\s*'radio'/);
    assert.match(settingsHtml, /fasttoolkit:settingschange/);
    assert.match(settingsHtml, /themePresetGrid\.addEventListener\('keydown'/);
    assert.match(settingsRuntime, /window\.fastToolkitSaveSettings/);
    assert.match(settingsRuntime, /window\.addEventListener\('storage'/);
    assert.match(settingsRuntime, /chrome\.runtime\.onMessage\.removeListener\(handleRuntimeTimerMessage\)/);
});

test('modern theme CSS preserves semantic and special-purpose button states', () => {
    const css = read('theme.css');
    assert.match(css, /button:not\(:where\(\.color-btn, \.mock-action-btn, \.explorer-btn, \.explorer-close,/);
    assert.match(css, /\.toast\.error/);
    assert.match(css, /button\.danger/);
    assert.match(css, /#pipOpenerOverlay\.visible/);
});
