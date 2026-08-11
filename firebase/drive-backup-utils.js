(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.FastToolkitDriveBackup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const BACKUP_SCHEMA = 'fast-toolkit-google-drive-backup';
    const BACKUP_SCHEMA_VERSION = 2;

    const AI_SECRET_KEYS = new Set([
        'simah_ai_key',
        'simah_groq_key'
    ]);

    const INTERNAL_KEYS = new Set([
        'gDriveAccessToken',
        'fastToolkit_firebase_last_uid',
        'fastToolkit_firebase_user',
        'fastToolkit_firebase_custom_config',
        'fastToolkit_bootstrap_seeded_values_v1',
        'fastToolkit_interactive_login_pending'
    ]);

    function isAiSecretKey(key) {
        const normalized = String(key || '').trim();
        if (AI_SECRET_KEYS.has(normalized)) return true;

        // Future-proof the backup if another AI provider is added later.
        return /(?:^|[_-])(?:ai|gemini|groq|openai|anthropic|claude)(?:[_-][a-z0-9]+)*[_-](?:api[_-]?)?key$/i.test(normalized);
    }

    function isInternalSessionKey(key) {
        const normalized = String(key || '').trim();
        return INTERNAL_KEYS.has(normalized) ||
            normalized.startsWith('fastToolkit_sync_dirty_') ||
            normalized.startsWith('firebase:');
    }

    function isBackupEligibleKey(key) {
        return Boolean(key) && !isAiSecretKey(key) && !isInternalSessionKey(key);
    }

    function collectStorageEntries(storage) {
        const entries = Object.create(null);
        if (!storage || typeof storage.length !== 'number' || typeof storage.key !== 'function') {
            return entries;
        }

        for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (!isBackupEligibleKey(key)) continue;
            const value = storage.getItem(key);
            if (value !== null) entries[key] = String(value);
        }
        return entries;
    }

    function createBackupPayload(storage, options = {}) {
        const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
        const entries = collectStorageEntries(storage);
        return {
            schema: BACKUP_SCHEMA,
            schemaVersion: BACKUP_SCHEMA_VERSION,
            createdAt: now.toISOString(),
            appVersion: String(options.appVersion || 'unknown'),
            protection: {
                aiKeysExcluded: true,
                authSessionExcluded: true
            },
            entries
        };
    }

    function normalizeBackupEntries(payload) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new Error('Invalid backup format');
        }

        const isCurrentFormat = payload.schema === BACKUP_SCHEMA &&
            payload.entries && typeof payload.entries === 'object' && !Array.isArray(payload.entries);
        const source = isCurrentFormat ? payload.entries : payload;
        const entries = Object.create(null);
        const skippedKeys = [];

        Object.entries(source).forEach(([key, value]) => {
            if (!isBackupEligibleKey(key) || typeof value !== 'string') {
                skippedKeys.push(key);
                return;
            }
            entries[key] = value;
        });

        return {
            entries,
            skippedKeys,
            legacy: !isCurrentFormat,
            createdAt: isCurrentFormat && typeof payload.createdAt === 'string' ? payload.createdAt : null
        };
    }

    function restoreStorageEntries(storage, payload) {
        if (!storage || typeof storage.setItem !== 'function') {
            throw new Error('Storage is unavailable');
        }

        const normalized = normalizeBackupEntries(payload);
        const restoredKeys = [];
        Object.entries(normalized.entries).forEach(([key, value]) => {
            storage.setItem(key, value);
            restoredKeys.push(key);
        });

        return {
            restoredKeys,
            skippedKeys: normalized.skippedKeys,
            legacy: normalized.legacy,
            createdAt: normalized.createdAt
        };
    }

    return Object.freeze({
        BACKUP_SCHEMA,
        BACKUP_SCHEMA_VERSION,
        AI_SECRET_KEYS,
        isAiSecretKey,
        isInternalSessionKey,
        isBackupEligibleKey,
        collectStorageEntries,
        createBackupPayload,
        normalizeBackupEntries,
        restoreStorageEntries
    });
});
