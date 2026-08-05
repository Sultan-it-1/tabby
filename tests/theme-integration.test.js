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

test('every themed page blocks first paint on the final theme stylesheet', () => {
    const version = JSON.parse(read('package.json')).version;
    const expectedLink = `<link id="fast-toolkit-theme-styles" rel="stylesheet" href="theme.css?v=${version}">`;

    for (const page of themedPages) {
        const html = read(page);
        const matches = html.match(/id="fast-toolkit-theme-styles"/g) || [];
        assert.equal(matches.length, 1, `${page} must contain one blocking theme stylesheet`);
        assert.ok(html.includes(expectedLink), `${page} must cache-bust the blocking theme stylesheet`);
        assert.ok(html.indexOf(expectedLink) < html.indexOf('</head>'), `${page} must load the theme before body paint`);
        assert.ok(html.indexOf(expectedLink) > html.lastIndexOf('</style>'), `${page} must keep theme overrides last in the cascade`);
    }
});

test('the shared settings runtime never reorders an existing theme stylesheet', () => {
    const settingsRuntime = read('settings.js');
    assert.match(settingsRuntime, /if \(document\.getElementById\('fast-toolkit-theme-styles'\)\) return;/);
    assert.doesNotMatch(settingsRuntime, /themeStylesheet\.parentNode === document\.head/);
});

test('the shared theme hides unstable first-frame layout and always reveals it safely', () => {
    const settingsRuntime = read('settings.js');
    const css = read('theme.css');
    assert.match(settingsRuntime, /root\.classList\.add\('modern-ui', 'ui-booting'\)/);
    assert.match(settingsRuntime, /window\.addEventListener\('load', revealToolkitUi/);
    assert.match(settingsRuntime, /setTimeout\(finishToolkitUiBoot, 2500\)/);
    assert.match(settingsRuntime, /root\.classList\.remove\('ui-booting'\)/);
    assert.match(css, /html\.modern-ui\.ui-booting body\s*\{[^}]*visibility:\s*hidden/s);
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
