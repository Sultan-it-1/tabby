'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cardUtils = require('../card-utils.js');
const themes = require('../theme-utils.js');

test('card utilities normalize Arabic digits and reject incomplete AI output', () => {
    assert.equal(cardUtils.normalizeDigits('١٢٣٤'), '1234');
    assert.equal(cardUtils.normalizeCard('**** ١٢٣٤'), '1234');
    const parsed = cardUtils.parseAIResultText('المبلغ 10 فقط', new Date('2026-08-11T12:00:00'));
    assert.equal(parsed.valid, false);
});

test('theme settings always resolve to a valid preset or custom theme', () => {
    const normalized = themes.normalizeSettings({ mode: 'dark', themeColor: '#34d399' });
    assert.equal(normalized.mode, 'dark');
    assert.equal(normalized.themeColor, '#34D399');
    assert.ok(themes.resolveTheme(normalized));
});

test('Firestore rules are scoped to the authenticated UID and reject broad access', () => {
    const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    assert.match(rules, /request\.auth\.uid\s*==\s*userId/);
    assert.doesNotMatch(rules, /allow\s+read,\s*write:\s*if\s+request\.auth\s*!=\s*null\s*;/);
    assert.match(rules, /allow\s+read,\s*write:\s*if\s+false/);
});

test('Firestore rules protect the legacy data map from cached clients', () => {
    const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    assert.match(rules, /function legacyDataIsProtected\(\)/);
    assert.match(rules, /request\.resource\.data\.data\s*==\s*resource\.data\.data/);
    assert.match(rules, /!hasLegacyData\(request\.resource\.data\)/);
    assert.match(rules, /request\.resource\.data\.schemaVersion\s*>=\s*3/);
    assert.match(rules, /request\.resource\.data\.legacyDataRemovedAt\s*==\s*request\.time/);
    assert.match(rules, /match \/recovery\/\{recoveryId\}/);
});

test('Firestore rules reject unversioned and replayed cloud tombstones', () => {
    const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    assert.match(rules, /function hasAuthenticatedDeleteRequest\(\)/);
    assert.match(rules, /writerVersion\s*>=\s*3/);
    assert.match(rules, /deleteRequestId\s*!=\s*resource\.data\.deleteRequestId/);
    assert.match(rules, /allow delete:\s*if false/);
});

test('Firebase deployment config points at the checked-in security rules', () => {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'firebase.json'), 'utf8'));
    assert.equal(config.firestore.rules, 'firestore.rules');
});

test('every Firebase page uses the current cache-busting app version', () => {
    const projectRoot = path.join(__dirname, '..');
    const appVersion = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')).version;
    fs.readdirSync(projectRoot)
        .filter(file => file.endsWith('.html'))
        .forEach(file => {
            const html = fs.readFileSync(path.join(projectRoot, file), 'utf8');
            if (!html.includes('firebase-config.js')) return;
            const escapedVersion = appVersion.replace(/\./g, '\\.');
            assert.match(html, new RegExp(`firebase-config\\.js\\?v=${escapedVersion}["']`), file);
        });
});

test('a fresh CIA page does not persist an empty edit before cloud bootstrap', () => {
    const ciaScript = fs.readFileSync(path.join(__dirname, '..', 'cia.js'), 'utf8');
    const loadFunction = ciaScript.match(/function loadCIAData\(\)\s*\{[\s\S]*?\n\}/);
    assert.ok(loadFunction, 'loadCIAData should exist');
    const freshBrowserBranch = loadFunction[0].match(/else\s*\{[\s\S]*?\}/);
    assert.ok(freshBrowserBranch, 'loadCIAData should handle missing browser data');
    assert.doesNotMatch(freshBrowserBranch[0], /saveCIAData\s*\(/);
});

test('settings do not expose the unused trusted-device Firestore cache toggle', () => {
    const settings = fs.readFileSync(path.join(__dirname, '..', 'settings.html'), 'utf8');
    assert.doesNotMatch(settings, /settingsTrustedDevice/);
    assert.doesNotMatch(settings, /fastToolkit_trusted_device/);
    assert.doesNotMatch(settings, /حفظ نسخة Firestore للعمل دون اتصال/);
});

test('note experience no longer tracks or displays the legacy manual-backup counter', () => {
    const noteHtml = fs.readFileSync(path.join(__dirname, '..', 'note.html'), 'utf8');
    const noteScript = fs.readFileSync(path.join(__dirname, '..', 'note.js'), 'utf8');
    const firebaseSync = fs.readFileSync(path.join(__dirname, '..', 'firebase-config.js'), 'utf8');
    const settings = fs.readFileSync(path.join(__dirname, '..', 'settings.html'), 'utf8');
    const productionSources = [noteHtml, noteScript, firebaseSync, settings].join('\n');
    assert.doesNotMatch(productionSources, /backupDot|backup-dot|unbackedUpCountV6|unbackedUpCount/);
});

test('CRM ticket tracker is exposed from home only and cached for offline loading', () => {
    const firebaseRoot = path.join(__dirname, '..');
    const index = fs.readFileSync(path.join(firebaseRoot, 'index.html'), 'utf8');
    assert.match(index, /id="advancedToolsBtn"/);
    assert.match(index, /crm-ticket-tracker\.js/);

    fs.readdirSync(firebaseRoot)
        .filter(file => file.endsWith('.html') && file !== 'index.html')
        .forEach(file => {
            const html = fs.readFileSync(path.join(firebaseRoot, file), 'utf8');
            assert.doesNotMatch(html, /advancedToolsBtn|crm-ticket-tracker\.js/, file);
        });

    const serviceWorker = fs.readFileSync(path.join(firebaseRoot, 'sw.js'), 'utf8');
    assert.match(serviceWorker, /\.\/crm-ticket-tracker\.js/);
    assert.match(serviceWorker, /\.\/crm-profile-analytics\.js/);
});
