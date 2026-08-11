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

function createHarness({ local = {}, remoteByUid = {}, legacyByUid = {} } = {}) {
    const localStorage = createStorage(local);
    const sessionStorage = createStorage();
    const remote = new Map();
    const legacy = new Map(Object.entries(legacyByUid));
    const listeners = new Map();
    const writes = [];
    const profileWrites = [];
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
                        writes.push({ uid, key: record.key, value: record.value, deleted: record.deleted, documentId });
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
        clearPersistence() { return Promise.resolve(); },
        enablePersistence() { return Promise.resolve(); },
        collection(name) {
            assert.equal(name, 'users');
            return {
                doc(uid) {
                    return {
                        collection(collectionName) {
                            assert.equal(collectionName, 'data');
                            return dataCollection(uid);
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

test('cloud data wins during login and local stale data is not uploaded', async () => {
    const harness = createHarness({
        local: { cardScannerData: 'local-stale' },
        remoteByUid: { alpha: { cardScannerData: 'cloud-current' } }
    });
    const sync = new harness.Engine();
    await harness.getAuthCallback()(user('alpha'));
    await wait();

    assert.equal(harness.localStorage.getItem('cardScannerData'), 'cloud-current');
    assert.equal(harness.writes.some(write => write.key === 'cardScannerData'), false);
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

test('legacy single-document data is migrated and the old payload is removed', async () => {
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
    assert.equal(harness.profileWrites.some(write => write.value.data && write.value.data.deletedField), true);
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

test('legacy encoded AI keys are decoded into session storage and never persisted locally', async () => {
    const encoded = `enc_v1:${Buffer.from('real-secret', 'utf8').toString('base64')}`;
    const harness = createHarness({ remoteByUid: { alpha: { simah_ai_key: encoded } } });
    const sync = new harness.Engine();
    await harness.getAuthCallback()(user('alpha'));
    await wait();

    assert.equal(harness.sessionStorage.getItem('simah_ai_key'), 'real-secret');
    assert.equal(harness.localStorage.getItem('simah_ai_key'), null);

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

test('signing out clears account data and session-only secrets', async () => {
    const harness = createHarness({
        remoteByUid: { alpha: { cardScannerData: 'alpha-data', simah_ai_key: 'secret' } }
    });
    const sync = new harness.Engine();
    await harness.getAuthCallback()(user('alpha'));
    await wait();
    await harness.getAuthCallback()(null);

    assert.equal(harness.localStorage.getItem('cardScannerData'), null);
    assert.equal(harness.sessionStorage.getItem('simah_ai_key'), null);
    assert.equal(harness.localStorage.getItem('fastToolkit_firebase_last_uid'), null);
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
