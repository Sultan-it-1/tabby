// ==========================================
// FAST TOOLKIT - Firebase Core & Sync Engine
// ==========================================

const defaultFirebaseConfig = {
    apiKey: "AIzaSyCmYREiT_Wbd3gj5QZv5c1NBugSadU0l94",
    authDomain: "tabby-6f8e3.firebaseapp.com",
    projectId: "tabby-6f8e3",
    storageBucket: "tabby-6f8e3.firebasestorage.app",
    messagingSenderId: "239523497934",
    appId: "1:239523497934:web:0771528256dd047b030d9f"
};

const FAST_TOOLKIT_SYNC_KEYS = Object.freeze([
    'fastToolkitSettings',
    'fastToolkitShortcuts',
    'fastToolkitExpanded',
    'fastToolkit_full_window',
    'copyGridDataV6',
    'noteTabLabels',
    'unbackedUpCountV6',
    'quick_sticky_note',
    'stickyNotesData',
    'currentStickyNoteId',
    'cardScannerData',
    'cardScannerHistory',
    'checkout_action_mode',
    'cardLinkToggle',
    'card_popup_enabled',
    'tabbyInput_saved',
    'simahApprovedAccounts',
    'simahAccountsHistory',
    'simah_ai_provider',
    'simah_ai_pref',
    'simah_ai_key',
    'simah_groq_key',
    'simah_usage',
    'simah_voice_speed',
    'autoSyncGDrive',
    'fastToolkitCIA_v4'
]);

const FAST_TOOLKIT_SECRET_KEYS = new Set(['simah_ai_key', 'simah_groq_key']);
const FAST_TOOLKIT_LAST_UID_KEY = 'fastToolkit_firebase_last_uid';
const FAST_TOOLKIT_DIRTY_PREFIX = 'fastToolkit_sync_dirty_v1:';
const FAST_TOOLKIT_SAVE_DELAY = 350;
const FAST_TOOLKIT_MONITOR_DELAY = 500;

let customConfig = null;
try {
    const savedConfig = localStorage.getItem('fastToolkit_firebase_custom_config');
    if (savedConfig) customConfig = JSON.parse(savedConfig);
} catch (e) { }

const firebaseConfig = customConfig || defaultFirebaseConfig;

if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    try {
        firebase.initializeApp(firebaseConfig);
    } catch (e) {
        console.warn('Firebase initialization warning:', e);
    }
}

class FastToolkitFirebaseSync {
    constructor() {
        this.user = null;
        this.db = null;
        this.auth = null;
        this.sessionUid = null;
        this.sessionReady = false;
        this.isBootstrapping = false;
        this.isApplyingCloud = false;
        this.transitionId = 0;
        this.unsubscribeCloud = null;
        this.saveTimers = new Map();
        this.pendingPayloads = new Map();
        this.retryQueue = new Map();
        this.pendingLocalChanges = new Map();
        this.inFlightWrites = new Set();
        this.activeWrites = 0;
        this.userListeners = new Set();
        this.syncListeners = new Set();
        this.syncState = {
            status: 'connecting',
            pending: 0,
            lastSyncedAt: null,
            error: null
        };
        this.localShadow = this.captureManagedData();
        this.monitorTimer = null;
        this.boundStorageHandler = event => this.handleStorageEvent(event);
        this.boundOnlineHandler = () => this.retryFailedWrites();
        this.boundPageHideHandler = () => this.handlePageHide();
        this.boundVisibilityHandler = () => {
            if (typeof document !== 'undefined' && document.hidden) this.handlePageHide();
        };
        this.init();
    }

    init() {
        this.startLocalMonitor();

        if (typeof window !== 'undefined') {
            window.addEventListener('storage', this.boundStorageHandler);
            window.addEventListener('online', this.boundOnlineHandler);
            window.addEventListener('pagehide', this.boundPageHideHandler);
            if (typeof document !== 'undefined') {
                document.addEventListener('visibilitychange', this.boundVisibilityHandler);
            }
        }

        if (typeof firebase === 'undefined') {
            this.setSyncState('local');
            return;
        }

        try {
            this.auth = firebase.auth();
            this.db = firebase.firestore();
            this.configurePersistence();
        } catch (error) {
            console.warn('Firebase services are unavailable:', error);
            this.setSyncState('error', { error });
            return;
        }

        if (this.auth.getRedirectResult) {
            this.auth.getRedirectResult().catch(error => {
                if (error && error.code !== 'auth/no-auth-event') {
                    console.warn('Redirect sign-in check:', error);
                }
            });
        }

        this.auth.onAuthStateChanged(
            user => this.handleAuthStateChanged(user),
            error => this.setSyncState('error', { error })
        );
    }

    configurePersistence() {
        if (!this.db || typeof this.db.enablePersistence !== 'function') return;
        // Firestore's IndexedDB cache is the offline/performance layer. It is
        // deliberately never cleared based on a UI preference: the server is
        // still the source of truth, and the cache lets a signed-in user work
        // while temporarily offline.
        this.db.enablePersistence({ synchronizeTabs: true }).catch(error => {
            console.warn('Firestore persistence warning:', error && error.code);
        });
    }

    async handleAuthStateChanged(firebaseUser) {
        const transitionId = ++this.transitionId;

        if (!firebaseUser) {
            // Signing out must never erase the user's browser mirror. Their
            // data lives in Firestore and will be restored on their next sign-in.
            await this.deactivateSession();
            if (transitionId !== this.transitionId) return;
            this.user = null;
            this.notifyUserListeners();
            this.setSyncState('local', { pending: 0, error: null });
            return;
        }

        const nextUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || 'مستخدم بدون بريد',
            displayName: firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'مستخدم'),
            photoURL: firebaseUser.photoURL || ''
        };

        if (this.sessionUid === nextUser.uid && this.sessionReady) {
            this.user = nextUser;
            this.notifyUserListeners();
            return;
        }

        await this.activateSession(nextUser, transitionId);
    }

    async activateSession(nextUser, transitionId) {
        const previousUid = this.getLastActiveUid();
        const canUseCurrentLocalData = !previousUid || previousUid === nextUser.uid;
        const localCandidate = canUseCurrentLocalData ? this.captureManagedData() : new Map();

        // Capture anything the active page changed just before authentication
        // switched. The dirty journal keeps it associated with its original
        // account instead of copying it into the next account.
        this.scanLocalChanges();
        await this.deactivateSession();
        if (transitionId !== this.transitionId) return;

        this.user = nextUser;
        this.sessionUid = nextUser.uid;
        this.sessionReady = false;
        this.isBootstrapping = true;
        this.pendingLocalChanges.clear();
        this.setSyncState('syncing', { pending: 0, error: null });
        this.notifyUserListeners();

        let remoteResult;
        try {
            remoteResult = await this.loadRemoteData(nextUser.uid);
        } catch (error) {
            remoteResult = { values: new Map(), confirmedFromServer: false, error };
        }
        if (transitionId !== this.transitionId || this.sessionUid !== nextUser.uid) return;

        const legacyResult = await this.loadLegacyData(nextUser.uid);
        if (transitionId !== this.transitionId || this.sessionUid !== nextUser.uid) return;

        // Per-key documents are canonical. The old `data` map remains a
        // read-only recovery archive and fills only keys that have not yet
        // migrated. A local value fills a gap only when the server confirmed
        // that neither cloud representation has that key.
        const mergedResult = this.mergeAccountData({
            remoteValues: remoteResult.values,
            legacyValues: legacyResult.values,
            localValues: canUseCurrentLocalData ? localCandidate : new Map(),
            serverConfirmed: remoteResult.confirmedFromServer && legacyResult.confirmedFromServer
        });
        const valuesToApply = mergedResult.values;

        if (legacyResult.values.size > 0 && remoteResult.confirmedFromServer && legacyResult.confirmedFromServer) {
            const migrationSucceeded = await this.migrateLegacyData(nextUser.uid, legacyResult.values, remoteResult.values);
            if (!migrationSucceeded) {
                this.setSyncState('error', { error: new Error('Unable to safely migrate legacy cloud data.') });
            }
        }

        const conflicts = canUseCurrentLocalData
            ? this.findLocalConflicts(localCandidate, valuesToApply)
            : new Map();
        if (conflicts.size > 0) {
            const snapshotSaved = await this.writeRecoverySnapshot(nextUser.uid, conflicts, 'local-before-cloud-apply');
            if (!snapshotSaved) {
                // Never replace a differing local value unless its recovery
                // snapshot was safely stored in the account first.
                this.isBootstrapping = false;
                this.setSyncState('error', { error: new Error('Recovery backup failed; local data was kept unchanged.') });
                return;
            }
        }

        // Capture edits made while the server request was in flight before
        // replacing the shared local view with the account snapshot.
        this.scanLocalChanges();
        this.replaceManagedData(valuesToApply, {
            clearMissing: Boolean(previousUid && previousUid !== nextUser.uid)
        });
        this.setLastActiveUid(nextUser.uid);
        this.isBootstrapping = false;
        this.sessionReady = true;

        const editsDuringBootstrap = new Map(this.pendingLocalChanges);
        this.loadDirtyChanges(nextUser.uid).forEach((rawValue, key) => {
            editsDuringBootstrap.set(key, rawValue);
        });
        this.pendingLocalChanges.clear();
        editsDuringBootstrap.forEach((rawValue, key) => {
            this.writeLocalRaw(key, rawValue, { notify: true });
            this.scheduleCloudWrite(key, rawValue);
        });

        if (mergedResult.serverConfirmed) {
            mergedResult.localOnlyKeys.forEach(key => {
                const rawValue = valuesToApply.get(key);
                this.markDirty(key, rawValue, nextUser.uid);
                this.scheduleCloudWrite(key, rawValue, 0);
            });
        }

        this.listenToCloudData(nextUser.uid);
        await this.updateUserProfile(nextUser);

        if (!mergedResult.serverConfirmed) {
            this.setSyncState('offline', { error: remoteResult.error || legacyResult.error || null });
        } else if (this.getPendingCount() === 0) {
            this.setSyncState('synced', { error: null, lastSyncedAt: Date.now() });
        }
    }

    async deactivateSession() {
        this.sessionReady = false;
        this.isBootstrapping = false;
        this.stopCloudListener();
        this.cancelPendingWrites();
        this.sessionUid = null;

    }

    notifyUserListeners() {
        this.userListeners.forEach(callback => {
            try { callback(this.user); } catch (e) { }
        });
    }

    onUserChange(callback) {
        if (typeof callback !== 'function') return () => { };
        this.userListeners.add(callback);
        callback(this.user);
        return () => this.userListeners.delete(callback);
    }

    setSyncState(status, patch = {}) {
        this.syncState = {
            ...this.syncState,
            ...patch,
            status,
            pending: patch.pending !== undefined ? patch.pending : this.getPendingCount()
        };
        this.syncListeners.forEach(callback => {
            try { callback({ ...this.syncState }); } catch (e) { }
        });
    }

    onSyncStateChange(callback) {
        if (typeof callback !== 'function') return () => { };
        this.syncListeners.add(callback);
        callback({ ...this.syncState });
        return () => this.syncListeners.delete(callback);
    }

    getPendingCount() {
        return this.pendingPayloads.size + this.retryQueue.size + this.inFlightWrites.size;
    }

    dirtyStorageKey(uid) {
        return `${FAST_TOOLKIT_DIRTY_PREFIX}${uid}`;
    }

    loadDirtyChanges(uid = this.sessionUid) {
        const values = new Map();
        if (!uid) return values;
        try {
            const parsed = JSON.parse(localStorage.getItem(this.dirtyStorageKey(uid)) || '{}');
            const entries = parsed && parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {};
            Object.entries(entries).forEach(([key, entry]) => {
                if (!FAST_TOOLKIT_SYNC_KEYS.includes(key)) return;
                values.set(key, entry && entry.deleted ? null : String(entry && entry.value !== undefined ? entry.value : ''));
            });
        } catch (e) { }
        return values;
    }

    markDirty(key, rawValue, uid = this.sessionUid) {
        if (!uid) return;
        try {
            const storageKey = this.dirtyStorageKey(uid);
            const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
            const entries = parsed && parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {};
            entries[key] = {
                value: rawValue === null ? '' : rawValue,
                deleted: rawValue === null,
                changedAt: Date.now()
            };
            localStorage.setItem(storageKey, JSON.stringify({ entries }));
        } catch (e) { }
    }

    clearDirty(key, rawValue, uid = this.sessionUid) {
        if (!uid) return;
        try {
            const storageKey = this.dirtyStorageKey(uid);
            const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
            const entries = parsed && parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {};
            const entry = entries[key];
            if (!entry) return;
            const entryValue = entry.deleted ? null : String(entry.value);
            if (entryValue !== rawValue) return;
            delete entries[key];
            if (Object.keys(entries).length) localStorage.setItem(storageKey, JSON.stringify({ entries }));
            else localStorage.removeItem(storageKey);
        } catch (e) { }
    }

    getLastActiveUid() {
        try { return localStorage.getItem(FAST_TOOLKIT_LAST_UID_KEY) || ''; }
        catch (e) { return ''; }
    }

    setLastActiveUid(uid) {
        try { localStorage.setItem(FAST_TOOLKIT_LAST_UID_KEY, uid); } catch (e) { }
    }

    clearLastActiveUid() {
        try {
            localStorage.removeItem(FAST_TOOLKIT_LAST_UID_KEY);
            localStorage.removeItem('fastToolkit_firebase_user');
        } catch (e) { }
    }

    dataCollection(uid = this.sessionUid) {
        return this.db.collection('users').doc(uid).collection('data');
    }

    recoveryCollection(uid, snapshotId) {
        return this.db.collection('users').doc(uid).collection('recovery').doc(snapshotId).collection('values');
    }

    keyDocumentId(key) {
        return encodeURIComponent(key).replace(/\./g, '%2E');
    }

    async loadRemoteData(uid) {
        const collection = this.dataCollection(uid);
        try {
            const snapshot = await collection.get({ source: 'server' });
            return {
                values: this.valuesFromSnapshot(snapshot),
                confirmedFromServer: true,
                error: null
            };
        } catch (serverError) {
            try {
                const snapshot = await collection.get({ source: 'cache' });
                return {
                    values: this.valuesFromSnapshot(snapshot),
                    confirmedFromServer: false,
                    error: serverError
                };
            } catch (cacheError) {
                return {
                    values: new Map(),
                    confirmedFromServer: false,
                    error: serverError || cacheError
                };
            }
        }
    }

    valuesFromSnapshot(snapshot) {
        const values = new Map();
        if (!snapshot || typeof snapshot.forEach !== 'function') return values;

        snapshot.forEach(documentSnapshot => {
            const record = documentSnapshot.data ? documentSnapshot.data() : null;
            if (!record || !record.key || !FAST_TOOLKIT_SYNC_KEYS.includes(record.key)) return;
            values.set(record.key, record.deleted ? null : this.normalizeCloudRaw(record.key, record.value));
        });
        return values;
    }

    async loadLegacyData(uid) {
        const values = new Map();
        let confirmedFromServer = false;
        let documentSnapshot = null;
        let error = null;

        try {
            documentSnapshot = await this.db.collection('users').doc(uid).get({ source: 'server' });
            confirmedFromServer = true;
        } catch (serverError) {
            error = serverError;
            try {
                documentSnapshot = await this.db.collection('users').doc(uid).get({ source: 'cache' });
            } catch (e) {
                return { values, confirmedFromServer: false, error: serverError || e };
            }
        }

        if (documentSnapshot && documentSnapshot.exists) {
            const legacyPayload = documentSnapshot.data() && documentSnapshot.data().data;
            if (legacyPayload && typeof legacyPayload === 'object') {
                Object.entries(legacyPayload).forEach(([key, value]) => {
                    if (!FAST_TOOLKIT_SYNC_KEYS.includes(key)) return;
                    values.set(key, this.normalizeCloudRaw(key, value));
                });
            }
        }
        return { values, confirmedFromServer, error };
    }

    mergeAccountData({ remoteValues, legacyValues, localValues, serverConfirmed }) {
        const values = new Map();
        const localOnlyKeys = new Set();

        // A tombstone in /data is intentional and must also prevent the old
        // archive or browser mirror from bringing that key back.
        remoteValues.forEach((rawValue, key) => values.set(key, rawValue));
        legacyValues.forEach((rawValue, key) => {
            if (!values.has(key)) values.set(key, rawValue);
        });
        localValues.forEach((rawValue, key) => {
            if (values.has(key)) return;
            values.set(key, rawValue);
            if (serverConfirmed) localOnlyKeys.add(key);
        });
        return { values, localOnlyKeys, serverConfirmed };
    }

    findLocalConflicts(localValues, cloudValues) {
        const conflicts = new Map();
        localValues.forEach((localValue, key) => {
            if (!cloudValues.has(key)) return;
            const cloudValue = cloudValues.get(key);
            if (localValue !== cloudValue) {
                conflicts.set(key, {
                    localValue,
                    cloudValue,
                    capturedAt: Date.now()
                });
            }
        });
        return conflicts;
    }

    async writeRecoverySnapshot(uid, entries, reason) {
        if (!this.db || !uid || !entries || entries.size === 0) return true;
        const snapshotId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const writes = [];
        entries.forEach((entry, key) => {
            writes.push(this.recoveryCollection(uid, snapshotId).doc(this.keyDocumentId(key)).set({
                key,
                localValue: entry.localValue === null ? '' : entry.localValue,
                localDeleted: entry.localValue === null,
                cloudValue: entry.cloudValue === null ? '' : entry.cloudValue,
                cloudDeleted: entry.cloudValue === null,
                reason,
                capturedAt: entry.capturedAt || Date.now(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }));
        });
        const results = await Promise.allSettled(writes);
        return results.every(result => result.status === 'fulfilled');
    }

    async migrateLegacyData(uid, legacyValues, remoteValues = new Map()) {
        const writes = [];
        legacyValues.forEach((rawValue, key) => {
            // The newer per-key document wins whenever it already exists,
            // including an explicit deletion tombstone.
            if (!remoteValues.has(key)) writes.push(this.writeDocument(uid, key, rawValue));
        });
        const results = await Promise.allSettled(writes);
        if (results.some(result => result.status === 'rejected')) return false;
        try {
            await this.db.collection('users').doc(uid).set({
                schemaVersion: 2,
                migratedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return true;
        } catch (e) {
            return false;
        }
    }

    normalizeCloudRaw(key, value) {
        let rawValue;
        if (typeof value === 'string') rawValue = value;
        else if (value === undefined || value === null) rawValue = '';
        else rawValue = JSON.stringify(value);

        if (FAST_TOOLKIT_SECRET_KEYS.has(key) && rawValue.startsWith('enc_v1:')) {
            return this.decodeLegacySecret(rawValue);
        }
        return rawValue;
    }

    decodeLegacySecret(value) {
        try {
            return decodeURIComponent(escape(atob(value.slice(7))));
        } catch (e) {
            return value;
        }
    }

    serializeValue(value) {
        if (value === undefined || value === null) return '';
        if (typeof value === 'string') return value;
        try { return JSON.stringify(value); }
        catch (e) { return String(value); }
    }

    readLocalRaw(key) {
        try {
            if (FAST_TOOLKIT_SECRET_KEYS.has(key)) {
                const sessionValue = sessionStorage.getItem(key);
                if (sessionValue !== null) return sessionValue;
                const localValue = localStorage.getItem(key);
                if (localValue !== null) {
                    // Keep the compatibility mirror. The cloud copy is the
                    // authority after sign-in; this only lets legacy modules
                    // and a signed-out session retain the entered key.
                    sessionStorage.setItem(key, localValue);
                    return localValue;
                }
                return null;
            }
            return localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    }

    captureManagedData() {
        const values = new Map();
        FAST_TOOLKIT_SYNC_KEYS.forEach(key => {
            const rawValue = this.readLocalRaw(key);
            if (rawValue !== null) values.set(key, rawValue);
        });
        return values;
    }

    writeLocalRaw(key, rawValue, { notify = false } = {}) {
        if (!FAST_TOOLKIT_SYNC_KEYS.includes(key)) return;
        const oldValue = this.readLocalRaw(key);

        this.isApplyingCloud = true;
        try {
            if (FAST_TOOLKIT_SECRET_KEYS.has(key)) {
                if (rawValue === null) {
                    localStorage.removeItem(key);
                    sessionStorage.removeItem(key);
                } else {
                    localStorage.setItem(key, rawValue);
                    sessionStorage.setItem(key, rawValue);
                }
            } else if (rawValue === null) {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, rawValue);
            }
            if (rawValue === null) this.localShadow.delete(key);
            else this.localShadow.set(key, rawValue);
        } finally {
            this.isApplyingCloud = false;
        }

        if (notify && oldValue !== rawValue) {
            this.notifyLocalConsumers(key, oldValue, rawValue);
        }
    }

    replaceManagedData(values, { clearMissing = false } = {}) {
        const changedKeys = [];
        FAST_TOOLKIT_SYNC_KEYS.forEach(key => {
            if (!values.has(key) && !clearMissing) return;
            const nextValue = values.has(key) ? values.get(key) : null;
            const oldValue = this.readLocalRaw(key);
            if (oldValue !== nextValue) changedKeys.push([key, oldValue, nextValue]);
            this.writeLocalRaw(key, nextValue);
        });
        changedKeys.forEach(([key, oldValue, newValue]) => {
            this.notifyLocalConsumers(key, oldValue, newValue, false);
        });
        if (changedKeys.length && typeof window.syncFromCloudStorage === 'function') {
            try { window.syncFromCloudStorage(); } catch (e) { }
        }
    }

    notifyLocalConsumers(key, oldValue, newValue, callPageSync = true) {
        if (typeof window === 'undefined') return;
        try {
            const event = typeof StorageEvent === 'function'
                ? new StorageEvent('storage', {
                    key,
                    oldValue,
                    newValue,
                    storageArea: FAST_TOOLKIT_SECRET_KEYS.has(key) ? sessionStorage : localStorage,
                    url: window.location ? window.location.href : ''
                })
                : new CustomEvent('storage', { detail: { key, oldValue, newValue } });
            window.dispatchEvent(event);
        } catch (e) { }

        try {
            window.dispatchEvent(new CustomEvent('fasttoolkit:cloudchange', {
                detail: { key, oldValue, newValue }
            }));
        } catch (e) { }

        if (callPageSync && typeof window.syncFromCloudStorage === 'function') {
            try { window.syncFromCloudStorage(); } catch (e) { }
        }
    }

    startLocalMonitor() {
        if (typeof setInterval !== 'function' || this.monitorTimer !== null) return;
        this.monitorTimer = setInterval(() => this.scanLocalChanges(), FAST_TOOLKIT_MONITOR_DELAY);
    }

    scanLocalChanges() {
        if (this.isApplyingCloud) return;
        FAST_TOOLKIT_SYNC_KEYS.forEach(key => {
            const currentValue = this.readLocalRaw(key);
            const shadowValue = this.localShadow.has(key) ? this.localShadow.get(key) : null;
            if (currentValue === shadowValue) return;

            if (currentValue === null) this.localShadow.delete(key);
            else this.localShadow.set(key, currentValue);

            if (this.isBootstrapping) {
                this.pendingLocalChanges.set(key, currentValue);
                this.markDirty(key, currentValue);
            } else if (this.sessionReady) {
                this.markDirty(key, currentValue);
                this.scheduleCloudWrite(key, currentValue);
            }
        });
    }

    handleStorageEvent(event) {
        const key = event && (event.key || (event.detail && event.detail.key));
        if (!key || !FAST_TOOLKIT_SYNC_KEYS.includes(key)) return;
        const newValue = event.newValue !== undefined
            ? event.newValue
            : event.detail && event.detail.newValue;
        if (newValue === null) this.localShadow.delete(key);
        else this.localShadow.set(key, newValue);
    }

    saveCloudData(key, value) {
        if (!FAST_TOOLKIT_SYNC_KEYS.includes(key)) return false;
        const rawValue = this.serializeValue(value);
        this.writeLocalRaw(key, rawValue);

        if (this.isBootstrapping) {
            this.pendingLocalChanges.set(key, rawValue);
            this.markDirty(key, rawValue);
        } else if (this.sessionReady) {
            this.markDirty(key, rawValue);
            this.scheduleCloudWrite(key, rawValue);
        }
        return true;
    }

    removeCloudData(key) {
        if (!FAST_TOOLKIT_SYNC_KEYS.includes(key)) return false;
        this.writeLocalRaw(key, null);
        if (this.isBootstrapping) {
            this.pendingLocalChanges.set(key, null);
            this.markDirty(key, null);
        }
        else if (this.sessionReady) {
            this.markDirty(key, null);
            this.scheduleCloudWrite(key, null);
        }
        return true;
    }

    scheduleCloudWrite(key, rawValue, delay = FAST_TOOLKIT_SAVE_DELAY) {
        if (!this.sessionReady || !this.sessionUid) return;
        const uid = this.sessionUid;
        const existingTimer = this.saveTimers.get(key);
        if (existingTimer) clearTimeout(existingTimer);

        this.pendingPayloads.set(key, { uid, rawValue });
        const timer = setTimeout(() => {
            this.saveTimers.delete(key);
            const payload = this.pendingPayloads.get(key);
            this.pendingPayloads.delete(key);
            if (!payload || payload.uid !== this.sessionUid) return;
            this.pushToFirestore(key, payload.rawValue, payload.uid);
        }, delay);
        this.saveTimers.set(key, timer);
        this.setSyncState('syncing', { pending: this.getPendingCount(), error: null });
    }

    async pushToFirestore(key, rawValue, uid = this.sessionUid) {
        if (!this.db || !uid || uid !== this.sessionUid) return false;
        this.activeWrites += 1;
        this.setSyncState('syncing', { pending: this.getPendingCount(), error: null });
        let operation = null;

        try {
            operation = this.writeDocument(uid, key, rawValue);
            this.inFlightWrites.add(operation);
            await operation;
            this.inFlightWrites.delete(operation);
            this.retryQueue.delete(key);
            this.clearDirty(key, rawValue, uid);
            this.activeWrites -= 1;
            const pending = this.getPendingCount();
            this.setSyncState(pending ? 'syncing' : 'synced', {
                pending,
                error: null,
                lastSyncedAt: Date.now()
            });
            return true;
        } catch (error) {
            if (operation) this.inFlightWrites.delete(operation);
            this.activeWrites -= 1;
            this.retryQueue.set(key, { uid, rawValue });
            const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
            this.setSyncState(offline ? 'offline' : 'error', {
                pending: this.getPendingCount(),
                error
            });
            console.error('Firestore push error:', error);
            return false;
        }
    }

    writeDocument(uid, key, rawValue) {
        return this.dataCollection(uid).doc(this.keyDocumentId(key)).set({
            key,
            value: rawValue === null ? '' : rawValue,
            deleted: rawValue === null,
            sensitive: FAST_TOOLKIT_SECRET_KEYS.has(key),
            clientUpdatedAt: Date.now(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }

    retryFailedWrites() {
        if (!this.sessionReady || this.retryQueue.size === 0) return;
        const queued = [...this.retryQueue.entries()];
        this.retryQueue.clear();
        queued.forEach(([key, payload]) => {
            if (payload.uid === this.sessionUid) this.scheduleCloudWrite(key, payload.rawValue, 0);
        });
    }

    async flushPendingWrites() {
        const writes = [];
        this.saveTimers.forEach(timer => clearTimeout(timer));
        this.saveTimers.clear();
        const queued = [...this.pendingPayloads.entries()];
        this.pendingPayloads.clear();
        queued.forEach(([key, payload]) => {
            if (payload.uid === this.sessionUid) {
                writes.push(this.pushToFirestore(key, payload.rawValue, payload.uid));
            }
        });
        await Promise.allSettled([...this.inFlightWrites, ...writes]);
    }

    handlePageHide() {
        this.scanLocalChanges();
        if (this.sessionReady) this.flushPendingWrites();
    }

    cancelPendingWrites() {
        this.saveTimers.forEach(timer => clearTimeout(timer));
        this.saveTimers.clear();
        this.pendingPayloads.clear();
        this.retryQueue.clear();
        this.pendingLocalChanges.clear();
    }

    listenToCloudData(uid) {
        this.stopCloudListener();
        if (!this.db || !uid) return;

        this.unsubscribeCloud = this.dataCollection(uid).onSnapshot(
            { includeMetadataChanges: true },
            snapshot => {
                if (uid !== this.sessionUid) return;
                let changed = false;
                const changes = typeof snapshot.docChanges === 'function'
                    ? snapshot.docChanges()
                    : [];

                changes.forEach(change => {
                    const record = change.doc && change.doc.data ? change.doc.data() : null;
                    if (!record || !record.key || !FAST_TOOLKIT_SYNC_KEYS.includes(record.key)) return;
                    const key = record.key;
                    if (this.pendingPayloads.has(key) || this.retryQueue.has(key) || this.loadDirtyChanges(uid).has(key)) return;
                    const nextValue = record.deleted ? null : this.normalizeCloudRaw(key, record.value);
                    const currentValue = this.readLocalRaw(key);
                    if (currentValue === nextValue) return;
                    this.writeLocalRaw(key, nextValue, { notify: true });
                    changed = true;
                });

                if (changed && typeof window.syncFromCloudStorage === 'function') {
                    try { window.syncFromCloudStorage(); } catch (e) { }
                }

                const fromCache = Boolean(snapshot.metadata && snapshot.metadata.fromCache);
                if (fromCache && typeof navigator !== 'undefined' && navigator.onLine === false) {
                    this.setSyncState('offline');
                } else if (this.getPendingCount() === 0) {
                    this.setSyncState('synced', { error: null, lastSyncedAt: Date.now() });
                }
            },
            error => {
                console.warn('Firestore snapshot listener warning:', error);
                this.setSyncState('error', { error });
            }
        );
    }

    stopCloudListener() {
        if (typeof this.unsubscribeCloud === 'function') {
            try { this.unsubscribeCloud(); } catch (e) { }
        }
        this.unsubscribeCloud = null;
    }

    async updateUserProfile(user) {
        if (!this.db || !user || user.uid !== this.sessionUid) return;
        try {
            await this.db.collection('users').doc(user.uid).set({
                email: user.email,
                displayName: user.displayName,
                schemaVersion: 2,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (error) {
            console.warn('Unable to update Firebase user profile:', error);
        }
    }

    async loginWithGoogle() {
        if (!this.auth || typeof firebase === 'undefined') {
            alert('⚠️ تعذر الاتصال بخدمة Firebase حاليًا.');
            return false;
        }

        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        try {
            await this.auth.signInWithPopup(provider);
            return true;
        } catch (error) {
            console.error('Google sign-in popup error:', error);
            if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
                return false;
            }
            if (error.code === 'auth/operation-not-allowed') {
                alert('⚠️ تسجيل الدخول بواسطة Google غير مفعّل في Firebase.');
                return false;
            }
            if (error.code === 'auth/unauthorized-domain') {
                alert('⚠️ النطاق الحالي غير مضاف إلى Authorized domains في Firebase.');
                return false;
            }
            if (error.code !== 'auth/popup-blocked' && error.code !== 'auth/operation-not-supported-in-this-environment') {
                alert(`⚠️ تعذر تسجيل الدخول: ${error.message || 'خطأ غير معروف'}`);
                return false;
            }

            try {
                await this.auth.signInWithRedirect(provider);
                return true;
            } catch (redirectError) {
                console.error('Redirect sign-in error:', redirectError);
                alert(`⚠️ تعذر تسجيل الدخول: ${redirectError.message || 'خطأ غير معروف'}`);
                return false;
            }
        }
    }

    async switchAccount() {
        if (!this.auth) return false;
        try {
            await this.flushPendingWrites();
            await this.auth.signOut();
            await this.deactivateSession();
            this.user = null;
            this.notifyUserListeners();
            return this.loginWithGoogle();
        } catch (error) {
            console.error('Switch account failed:', error);
            return false;
        }
    }

    async signOut() {
        if (!this.auth) return false;
        try {
            await this.flushPendingWrites();
            await this.auth.signOut();
            await this.deactivateSession();
            this.user = null;
            this.notifyUserListeners();
            this.setSyncState('local', { pending: 0, error: null });
            return true;
        } catch (error) {
            console.error('Sign out failed:', error);
            return false;
        }
    }

    destroy() {
        this.stopCloudListener();
        this.cancelPendingWrites();
        if (this.monitorTimer !== null) clearInterval(this.monitorTimer);
        this.monitorTimer = null;
        if (typeof window !== 'undefined') {
            window.removeEventListener('storage', this.boundStorageHandler);
            window.removeEventListener('online', this.boundOnlineHandler);
            window.removeEventListener('pagehide', this.boundPageHideHandler);
            if (typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
            }
        }
        this.userListeners.clear();
        this.syncListeners.clear();
    }
}

if (typeof window !== 'undefined') {
    window.FastToolkitFirebaseSync = FastToolkitFirebaseSync;
    window.FAST_TOOLKIT_SYNC_KEYS = FAST_TOOLKIT_SYNC_KEYS;
    if (!window.__FAST_TOOLKIT_DISABLE_FIREBASE_AUTO_INIT__) {
        window.FastToolkitFirebase = new FastToolkitFirebaseSync();
    }
}
