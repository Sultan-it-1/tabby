const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backup = require('../drive-backup-utils.js');

function createStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        get length() { return values.size; },
        key(index) { return [...values.keys()][index] ?? null; },
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(String(key), String(value)); },
        removeItem(key) { values.delete(key); }
    };
}

test('complete backup captures future local data while excluding AI keys and auth internals', () => {
    const storage = createStorage({
        copyGridDataV6: '{"notes":true}',
        futureToolkitFeature: 'future-data',
        simah_ai_provider: 'gemini',
        simah_ai_key: 'gemini-secret',
        simah_groq_key: 'groq-secret',
        future_gemini_api_key: 'future-secret',
        gDriveAccessToken: 'drive-token',
        'firebase:authUser:example': 'auth-token',
        'fastToolkit_sync_dirty_v1:user': 'dirty-journal',
        fastToolkit_firebase_last_uid: 'user-id'
    });

    const payload = backup.createBackupPayload(storage, {
        appVersion: '2.4.0',
        now: new Date('2026-08-11T12:00:00.000Z')
    });

    assert.equal(payload.schema, backup.BACKUP_SCHEMA);
    assert.equal(payload.schemaVersion, 2);
    assert.equal(payload.createdAt, '2026-08-11T12:00:00.000Z');
    assert.equal(payload.appVersion, '2.4.0');
    assert.deepEqual({ ...payload.entries }, {
        copyGridDataV6: '{"notes":true}',
        futureToolkitFeature: 'future-data',
        simah_ai_provider: 'gemini'
    });
    assert.equal(payload.protection.aiKeysExcluded, true);
    assert.equal(payload.protection.authSessionExcluded, true);
});

test('AI preferences remain eligible while present and future provider secrets are blocked', () => {
    assert.equal(backup.isAiSecretKey('simah_ai_pref'), false);
    assert.equal(backup.isAiSecretKey('simah_ai_provider'), false);
    assert.equal(backup.isAiSecretKey('simah_ai_key'), true);
    assert.equal(backup.isAiSecretKey('simah_groq_key'), true);
    assert.equal(backup.isAiSecretKey('openai_api_key'), true);
    assert.equal(backup.isAiSecretKey('future-claude-key'), true);
});

test('restore merges data without clearing existing values or replacing AI keys', () => {
    const storage = createStorage({
        simah_ai_key: 'current-gemini-key',
        simah_groq_key: 'current-groq-key',
        existingLocalOnly: 'keep-me'
    });
    const payload = {
        schema: backup.BACKUP_SCHEMA,
        schemaVersion: 2,
        createdAt: '2026-08-11T12:00:00.000Z',
        entries: {
            copyGridDataV6: '{"restored":true}',
            simah_ai_key: 'backup-secret',
            simah_groq_key: 'backup-secret',
            'firebase:authUser:example': 'backup-auth'
        }
    };

    const result = backup.restoreStorageEntries(storage, payload);

    assert.equal(storage.getItem('copyGridDataV6'), '{"restored":true}');
    assert.equal(storage.getItem('existingLocalOnly'), 'keep-me');
    assert.equal(storage.getItem('simah_ai_key'), 'current-gemini-key');
    assert.equal(storage.getItem('simah_groq_key'), 'current-groq-key');
    assert.equal(storage.getItem('firebase:authUser:example'), null);
    assert.deepEqual(result.restoredKeys, ['copyGridDataV6']);
    assert.equal(result.legacy, false);
});

test('restore accepts the previous flat Drive backup format but still rejects embedded secrets', () => {
    const storage = createStorage({ simah_ai_key: 'current-key' });
    const result = backup.restoreStorageEntries(storage, {
        stickyNotesData: '[{"id":"legacy"}]',
        simah_ai_key: 'old-leaked-key'
    });

    assert.equal(storage.getItem('stickyNotesData'), '[{"id":"legacy"}]');
    assert.equal(storage.getItem('simah_ai_key'), 'current-key');
    assert.equal(result.legacy, true);
});

test('settings expose an explicit local-first Drive option and require upload consent', () => {
    const root = path.join(__dirname, '..');
    const settings = fs.readFileSync(path.join(root, 'settings.html'), 'utf8');
    const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

    assert.match(settings, /النسخ والاسترداد من Google Drive/);
    assert.match(settings, /اختياري · لمحبي الوكال/);
    assert.match(settings, /id="driveBackupConsent"/);
    assert.match(settings, /id="driveBackupBtn" disabled/);
    assert.match(settings, /مفاتيح Gemini أو Groq أو أي مفتاح AI/);
    assert.match(settings, /drive-backup-utils\.js/);
    assert.match(settings, /accounts\.google\.com\/gsi\/client/);
    assert.doesNotMatch(settings, /const BACKUP_KEYS/);
    assert.match(serviceWorker, /\.\/drive-backup-utils\.js/);

    const inlineScripts = [...settings.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
    inlineScripts.forEach((match, index) => {
        assert.doesNotThrow(() => new Function(match[1]), `inline settings script ${index + 1} must parse`);
    });
});
