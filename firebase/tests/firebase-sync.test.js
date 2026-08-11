'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ENGINE_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'firebase-config.js'), 'utf8');

function createStorage(initial = {}) {
    const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); },
        clear() { values.clear(); }
    };
}

function createSnapshot(records, changes = []) {
    const docs = [...records.values()].map(record => ({ data: () => ({ ...record }) }));
    return {
        empty: docs.length === 0,
        metadata: { fromCache: false },
        forEach(callback) { docs.forEach(callback); },
        docChanges() { return changes; }
    };
}

function createHarness({ local = {}, remoteByUid = {}, legacyByUid = {}, conflictResolution = null } = {}) {
    const localStorage = createStorage(local);
    const sessionStorage = createStorage();
    const remote = new Map();
    const legacy = new Map(Object.entries(legacyByUid));
    const listeners = new Map();
    const writes = [];
    const profileWrites = [];
    const recoveryWrites = [];
    const recoveryManifests = [];
    const conflictPrompts = [];
    let authCallback = null;
    let unsubscribeCount = 0;

    Object.entries(remoteByUid).forEach(([uid, values]) => {
        remote.set(uid, new Map(Object.entries(values).map(([key, value]) => [key, {
            key,
            value,
            deleted: false,
            sensitive: key === 'simah_ai_key' || key === 'simah_groq_key',
            clientUpdatedAt: 1,
            updatedAt: 1
        }])));
    });

    function recordsFor(uid) {
        if (!remote.has(uid)) remote.set(uid, new Map());
        return remote.get(uid);
    }

    function dataCollection(uid) {
        return {
            get() { return Promise.resolve(createSnapshot(recordsFor(uid))); },
            doc(documentId) {
                return {
                    set(record) {
                        recordsFor(uid).set(record.key, { ...record });
                        writes.push({ uid, documentId, ...record });
                        const listener = listeners.get(uid);
                        if (listener) {
                            listener(createSnapshot(recordsFor(uid), [{
                                type: 'modified',
                                doc: { data: () => ({ ...record }) }
                            }]));
                        }
                        return Promise.resolve();
                    }
                };
            },
            onSnapshot(options, next) {
                listeners.set(uid, next);
                return () => {
                    unsubscribeCount += 1;
                    listeners.delete(uid);
                };
            }
        };
    }

    const db = {
        enablePersistence() { return Promise.resolve(); },
        collection(name) {
            assert.equal(name, 'users');
            return {
                doc(uid) {
                    return {
                        collection(collectionName) {
                            if (collectionName === 'data') return dataCollection(uid);
                            if (collectionName === 'recovery') {
                                return {
                                    doc(snapshotId) {
                                        return {
                                            set(record) {
                                                recoveryManifests.push({ uid, snapshotId, record });
                                                return Promise.resolve();
                                            },
                                            collection(valuesName) {
                                                assert.equal(valuesName, 'values');
                                                return {
                                                    doc(documentId) {
                                                        return {
                                                            set(record) {
                                                                recoveryWrites.push({ uid, snapshotId, documentId, record });
                                                                return Promise.resolve();
                                                            }
                                                        };
                                                    }
                                                };
                                            }
                                        };
                                    }
                                };
                            }
                            throw new Error(`Unexpected collection: ${collectionName}`);
                        },
                        get() {
                            const data = legacy.get(uid);
                            return Promise.resolve({ exists: Boolean(data), data: () => data || {} });
                        },
                        set(value) {
                            profileWrites.push({ uid, value });
                            return Promise.resolve();
                        }
                    };
                }
            };
        }
    };

    function firestore() { return db; }
    firestore.FieldValue = { serverTimestamp: () => 123, delete: () => ({ deletedField: true }) };

    const auth = {
        getRedirectResult: () => Promise.resolve(null),
        onAuthStateChanged(callback) { authCallback = callback; },
        signInWithPopup: () => Promise.resolve(),
        signInWithRedirect: () => Promise.resolve(),
        signOut: () => Promise.resolve()
    };
    function authFactory() { return auth; }
    authFactory.GoogleAuthProvider = function GoogleAuthProvider() {
        this.setCustomParameters = () => { };
    };

    const eventListeners = new Map();
    const windowObject = {
        __FAST_TOOLKIT_DISABLE_FIREBASE_AUTO_INIT__: true,
        location: { href: 'https://example.test/' },
        addEventListener(type, callback) {
            if (!eventListeners.has(type)) eventListeners.set(type, new Set());
            eventListeners.get(type).add(callback);
        },
        removeEventListener(type, callback) {
            if (eventListeners.has(type)) eventListeners.get(type).delete(callback);
        },
        dispatchEvent(event) {
            const callbacks = eventListeners.get(event.type) || [];
            callbacks.forEach(callback => callback(event));
            return true;
        }
    };
    if (conflictResolution) {
        windowObject.fastToolkitResolveLoginConflict = details => {
            conflictPrompts.push(details);
            return Promise.resolve(conflictResolution);
        };
    }

    function StorageEvent(type, init = {}) { this.type = type; Object.assign(this, init); }
    function CustomEvent(type, init = {}) { this.type = type; Object.assign(this, init); }

    const context = vm.createContext({
        window: windowObject,
        localStorage,
        sessionStorage,
        firebase: {
            apps: [],
            initializeApp() { this.apps.push({}); },
            firestore,
            auth: authFactory
        },
        navigator: { onLine: true },
        StorageEvent,
        CustomEvent,
        setTimeout,
        clearTimeout,
        setInterval: () => 1,
        clearInterval: () => { },
        encodeURIComponent,
        decodeURIComponent,
        escape,
        atob: value => Buffer.from(value, 'base64').toString('binary'),
        alert: () => { },
        console: { log() { }, warn() { }, error() { } }
    });
    windowObject.window = windowObject;
    windowObject.localStorage = localStorage;
    windowObject.sessionStorage = sessionStorage;
    windowObject.CustomEvent = CustomEvent;
    windowObject.StorageEvent = StorageEvent;

    vm.runInContext(ENGINE_SOURCE, context, { filename: 'firebase-config.js' });

    return {
        Engine: windowObject.FastToolkitFirebaseSync,
        localStorage,
        sessionStorage,
        db,
        writes,
        profileWrites,
        recoveryWrites,
        recoveryManifests,
        conflictPrompts,
        remote,
        getAuthCallback: () => authCallback,
        getUnsubscribeCount: () => unsubscribeCount
    };
}

function user(uid) {
    return { uid, email: `${uid}@example.test`, displayName: uid, photoURL: '' };
}

function wait(ms = 25) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

test('cloud data wins during login after saving a recovery copy of a differing local value', async () => {
    const harness = createHarness({
        local: { cardScannerData: 'local-stale' },
        remoteByUid: { alpha: { cardScannerData: 'cloud-current' } },
        conflictResolution: 'cloud'
    });
    const sync = new harness.Engine();
    await harness.getAuthCallback()(user('alpha'));
    await wait();

    assert.equal(harness.localStorage.getItem('cardScannerData'), 'cloud-current');
    assert.equal(harness.writes.some(write => write.key === 'cardScannerData'), false);
    assert.equal(harness.recoveryWrites.length, 1);
    assert.equal(harness.recoveryManifests.length, 1);
    assert.equal(harness.recoveryManifests[0].record.keyCount, 1);
    assert.equal(harness.recoveryWrites[0].record.localValue, 'local-stale');
    assert.equal(harness.recoveryWrites[0].record.cloudValue, 'cloud-current');
    assert.equal(harness.conflictPrompts.length, 1);
    sync.destroy();
});

test('recommended login merge preserves unique and overlapping structured data from both sides', async () => {
    const localValue = JSON.stringify({
        cards: [{ id: 'shared', localEdit: true }, { id: 'local-only', value: 2 }],
        preferences: { localSetting: true }
    });
    const cloudValue = JSON.stringify({
        cards: [{ id: 'shared', cloudEdit: true }, { id: 'cloud-only', value: 1 }],
        preferences: { cloudSetting: true }
    });
    const harness = createHarness({
        local: { copyGridDataV6: localValue },
        remoteByUid: { alpha: { copyGridDataV6: cloudValue } },
        conflictResolution: 'merge'
    });
    const sync = new harness.Engine();
    await harness.getAuthCallback()(user('alpha'));
    await wait(50);

    const merged = JSON.parse(harness.localStorage.getItem('copyGridDataV6'));
    assert.deepEqual(JSON.parse(JSON.stringify(merged.preferences)), { cloudSetting: true, localSetting: true });
    assert.deepEqual(
        merged.cards.map(card => card.id),
        ['shared', 'cloud-only', 'local-only']
    );
    assert.deepEqual(JSON.parse(JSON.stringify(merged.cards[0])), {
        id: 'shared', cloudEdit: true, localEdit: true
    });
    const mergedWrite = harness.writes.find(write => write.key === 'copyGridDataV6');
    assert.ok(mergedWrite);
    assert.deepEqual(JSON.parse(mergedWrite.value), merged);
    assert.equal(harness.recoveryWrites.length, 1);
    assert.equal(harness.recoveryWrites[0].record.localValue, localValue);
    assert.equal(harness.recoveryWrites[0].record.cloudValue, cloudValue);
    sync.destroy();
});

test('interactive return to the same account can keep and upload signed-out device work', async () => {
    const harness = createHarness({
        local: {
            fastToolkit_firebase_last_uid: 'alpha',
            cardScannerData: 'new-device-work'
        },
        remoteByUid: { alpha: { cardScannerData: 'older-cloud-work' } },
        conflictResolution: 'local'
    });
    harness.sessionStorage.setItem('fastToolkit_interactive_login_pending', 'true');
    const sync = new harness.Engine();
    await harness.getAuthCallback()(user('alpha'));
    await wait(50);

    assert.equal(harness.localStorage.getItem('cardScannerData'), 'new-device-work');
    assert.equal(harness.writes.some(write => (
        write.key === 'cardScannerData' && write.value === 'new-device-work'
    )), true);
    assert.equal(harness.conflictPrompts.length, 1);
    assert.equal(harness.sessionStorage.getItem('fastToolkit_interactive_login_pending'), null);
    sync.destroy();
});

test('persisted account startup uses cloud without prompting on an unchanged device cache', async () => {
    const harness = createHarness({
        local: {
            fastToolkit_firebase_last_uid: 'alpha',
            cardScannerData: 'stale-cache'
        },
        remoteByUid: { alpha: { cardScannerData: 'current-cloud' } },
        conflictResolution: 'local'
    });
    const sync = new harness.Engine();
    await harness.getAuthCallback()(user('alpha'));
    await wait();

    assert.equal(harness.localStorage.getItem('cardScannerData'), 'current-cloud');
    assert.equal(harness.conflictPrompts.length, 0);
    assert.equal(harness.writes.some(write => write.value === 'stale-cache'), false);
    sync.destroy();
});

test('an empty device restores cloud data without showing a conflict choice', async () => {
    const harness = createHarness({
        remoteByUid: { alpha: { stickyNotesData: '[{"id":"cloud-note"}]' } },
        conflictResolution: 'local'
    });
    const sync = new harness.Engine();
    await harness.getAuthCallback()(user('alpha'));
    await wait();

    assert.equal(harness.localStorage.getItem('stickyNotesData'), '[{"id":"cloud-note"}]');
    assert.equal(harness.conflictPrompts.length, 0);
    sync.destroy();
});

test('a new empty account receives existing legacy local data once', async () => {
    const harness = createHarness({ local: { copyGridDataV6: '{"c1":{"a":1}}' } });
    const sync = new harness.Engine();
    await harness.getAuthCallback()(user('new-user'));
    await wait(50);

    const write = harness.writes.find(item => item.key === 'copyGridDataV6');
    assert.ok(write);
    assert.equal(write.uid, 'new-user');
    assert.equal(write.value, '{"c1":{"a":1}}');
    sync.destroy();
});

test('legacy single-document data is migrated while the old payload remains a recovery archive', async () => {
    const harness = createHarness({
        legacyByUid: {
            alpha: { data: { fastToolkitCIA_v4: [{ id: 'legacy-card' }] } }
        }
    });
    const sync = new harness.Engine();
    await harness.getAuthCallback()(user('alpha'));
    await wait(50);

    assert.equal(harness.localStorage.getItem('fastToolkitCIA_v4'), '[{"id":"legacy-card"}]');
    assert.equal(harness.writes.some(write => write.key === 'fastToolkitCIA_v4'), true);
    assert.equal(harness.profileWrites.some(write => write.value.schemaVersion === 2 && !('data' in write.value)), true);
    sync.destroy();
});

test('clearing browser storage restores the complete account from both current and legacy cloud data', async () => {
    const harness = createHarness({
        remoteByUid: { alpha: { cardScannerData: 'current-card-data' } },
        legacyByUid: {
            alpha: { data: { copyGridDataV6: '{"from":"legacy"}', simah_ai_key: 'legacy-key' } }
        }
    });
    const sync = new harness.Engine();
    await harness.getAuthCallback()(user('alpha'));
    await wait(50);

    assert.equal(harness.localStorage.getItem('cardScannerData'), 'current-card-data');
    assert.equal(harness.localStorage.getItem('copyGridDataV6'), '{"from":"legacy"}');
    assert.equal(harness.localStorage.getItem('simah_ai_key'), 'legacy-key');
    assert.equal(harness.sessionStorage.getItem('simah_ai_key'), 'legacy-key');
    assert.equal(harness.writes.some(write => write.key === 'copyGridDataV6'), true);
    assert.equal(harness.writes.some(write => write.key === 'simah_ai_key'), true);
    sync.destroy();
});

test('a cloud deletion tombstone is not resurrected from the legacy archive or browser mirror', async () => {
    const harness = createHarness({
        local: { cardScannerData: 'stale-local' },
        remoteByUid: { alpha: { cardScannerData: 'placeholder' } },
        legacyByUid: { alpha: { data: { cardScannerData: 'legacy-value' } } }
    });
    harness.remote.get('alpha').set('cardScannerData', {
        key: 'cardScannerData', value: '', deleted: true, sensitive: false,
        writerVersion: 3, deleteRequestId: 'trusted-delete-1', clientUpdatedAt: 1, updatedAt: 1
    });
    const sync = new harness.Engine();
    await harness.getAuthCallback()(user('alpha'));
    await wait();

    assert.equal(harness.localStorage.getItem('cardScannerData'), null);
    assert.equal(harness.writes.some(write => write.key === 'cardScannerData' && write.value === 'legacy-value'), false);
    sync.destroy();
});

test('an unversioned tombstone from a cached client is recovered from the immutable legacy archive', async () => {
    const harness = createHarness({
        remoteByUid: { alpha: { cardScannerData: 'placeholder' } },
        legacyByUid: { alpha: { data: { cardScannerData: 'archived-card-data' } } }
    });
    harness.remote.get('alpha').set('cardScannerData', {
        key: 'cardScannerData', value: '', deleted: true, sensitive: false, clientUpdatedAt: 1, updatedAt: 1
    });
    const sync = new harness.Engine();
    await harness.getAuthCallback()(user('alpha'));
    await wait(50);

    assert.equal(harness.localStorage.getItem('cardScannerData'), 'archived-card-data');
    const repairWrite = harness.writes.find(write => write.key === 'cardScannerData');
    assert.ok(repairWrite);
    assert.equal(repairWrite.value, 'archived-card-data');
    assert.equal(repairWrite.deleted, false);
    assert.equal(repairWrite.writerVersion, 3);
    sync.destroy();
});

test('debouncing is independent per key and does not drop adjacent writes', async () => {
    const harness = createHarness();
    const sync = new harness.Engine();
    sync.db = harness.db;
    sync.user = user('alpha');
    sync.sessionUid = 'alpha';
    sync.sessionReady = true;

    sync.saveCloudData('cardScannerData', 'one');
    sync.saveCloudData('copyGridDataV6', 'two');
    sync.saveCloudData('fastToolkitCIA_v4', 'three');
    await wait(450);

    const keys = harness.writes.map(item => item.key).sort();
    assert.deepEqual(keys, ['cardScannerData', 'copyGridDataV6', 'fastToolkitCIA_v4']);
    sync.destroy();
});

test('legacy encoded AI keys are decoded and kept in the cloud-backed browser mirror', async () => {
    const encoded = `enc_v1:${Buffer.from('real-secret', 'utf8').toString('base64')}`;
    const harness = createHarness({ remoteByUid: { alpha: { simah_ai_key: encoded } } });
    const sync = new harness.Engine();
    await harness.getAuthCallback()(user('alpha'));
    await wait();

    assert.equal(harness.sessionStorage.getItem('simah_ai_key'), 'real-secret');
    assert.equal(harness.localStorage.getItem('simah_ai_key'), 'real-secret');

    sync.saveCloudData('simah_ai_key', 'new-secret');
    await wait(450);
    const secretWrite = harness.writes.find(item => item.key === 'simah_ai_key');
    assert.equal(secretWrite.value, 'new-secret');
    sync.destroy();
});

test('switching accounts unsubscribes the old listener and does not copy old data', async () => {
    const harness = createHarness({
        remoteByUid: {
            alpha: { cardScannerData: 'alpha-data' },
            beta: { cardScannerData: 'beta-data' }
        }
    });
    const sync = new harness.Engine();
    await harness.getAuthCallback()(user('alpha'));
    await wait();
    assert.equal(harness.localStorage.getItem('cardScannerData'), 'alpha-data');

    await harness.getAuthCallback()(user('beta'));
    await wait();
    assert.equal(harness.localStorage.getItem('cardScannerData'), 'beta-data');
    assert.ok(harness.getUnsubscribeCount() >= 1);
    assert.equal(harness.writes.some(write => write.uid === 'beta' && write.value === 'alpha-data'), false);
    sync.destroy();
});

test("signing out never clears the user's cloud-backed browser mirror", async () => {
    const harness = createHarness({
        remoteByUid: { alpha: { cardScannerData: 'alpha-data', simah_ai_key: 'secret' } }
    });
    const sync = new harness.Engine();
    await harness.getAuthCallback()(user('alpha'));
    await wait();
    await harness.getAuthCallback()(null);

    assert.equal(harness.localStorage.getItem('cardScannerData'), 'alpha-data');
    assert.equal(harness.sessionStorage.getItem('simah_ai_key'), 'secret');
    assert.equal(harness.localStorage.getItem('fastToolkit_firebase_last_uid'), 'alpha');
    sync.destroy();
});

test('direct localStorage changes are discovered by the automatic monitor', async () => {
    const harness = createHarness();
    const sync = new harness.Engine();
    sync.db = harness.db;
    sync.user = user('alpha');
    sync.sessionUid = 'alpha';
    sync.sessionReady = true;

    harness.localStorage.setItem('card_popup_enabled', 'false');
    sync.scanLocalChanges();
    await wait(450);

    assert.equal(harness.writes.some(write => write.key === 'card_popup_enabled' && write.value === 'false'), true);
    sync.destroy();
});

test('a bulk browser-storage reset restores the local mirror and never uploads tombstones', async () => {
    const harness = createHarness({
        local: {
            cardScannerData: 'cards',
            copyGridDataV6: 'grid',
            fastToolkitCIA_v4: 'cia',
            stickyNotesData: 'notes'
        }
    });
    const sync = new harness.Engine();
    sync.db = harness.db;
    sync.user = user('alpha');
    sync.sessionUid = 'alpha';
    sync.sessionReady = true;

    harness.localStorage.clear();
    sync.scanLocalChanges();
    await wait(450);

    assert.equal(harness.localStorage.getItem('cardScannerData'), 'cards');
    assert.equal(harness.localStorage.getItem('copyGridDataV6'), 'grid');
    assert.equal(harness.localStorage.getItem('fastToolkitCIA_v4'), 'cia');
    assert.equal(harness.localStorage.getItem('stickyNotesData'), 'notes');
    assert.equal(harness.writes.some(write => write.deleted), false);
    sync.destroy();
});

test('a single raw cache eviction is restored and cannot delete cloud data', async () => {
    const harness = createHarness({ local: { cardScannerData: 'cards' } });
    const sync = new harness.Engine();
    sync.db = harness.db;
    sync.user = user('alpha');
    sync.sessionUid = 'alpha';
    sync.sessionReady = true;

    harness.localStorage.removeItem('cardScannerData');
    sync.scanLocalChanges();
    await wait(450);

    assert.equal(harness.localStorage.getItem('cardScannerData'), 'cards');
    assert.equal(harness.writes.length, 0);
    sync.destroy();
});

test('an explicit cloud deletion includes a one-time authenticated delete request', async () => {
    const harness = createHarness({ local: { cardScannerData: 'cards' } });
    const sync = new harness.Engine();
    sync.db = harness.db;
    sync.user = user('alpha');
    sync.sessionUid = 'alpha';
    sync.sessionReady = true;

    sync.removeCloudData('cardScannerData');
    await wait(450);

    const deletion = harness.writes.find(write => write.key === 'cardScannerData');
    assert.ok(deletion);
    assert.equal(deletion.deleted, true);
    assert.equal(deletion.writerVersion, 3);
    assert.ok(deletion.deleteRequestId.length > 0);
    sync.destroy();
});

test('the dirty journal survives navigation and is replayed over an older cloud value', async () => {
    const harness = createHarness({
        local: {
            fastToolkit_firebase_last_uid: 'alpha',
            card_popup_enabled: 'true'
        },
        remoteByUid: { alpha: { card_popup_enabled: 'true' } }
    });

    const firstPage = new harness.Engine();
    firstPage.db = harness.db;
    firstPage.user = user('alpha');
    firstPage.sessionUid = 'alpha';
    firstPage.sessionReady = true;
    harness.localStorage.setItem('card_popup_enabled', 'false');
    firstPage.scanLocalChanges();
    firstPage.destroy();

    const secondPage = new harness.Engine();
    await harness.getAuthCallback()(user('alpha'));
    await wait(450);

    assert.equal(harness.localStorage.getItem('card_popup_enabled'), 'false');
    assert.equal(harness.writes.some(write => write.key === 'card_popup_enabled' && write.value === 'false'), true);
    secondPage.destroy();
});
