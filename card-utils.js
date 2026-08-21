(function (root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }

    if (root) {
        root.CardScannerUtils = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const DECLINED_TERMS = [
        'decline', 'declined', 'failed', 'failure', 'insufficient',
        'مرفوض', 'مرفوضة', 'مرفوضه', 'فشل', 'فشلت', 'غير كافي', 'غير كاف'
    ];

    const SUCCESS_TERMS = [
        'success', 'successful', 'approved', 'completed',
        'ناجح', 'ناجحة', 'تمت', 'مقبول'
    ];

    function normalizeDigits(value) {
        return String(value ?? '')
            .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
            .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
            .replace(/٫/g, '.')
            .replace(/٬/g, ',')
            .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
    }

    function normalizeAmount(value) {
        let cleaned = normalizeDigits(value)
            .replace(/\s+/g, '')
            .replace(/[^\d.,-]/g, '');

        if (!cleaned || cleaned.startsWith('-')) return null;

        const lastComma = cleaned.lastIndexOf(',');
        const lastDot = cleaned.lastIndexOf('.');

        if (lastComma !== -1 && lastDot !== -1) {
            const decimalSeparator = lastComma > lastDot ? ',' : '.';
            const groupingSeparator = decimalSeparator === ',' ? /\./g : /,/g;
            cleaned = cleaned.replace(groupingSeparator, '');
            if (decimalSeparator === ',') cleaned = cleaned.replace(',', '.');
        } else if (lastComma !== -1) {
            const fractionLength = cleaned.length - lastComma - 1;
            cleaned = fractionLength > 0 && fractionLength <= 2
                ? cleaned.replace(/,/g, '.').replace(/\.(?=.*\.)/g, '')
                : cleaned.replace(/,/g, '');
        } else if (lastDot !== -1) {
            const parts = cleaned.split('.');
            const fractionLength = parts[parts.length - 1].length;
            if (fractionLength === 0) {
                return null;
            } else if (fractionLength > 2) {
                cleaned = parts.join('');
            } else if (parts.length > 2) {
                const fraction = parts.pop();
                cleaned = `${parts.join('')}.${fraction}`;
            }
        }

        const amount = Number(cleaned);
        if (!Number.isFinite(amount) || amount < 0) return null;
        return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
    }

    function normalizeCard(value) {
        const digits = normalizeDigits(value).replace(/\D/g, '');
        if (digits.length < 4) return null;
        return digits.slice(-4);
    }

    function normalizeTime(value) {
        const normalized = normalizeDigits(value).trim().toLowerCase();
        const match = normalized.match(/(?:^|\D)(\d{1,2}):(\d{2})(?:\s*(a\.?m\.?|p\.?m\.?|ص|م))?(?:\D|$)/i);
        if (!match) return null;

        let hour = Number(match[1]);
        const minute = Number(match[2]);
        const period = match[3] || '';

        if (minute < 0 || minute > 59) return null;
        if (period) {
            if (hour < 1 || hour > 12) return null;
            const isPm = period.startsWith('p') || period === 'م';
            const isAm = period.startsWith('a') || period === 'ص';
            if (isPm && hour !== 12) hour += 12;
            if (isAm && hour === 12) hour = 0;
        } else if (hour < 0 || hour > 23) {
            return null;
        }

        return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }

    function isValidDate(day, month, year) {
        if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return false;
        if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return false;
        const date = new Date(Date.UTC(year, month - 1, day));
        return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    }

    function normalizeDate(value, now = new Date()) {
        const normalized = normalizeDigits(value).trim().replace(/[/.\s]+/g, '-').replace(/-+/g, '-');
        const parts = normalized.split('-').filter(Boolean);
        const currentYear = now.getFullYear();
        const currentYearShort = currentYear % 100;

        if (parts.length !== 2 && parts.length !== 3) return null;

        const numbers = parts.map(part => Number(part));
        if (numbers.some(number => !Number.isInteger(number))) return null;

        let day;
        let month;
        let year = currentYear;

        if (parts.length === 2) {
            [day, month] = numbers;
            if (day <= 12 && month > 12) [day, month] = [month, day];
        } else {
            const [first, second, third] = numbers;
            const firstLength = parts[0].length;
            const thirdLength = parts[2].length;

            if (firstLength === 4) {
                year = first;
                month = second;
                day = third;
            } else if (thirdLength === 4) {
                day = first;
                month = second;
                year = third;
            } else {
                const yearFromFirst = 2000 + first;
                const looksLikeRecentYearFirst = first === currentYearShort ||
                    (yearFromFirst >= currentYear - 5 && yearFromFirst <= currentYear + 1);

                if (looksLikeRecentYearFirst) {
                    year = yearFromFirst;
                    month = second;
                    day = third;
                } else {
                    day = first;
                    month = second;
                    year = 2000 + third;
                }
            }
        }

        if (!isValidDate(day, month, year)) return null;
        const formatted = `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}`;
        return year === currentYear ? formatted : `${formatted}-${year}`;
    }

    function includesAny(text, terms) {
        return terms.some(term => text.includes(term));
    }

    function normalizeNetwork(value) {
        const text = normalizeDigits(value).toLowerCase();
        if (includesAny(text, ['apple pay', 'applepay', 'ابل باي', 'أبل باي', 'ابل باى', 'أبل باى'])) return 'apple pay';
        if (includesAny(text, ['mada', 'مدى'])) return 'mada';
        if (includesAny(text, ['mastercard', 'master card', 'master', 'ماستركارد'])) return 'mastercard';
        if (includesAny(text, ['visa', 'فيزا'])) return 'visa';
        return 'unknown';
    }

    function normalizeStatus(value) {
        const text = normalizeDigits(value).toLowerCase();
        if (includesAny(text, DECLINED_TERMS)) return 'declined';
        if (includesAny(text, SUCCESS_TERMS)) return 'success';
        return 'unknown';
    }

    function detectMeta(value) {
        const text = normalizeDigits(value).toLowerCase();
        return {
            network: normalizeNetwork(text),
            status: includesAny(text, DECLINED_TERMS) ? 'declined' : 'success'
        };
    }

    function buildResult(fields) {
        const card = fields.card || '0000';
        const amount = fields.amount || '0';
        const time = fields.time || '00:00';
        const date = fields.date || '00-00';
        return {
            card,
            amount,
            time,
            date,
            network: fields.network || 'unknown',
            status: fields.status || 'unknown',
            cleanText: fields.cleanText || '',
            fullText: `${amount} // ${card} // ${time} // ${date}`
        };
    }

    function parseAIResultText(aiText, now = new Date()) {
        const cleaned = normalizeDigits(aiText)
            .replace(/```[a-z]*\s*/gi, '')
            .replace(/```/g, '')
            .trim();
        const lines = cleaned.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const candidates = lines.filter(line => line.split('//').length >= 6);
        if (candidates.length === 0 && cleaned) candidates.push(cleaned);

        for (const candidateLine of candidates) {
            const parts = candidateLine.split('//').map(part => part.trim());
            if (parts.length < 6) continue;

            const card = normalizeCard(parts[0]) || '0000';
            const amount = normalizeAmount(parts[1]);
            const time = normalizeTime(parts[2]);
            const date = normalizeDate(parts[3], now);
            const network = normalizeNetwork(parts[4]);
            const status = normalizeStatus(parts[5]);
            if (amount === null || Number(amount) <= 0 || time === null || date === null) continue;

            const result = buildResult({ card, amount, time, date, network, status, cleanText: cleaned });
            return { valid: true, error: null, result };
        }

        return { valid: false, error: candidates.length ? 'AI_FIELDS' : 'AI_FORMAT', result: null };
    }

    function selectRelevantText(rawText) {
        const normalized = normalizeDigits(rawText);
        const blocks = normalized.split(/\n\s*\n+/).map(block => block.trim()).filter(Boolean);
        const tabbyBlocks = blocks.filter(block => /tabby|تابي/i.test(block));
        return tabbyBlocks.length > 0 ? tabbyBlocks[tabbyBlocks.length - 1] : normalized;
    }

    function extractAmount(text) {
        const numeric = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d{1,9}(?:[.,]\\d{1,2})?)';
        const currencyAfter = new RegExp(`(?:sar|ر\\.?\\s*س|ريال|amount|مبلغ)[^\\d]{0,12}${numeric}`, 'i');
        const currencyBefore = new RegExp(`${numeric}\\s*(?:sar|ر\\.?\\s*س|ريال)`, 'i');
        const explicit = text.match(currencyAfter) || text.match(currencyBefore);
        if (explicit) return normalizeAmount(explicit[1]);

        const decimal = text.match(/\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{1,9}[.,]\d{1,2}/);
        return decimal ? normalizeAmount(decimal[0]) : null;
    }

    function extractCard(text, now = new Date()) {
        const lines = text.split(/\r?\n/);
        const markerPatterns = [
            /(?:عبر|بطاقة|البطاقة|card(?:\s+ending(?:\s+in)?)?|ending(?:\s+in)?)[^\d]{0,25}([\d\s*xX•-]{4,40})/i,
            /(?:by|using)[^\d]{0,12}([\d\s*xX•-]{4,40})/i
        ];

        for (const line of lines) {
            for (const pattern of markerPatterns) {
                const match = line.match(pattern);
                const card = match ? normalizeCard(match[1]) : null;
                if (card) return card;
            }

            const hasFrom = /(?:من|from)/i.test(line);
            const hasAccount = /(?:حساب|account)/i.test(line);
            const hasBy = /(?:عبر|\bby\b)/i.test(line);
            if (hasFrom && !hasAccount && !hasBy) {
                const fromMatch = line.match(/(?:من|from)[^\d]{0,12}([\d\s*xX•-]{4,40})/i);
                const card = fromMatch ? normalizeCard(fromMatch[1]) : null;
                if (card) return card;
            }
        }

        const accountDigits = new Set();
        for (const line of lines) {
            if (/(?:حساب|account)/i.test(line)) {
                (line.match(/\b\d{4}\b/g) || []).forEach(value => accountDigits.add(value));
            }
        }
        const amount = extractAmount(text);
        const excludedAmounts = new Set();
        if (amount !== null) {
            const integerPart = String(amount).split('.')[0];
            if (integerPart.length === 4) excludedAmounts.add(integerPart);
        }

        const candidates = text.match(/\b\d{4}\b/g) || [];
        return candidates.find(candidate =>
            !/^(?:19|20)\d{2}$/.test(candidate) &&
            !accountDigits.has(candidate) &&
            !excludedAmounts.has(candidate)
        ) || '0000';
    }

    function extractDate(text, now = new Date()) {
        const fullDate = text.match(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/);
        if (fullDate) return normalizeDate(fullDate[0], now);

        const labeledDate = text.match(/(?:date|بتاريخ|تاريخ)[^\d]{0,8}(\d{1,2}[-/.]\d{1,2})/i);
        return labeledDate ? normalizeDate(labeledDate[1], now) : null;
    }

    function extractTime(text) {
        const match = text.match(/(?:^|\D)\d{1,2}:\d{2}(?:\s*(?:a\.?m\.?|p\.?m\.?|ص|م))?(?:\D|$)/i);
        return match ? normalizeTime(match[0]) : null;
    }

    function parseLocalOcrText(rawText, now = new Date()) {
        const relevantText = selectRelevantText(rawText).trim();
        if (!relevantText) return { valid: false, error: 'OCR_EMPTY', result: null };

        const amount = extractAmount(relevantText);
        const time = extractTime(relevantText);
        const date = extractDate(relevantText, now);
        const card = extractCard(relevantText, now);
        const meta = detectMeta(relevantText);

        if (amount === null || Number(amount) <= 0 || time === null || date === null) {
            return { valid: false, error: 'OCR_FIELDS', result: null };
        }

        return {
            valid: true,
            error: null,
            result: buildResult({
                card,
                amount,
                time,
                date,
                network: meta.network,
                status: meta.status,
                cleanText: relevantText.replace(/\s+/g, ' ')
            })
        };
    }

    return {
        normalizeDigits,
        normalizeAmount,
        normalizeCard,
        normalizeTime,
        normalizeDate,
        normalizeNetwork,
        normalizeStatus,
        detectMeta,
        parseAIResultText,
        parseLocalOcrText
    };
});
