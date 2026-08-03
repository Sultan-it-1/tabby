/**
 * ==============================================================================
 * FAST TOOLKIT - UI Access Guard & Company Web App Sync
 * نظام قفل الواجهة وحظر الوصول وحفظ النسخ السحابية عبر Apps Script
 * ==============================================================================
 */

(function () {
    const STORAGE_KEY_EMAIL = 'fastToolkitCompanyEmail';
    const STORAGE_KEY_WEBAPP_URL = 'fastToolkitCompanyWebAppUrl';
    const STORAGE_KEY_AUTH_STATUS = 'fastToolkitAuthStatus';

    // الرابط المباشر الافتراضي لـ Web App الشركة (يمكن تعديله من صفحة الإعدادات)
    const DEFAULT_WEB_APP_URL = localStorage.getItem(STORAGE_KEY_WEBAPP_URL) || '';

    window.FastToolkitAuth = {
        getEmail: function () {
            return localStorage.getItem(STORAGE_KEY_EMAIL) || '';
        },

        setEmail: function (email) {
            if (email) localStorage.setItem(STORAGE_KEY_EMAIL, email.toLowerCase().trim());
            else localStorage.removeItem(STORAGE_KEY_EMAIL);
        },

        getWebAppUrl: function () {
            return localStorage.getItem(STORAGE_KEY_WEBAPP_URL) || DEFAULT_WEB_APP_URL;
        },

        setWebAppUrl: function (url) {
            if (url) localStorage.setItem(STORAGE_KEY_WEBAPP_URL, url.trim());
            else localStorage.removeItem(STORAGE_KEY_WEBAPP_URL);
        },

        isAuthorized: function () {
            return sessionStorage.getItem(STORAGE_KEY_AUTH_STATUS) === 'true';
        },

        // 🔒 التحقق من صلاحية البريد مع خادم السكريبت
        verifyAccess: async function (email, customUrl) {
            const targetUrl = customUrl || this.getWebAppUrl();
            if (!targetUrl) {
                return { allowed: false, error: 'NO_WEBAPP_URL', message: 'لم يتم إعداد رابط خادم الشركة (Web App URL) في الإعدادات.' };
            }

            if (!email) {
                return { allowed: false, error: 'NO_EMAIL', message: 'يرجى إدخال البريد الإلكتروني للتحقق.' };
            }

            try {
                const response = await fetch(targetUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        action: 'check_access',
                        userEmail: email.toLowerCase().trim()
                    })
                });

                const data = await response.json();
                if (data.allowed) {
                    this.setEmail(email);
                    sessionStorage.setItem(STORAGE_KEY_AUTH_STATUS, 'true');
                    return { allowed: true, message: data.message || 'تم التحقق بنجاح' };
                } else {
                    sessionStorage.removeItem(STORAGE_KEY_AUTH_STATUS);
                    return { allowed: false, message: data.message || 'عذراً، البريد غير مصرح له بالاستخدام.' };
                }
            } catch (err) {
                console.error('Auth Guard verify error:', err);
                return { allowed: false, error: 'NETWORK_ERROR', message: 'فشل الاتصال بخادم الشركة. يرجى التأكد من الرابط أو الشبكة.' };
            }
        },

        // ☁️ إجراء النسخ الاحتياطي عبر Web App
        backupData: async function (payload) {
            const targetUrl = this.getWebAppUrl();
            const email = this.getEmail();

            if (!targetUrl || !email) {
                throw new Error('يرجى تسجيل الدخول وإعداد رابط Web App الخاص بالشركة أولاً.');
            }

            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'backup',
                    userEmail: email,
                    payload: payload
                })
            });

            const data = await response.json();
            if (!data.allowed) {
                throw new Error(data.message || 'غير مصرح للبريد بإجراء الحفظ السحابي.');
            }
            return data;
        },

        // ☁️ إجراء استرداد النسخة الاحتياطية عبر Web App
        restoreData: async function () {
            const targetUrl = this.getWebAppUrl();
            const email = this.getEmail();

            if (!targetUrl || !email) {
                throw new Error('يرجى تسجيل الدخول وإعداد رابط Web App الخاص بالشركة أولاً.');
            }

            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'restore',
                    userEmail: email
                })
            });

            const data = await response.json();
            if (!data.allowed) {
                throw new Error(data.message || 'غير مصرح للبريد باستعادة البيانات.');
            }
            return data;
        }
    };

    // ==============================================================================
    // 🎨 إنشاء وتدبير شاشة القفل (UI Lock Screen)
    // ==============================================================================
    function initLockScreen() {
        if (document.getElementById('fastToolkitLockOverlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'fastToolkitLockOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(12, 12, 14, 0.98);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            direction: rtl;
            color: #eeeeee;
        `;

        overlay.innerHTML = `
            <div style="
                background: #18181c;
                border: 1px solid #2a2a32;
                border-radius: 16px;
                padding: 24px 28px;
                width: 90%;
                max-width: 380px;
                text-align: center;
                box-shadow: 0 20px 50px rgba(0,0,0,0.8);
            ">
                <div style="font-size: 42px; margin-bottom: 8px;">🔒</div>
                <h3 style="margin: 0 0 8px 0; color: #ffffff; font-size: 18px; font-weight: 700;">FAST TOOLKIT</h3>
                <p style="margin: 0 0 16px 0; color: #a0a0ab; font-size: 12px; line-height: 1.5;">
                    هذا التطبيق محمّي وخاص بالشركة. يرجى إدخال البريد الإلكتروني المعتمد للتحقق من الصلاحيات.
                </p>

                <div id="lockStatusBox" style="
                    display: none;
                    padding: 8px 12px;
                    border-radius: 8px;
                    font-size: 11px;
                    margin-bottom: 12px;
                "></div>

                <div id="lockInputForm">
                    <input type="email" id="lockEmailInput" placeholder="name@company.com" style="
                        width: 100%;
                        box-sizing: border-box;
                        padding: 10px 12px;
                        background: #0f0f12;
                        border: 1px solid #33333d;
                        border-radius: 8px;
                        color: #ffffff;
                        font-size: 13px;
                        text-align: center;
                        margin-bottom: 10px;
                        outline: none;
                    " dir="ltr" value="${window.FastToolkitAuth.getEmail()}">

                    <input type="url" id="lockUrlInput" placeholder="رابط Web App (إذا لم يتم حفظه)" style="
                        width: 100%;
                        box-sizing: border-box;
                        padding: 8px 12px;
                        background: #0f0f12;
                        border: 1px solid #33333d;
                        border-radius: 8px;
                        color: #888899;
                        font-size: 11px;
                        text-align: center;
                        margin-bottom: 14px;
                        outline: none;
                        display: ${window.FastToolkitAuth.getWebAppUrl() ? 'none' : 'block'};
                    " dir="ltr" value="${window.FastToolkitAuth.getWebAppUrl()}">

                    <button id="lockSubmitBtn" style="
                        width: 100%;
                        padding: 10px;
                        background: #00e676;
                        color: #000000;
                        border: none;
                        border-radius: 8px;
                        font-weight: 700;
                        font-size: 13px;
                        cursor: pointer;
                        transition: background 0.2s;
                    ">التحقق والدخول 🚀</button>

                    <button id="toggleUrlBtn" style="
                        background: transparent;
                        border: none;
                        color: #666677;
                        font-size: 10px;
                        margin-top: 10px;
                        cursor: pointer;
                        text-decoration: underline;
                    ">${window.FastToolkitAuth.getWebAppUrl() ? 'تعديل رابط خادم الشركة' : 'إخفاء رابط الخادم'}</button>
                </div>
            </div>
        `;

        document.documentElement.appendChild(overlay);

        const emailInput = document.getElementById('lockEmailInput');
        const urlInput = document.getElementById('lockUrlInput');
        const submitBtn = document.getElementById('lockSubmitBtn');
        const statusBox = document.getElementById('lockStatusBox');
        const toggleUrlBtn = document.getElementById('toggleUrlBtn');

        toggleUrlBtn.addEventListener('click', () => {
            if (urlInput.style.display === 'none') {
                urlInput.style.display = 'block';
                toggleUrlBtn.innerText = 'إخفاء رابط الخادم';
            } else {
                urlInput.style.display = 'none';
                toggleUrlBtn.innerText = 'تعديل رابط خادم الشركة';
            }
        });

        async function handleAuthCheck() {
            const email = emailInput.value.trim();
            let webAppUrl = urlInput.value.trim() || window.FastToolkitAuth.getWebAppUrl();

            if (!webAppUrl) {
                showStatus('يرجى إدخال رابط Web App الخاص برابط خادم الشركة ⚠️', 'warning');
                urlInput.style.display = 'block';
                return;
            }

            if (!email) {
                showStatus('يرجى إدخال بريدك الإلكتروني ⚠️', 'warning');
                return;
            }

            showStatus('جاري التحقق من الصلاحية... ⏳', 'info');
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.7';

            window.FastToolkitAuth.setWebAppUrl(webAppUrl);
            const result = await window.FastToolkitAuth.verifyAccess(email, webAppUrl);

            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';

            if (result.allowed) {
                showStatus('تم التحقق بنجاح! جاري فتح التطبيق... ✅', 'success');
                setTimeout(() => {
                    overlay.style.display = 'none';
                }, 400);
            } else {
                showStatus(result.message || 'البريد غير مصرح له بالاستخدام ⛔', 'danger');
            }
        }

        submitBtn.addEventListener('click', handleAuthCheck);
        emailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAuthCheck(); });

        function showStatus(msg, type) {
            statusBox.style.display = 'block';
            statusBox.innerText = msg;
            if (type === 'danger') {
                statusBox.style.background = 'rgba(255, 68, 68, 0.15)';
                statusBox.style.border = '1px solid #ff4444';
                statusBox.style.color = '#ff6666';
            } else if (type === 'success') {
                statusBox.style.background = 'rgba(0, 230, 118, 0.15)';
                statusBox.style.border = '1px solid #00e676';
                statusBox.style.color = '#00e676';
            } else if (type === 'warning') {
                statusBox.style.background = 'rgba(255, 187, 51, 0.15)';
                statusBox.style.border = '1px solid #ffbb33';
                statusBox.style.color = '#ffbb33';
            } else {
                statusBox.style.background = 'rgba(66, 133, 244, 0.15)';
                statusBox.style.border = '1px solid #4285f4';
                statusBox.style.color = '#4285f4';
            }
        }

        // إخفاء القفل تلقائياً إذا كان مفحوصاً ومصرحاً له في الجلسة الحالية
        if (window.FastToolkitAuth.isAuthorized() && window.FastToolkitAuth.getEmail()) {
            overlay.style.display = 'none';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLockScreen);
    } else {
        initLockScreen();
    }

})();
