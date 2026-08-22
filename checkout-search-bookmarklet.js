(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        const api = factory();
        root.FastToolkitCheckoutSearch = api;
        root.FastToolkitCheckoutWithCardSearch = api;
        root.FastToolkitCheckoutWithoutCardSearch = Object.freeze({
            buildBookmarklet: api.buildWithoutCardBookmarklet,
            buildInlineBookmarklet: api.buildWithoutCardBookmarklet,
            install: api.installWithoutCard
        });
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createCheckoutSearchEngine() {
        function normalizeDigits(value) {
            return String(value == null ? '' : value)
                .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
                .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
        }

        function normalizeText(value) {
            return normalizeDigits(value)
                .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
                .replace(/\u00a0/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function parseAmount(value) {
            const text = normalizeDigits(value).replace(/\u00a0/g, ' ').trim();
            const match = text.match(/(?:^|[^\d])(\d+[,]\d{1,2}|(?:\d{1,3}(?:[ ,]\d{3})+|\d+)(?:\.\d{1,2})?)(?!\d)/);
            if (!match) return null;
            let numeric = match[1].replace(/\s+/g, '');
            if (numeric.includes('.') && numeric.includes(',')) {
                numeric = numeric.replace(/,/g, '');
            } else if (numeric.includes(',')) {
                if (/^\d{1,3}(?:,\d{3})+$/.test(numeric)) numeric = numeric.replace(/,/g, '');
                else if (/^\d+,\d{1,2}$/.test(numeric)) numeric = numeric.replace(',', '.');
                else numeric = numeric.replace(/,/g, '');
            }
            const number = Number(numeric);
            return Number.isFinite(number) && number >= 0 ? Object.freeze({ number, normalized: numeric }) : null;
        }

        function validDateParts(year, month, day) {
            const y = Number(year);
            const m = Number(month);
            const d = Number(day);
            if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
            if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
            const date = new Date(y, m - 1, d);
            return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
        }

        function inferYear(month, day, nowValue) {
            const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
            let year = now.getFullYear();
            const candidate = new Date(year, Number(month) - 1, Number(day), 12, 0, 0, 0);
            const futureLimit = new Date(now.getTime() + (45 * 24 * 60 * 60 * 1000));
            if (candidate > futureLimit) year -= 1;
            return year;
        }

        function parseDate(value, nowValue) {
            const text = normalizeText(value).replace(/[./]/g, '-');
            let match = text.match(/(^|\D)(20\d{2})-(\d{1,2})-(\d{1,2})(?!\d)/);
            let year;
            let month;
            let day;
            if (match) {
                year = Number(match[2]);
                month = Number(match[3]);
                day = Number(match[4]);
            } else {
                match = text.match(/(^|\D)(\d{1,2})-(\d{1,2})-(\d{2,4})(?!\d)/);
                if (match) {
                    day = Number(match[2]);
                    month = Number(match[3]);
                    year = Number(match[4]);
                    if (year < 100) year += 2000;
                } else {
                    match = text.match(/(^|\D)(\d{1,2})-(\d{1,2})(?![-\d])/);
                    if (!match) return null;
                    day = Number(match[2]);
                    month = Number(match[3]);
                    year = inferYear(month, day, nowValue);
                }
            }
            if (!validDateParts(year, month, day)) return null;
            const formattedDay = String(day).padStart(2, '0');
            const formattedMonth = String(month).padStart(2, '0');
            const formattedYear = String(year).padStart(4, '0');
            const iso = `${formattedYear}-${formattedMonth}-${formattedDay}`;
            const checkoutDateToken = `${formattedYear}${formattedMonth}${formattedDay}`;
            const checkoutDateParam = `${checkoutDateToken}..${checkoutDateToken}`;

            return Object.freeze({
                year,
                month,
                day,
                iso,
                checkoutDateParam
            });
        }

        function splitClipboardParts(rawText) {
            const text = normalizeText(rawText);
            if (!text) return [];

            if (text.includes('//')) {
                return text.split(/\s*\/\/\s*/).map(p => p.trim());
            }
            if (text.includes('\\\\')) {
                return text.split(/\s*\\\\\s*/).map(p => p.trim());
            }
            if (/\s+[\/\\|–—]\s+/.test(text) || /\s+-\s+/.test(text)) {
                return text.split(/\s+[\/\\|–—-]\s+/).map(p => p.trim());
            }
            if (text.includes('\\')) {
                return text.split(/\s*\\\s*/).map(p => p.trim());
            }
            if (text.includes('/')) {
                const slashParts = text.split(/\s*\/\s*/).map(p => p.trim());
                if (slashParts.length >= 4) {
                    return [
                        slashParts[0],
                        slashParts[1],
                        slashParts[2],
                        slashParts.slice(3).join('-')
                    ];
                }
            }
            if (text.includes('-')) {
                const dashParts = text.split(/\s*-\s*/).map(p => p.trim());
                if (dashParts.length >= 4) {
                    return [
                        dashParts[0],
                        dashParts[1],
                        dashParts[2],
                        dashParts.slice(3).join('-')
                    ];
                }
            }
            if (text.includes('|')) {
                return text.split(/\s*\|\s*/).map(p => p.trim());
            }
            return [];
        }

        function parseTimeToken(value) {
            if (!value) return '';
            const text = normalizeText(value).toLowerCase();

            let match = text.match(/(?:^|\D)([01]?\d|2[0-3])[:.]([0-5]\d)(?::[0-5]\d)?\s*(am|pm|ص|م)?(?!\d)/i);
            if (match) {
                let hour = Number(match[1]);
                const minute = match[2];
                const ampm = (match[3] || '').toLowerCase();
                if ((ampm === 'pm' || ampm === 'م') && hour < 12) hour += 12;
                if ((ampm === 'am' || ampm === 'ص') && hour === 12) hour = 0;
                return `${String(hour).padStart(2, '0')}:${minute}`;
            }

            match = text.match(/(?:^|\D)([01]?\d|2[0-3])-([0-5]\d)(?!\d)/);
            if (match) {
                return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
            }

            match = text.match(/(?:^|\D)([01]\d|2[0-3])([0-5]\d)(?!\d)/);
            if (match) {
                return `${match[1]}:${match[2]}`;
            }

            return '';
        }

        function parseClipboard(value, nowValue) {
            const raw = normalizeText(value);
            const parts = splitClipboardParts(raw);
            const amount = parseAmount(parts[0] || raw);
            const cardMatch = String(parts[1] || raw).match(/(?:\D|^)(\d{4})(?!\d)/);
            const parsedTime = parts[2] ? parseTimeToken(parts[2]) : '';
            const timeFallback = String(raw).match(/(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/);
            const time = parsedTime || (timeFallback ? `${String(Number(timeFallback[1])).padStart(2, '0')}:${timeFallback[2]}` : '');
            const dateSource = (parts.length >= 4 ? parts.slice(3).join(' ') : '') || raw;
            const date = parseDate(dateSource, nowValue);
            const isApplePay = /apple\s*pay|آبل\s*باي|ابل\s*باي/i.test(raw);

            return Object.freeze({
                raw,
                amount: amount ? amount.normalized : '',
                card: cardMatch ? cardMatch[1] : '',
                time,
                date,
                isApplePay
            });
        }

        function buildCheckoutUrl(data, mode = 'with-card') {
            const withoutCard = mode === 'without-card';
            let baseUrl = 'https://dashboard.checkout.com/payments/all-payments';
            const params = [];

            if (data.amount) {
                params.push(`amount=${encodeURIComponent(data.amount)}`);
                params.push('currency=SAR');
            }

            if (!withoutCard && data.card) {
                params.push(`card=${encodeURIComponent(data.card)}`);
            }

            if (data.date && data.date.checkoutDateParam) {
                params.push(`date=${encodeURIComponent(data.date.checkoutDateParam)}`);
            }

            return params.length > 0 ? `${baseUrl}?${params.join('&')}` : baseUrl;
        }

        function isCheckoutDomain(locationLike) {
            if (!locationLike) return false;
            const hostname = String(locationLike.hostname || '').toLowerCase();
            return hostname === 'checkout.com' || hostname.endsWith('.checkout.com');
        }

        return Object.freeze({
            normalizeDigits,
            normalizeText,
            parseAmount,
            parseDate,
            parseClipboard,
            buildCheckoutUrl,
            isCheckoutDomain
        });
    }

    async function checkoutSearchRuntime(createEngine, request = {}) {
        const engine = createEngine();
        if (request.action !== 'run') return null;
        if (typeof window === 'undefined' || typeof document === 'undefined') return null;

        const withoutCard = request.mode === 'without-card';
        document.getElementById('fast-toolkit-checkout-status')?.remove();

        const showHud = (message, isError = false) => {
            try {
                const hud = document.createElement('div');
                hud.id = 'fast-toolkit-checkout-status';
                hud.setAttribute('role', 'status');
                hud.setAttribute('aria-live', 'polite');
                hud.style.cssText = [
                    'position:fixed',
                    'left:18px',
                    'bottom:18px',
                    'z-index:2147483647',
                    'max-width:420px',
                    'padding:12px 18px',
                    'border-radius:10px',
                    isError ? 'background:#8b1b1b' : 'background:#0f4c81',
                    'color:#ffffff',
                    'font:600 13px/1.6 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
                    'box-shadow:0 8px 30px rgba(0,0,0,0.35)',
                    'direction:rtl',
                    'text-align:right',
                    'border:1px solid rgba(255,255,255,0.2)',
                    'transition:opacity 0.3s ease'
                ].join(';');
                hud.textContent = message;
                (document.body || document.documentElement).appendChild(hud);
                window.setTimeout(() => {
                    hud.style.opacity = '0';
                    window.setTimeout(() => hud.remove(), 350);
                }, 3500);
            } catch (_) {}
        };

        try {
            const clipboardText = request.clipboardText != null
                ? String(request.clipboardText)
                : (typeof navigator !== 'undefined' && navigator.clipboard?.readText ? await navigator.clipboard.readText() : '');

            if (!clipboardText.trim()) {
                showHud('⚠️ الحافظة فارغة! انسخ النتيجة أولاً بصيغة: المبلغ // البطاقة // الوقت // التاريخ', true);
                return null;
            }

            const data = engine.parseClipboard(clipboardText, request.now);
            const checkoutUrl = engine.buildCheckoutUrl(data, request.mode);

            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                try {
                    await navigator.clipboard.writeText(checkoutUrl);
                } catch (_) {}
            }

            const isCurrentlyOnCheckout = engine.isCheckoutDomain(window.location);
            if (isCurrentlyOnCheckout) {
                window.location.href = checkoutUrl;
            } else {
                const opened = window.open(checkoutUrl, '_blank');
                if (!opened || opened.closed || typeof opened.closed === 'undefined') {
                    window.location.href = checkoutUrl;
                }
            }

            showHud(withoutCard
                ? '🛒 Checkout: تم نسخ وتوليد الرابط بدون بطاقة وفتحه بنجاح 🚀'
                : '🛒 Checkout: تم نسخ وتوليد رابط البحث ببطاقة وفتحه بنجاح 🚀');

            return Object.freeze({
                url: checkoutUrl,
                amount: data.amount,
                card: withoutCard ? '' : data.card,
                dateParam: data.date ? data.date.checkoutDateParam : '',
                withoutCard,
                navigatedSameTab: isCurrentlyOnCheckout
            });
        } catch (error) {
            showHud(`⚠️ خطأ في تشغيل بحث Checkout: ${error.message || error}`, true);
            return null;
        }
    }

    const engine = createCheckoutSearchEngine();

    function getRuntimeSource(mode = 'with-card') {
        return `void((${checkoutSearchRuntime.toString()})(${createCheckoutSearchEngine.toString()},{action:'run',mode:${JSON.stringify(mode)}}));`;
    }

    function buildInlineBookmarklet() {
        return `javascript:${encodeURIComponent(getRuntimeSource('with-card'))}`;
    }

    function buildBookmarklet() {
        return buildInlineBookmarklet();
    }

    function buildWithCardBookmarklet() {
        return buildInlineBookmarklet();
    }

    function buildWithoutCardBookmarklet() {
        return `javascript:${encodeURIComponent(getRuntimeSource('without-card'))}`;
    }

    function install(options) {
        return checkoutSearchRuntime(createCheckoutSearchEngine, Object.assign({ action: 'run', mode: 'with-card' }, options || {}));
    }

    function installWithoutCard(options) {
        return checkoutSearchRuntime(createCheckoutSearchEngine, Object.assign({ action: 'run', mode: 'without-card' }, options || {}));
    }

    return Object.freeze({
        normalizeDigits: engine.normalizeDigits,
        normalizeText: engine.normalizeText,
        parseAmount: engine.parseAmount,
        parseDate: engine.parseDate,
        parseClipboard: engine.parseClipboard,
        buildCheckoutUrl: engine.buildCheckoutUrl,
        isCheckoutDomain: engine.isCheckoutDomain,
        getRuntimeSource,
        buildBookmarklet,
        buildInlineBookmarklet,
        buildWithCardBookmarklet,
        buildWithoutCardBookmarklet,
        install,
        installWithoutCard
    });
}));
