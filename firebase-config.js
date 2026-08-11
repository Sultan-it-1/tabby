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
const FAST_TOOLKIT_ENCRYPTED_KEYS = new Set([
    'copyGridDataV6',
    'noteTabLabels',
    'quick_sticky_note',
    'stickyNotesData',
    'cardScannerData',
    'cardScannerHistory',
    'tabbyInput_saved',
    'simahApprovedAccounts',
    'simahAccountsHistory',
    'simah_ai_key',
    'simah_groq_key',
    'fastToolkitCIA_v4'
]);
const FAST_TOOLKIT_LAST_UID_KEY = 'fastToolkit_firebase_last_uid';
const FAST_TOOLKIT_DIRTY_PREFIX = 'fastToolkit_sync_dirty_v1:';
const FAST_TOOLKIT_INTERACTIVE_LOGIN_KEY = 'fastToolkit_interactive_login_pending';
const FAST_TOOLKIT_BOOTSTRAP_SEEDS_KEY = 'fastToolkit_bootstrap_seeded_values_v1';
const FAST_TOOLKIT_SAVE_DELAY = 350;
const FAST_TOOLKIT_MONITOR_DELAY = 500;
const FAST_TOOLKIT_WRITER_VERSION = 4;
const FAST_TOOLKIT_MIN_TRUSTED_DELETE_VERSION = 3;
const FAST_TOOLKIT_ENCRYPTION_PREFIX = 'ft_enc_v1:';
const FAST_TOOLKIT_ENCRYPTION_VERSION = 1;
const FAST_TOOLKIT_ENCRYPTION_SALT = 'fast-toolkit|tabby-6f8e3|cloud-sensitive-data|v1';

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
        this.encryptionKey = null;
        this.encryptionIdentity = '';
        this.encryptionRequestId = 0;
        this.isBootstrapping = false;
        this.isApplyingCloud = false;
        this.transitionId = 0;
        this.unsubscribeCloud = null;
        this.cloudSnapshotQueue = Promise.resolve();
        this.saveTimers = new Map();
        this.pendingPayloads = new Map();
        this.retryQueue = new Map();
        this.pendingLocalChanges = new Map();
        this.loginConflictResolver = null;
        this.dismissLoginConflictDialog = null;
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
        if (this.dismissLoginConflictDialog) this.dismissLoginConflictDialog('cloud');

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
            try {
                await this.prepareEncryption(firebaseUser);
            } catch (error) {
                console.error('Client-side encryption is unavailable:', error);
                this.setSyncState('error', { error });
                return;
            }
            this.setInteractiveLoginPending(false);
            this.clearBootstrapSeededValues();
            this.user = nextUser;
            this.notifyUserListeners();
            return;
        }

        await this.activateSession(nextUser, transitionId, firebaseUser);
    }

    async activateSession(nextUser, transitionId, firebaseUser) {
        const previousUid = this.getLastActiveUid();
        const canUseCurrentLocalData = !previousUid || previousUid === nextUser.uid;
        const shouldResolveLoginConflicts = canUseCurrentLocalData && (
            !previousUid || this.hasInteractiveLoginPending()
        );
        const localCandidate = canUseCurrentLocalData
            ? this.excludeBootstrapSeededValues(this.captureManagedData())
            : new Map();

        // Capture anything the active page changed just before authentication
        // switched. The dirty journal keeps it associated with its original
        // account instead of copying it into the next account.
        this.scanLocalChanges();
        await this.deactivateSession();
        if (transitionId !== this.transitionId) return;

        try {
            await this.prepareEncryption(firebaseUser);
        } catch (error) {
            if (transitionId !== this.transitionId) return;
            console.error('Client-side encryption is unavailable:', error);
            this.user = null;
            this.notifyUserListeners();
            this.setSyncState('error', { error });
            return;
        }
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
            remoteResult = {
                values: new Map(),
                untrustedDeletedKeys: new Set(),
                encryptionMigrationKeys: new Set(),
                confirmedFromServer: false,
                error
            };
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
            untrustedDeletedKeys: remoteResult.untrustedDeletedKeys,
            serverConfirmed: remoteResult.confirmedFromServer && legacyResult.confirmedFromServer
        });
        const valuesToApply = mergedResult.values;
        const resolutionUploadKeys = new Set();

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
            const snapshotSaved = await this.writeRecoverySnapshot(nextUser.uid, conflicts, 'login-conflict-before-resolution');
            if (!snapshotSaved) {
                // Never replace a differing local value unless its recovery
                // snapshot was safely stored in the account first.
                this.isBootstrapping = false;
                this.setSyncState('error', { error: new Error('Recovery backup failed; local data was kept unchanged.') });
                return;
            }

            if (shouldResolveLoginConflicts) {
                const resolution = await this.requestLoginConflictResolution(nextUser, conflicts);
                if (transitionId !== this.transitionId || this.sessionUid !== nextUser.uid) return;
                this.applyLoginConflictResolution(valuesToApply, conflicts, resolution)
                    .forEach(key => resolutionUploadKeys.add(key));
            }
        }

        // Capture edits made while the server request was in flight before
        // replacing the shared local view with the account snapshot.
        this.scanLocalChanges();
        this.replaceManagedData(valuesToApply, {
            clearMissing: Boolean(previousUid && previousUid !== nextUser.uid)
        });
        this.setLastActiveUid(nextUser.uid);
        this.setInteractiveLoginPending(false);
        this.clearBootstrapSeededValues();
        this.isBootstrapping = false;
        this.sessionReady = true;
        this.notifyUserListeners();

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
            new Set([
                ...mergedResult.localOnlyKeys,
                ...resolutionUploadKeys,
                ...(remoteResult.encryptionMigrationKeys || [])
            ]).forEach(key => {
                const rawValue = valuesToApply.get(key);
                if (rawValue === null || rawValue === undefined) return;
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
        this.encryptionRequestId += 1;
        this.encryptionKey = null;
        this.encryptionIdentity = '';

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

    isSessionReady() {
        return Boolean(this.user && this.sessionReady);
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
        return this.pendingPayloads.size + this.retryQueue.size + this.inFlightWrites.size + (this.activeWrites || 0);
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

    hasInteractiveLoginPending() {
        try { return sessionStorage.getItem(FAST_TOOLKIT_INTERACTIVE_LOGIN_KEY) === 'true'; }
        catch (e) { return false; }
    }

    setInteractiveLoginPending(pending) {
        try {
            if (pending) sessionStorage.setItem(FAST_TOOLKIT_INTERACTIVE_LOGIN_KEY, 'true');
            else sessionStorage.removeItem(FAST_TOOLKIT_INTERACTIVE_LOGIN_KEY);
        } catch (e) { }
    }

    loadBootstrapSeededValues() {
        const values = new Map();
        try {
            const parsed = JSON.parse(localStorage.getItem(FAST_TOOLKIT_BOOTSTRAP_SEEDS_KEY) || '{}');
            const entries = parsed && parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {};
            Object.entries(entries).forEach(([key, rawValue]) => {
                if (FAST_TOOLKIT_SYNC_KEYS.includes(key)) values.set(key, String(rawValue));
            });
        } catch (e) { }
        return values;
    }

    excludeBootstrapSeededValues(localValues) {
        const meaningfulValues = new Map(localValues);
        this.loadBootstrapSeededValues().forEach((seededValue, key) => {
            if (!meaningfulValues.has(key)) return;
            if (this.rawValuesEquivalent(meaningfulValues.get(key), seededValue)) meaningfulValues.delete(key);
        });
        return meaningfulValues;
    }

    clearBootstrapSeededValues() {
        try { localStorage.removeItem(FAST_TOOLKIT_BOOTSTRAP_SEEDS_KEY); } catch (e) { }
    }

    clearLastActiveUid() {
        try {
            localStorage.removeItem(FAST_TOOLKIT_LAST_UID_KEY);
            localStorage.removeItem('fastToolkit_firebase_user');
        } catch (e) { }
    }

    isSensitiveKey(key) {
        const normalized = String(key || '');
        return FAST_TOOLKIT_ENCRYPTED_KEYS.has(normalized) ||
            /(?:^|[_-])(?:ai|gemini|groq|openai|anthropic|claude)(?:[_-][a-z0-9]+)*[_-](?:api[_-]?)?key$/i.test(normalized);
    }

    getCryptoProvider() {
        const provider = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
        if (!provider || !provider.subtle || typeof provider.getRandomValues !== 'function') {
            throw new Error('Web Crypto API is required for secure cloud sync.');
        }
        return provider;
    }

    buildEncryptionIdentity(firebaseUser) {
        const providers = Array.isArray(firebaseUser && firebaseUser.providerData)
            ? firebaseUser.providerData
                .filter(entry => entry && entry.providerId && entry.uid)
                .map(entry => `${entry.providerId}:${entry.uid}`)
                .sort()
            : [];
        // Keep derivation stable if another login provider is linked later.
        // Google is the app's primary login; otherwise use the first stable
        // provider identity exposed by Firebase Auth.
        const providerIdentity = providers.find(value => value.startsWith('google.com:')) ||
            providers[0] ||
            `firebase:${firebaseUser.uid}`;
        return `${firebaseConfig.projectId}|${firebaseUser.uid}|${providerIdentity}`;
    }

    async prepareEncryption(firebaseUser) {
        if (!firebaseUser || !firebaseUser.uid) throw new Error('A signed-in account is required for encryption.');
        const identity = this.buildEncryptionIdentity(firebaseUser);
        if (this.encryptionKey && this.encryptionIdentity === identity) return this.encryptionKey;
        const requestId = ++this.encryptionRequestId;

        const cryptoProvider = this.getCryptoProvider();
        const encoder = new TextEncoder();
        const baseKey = await cryptoProvider.subtle.importKey(
            'raw',
            encoder.encode(identity),
            'HKDF',
            false,
            ['deriveKey']
        );
        const derivedKey = await cryptoProvider.subtle.deriveKey({
            name: 'HKDF',
            salt: encoder.encode(FAST_TOOLKIT_ENCRYPTION_SALT),
            info: encoder.encode('AES-256-GCM cloud field encryption'),
            hash: 'SHA-256'
        }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        if (requestId !== this.encryptionRequestId) {
            throw new Error('Encryption setup was superseded by another account session.');
        }
        this.encryptionKey = derivedKey;
        this.encryptionIdentity = identity;
        return this.encryptionKey;
    }

    bytesToBase64(bytes) {
        let binary = '';
        const chunkSize = 0x8000;
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
        }
        return btoa(binary);
    }

    base64ToBytes(value) {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return bytes;
    }

    isEncryptedCloudValue(value) {
        return typeof value === 'string' && value.startsWith(FAST_TOOLKIT_ENCRYPTION_PREFIX);
    }

    async encodeCloudRaw(key, rawValue) {
        if (!this.isSensitiveKey(key)) return rawValue;
        if (!this.encryptionKey) throw new Error(`Encryption key is unavailable for ${key}.`);

        const cryptoProvider = this.getCryptoProvider();
        const iv = cryptoProvider.getRandomValues(new Uint8Array(12));
        const encoder = new TextEncoder();
        const cipherBuffer = await cryptoProvider.subtle.encrypt({
            name: 'AES-GCM',
            iv,
            additionalData: encoder.encode(`fast-toolkit:${key}:v1`),
            tagLength: 128
        }, this.encryptionKey, encoder.encode(rawValue));
        return `${FAST_TOOLKIT_ENCRYPTION_PREFIX}${this.bytesToBase64(iv)}:${this.bytesToBase64(new Uint8Array(cipherBuffer))}`;
    }

    async decodeCloudRaw(key, value) {
        if (!this.isEncryptedCloudValue(value)) return value;
        if (!this.encryptionKey) throw new Error(`Encryption key is unavailable for ${key}.`);

        const payload = value.slice(FAST_TOOLKIT_ENCRYPTION_PREFIX.length);
        const separator = payload.indexOf(':');
        if (separator <= 0) throw new Error(`Invalid encrypted payload for ${key}.`);
        const iv = this.base64ToBytes(payload.slice(0, separator));
        const ciphertext = this.base64ToBytes(payload.slice(separator + 1));
        const encoder = new TextEncoder();
        const plainBuffer = await this.getCryptoProvider().subtle.decrypt({
            name: 'AES-GCM',
            iv,
            additionalData: encoder.encode(`fast-toolkit:${key}:v1`),
            tagLength: 128
        }, this.encryptionKey, ciphertext);
        return new TextDecoder().decode(plainBuffer);
    }

    dataCollection(uid = this.sessionUid) {
        return this.db.collection('users').doc(uid).collection('data');
    }

    recoveryDocument(uid, snapshotId) {
        return this.db.collection('users').doc(uid).collection('recovery').doc(snapshotId);
    }

    recoveryCollection(uid, snapshotId) {
        return this.recoveryDocument(uid, snapshotId).collection('values');
    }

    keyDocumentId(key) {
        return encodeURIComponent(key).replace(/\./g, '%2E');
    }

    withTimeout(promise, ms = 3500) {
        let timer = null;
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Server request timed out')), ms);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => {
            if (timer) clearTimeout(timer);
        });
    }

    async loadRemoteData(uid) {
        const collection = this.dataCollection(uid);
        try {
            const snapshot = await this.withTimeout(collection.get({ source: 'server' }), 3500);
            const remoteState = await this.remoteStateFromSnapshot(snapshot);
            return {
                ...remoteState,
                confirmedFromServer: true,
                error: null
            };
        } catch (serverError) {
            try {
                const snapshot = await collection.get({ source: 'cache' });
                const remoteState = await this.remoteStateFromSnapshot(snapshot);
                return {
                    ...remoteState,
                    confirmedFromServer: false,
                    error: serverError
                };
            } catch (cacheError) {
                return {
                    values: new Map(),
                    untrustedDeletedKeys: new Set(),
                    encryptionMigrationKeys: new Set(),
                    confirmedFromServer: false,
                    error: serverError || cacheError
                };
            }
        }
    }

    async remoteStateFromSnapshot(snapshot) {
        const values = new Map();
        const untrustedDeletedKeys = new Set();
        const encryptionMigrationKeys = new Set();
        if (!snapshot || typeof snapshot.forEach !== 'function') {
            return { values, untrustedDeletedKeys, encryptionMigrationKeys };
        }

        const records = [];
        snapshot.forEach(documentSnapshot => {
            const record = documentSnapshot.data ? documentSnapshot.data() : null;
            if (record) records.push(record);
        });
        for (const record of records) {
            if (!record || !record.key || !FAST_TOOLKIT_SYNC_KEYS.includes(record.key)) continue;
            if (record.deleted && !this.isTrustedDeletion(record)) {
                untrustedDeletedKeys.add(record.key);
                continue;
            }
            if (!record.deleted && this.isSensitiveKey(record.key) && !this.isEncryptedCloudValue(record.value)) {
                encryptionMigrationKeys.add(record.key);
            }
            values.set(record.key, record.deleted ? null : await this.normalizeCloudRaw(record.key, record.value));
        }
        return { values, untrustedDeletedKeys, encryptionMigrationKeys };
    }

    isTrustedDeletion(record) {
        return Boolean(
            record &&
            record.deleted === true &&
            Number(record.writerVersion) >= FAST_TOOLKIT_MIN_TRUSTED_DELETE_VERSION &&
            typeof record.deleteRequestId === 'string' &&
            record.deleteRequestId.length > 0
        );
    }

    async loadLegacyData(uid) {
        const values = new Map();
        let confirmedFromServer = false;
        let documentSnapshot = null;
        let error = null;

        try {
            documentSnapshot = await this.withTimeout(this.db.collection('users').doc(uid).get({ source: 'server' }), 3500);
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
                for (const [key, value] of Object.entries(legacyPayload)) {
                    if (!FAST_TOOLKIT_SYNC_KEYS.includes(key)) continue;
                    values.set(key, await this.normalizeCloudRaw(key, value));
                }
            }
        }
        return { values, confirmedFromServer, error };
    }

    mergeAccountData({ remoteValues, legacyValues, localValues, untrustedDeletedKeys = new Set(), serverConfirmed }) {
        const values = new Map();
        const localOnlyKeys = new Set();

        // Only deletions created by the guarded writer protocol are canonical.
        // Older clients converted a browser-storage reset into unversioned
        // tombstones, so the immutable legacy map is allowed to recover them.
        remoteValues.forEach((rawValue, key) => values.set(key, rawValue));
        legacyValues.forEach((rawValue, key) => {
            if (!values.has(key)) {
                values.set(key, rawValue);
            }
        });
        localValues.forEach((rawValue, key) => {
            if (values.has(key)) return;
            values.set(key, rawValue);
            if (serverConfirmed) localOnlyKeys.add(key);
        });
        return { values, localOnlyKeys, serverConfirmed };
    }

    rawValuesEquivalent(firstRaw, secondRaw) {
        if (firstRaw === secondRaw) return true;
        if (firstRaw === null || firstRaw === undefined || secondRaw === null || secondRaw === undefined) return false;
        try {
            return this.structuredValuesEquivalent(JSON.parse(firstRaw), JSON.parse(secondRaw));
        } catch (e) {
            return false;
        }
    }

    structuredValuesEquivalent(first, second) {
        if (Object.is(first, second)) return true;
        if (Array.isArray(first) || Array.isArray(second)) {
            return Array.isArray(first) && Array.isArray(second) &&
                first.length === second.length &&
                first.every((item, index) => this.structuredValuesEquivalent(item, second[index]));
        }
        if (this.isPlainObject(first) || this.isPlainObject(second)) {
            if (!this.isPlainObject(first) || !this.isPlainObject(second)) return false;
            const firstKeys = Object.keys(first).sort();
            const secondKeys = Object.keys(second).sort();
            return firstKeys.length === secondKeys.length &&
                firstKeys.every((key, index) => (
                    key === secondKeys[index] && this.structuredValuesEquivalent(first[key], second[key])
                ));
        }
        return false;
    }

    findLocalConflicts(localValues, cloudValues) {
        const conflicts = new Map();
        localValues.forEach((localValue, key) => {
            if (!cloudValues.has(key)) return;
            const cloudValue = cloudValues.get(key);
            if (!this.rawValuesEquivalent(localValue, cloudValue)) {
                conflicts.set(key, {
                    localValue,
                    cloudValue,
                    capturedAt: Date.now()
                });
            }
        });
        return conflicts;
    }

    normalizeLoginConflictResolution(value) {
        return ['merge', 'local', 'cloud'].includes(value) ? value : 'merge';
    }

    async requestLoginConflictResolution(user, conflicts) {
        const details = {
            email: user && user.email ? user.email : '',
            conflictCount: conflicts.size,
            keys: [...conflicts.keys()],
            hasCloudDeletions: [...conflicts.values()].some(entry => entry.cloudValue === null)
        };
        const resolver = this.loginConflictResolver || (
            typeof window !== 'undefined' && typeof window.fastToolkitResolveLoginConflict === 'function'
                ? window.fastToolkitResolveLoginConflict
                : null
        );

        if (resolver) {
            try {
                return this.normalizeLoginConflictResolution(await resolver(details));
            } catch (e) {
                console.warn('Login conflict resolver failed:', e);
            }
        }
        return this.showLoginConflictDialog(details);
    }

    showLoginConflictDialog(details) {
        if (typeof document === 'undefined' || !document.body || typeof document.createElement !== 'function') {
            return Promise.resolve(details.hasCloudDeletions ? 'cloud' : 'merge');
        }

        return new Promise(resolve => {
            if (this.dismissLoginConflictDialog) this.dismissLoginConflictDialog('cloud');
            const overlay = document.createElement('div');
            overlay.setAttribute('role', 'presentation');
            overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(2,6,12,.78);backdrop-filter:blur(10px);direction:rtl;font-family:inherit;';

            const dialog = document.createElement('section');
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.setAttribute('aria-labelledby', 'fastToolkitLoginConflictTitle');
            dialog.style.cssText = 'width:min(470px,100%);color:#f8fafc;background:linear-gradient(145deg,#151b25,#0b0f16);border:1px solid rgba(148,163,184,.22);border-radius:20px;padding:20px;box-shadow:0 24px 80px rgba(0,0,0,.55);';
            dialog.innerHTML = `
                <div style="display:flex;align-items:center;gap:11px;margin-bottom:10px;">
                    <span style="display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:rgba(52,211,153,.16);font-size:22px;">☁️</span>
                    <div>
                        <h2 id="fastToolkitLoginConflictTitle" style="margin:0;font-size:17px;line-height:1.4;font-weight:700;">اختر طريقة مزامنة بياناتك</h2>
                        <div data-account-email style="color:#94a3b8;font-size:11px;overflow-wrap:anywhere;"></div>
                    </div>
                </div>
                <p style="margin:0 0 16px;color:#cbd5e1;font-size:12px;line-height:1.8;">🛡️ لديك بيانات على هذا الجهاز وبيانات سابقة في حسابك السحابي. تم حفظ نسخة احتياطية للطرفين ولن تضيع أي بيانات.</p>
                <div style="display:grid;gap:10px;">
                    <button type="button" data-resolution="merge" style="cursor:pointer;text-align:right;border:2px solid #34d399;border-radius:14px;padding:14px;color:#ecfdf5;background:linear-gradient(135deg,rgba(16,185,129,.25),rgba(5,150,105,.12));box-shadow:0 0 20px rgba(52,211,153,.2);font:inherit;transition:all 0.2s ease;">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                            <strong style="font-size:14px;color:#34d399;display:flex;align-items:center;gap:6px;">✨ دمج الكل (الموصى به والآمن)</strong>
                            <span style="background:#34d399;color:#064e3b;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;">الأفضل والآمن</span>
                        </div>
                        <span style="display:block;color:#a7f3d0;font-size:11px;line-height:1.6;">يجمع بين كافة العناصر في الجهاز والسحابة معاً دون حذف أو فقدان أي عنصر.</span>
                    </button>
                    <button type="button" data-resolution="local" style="cursor:pointer;text-align:right;border:1px solid rgba(148,163,184,.15);border-radius:12px;padding:10px 12px;color:#94a3b8;background:rgba(255,255,255,.02);font:inherit;opacity:0.85;transition:all 0.2s ease;" onmouseover="this.style.opacity='1';this.style.borderColor='rgba(148,163,184,.3)'" onmouseout="this.style.opacity='0.85';this.style.borderColor='rgba(148,163,184,.15)'">
                        <strong style="display:block;font-size:12px;color:#cbd5e1;">📱 الاعتماد على بيانات هذا الجهاز فقط</strong>
                        <span style="display:block;margin-top:2px;color:#64748b;font-size:10px;">يرفع العمل الحالي بالكامل للحساب، وتُحفظ النسخة السحابية السابقة كنسخة احتياطية.</span>
                    </button>
                    <button type="button" data-resolution="cloud" style="cursor:pointer;text-align:right;border:1px solid rgba(148,163,184,.15);border-radius:12px;padding:10px 12px;color:#94a3b8;background:rgba(255,255,255,.02);font:inherit;opacity:0.85;transition:all 0.2s ease;" onmouseover="this.style.opacity='1';this.style.borderColor='rgba(148,163,184,.3)'" onmouseout="this.style.opacity='0.85';this.style.borderColor='rgba(148,163,184,.15)'">
                        <strong style="display:block;font-size:12px;color:#cbd5e1;">☁️ استعادة بيانات الحساب السحابي فقط</strong>
                        <span style="display:block;margin-top:2px;color:#64748b;font-size:10px;">ينزّل نسخة الحساب السحابي، وتُحفظ بيانات هذا الجهاز كنسخة استرجاع احتياطية.</span>
                    </button>
                </div>
                <div style="margin-top:12px;color:#64748b;font-size:10px;text-align:center;">${details.conflictCount} عناصر تتطلب الاختيار • جميع العناصر الأخرى محفوظة وآمنة تلقائياً</div>
            `;
            const emailNode = dialog.querySelector('[data-account-email]');
            if (emailNode) emailNode.textContent = details.email;
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            let completed = false;
            const finish = value => {
                if (completed) return;
                completed = true;
                overlay.remove();
                if (this.dismissLoginConflictDialog === finish) this.dismissLoginConflictDialog = null;
                resolve(this.normalizeLoginConflictResolution(value));
            };
            this.dismissLoginConflictDialog = finish;
            dialog.querySelectorAll('[data-resolution]').forEach(button => {
                button.addEventListener('click', () => finish(button.getAttribute('data-resolution')), { once: true });
            });
            const recommended = dialog.querySelector('[data-resolution="merge"]');
            if (recommended && typeof recommended.focus === 'function') recommended.focus();
        });
    }

    applyLoginConflictResolution(values, conflicts, resolution) {
        const uploadKeys = new Set();
        const mode = this.normalizeLoginConflictResolution(resolution);
        if (mode === 'cloud') return uploadKeys;

        conflicts.forEach((entry, key) => {
            const nextValue = mode === 'local'
                ? entry.localValue
                : this.mergeConflictRawValues(entry.cloudValue, entry.localValue);
            values.set(key, nextValue);
            if (!this.rawValuesEquivalent(nextValue, entry.cloudValue)) uploadKeys.add(key);
        });
        return uploadKeys;
    }

    mergeConflictRawValues(cloudRaw, localRaw) {
        if (cloudRaw === null || cloudRaw === undefined) return localRaw;
        if (localRaw === null || localRaw === undefined) return cloudRaw;

        try {
            const cloudValue = JSON.parse(cloudRaw);
            const localValue = JSON.parse(localRaw);
            const mergedValue = this.mergeStructuredValues(cloudValue, localValue);
            return JSON.stringify(mergedValue);
        } catch (e) {
            // Plain strings and non-JSON preferences use the value the user was
            // actively working with on this device. The cloud copy remains in
            // the immutable recovery snapshot created before this method runs.
            return localRaw;
        }
    }

    mergeStructuredValues(cloudValue, localValue) {
        if (Array.isArray(cloudValue) && Array.isArray(localValue)) {
            const merged = [...cloudValue];
            const indexes = new Map();
            merged.forEach((item, index) => indexes.set(this.arrayItemIdentity(item), index));
            localValue.forEach(item => {
                const identity = this.arrayItemIdentity(item);
                if (indexes.has(identity)) {
                    const index = indexes.get(identity);
                    merged[index] = this.mergeStructuredValues(merged[index], item);
                } else {
                    indexes.set(identity, merged.length);
                    merged.push(item);
                }
            });
            return merged;
        }

        if (this.isPlainObject(cloudValue) && this.isPlainObject(localValue)) {
            const merged = { ...cloudValue };
            Object.entries(localValue).forEach(([key, value]) => {
                merged[key] = Object.prototype.hasOwnProperty.call(merged, key)
                    ? this.mergeStructuredValues(merged[key], value)
                    : value;
            });
            return merged;
        }
        return localValue;
    }

    isPlainObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    arrayItemIdentity(item) {
        if (this.isPlainObject(item)) {
            const identityKey = ['id', '_id', 'uuid', 'uid', 'key', 'accountNumber', 'c']
                .find(key => item[key] !== undefined && item[key] !== null && item[key] !== '');
            if (identityKey) return `${identityKey}:${String(item[identityKey])}`;
        }
        try { return `value:${JSON.stringify(item)}`; }
        catch (e) { return `value:${String(item)}`; }
    }

    async writeRecoverySnapshot(uid, entries, reason) {
        if (!this.db || !uid || !entries || entries.size === 0) return true;
        const snapshotId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        try {
            // Create a real parent document so recovery snapshots can be
            // listed and restored later. Subcollections beneath a missing
            // parent are visible in the console but cannot be queried.
            await this.recoveryDocument(uid, snapshotId).set({
                reason,
                keyCount: entries.size,
                schemaVersion: 1,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            return false;
        }
        const writes = [];
        for (const [key, entry] of entries.entries()) {
            const localDeleted = entry.localValue === null;
            const cloudDeleted = entry.cloudValue === null;
            const localValue = localDeleted ? '' : await this.encodeCloudRaw(key, entry.localValue);
            const cloudValue = cloudDeleted ? '' : await this.encodeCloudRaw(key, entry.cloudValue);
            writes.push(this.recoveryCollection(uid, snapshotId).doc(this.keyDocumentId(key)).set({
                key,
                localValue,
                localDeleted,
                cloudValue,
                cloudDeleted,
                encryptionVersion: this.isSensitiveKey(key) ? FAST_TOOLKIT_ENCRYPTION_VERSION : 0,
                reason,
                capturedAt: entry.capturedAt || Date.now(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }));
        }
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

        const archiveEntries = new Map();
        legacyValues.forEach((rawValue, key) => {
            archiveEntries.set(key, {
                localValue: rawValue,
                cloudValue: rawValue,
                capturedAt: Date.now()
            });
        });
        const archiveSaved = await this.writeRecoverySnapshot(uid, archiveEntries, 'legacy-encryption-migration');
        if (!archiveSaved) return false;

        try {
            await this.db.collection('users').doc(uid).set({
                schemaVersion: 3,
                migratedAt: firebase.firestore.FieldValue.serverTimestamp(),
                legacyDataRemovedAt: firebase.firestore.FieldValue.serverTimestamp(),
                data: firebase.firestore.FieldValue.delete()
            }, { merge: true });
            return true;
        } catch (e) {
            // The encrypted per-key documents and recovery archive are already
            // durable. Older deployed rules may temporarily keep the legacy
            // map immutable; the cleanup is retried on the next sign-in.
            console.warn('Legacy plaintext archive cleanup is pending:', e);
            return true;
        }
    }

    async normalizeCloudRaw(key, value) {
        let rawValue;
        if (typeof value === 'string') rawValue = value;
        else if (value === undefined || value === null) rawValue = '';
        else rawValue = JSON.stringify(value);

        if (this.isEncryptedCloudValue(rawValue)) {
            return this.decodeCloudRaw(key, rawValue);
        }
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
        let changes = [];
        FAST_TOOLKIT_SYNC_KEYS.forEach(key => {
            const currentValue = this.readLocalRaw(key);
            const shadowValue = this.localShadow.has(key) ? this.localShadow.get(key) : null;
            if (currentValue === shadowValue) return;

            changes.push({ key, currentValue, shadowValue });
        });

        const removedKeys = changes.filter(change => change.currentValue === null && change.shadowValue !== null);

        if ((this.sessionReady || this.isBootstrapping) && removedKeys.length > 0) {
            // localStorage is only a compatibility cache, so its disappearance
            // is never an account-level delete. Explicit removeCloudData()
            // calls update the shadow first and still sync normally.
            if (this.sessionUid) {
                this.setLastActiveUid(this.sessionUid);
            }
            removedKeys.forEach(({ key, shadowValue }) => {
                this.writeLocalRaw(key, shadowValue, { notify: true });
            });
            changes = changes.filter(change => change.currentValue !== null);
        }

        changes.forEach(({ key, currentValue }) => {

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
        if (event && (event.key === null || event.key === '')) {
            this.localShadow.clear();
            this.clearLastActiveUid();
            if (typeof window !== 'undefined' && typeof window.syncFromCloudStorage === 'function') {
                try { window.syncFromCloudStorage(); } catch (e) { }
            }
            return;
        }
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

    async writeDocument(uid, key, rawValue) {
        const isDeletion = rawValue === null;
        const sensitive = this.isSensitiveKey(key);
        const cloudValue = isDeletion ? '' : await this.encodeCloudRaw(key, rawValue);
        return this.dataCollection(uid).doc(this.keyDocumentId(key)).set({
            key,
            value: cloudValue,
            deleted: isDeletion,
            sensitive,
            writerVersion: FAST_TOOLKIT_WRITER_VERSION,
            deleteRequestId: isDeletion
                ? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
                : '',
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
                this.cloudSnapshotQueue = this.cloudSnapshotQueue
                    .then(() => this.applyCloudSnapshot(uid, snapshot))
                    .catch(error => {
                        console.warn('Unable to apply cloud snapshot:', error);
                        this.setSyncState('error', { error });
                    });
            },
            error => {
                console.warn('Firestore snapshot listener warning:', error);
                this.setSyncState('error', { error });
            }
        );
    }

    async applyCloudSnapshot(uid, snapshot) {
        if (uid !== this.sessionUid) return;
        let changed = false;
        const changes = typeof snapshot.docChanges === 'function'
            ? snapshot.docChanges()
            : [];

        for (const change of changes) {
            if (uid !== this.sessionUid) return;
            const record = change.doc && change.doc.data ? change.doc.data() : null;
            if (!record || !record.key || !FAST_TOOLKIT_SYNC_KEYS.includes(record.key)) continue;
            if (record.deleted && !this.isTrustedDeletion(record)) continue;
            const key = record.key;
            if (this.pendingPayloads.has(key) || this.retryQueue.has(key) || this.loadDirtyChanges(uid).has(key)) continue;
            let nextValue;
            try {
                nextValue = record.deleted ? null : await this.normalizeCloudRaw(key, record.value);
            } catch (error) {
                if (uid !== this.sessionUid) return;
                console.warn('Unable to decrypt cloud value:', key, error);
                this.setSyncState('error', { error });
                continue;
            }
            if (uid !== this.sessionUid) return;
            const currentValue = this.readLocalRaw(key);
            if (currentValue === nextValue) continue;
            this.writeLocalRaw(key, nextValue, { notify: true });
            changed = true;
        }

        if (changed && typeof window.syncFromCloudStorage === 'function') {
            try { window.syncFromCloudStorage(); } catch (e) { }
        }

        const fromCache = Boolean(snapshot.metadata && snapshot.metadata.fromCache);
        if (fromCache && typeof navigator !== 'undefined' && navigator.onLine === false) {
            this.setSyncState('offline');
        } else if (this.getPendingCount() === 0) {
            this.setSyncState('synced', { error: null, lastSyncedAt: Date.now() });
        }
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
                schemaVersion: 3,
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
        this.setInteractiveLoginPending(true);

        try {
            await this.auth.signInWithPopup(provider);
            return true;
        } catch (error) {
            console.error('Google sign-in popup error:', error);
            if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
                this.setInteractiveLoginPending(false);
                return false;
            }
            if (error.code === 'auth/operation-not-allowed') {
                this.setInteractiveLoginPending(false);
                alert('⚠️ تسجيل الدخول بواسطة Google غير مفعّل في Firebase.');
                return false;
            }
            if (error.code === 'auth/unauthorized-domain') {
                this.setInteractiveLoginPending(false);
                alert('⚠️ النطاق الحالي غير مضاف إلى Authorized domains في Firebase.');
                return false;
            }
            if (error.code !== 'auth/popup-blocked' && error.code !== 'auth/operation-not-supported-in-this-environment') {
                this.setInteractiveLoginPending(false);
                alert(`⚠️ تعذر تسجيل الدخول: ${error.message || 'خطأ غير معروف'}`);
                return false;
            }

            try {
                await this.auth.signInWithRedirect(provider);
                return true;
            } catch (redirectError) {
                console.error('Redirect sign-in error:', redirectError);
                this.setInteractiveLoginPending(false);
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
        if (this.dismissLoginConflictDialog) this.dismissLoginConflictDialog('cloud');
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
