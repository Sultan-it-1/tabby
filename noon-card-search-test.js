(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        const api = factory();
        root.FastToolkitNoonCardSearchTest2 = api;
        root.FastToolkitNoonCardSearchTest = api;
        root.FastToolkitNoonCardSearchTest3 = Object.freeze({
            buildBookmarklet: api.buildWithoutCardBookmarklet,
            buildInlineBookmarklet: api.buildWithoutCardBookmarklet,
            install: api.installWithoutCard
        });
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createNoonSearchEngine() {
        const MONTH_NAMES = Object.freeze([
            ['jan', 'january', 'يناير', 'كانون الثاني'],
            ['feb', 'february', 'فبراير', 'شباط'],
            ['mar', 'march', 'مارس', 'آذار', 'اذار'],
            ['apr', 'april', 'أبريل', 'ابريل', 'نيسان'],
            ['may', 'مايو', 'أيار', 'ايار'],
            ['jun', 'june', 'يونيو', 'حزيران'],
            ['jul', 'july', 'يوليو', 'تموز'],
            ['aug', 'august', 'أغسطس', 'اغسطس', 'آب', 'اب'],
            ['sep', 'sept', 'september', 'سبتمبر', 'أيلول', 'ايلول'],
            ['oct', 'october', 'أكتوبر', 'اكتوبر', 'تشرين الأول', 'تشرين الاول'],
            ['nov', 'november', 'نوفمبر', 'تشرين الثاني'],
            ['dec', 'december', 'ديسمبر', 'كانون الأول', 'كانون الاول']
        ]);

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
            return Number.isFinite(number) ? Object.freeze({ number, normalized: numeric }) : null;
        }

        function extractAmountValues(value) {
            const text = normalizeText(value)
                .replace(/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/g, ' ')
                .replace(/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g, ' ')
                .replace(/\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/g, ' ')
                .replace(/(?:\*|x|•){2,}\s*\d{4}\b/gi, ' ')
                .replace(/\b\d{10,}\b/g, ' ');
            const values = [];
            const pattern = /(?:^|[^\d])(\d+[,]\d{1,2}|(?:\d{1,3}(?:[ ,]\d{3})+|\d+)(?:\.\d{1,2})?)(?!\d)/g;
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const parsed = parseAmount(match[1]);
                if (parsed) values.push(parsed.number);
            }
            return Object.freeze(values);
        }

        function amountMatchesText(value, targetAmount) {
            const target = parseAmount(targetAmount);
            if (!target) return false;
            return extractAmountValues(value).some(amount => Math.abs(amount - target.number) < 0.005);
        }

        function exactDigitsMatch(value, digits) {
            const wanted = normalizeDigits(digits).replace(/\D/g, '');
            if (!wanted) return false;
            const escaped = wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`(^|\\D)${escaped}(?!\\d)`).test(normalizeDigits(value));
        }

        function exactTimeMatch(value, time) {
            const normalizedTime = normalizeDigits(time).trim();
            if (!/^\d{2}:\d{2}$/.test(normalizedTime)) return false;
            const escaped = normalizedTime.replace(':', '\\:');
            return new RegExp(`(^|\\D)${escaped}(?!\\d)`).test(normalizeDigits(value));
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

        function formatIsoDate(year, month, day) {
            return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
            const iso = formatIsoDate(year, month, day);
            return Object.freeze({
                year,
                month,
                day,
                iso,
                range: `${iso} 00:00 - ${iso} 23:59`
            });
        }

        function parseClipboard(value, nowValue) {
            const raw = normalizeText(value);
            const parts = raw.includes('//') ? raw.split('//').map(part => part.trim()) : [];
            const amount = parseAmount(parts[0] || raw);
            const cardMatch = String(parts[1] || raw).match(/(?:\D|^)(\d{4})(?!\d)/);
            const timeMatch = String(parts[2] || raw).match(/(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/);
            const dateSource = parts.slice(3).join(' ') || raw;
            const date = parseDate(dateSource, nowValue);
            return Object.freeze({
                raw,
                amount: amount ? amount.normalized : '',
                card: cardMatch ? cardMatch[1] : '',
                time: timeMatch ? `${String(Number(timeMatch[1])).padStart(2, '0')}:${timeMatch[2]}` : '',
                date
            });
        }

        function parseMonthLabel(value) {
            const text = normalizeText(value).toLowerCase();
            const yearMatch = text.match(/(?:^|\D)(20\d{2})(?!\d)/);
            if (!yearMatch) return null;
            let month = null;
            for (let index = 0; index < MONTH_NAMES.length && month == null; index += 1) {
                if (MONTH_NAMES[index].some(name => text.includes(name.toLowerCase()))) month = index + 1;
            }
            if (month == null) {
                const numeric = text.match(/(?:^|\D)(0?[1-9]|1[0-2])\s*[/-]\s*20\d{2}(?!\d)/);
                if (numeric) month = Number(numeric[1]);
            }
            return month == null ? null : Object.freeze({ year: Number(yearMatch[1]), month });
        }

        function isAllowedLocation(locationLike) {
            if (!locationLike) return false;
            const protocol = String(locationLike.protocol || '').toLowerCase();
            const hostname = String(locationLike.hostname || '').toLowerCase();
            if (protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1') return true;
            return protocol === 'https:' && (hostname === 'portal.noonpayments.com' || hostname === 'portal.sa.noonpayments.com');
        }

        return Object.freeze({
            normalizeDigits,
            normalizeText,
            parseAmount,
            extractAmountValues,
            amountMatchesText,
            exactDigitsMatch,
            exactTimeMatch,
            parseDate,
            parseClipboard,
            parseMonthLabel,
            isAllowedLocation
        });
    }

    async function noonCardSearchRuntime(createEngine, request = {}) {
        const engine = createEngine();
        if (request.action !== 'run') return null;
        if (typeof window === 'undefined' || typeof document === 'undefined') return null;
        document.getElementById('fast-toolkit-noon-test-status')?.remove();

        if (!engine.isAllowedLocation(window.location)) {
            return null;
        }

        const delay = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));
        const isVisible = element => {
            if (!element || element.disabled) return false;
            if (element.hidden || element.getAttribute?.('aria-hidden') === 'true') return false;
            const style = typeof window.getComputedStyle === 'function' ? window.getComputedStyle(element) : null;
            return !style || (style.display !== 'none' && style.visibility !== 'hidden');
        };
        const waitFor = async (getter, timeout = 4000) => {
            const startedAt = Date.now();
            while (Date.now() - startedAt < timeout) {
                const value = getter();
                if (value) return value;
                await delay(70);
            }
            return null;
        };
        const dispatch = (element, type) => {
            const EventConstructor = type === 'click' && typeof MouseEvent === 'function' ? MouseEvent : Event;
            element.dispatchEvent(new EventConstructor(type, { bubbles: true, cancelable: true, composed: true }));
        };
        const setInputValue = (element, value) => {
            if (!element) return false;
            try {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                if (setter) setter.call(element, value);
                else element.value = value;
            } catch (error) {
                element.value = value;
            }
            dispatch(element, 'input');
            dispatch(element, 'change');
            dispatch(element, 'blur');
            return true;
        };
        const setSelectValue = (element, value) => {
            if (!element) return false;
            const option = Array.from(element.options || []).find(item => String(item.value) === String(value) && !item.disabled);
            if (!option) return false;
            try {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
                if (setter) setter.call(element, option.value);
                else element.value = option.value;
            } catch (error) {
                element.value = option.value;
            }
            dispatch(element, 'input');
            dispatch(element, 'change');
            return true;
        };

        function metadata(element) {
            const label = element.closest?.('mat-form-field, .mat-mdc-form-field, label, .form-group')?.innerText || '';
            return engine.normalizeText([
                element.id,
                element.name,
                element.placeholder,
                element.getAttribute?.('aria-label'),
                element.className,
                label
            ].filter(Boolean).join(' ')).toLowerCase();
        }

        function findDateInput() {
            return document.querySelector('#calendar-input, input[ngxdaterangepickermd], input[ngxdaterangepicker]') ||
                Array.from(document.querySelectorAll('input')).find(element => /calendar|date-time|date range|daterange|التاريخ/.test(metadata(element)));
        }

        function findFields(kind, dateInput) {
            const inputs = Array.from(document.querySelectorAll('input')).filter(element => element !== dateInput && isVisible(element));
            const patterns = kind === 'card'
                ? [/card/, /last\s*4/, /pan/, /payer/, /بطاق/]
                : [/amount/, /مبلغ/];
            return inputs
                .map(element => ({ element, score: patterns.reduce((score, pattern) => score + (pattern.test(metadata(element)) ? 10 : 0), 0) }))
                .filter(item => item.score > 0)
                .sort((left, right) => right.score - left.score)
                .map(item => item.element);
        }

        const normalizedChoice = value => engine.normalizeText(value).toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
        const isCurrencyChoice = (label, value) => {
            const text = normalizedChoice(label);
            const rawValue = normalizedChoice(value);
            return text === 'currency' || text === 'currencies' || text === 'العملة' || text === 'عمله' ||
                rawValue === 'currency' || rawValue === 'currencies';
        };
        const isSarChoice = (label, value) => {
            const text = normalizedChoice(label);
            const rawValue = normalizedChoice(value);
            return rawValue === 'sar' || text === 'sar' ||
                /^(sar\s+)?saudi( arabian)? riyal(\s+sar)?$/.test(text) ||
                /^(sar\s+)?ريال سعودي(\s+sar)?$/.test(text);
        };
        const chooseNativeOption = (select, matcher) => {
            const option = Array.from(select?.options || []).find(item => !item.disabled && matcher(item.textContent, item.value));
            return option ? setSelectValue(select, option.value) : false;
        };
        const visibleMaterialOptions = () => Array.from(document.querySelectorAll('mat-option, .mat-mdc-option, [role="option"]'))
            .filter(isVisible);
        const closeMaterialSelect = control => {
            const target = control || document.activeElement || document.body;
            target.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true
            }));
        };
        const chooseMaterialOption = async (control, matcher) => {
            if (!control || !isVisible(control)) return false;
            control.click();
            const options = await waitFor(() => {
                const visible = visibleMaterialOptions();
                return visible.length ? visible : null;
            }, 1200);
            if (!options) return false;
            const option = options.find(item => matcher(item.textContent, item.getAttribute?.('value')));
            if (!option) {
                closeMaterialSelect(control);
                await delay(80);
                return false;
            }
            const isMultiple = control.hasAttribute?.('multiple') ||
                control.classList?.contains('mat-mdc-select-multiple') ||
                option.closest?.('[aria-multiselectable="true"]');
            option.click();
            await delay(100);
            if (isMultiple) {
                closeMaterialSelect(control);
                await waitFor(() => visibleMaterialOptions().length ? null : true, 1200);
            }
            await delay(80);
            return true;
        };

        async function selectOptionalSarCurrency(dateInput) {
            const searchRoot = dateInput?.closest?.('np-common-search') ||
                dateInput?.closest?.('mat-card.search_card, .search_card');
            if (!searchRoot) return false;
            const nativeSelects = () => Array.from(searchRoot.querySelectorAll('select')).filter(isVisible);
            const nativeSarSelect = () => nativeSelects().find(select =>
                Array.from(select.options || []).some(option => isSarChoice(option.textContent, option.value)));
            const chooseVisibleNativeSar = () => {
                const select = nativeSarSelect();
                return select ? chooseNativeOption(select, isSarChoice) : false;
            };
            if (chooseVisibleNativeSar()) return true;

            const nativeCurrencyField = nativeSelects().find(select =>
                Array.from(select.options || []).some(option => isCurrencyChoice(option.textContent, option.value)));
            if (nativeCurrencyField && chooseNativeOption(nativeCurrencyField, isCurrencyChoice)) {
                const selected = await waitFor(() => chooseVisibleNativeSar() ? true : null, 2500);
                if (selected) return true;
            }

            const materialControls = () => Array.from(searchRoot.querySelectorAll('mat-select, [role="combobox"]'))
                .filter(isVisible);
            const isCurrencyControl = control => /currenc(?:y|ies)|العملة|عمله/.test(metadata(control));
            const directCurrencyControl = materialControls().find(isCurrencyControl);
            if (directCurrencyControl && await chooseMaterialOption(directCurrencyControl, isSarChoice)) return true;

            const fieldControls = materialControls().filter(control => /field|filter|criteria|حقل|فلتر|معيار/.test(metadata(control)));
            for (const fieldControl of fieldControls) {
                if (!await chooseMaterialOption(fieldControl, isCurrencyChoice)) continue;
                const selected = await waitFor(() => {
                    if (chooseVisibleNativeSar()) return true;
                    return materialControls().find(control => control !== fieldControl && isCurrencyControl(control)) || null;
                }, 2500);
                if (selected === true) return true;
                if (selected && await chooseMaterialOption(selected, isSarChoice)) return true;
            }
            return false;
        }

        function findPicker() {
            const candidates = Array.from(document.querySelectorAll('.md-drppicker, ngx-daterangepicker-material, .daterangepicker, [class*="daterangepicker"]'));
            return candidates.find(element => isVisible(element) && element.querySelector('.calendar-table, .calendar, .ranges, button, li')) || null;
        }

        async function revealCalendars(picker) {
            if (visibleCalendars(picker).length) return true;
            const customOptions = Array.from(picker.querySelectorAll('.ranges li button, .ranges li, li button, button, li'))
                .filter(element => /custom\s*range|custom|نطاق\s*مخصص|مخصص|تخصيص/i.test(engine.normalizeText(element.textContent)) && isVisible(element));
            const customOption = customOptions[customOptions.length - 1];
            if (!customOption) return false;
            const clickable = customOption.matches?.('li')
                ? (customOption.querySelector('button, [role="button"]') || customOption)
                : customOption;
            clickable.click();
            return Boolean(await waitFor(() => visibleCalendars(picker).length ? true : null, 2500));
        }

        function calendarMonth(calendar) {
            const monthElement = calendar.querySelector('.month');
            if (!monthElement) return null;
            const monthSelect = monthElement.querySelector('.monthselect');
            const yearSelect = monthElement.querySelector('.yearselect');
            if (monthSelect && yearSelect) {
                const rawMonth = Number(monthSelect.value);
                const year = Number(yearSelect.value);
                if (Number.isInteger(rawMonth) && Number.isInteger(year)) return { year, month: rawMonth + 1 };
            }
            return engine.parseMonthLabel(monthElement.textContent);
        }

        function visibleCalendars(picker) {
            return Array.from(picker.querySelectorAll('.calendar')).filter(calendar => isVisible(calendar) && calendar.querySelector('.calendar-table'));
        }

        async function useCalendarDropdowns(picker, target) {
            let calendar = visibleCalendars(picker).find(item => item.querySelector('.monthselect') && item.querySelector('.yearselect'));
            if (!calendar) return false;
            const yearSelect = calendar.querySelector('.yearselect');
            if (!setSelectValue(yearSelect, target.year)) return false;
            await delay(100);
            calendar = visibleCalendars(picker).find(item => item.querySelector('.monthselect') && item.querySelector('.yearselect')) || calendar;
            const monthSelect = calendar.querySelector('.monthselect');
            if (!setSelectValue(monthSelect, target.month - 1)) return false;
            await delay(120);
            return visibleCalendars(picker).some(item => {
                const shown = calendarMonth(item);
                return shown && shown.year === target.year && shown.month === target.month;
            });
        }

        async function navigateToMonth(picker, target) {
            if (await useCalendarDropdowns(picker, target)) return true;
            for (let attempt = 0; attempt < 120; attempt += 1) {
                const calendars = visibleCalendars(picker);
                const months = calendars.map(calendarMonth).filter(Boolean);
                if (months.some(value => value.year === target.year && value.month === target.month)) return true;
                if (!months.length) return false;
                const targetIndex = (target.year * 12) + target.month;
                const indexes = months.map(value => (value.year * 12) + value.month);
                const goBack = targetIndex < Math.min(...indexes);
                const selector = goBack ? '.prev.available, .prev' : '.next.available, .next';
                const button = calendars.map(calendar => calendar.querySelector(selector)).find(isVisible);
                if (!button) return false;
                button.click();
                await delay(90);
            }
            return false;
        }

        function findDayCell(picker, target) {
            const matchingCalendar = visibleCalendars(picker).find(calendar => {
                const shown = calendarMonth(calendar);
                return shown && shown.year === target.year && shown.month === target.month;
            });
            if (!matchingCalendar) return null;
            return Array.from(matchingCalendar.querySelectorAll('.calendar-table tbody td, tbody td'))
                .find(cell => {
                    const className = String(cell.className || '').toLowerCase();
                    const day = Number(engine.normalizeDigits(cell.textContent).trim());
                    return day === target.day && !cell.disabled && !/\boff\b|disabled|unavailable/.test(className);
                }) || null;
        }

        function setTime(picker, side, hour, minute, second) {
            const calendar = picker.querySelector(`.calendar.${side}`) || visibleCalendars(picker)[side === 'left' ? 0 : 1];
            if (!calendar || !calendar.querySelector('.calendar-time')) return true;
            const hasHour = setSelectValue(calendar.querySelector('.hourselect'), hour);
            const hasMinute = setSelectValue(calendar.querySelector('.minuteselect'), minute);
            const seconds = calendar.querySelector('.secondselect');
            const ampm = calendar.querySelector('.ampmselect');
            if (seconds) setSelectValue(seconds, second);
            if (ampm) setSelectValue(ampm, hour >= 12 ? 'PM' : 'AM');
            return hasHour && hasMinute;
        }

        async function selectDateRange(dateInput, target) {
            dateInput.focus();
            dateInput.click();
            const picker = await waitFor(findPicker, 3500);
            if (!picker) throw new Error('لم يفتح تقويم نون.');
            if (!await revealCalendars(picker)) throw new Error('لم تظهر أيام التقويم.');
            if (!await navigateToMonth(picker, target)) throw new Error(`تعذر الانتقال إلى ${target.iso}.`);

            let startCell = findDayCell(picker, target);
            if (!startCell) throw new Error(`اليوم ${target.iso} غير متاح في التقويم.`);
            startCell.click();
            await delay(120);
            setTime(picker, 'left', 0, 0, 0);
            await delay(80);

            if (!visibleCalendars(picker).some(calendar => {
                const shown = calendarMonth(calendar);
                return shown && shown.year === target.year && shown.month === target.month;
            })) await navigateToMonth(picker, target);
            const endCell = findDayCell(picker, target);
            if (!endCell) throw new Error('تعذر تحديد نهاية اليوم.');
            endCell.click();
            await delay(120);
            setTime(picker, 'right', 23, 59, 59);
            await delay(100);

            const buttons = Array.from(picker.querySelectorAll('.buttons button, button'));
            const applyButton = buttons.find(button => {
                const text = engine.normalizeText(button.textContent || button.title).toLowerCase();
                return isVisible(button) && !button.disabled && /apply|okay|ok|تطبيق|اعتماد|موافق/.test(text) && !/cancel|clear|إلغاء|مسح/.test(text);
            });
            if (applyButton) {
                applyButton.click();
                await delay(180);
            }

            const selectedValue = engine.normalizeText(dateInput.value);
            if (!selectedValue.includes(target.iso)) throw new Error('التقويم لم يعتمد التاريخ المختار.');
            if (selectedValue !== target.range) throw new Error('قيمة Date Range غير مطابقة.');
            return true;
        }

        function findSearchButton(dateInput, cardInput, amountInput) {
            const searchRoot = dateInput?.closest?.('np-common-search') ||
                dateInput?.closest?.('mat-card.search_card, .search_card');
            if (!searchRoot) return null;

            const transactionSearchButton = searchRoot.querySelector('#add-search-button');
            if (isVisible(transactionSearchButton) && transactionSearchButton.getAttribute?.('aria-disabled') !== 'true') {
                return transactionSearchButton;
            }

            const candidates = Array.from(searchRoot.querySelectorAll('button, [role="button"], input[type="submit"]'));
            return candidates
                .filter(element => isVisible(element) &&
                    element.id !== 'quick-search-btn' &&
                    !element.closest?.('np-quick-search-criteria, header, nav'))
                .map(element => {
                    const text = engine.normalizeText(element.textContent || element.value || element.getAttribute?.('aria-label')).toLowerCase();
                    let score = 0;
                    if (element.id === 'add-search-button') score += 1000;
                    if (/^(search|بحث)$/.test(text)) score += 100;
                    else if (/search|بحث/.test(text)) score += 50;
                    if (element.type === 'submit') score += 10;
                    if (/reset|clear|cancel|export|مسح|إلغاء|تصدير/.test(text)) score -= 200;
                    return { element, score };
                })
                .sort((left, right) => right.score - left.score)
                .find(item => item.score > 0)?.element || null;
        }

        async function activateSearchButton(dateInput, cardInput, amountInput) {
            const button = await waitFor(() => {
                const candidate = findSearchButton(dateInput, cardInput, amountInput);
                if (!candidate || candidate.disabled || candidate.getAttribute?.('aria-disabled') === 'true') return null;
                return candidate;
            }, 5000);
            if (!button) throw new Error('SEARCH_NOT_READY');
            await Promise.resolve();
            await delay(180);
            button.focus?.();
            await delay(120);
            button.click();
            return button;
        }

        function startResultHighlighting(data) {
            if (window.__FAST_TOOLKIT_NOON_TEST_HIGHLIGHT_TIMER__) {
                window.clearInterval(window.__FAST_TOOLKIT_NOON_TEST_HIGHLIGHT_TIMER__);
            }
            const restoreRow = row => {
                row.style.backgroundColor = row.dataset.fastToolkitNoonOriginalBackground || '';
                row.style.borderLeft = row.dataset.fastToolkitNoonOriginalBorder || '';
                row.style.outline = row.dataset.fastToolkitNoonOriginalOutline || '';
                delete row.dataset.fastToolkitNoonTest;
                delete row.dataset.fastToolkitNoonOriginalBackground;
                delete row.dataset.fastToolkitNoonOriginalBorder;
                delete row.dataset.fastToolkitNoonOriginalOutline;
            };
            document.querySelectorAll('[data-fast-toolkit-noon-test]').forEach(restoreRow);
            let expectedTime = '';
            let previousMinute = '';
            if (data.time) {
                const [hourValue, minuteValue] = data.time.split(':').map(Number);
                expectedTime = `${String(hourValue).padStart(2, '0')}:${String(minuteValue).padStart(2, '0')}`;
                const date = new Date(2000, 0, 1, hourValue, minuteValue - 1);
                previousMinute = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            }
            const foreignCurrencyPattern = /(?:^|[^a-z])(aed|egp|usd|eur|gbp|kwd|bhd|omr|qar|jod)(?![a-z])|[$€£]/i;
            const rowSelector = 'tbody tr, [role="row"], mat-row, .mat-row, .mat-mdc-row, .cdk-row, .list-item';
            const rememberAndPaint = (row, kind) => {
                if (!row.dataset.fastToolkitNoonTest) {
                    row.dataset.fastToolkitNoonOriginalBackground = row.style.backgroundColor || '';
                    row.dataset.fastToolkitNoonOriginalBorder = row.style.borderLeft || '';
                    row.dataset.fastToolkitNoonOriginalOutline = row.style.outline || '';
                }
                if (kind === 'apple') {
                    row.style.backgroundColor = 'rgba(255, 235, 59, 0.45)';
                    row.style.borderLeft = '5px solid #ffd700';
                    row.style.outline = '2px solid #ffd700';
                } else {
                    row.style.backgroundColor = 'rgba(0, 255, 136, 0.15)';
                    row.style.borderLeft = '4px solid #00ff88';
                    row.style.outline = '';
                }
                row.dataset.fastToolkitNoonTest = kind;
                row.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
            };
            const rowAmountMatches = (row, text) => {
                const cells = Array.from(row.querySelectorAll?.('td, [role="cell"], mat-cell, .mat-cell, .mat-mdc-cell, .cdk-cell') || []);
                if (cells.length) return cells.some(cell => engine.amountMatchesText(cell.innerText || cell.textContent, data.amount));
                return engine.amountMatchesText(text, data.amount);
            };
            const scan = () => {
                const candidates = Array.from(new Set(document.querySelectorAll(rowSelector))).map(row => {
                    const text = engine.normalizeText(row.innerText || row.textContent).toLowerCase();
                    if (!text || foreignCurrencyPattern.test(text)) return null;
                    const hasApplePay = /apple\s*pay|applepay|apple_pay/.test(text);
                    const timeMatches = expectedTime && (engine.exactTimeMatch(text, expectedTime) || (previousMinute && engine.exactTimeMatch(text, previousMinute)));
                    const amountMatches = Boolean(data.amount) && rowAmountMatches(row, text);
                    const cardMatches = engine.exactDigitsMatch(text, data.card);
                    return { row, hasApplePay, timeMatches, amountMatches, cardMatches };
                }).filter(Boolean);

                const appleMatches = candidates.filter(item => item.hasApplePay && item.timeMatches && item.amountMatches);
                const greenMatches = candidates.filter(item => !item.hasApplePay && item.cardMatches && item.amountMatches);
                const timedGreenMatches = greenMatches.filter(item => item.timeMatches);
                const chosenGreenMatches = timedGreenMatches.length ? timedGreenMatches : greenMatches;
                const chosenRows = new Map();
                appleMatches.forEach(item => chosenRows.set(item.row, 'apple'));
                chosenGreenMatches.forEach(item => chosenRows.set(item.row, 'match'));

                document.querySelectorAll('[data-fast-toolkit-noon-test]').forEach(row => {
                    if (!chosenRows.has(row)) restoreRow(row);
                });
                chosenRows.forEach((kind, row) => {
                    if (row.dataset.fastToolkitNoonTest !== kind) rememberAndPaint(row, kind);
                });
            };
            scan();
            window.__FAST_TOOLKIT_NOON_TEST_HIGHLIGHT_TIMER__ = window.setInterval(scan, 1500);
        }

        try {
            const withoutCard = request.mode === 'without-card';
            const clipboardText = request.clipboardText != null
                ? String(request.clipboardText)
                : await navigator.clipboard.readText();
            if (!clipboardText.trim()) throw new Error('الحافظة فارغة.');
            const data = engine.parseClipboard(clipboardText, request.now);
            if (!withoutCard && !data.card) throw new Error('لم أجد آخر 4 أرقام للبطاقة في الحافظة.');
            if (!data.date) throw new Error('لم أجد التاريخ. انسخ النتيجة كاملة: المبلغ // البطاقة // الوقت // التاريخ.');

            const dateInput = findDateInput();
            if (!dateInput) throw new Error('لم أجد حقل Date في صفحة نون.');
            const cardInputs = findFields('card', dateInput);
            const cardInput = cardInputs[0] || null;
            const amountInputs = findFields('amount', dateInput);
            if (!withoutCard && !cardInput) throw new Error('لم أجد حقل البطاقة في صفحة نون.');

            if (withoutCard) {
                cardInputs.forEach(input => setInputValue(input, ''));
                await delay(100);
                if (cardInputs.some(input => engine.normalizeText(input.value) !== '')) throw new Error('CARD_NOT_CLEARED');
            } else {
                setInputValue(cardInput, data.card);
            }
            if (data.amount) {
                if (!amountInputs.length) throw new Error('لم أجد حقول Amount From وAmount To في صفحة نون.');
                amountInputs.forEach(input => setInputValue(input, data.amount));
                await delay(100);
                if (amountInputs.some(input => engine.normalizeText(input.value) !== data.amount)) {
                    throw new Error('تعذر تعبئة جميع حقول المبلغ بالقيمة نفسها.');
                }
            }
            await selectDateRange(dateInput, data.date);
            const currencyApplied = await selectOptionalSarCurrency(dateInput);

            await activateSearchButton(dateInput, cardInput, amountInputs[0] || null);
            startResultHighlighting(data);
            return Object.freeze({ card: withoutCard ? '' : data.card, amount: data.amount, dateRange: data.date.range, currency: currencyApplied ? 'SAR' : '', withoutCard });
        } catch (error) {
            return null;
        }
    }

    const engine = createNoonSearchEngine();

    function getRuntimeSource(mode = 'with-card') {
        return `void((${noonCardSearchRuntime.toString()})(${createNoonSearchEngine.toString()},{action:'run',mode:${JSON.stringify(mode)}}));`;
    }

    function buildInlineBookmarklet() {
        return `javascript:${encodeURIComponent(getRuntimeSource())}`;
    }

    function buildBookmarklet() {
        return buildInlineBookmarklet();
    }

    function buildWithoutCardBookmarklet() {
        return `javascript:${encodeURIComponent(getRuntimeSource('without-card'))}`;
    }

    function install(options) {
        return noonCardSearchRuntime(createNoonSearchEngine, Object.assign({ action: 'run' }, options || {}));
    }

    function installWithoutCard(options) {
        return noonCardSearchRuntime(createNoonSearchEngine, Object.assign({ action: 'run', mode: 'without-card' }, options || {}));
    }

    return Object.freeze({
        normalizeDigits: engine.normalizeDigits,
        normalizeText: engine.normalizeText,
        parseAmount: engine.parseAmount,
        extractAmountValues: engine.extractAmountValues,
        amountMatchesText: engine.amountMatchesText,
        exactDigitsMatch: engine.exactDigitsMatch,
        exactTimeMatch: engine.exactTimeMatch,
        parseDate: engine.parseDate,
        parseClipboard: engine.parseClipboard,
        parseMonthLabel: engine.parseMonthLabel,
        isAllowedLocation: engine.isAllowedLocation,
        getRuntimeSource,
        buildBookmarklet,
        buildInlineBookmarklet,
        buildWithoutCardBookmarklet,
        install,
        installWithoutCard
    });
}));
