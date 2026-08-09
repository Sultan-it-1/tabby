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

// Allow custom config saved in localStorage
let customConfig = null;
try {
    const savedConfig = localStorage.getItem('fastToolkit_firebase_custom_config');
    if (savedConfig) customConfig = JSON.parse(savedConfig);
} catch (e) {}

const firebaseConfig = customConfig || defaultFirebaseConfig;

// Initialize Firebase if SDK script is loaded
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    try {
        firebase.initializeApp(firebaseConfig);
        firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(err => {
            console.warn("Firestore persistence warning:", err.code);
        });
    } catch (e) {
        console.warn("Firebase initialization warning:", e);
    }
}

class FastToolkitFirebaseSync {
    constructor() {
        this.user = null;
        this.db = null;
        this.auth = null;
        this.saveTimeout = null;
        this.listeners = [];
        this.init();
    }

    init() {
        if (typeof firebase === 'undefined') return;

        try {
            this.auth = firebase.auth();
            this.db = firebase.firestore();
        } catch (e) {
            return;
        }

        // Cached user for instant local UI rendering (0ms delay)
        try {
            const cachedUser = localStorage.getItem('fastToolkit_firebase_user');
            if (cachedUser) this.user = JSON.parse(cachedUser);
        } catch (e) {}

        this.auth.onAuthStateChanged(async (user) => {
            if (user) {
                this.user = {
                    uid: user.uid,
                    email: user.email || 'مستخدم بدون بريد',
                    displayName: user.displayName || user.email?.split('@')[0] || 'مستخدم',
                    photoURL: user.photoURL || ''
                };
                localStorage.setItem('fastToolkit_firebase_user', JSON.stringify(this.user));
                this.notifyListeners();
                this.listenToCloudData();
                this.syncAllLocalDataToCloud();
            } else {
                this.user = null;
                localStorage.removeItem('fastToolkit_firebase_user');
                this.notifyListeners();
            }
        });
    }

    notifyListeners() {
        this.listeners.forEach(cb => {
            try { cb(this.user); } catch (e) {}
        });
    }

    onUserChange(callback) {
        if (typeof callback === 'function') {
            this.listeners.push(callback);
            callback(this.user); // Always invoke immediately
        }
    }

    async syncAllLocalDataToCloud() {
        if (!this.user || !this.db) return;
        const keysToSync = [
            'copyGridDataV6',
            'fastToolkitCIA_v4',
            'stickyNotesData',
            'quick_sticky_note',
            'simahApprovedAccounts',
            'simahAccountsHistory',
            'simah_ai_provider',
            'simah_ai_key',
            'simah_groq_key',
            'fastToolkitSettings',
            'fastToolkitShortcuts',
            'cardScannerData'
        ];

        const dataPayload = {};
        keysToSync.forEach(key => {
            const val = localStorage.getItem(key);
            if (val !== null) {
                if (key === 'simah_ai_key' || key === 'simah_groq_key') {
                    dataPayload[key] = this.encryptValue(val);
                } else {
                    try {
                        dataPayload[key] = JSON.parse(val);
                    } catch (e) {
                        dataPayload[key] = val;
                    }
                }
            }
        });

        try {
            const userRef = this.db.collection('users').doc(this.user.uid);
            await userRef.set({
                email: this.user.email,
                displayName: this.user.displayName,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                data: dataPayload
            }, { merge: true });
            console.log("Full local data successfully synced to Firestore!");
        } catch (err) {
            console.error("Firestore initial sync error:", err);
            if (err.code === 'permission-denied') {
                alert("⚠️ فشل الحفظ في Firestore بسبب الصلاحيات (Permission Denied).\nالرجاء الذهاب لـ Firebase Console -> Firestore Database -> Rules وتعديل القواعد إلى:\nallow read, write: if request.auth != null;");
            }
        }
    }

    async loginWithGoogle() {
        if (typeof firebase === 'undefined' || !this.auth) {
            alert("⚠️ مكتبة Firebase لم تتصل بعد.");
            return;
        }
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
            await this.auth.signInWithPopup(provider);
        } catch (err) {
            console.error("Google Login error:", err);
            if (err.code === 'auth/operation-not-allowed') {
                alert("⚠️ خيار الدخول بـ Google غير مفعل بعد في لوحة التحكم (Firebase Console).\nالرجاء الذهاب لـ Authentication -> Sign-in method وتفعيل خيار Google.");
            } else if (err.code === 'auth/unauthorized-domain') {
                alert("⚠️ النطاق الحالي غير مصرح به في Firebase.\nالرجاء إضافة النطاق الحالي في Firebase Console -> Authentication -> Settings -> Authorized domains.");
            } else if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
                try {
                    await this.auth.signInWithRedirect(provider);
                } catch (rErr) {
                    console.error("Redirect login error:", rErr);
                }
            } else {
                alert(`⚠️ تعذر تسجيل الدخول: ${err.message || 'خطأ غير معروف'}`);
            }
        }
    }

    async switchAccount() {
        if (typeof firebase === 'undefined' || !this.auth) return;
        try {
            await this.auth.signOut();
            localStorage.removeItem('fastToolkit_firebase_user');
            await this.loginWithGoogle();
        } catch (err) {
            console.error("Switch account failed:", err);
        }
    }

    async signOut() {
        if (typeof firebase === 'undefined' || !this.auth) return;
        await this.auth.signOut();
        localStorage.removeItem('fastToolkit_firebase_user');
    }

    // 0ms Optimistic Save with Debounced Background Firestore Push
    saveCloudData(key, data) {
        // Save locally first (0ms delay)
        try {
            if (typeof data === 'object') {
                localStorage.setItem(key, JSON.stringify(data));
            } else {
                localStorage.setItem(key, data);
            }
        } catch (e) {}

        if (!this.user || !this.db) return;

        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            this.pushToFirestore(key, data);
        }, 1000);
    }

    encryptValue(str) {
        if (!str || typeof str !== 'string') return str;
        try {
            return 'enc_v1:' + btoa(unescape(encodeURIComponent(str)));
        } catch (e) { return str; }
    }

    decryptValue(str) {
        if (!str || typeof str !== 'string' || !str.startsWith('enc_v1:')) return str;
        try {
            return decodeURIComponent(escape(atob(str.slice(7))));
        } catch (e) { return str; }
    }

    async pushToFirestore(key, data) {
        if (!this.user || !this.db) return;
        try {
            const userRef = this.db.collection('users').doc(this.user.uid);
            let valToSave = data;
            if (key === 'simah_ai_key' || key === 'simah_groq_key') {
                valToSave = this.encryptValue(data);
            } else if (typeof data === 'string') {
                try { valToSave = JSON.parse(data); } catch (e) {}
            }
            await userRef.set({
                email: this.user.email,
                displayName: this.user.displayName,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                data: {
                    [key]: valToSave
                }
            }, { merge: true });
        } catch (err) {
            console.error("Firestore push error:", err);
            if (err.code === 'permission-denied') {
                alert("⚠️ فشل الحفظ في Firestore بسبب الصلاحيات (Permission Denied).\nالرجاء الذهاب لـ Firebase Console -> Firestore Database -> Rules وتعديل القواعد إلى:\nallow read, write: if request.auth != null;");
            }
        }
    }

    // Real-time Background Pull
    listenToCloudData() {
        if (!this.user || !this.db) return;
        const userRef = this.db.collection('users').doc(this.user.uid);

        userRef.onSnapshot(doc => {
            if (doc.exists) {
                const cloudPayload = doc.data()?.data;
                if (cloudPayload && typeof cloudPayload === 'object') {
                    let hasChanges = false;
                    Object.entries(cloudPayload).forEach(([key, val]) => {
                        const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
                        const localVal = localStorage.getItem(key);
                        if (localVal !== strVal) {
                            localStorage.setItem(key, strVal);
                            hasChanges = true;
                        }
                    });
                    if (hasChanges && typeof window.syncFromCloudStorage === 'function') {
                        window.syncFromCloudStorage();
                    }
                }
            }
        }, err => {
            console.warn("Firestore snapshot listener warning:", err);
        });
    }
}

window.FastToolkitFirebase = new FastToolkitFirebaseSync();
