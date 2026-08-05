const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('card utilities load before the card runtime and are available offline', () => {
    const html = read('card.html');
    const serviceWorker = read('sw.js');
    const utilsIndex = html.indexOf('card-utils.js');
    const runtimeIndex = html.indexOf('card.js');

    assert.ok(utilsIndex >= 0, 'card.html must load card-utils.js');
    assert.ok(runtimeIndex > utilsIndex, 'card-utils.js must load before card.js');
    assert.match(serviceWorker, /["']\.\/card-utils\.js["']/);
});

test('site, package, production extension, and dev extension versions match', () => {
    const packageVersion = JSON.parse(read('package.json')).version;
    const productionVersion = JSON.parse(read('chrome-extension/manifest.json')).version;
    const devVersion = JSON.parse(read('chrome-extension-dev/manifest.json')).version;
    const siteVersion = read('version.js').match(/APP_VERSION\s*=\s*["']([^"']+)/)?.[1];

    assert.equal(siteVersion, packageVersion);
    assert.equal(productionVersion, packageVersion);
    assert.equal(devVersion, packageVersion);
});

test('production extension embeds the canonical HTTPS site', () => {
    const sidePanel = read('chrome-extension/sidepanel.html');
    const launcher = read('chrome-extension/launcher.js');
    assert.match(sidePanel, /https:\/\/tabby\.sultanops\.com\//);
    assert.match(launcher, /fastToolkitPip=1/);
    assert.match(launcher, /fast-toolkit-pip/);
});

test('inline HTML scripts and JSON manifests remain syntactically valid', () => {
    const roots = ['.', 'chrome-extension', 'chrome-extension-dev'];
    let inlineScriptCount = 0;

    for (const relativeRoot of roots) {
        const directory = path.join(root, relativeRoot);
        for (const name of fs.readdirSync(directory).filter(file => file.endsWith('.html'))) {
            const source = fs.readFileSync(path.join(directory, name), 'utf8');
            const inlineScriptPattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
            let match;
            while ((match = inlineScriptPattern.exec(source))) {
                assert.doesNotThrow(() => new Function(match[1]), `${relativeRoot}/${name} contains invalid inline JavaScript`);
                inlineScriptCount++;
            }
        }
    }

    assert.ok(inlineScriptCount > 0);
    for (const manifest of ['manifest.json', 'chrome-extension/manifest.json', 'chrome-extension-dev/manifest.json']) {
        assert.doesNotThrow(() => JSON.parse(read(manifest)), `${manifest} must contain valid JSON`);
    }
});
