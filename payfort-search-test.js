(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.FastToolkitPayFortSearchTest4 = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createPayFortSearchEngine() {
        const MONTH_NAMES = Object.freeze([
            ['jan', 'january'], ['feb', 'february'], ['mar', 'march'], ['apr', 'april'],
            ['may'], ['jun', 'june'], ['jul', 'july'], ['aug', 'august'],
            ['sep', 'sept', 'september'], ['oct', 'october'], ['nov', 'november'], ['dec', 'december']
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
            if (numeric.includes('.') && numeric.includes(',')) numeric = numeric.replace(/,/g, '');
            else if (/^\d{1,3}(?:,\d{3})+$/.test(numeric)) numeric = numeric.replace(/,/g, '');
            else if (/^\d+,\d{1,2}$/.test(numeric)) numeric = numeric.replace(',', '.');
            else numeric = numeric.replace(/,/g, '');
            const number = Number(numeric);
            if (!Number.isFinite(number) || number < 0) return null;
            return Object.freeze({ number, normalized: numeric });
        }

        function validDate(year, month, day) {
            const date = new Date(year, month - 1, day, 12, 0, 0, 0);
            return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
        }

        function inferYear(month, day, nowValue) {
            const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
            let year = now.getFullYear();
            const candidate = new Date(year, month - 1, day, 12, 0, 0, 0);
            if (candidate.getTime() > now.getTime() + (45 * 86400000)) year -= 1;
            return year;
        }

        function parseDate(value, nowValue) {
            const text = normalizeText(value).replace(/[./]/g, '-');
            const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
            const currentYear = now.getFullYear();
            const currentYearShort = currentYear % 100;
            let year;
            let month;
            let day;
            let match = text.match(/(^|\D)(20\d{2})-(\d{1,2})-(\d{1,2})(?!\d)/);
            if (match) {
                year = Number(match[2]); month = Number(match[3]); day = Number(match[4]);
            } else {
                match = text.match(/(^|\D)(\d{1,2})-(\d{1,2})-(\d{2,4})(?!\d)/);
                if (match) {
                    const first = Number(match[2]);
                    month = Number(match[3]);
                    const third = Number(match[4]);
                    if (match[4].length === 4 || third === currentYearShort) {
                        day = first; year = match[4].length === 4 ? third : 2000 + third;
                    } else if (first === currentYearShort) {
                        year = 2000 + first; day = third;
                    } else {
                        day = first; year = 2000 + third;
                    }
                } else {
                    match = text.match(/(^|\D)(\d{1,2})-(\d{1,2})(?![-\d])/);
                    if (!match) return null;
                    day = Number(match[2]); month = Number(match[3]); year = inferYear(month, day, now);
                }
            }
            if (!validDate(year, month, day)) return null;
            const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            return Object.freeze({ year, month, day, iso });
        }

        function parseClipboard(value, nowValue) {
            const text = normalizeText(value);
            const parts = text.split('//').map(part => part.trim());
            const amount = parseAmount(parts[0] || text);
            const date = parseDate(parts[3] || text, nowValue);
            return Object.freeze({ amount: amount ? amount.normalized : '', date });
        }

        function parseMonthLabel(value) {
            const text = normalizeText(value).toLowerCase();
            const yearMatch = text.match(/20\d{2}/);
            if (!yearMatch) return null;
            let month = null;
            for (let index = 0; index < MONTH_NAMES.length; index += 1) {
                if (MONTH_NAMES[index].some(name => text.includes(name))) month = index + 1;
            }
            if (month == null) {
                const numeric = text.match(/(?:^|\D)(0?[1-9]|1[0-2])\s*[/-]\s*20\d{2}(?!\d)/);
                if (numeric) month = Number(numeric[1]);
            }
            return month == null ? null : Object.freeze({ year: Number(yearMatch[0]), month });
        }

        function isAllowedLocation(locationLike) {
            if (!locationLike) return false;
            const protocol = String(locationLike.protocol || '').toLowerCase();
            const hostname = String(locationLike.hostname || '').toLowerCase();
            if (protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1') return true;
            return protocol === 'https:' && hostname === 'fort.payfort.com';
        }

        return Object.freeze({ normalizeDigits, normalizeText, parseAmount, parseDate, parseClipboard, parseMonthLabel, isAllowedLocation });
    }

    async function payFortSearchRuntime(createEngine, request = {}) {
        const engine = createEngine();
        if (request.action !== 'run') return null;
        if (typeof window === 'undefined' || typeof document === 'undefined') return null;
        if (!engine.isAllowedLocation(window.location)) return null;

        const delay = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));
        const waitFor = async (getter, timeout = 5000) => {
            const startedAt = Date.now();
            while (Date.now() - startedAt < timeout) {
                const value = getter();
                if (value) return value;
                await delay(80);
            }
            return null;
        };
        const isVisible = element => {
            if (!element || element.disabled || element.hidden || element.getAttribute?.('aria-hidden') === 'true') return false;
            const style = typeof window.getComputedStyle === 'function' ? window.getComputedStyle(element) : null;
            return !style || (style.display !== 'none' && style.visibility !== 'hidden');
        };
        const dispatch = (element, type) => element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
        const metadata = element => engine.normalizeText([
            element.id, element.name, element.placeholder, element.className,
            element.getAttribute?.('aria-label'), element.closest?.('.form-group, label, td, th')?.innerText
        ].filter(Boolean).join(' ')).toLowerCase();

        function setInputValue(element, value) {
            if (!element) return false;
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            if (setter) setter.call(element, value);
            else element.value = value;
            dispatch(element, 'input');
            dispatch(element, 'change');
            element.blur?.();
            return engine.normalizeText(element.value) === engine.normalizeText(value);
        }

        function optionText(option) {
            return engine.normalizeText(`${option.value || ''} ${option.textContent || ''}`).toLowerCase();
        }

        function setSelectOption(select, matcher) {
            if (!select) return null;
            const option = Array.from(select.options || []).find(item => !item.disabled && matcher(optionText(item), item));
            if (!option) return null;
            if (window.jQuery) {
                const wrapped = window.jQuery(select);
                wrapped.val(option.value).trigger('change');
                if (typeof wrapped.selectpicker === 'function') wrapped.selectpicker('refresh');
            } else {
                select.value = option.value;
                dispatch(select, 'input');
                dispatch(select, 'change');
            }
            return option;
        }

        function findDateInput() {
            const inputs = Array.from(document.querySelectorAll('input')).filter(input => isVisible(input) && !input.closest('[id$="_advancedFilterFieldsGrid"], .advanced-report-filter'));
            return inputs
                .map(input => {
                    const meta = metadata(input);
                    let score = 0;
                    if (/daterange|date-range|date_range/.test(meta)) score += 100;
                    if (/date\s*range/.test(meta)) score += 80;
                    if (/date|from|to/.test(meta)) score += 25;
                    return { input, score };
                })
                .sort((left, right) => right.score - left.score)
                .find(item => item.score > 0)?.input || null;
        }

        function visiblePicker() {
            return Array.from(document.querySelectorAll('.daterangepicker')).find(isVisible) || null;
        }

        function visibleCalendars(picker) {
            return Array.from(picker.querySelectorAll('.drp-calendar, .calendar')).filter(calendar => isVisible(calendar) && calendar.querySelector('table'));
        }

        function calendarMonth(calendar) {
            const label = calendar.querySelector('.month, .month-name, th.month');
            return label ? engine.parseMonthLabel(label.textContent) : null;
        }

        async function navigateToMonth(picker, target) {
            for (let attempt = 0; attempt < 120; attempt += 1) {
                const calendars = visibleCalendars(picker);
                const months = calendars.map(calendarMonth).filter(Boolean);
                if (months.some(value => value.year === target.year && value.month === target.month)) return true;
                if (!months.length) return false;
                const targetIndex = target.year * 12 + target.month;
                const shown = months.map(value => value.year * 12 + value.month);
                const goBack = targetIndex < Math.min(...shown);
                const selector = goBack ? '.prev.available, .prev' : '.next.available, .next';
                const button = calendars.map(calendar => calendar.querySelector(selector)).find(isVisible);
                if (!button) return false;
                button.click();
                await delay(80);
            }
            return false;
        }

        function findDayCell(picker, target) {
            const calendar = visibleCalendars(picker).find(item => {
                const shown = calendarMonth(item);
                return shown && shown.year === target.year && shown.month === target.month;
            });
            if (!calendar) return null;
            return Array.from(calendar.querySelectorAll('tbody td')).find(cell => {
                const className = String(cell.className || '').toLowerCase();
                return Number(engine.normalizeDigits(cell.textContent).trim()) === target.day &&
                    !/\boff\b|disabled|unavailable/.test(className);
            }) || null;
        }

        async function selectDateRange(dateInput, target) {
            if (window.jQuery) {
                const wrapped = window.jQuery(dateInput);
                const picker = wrapped.data('daterangepicker');
                if (picker && typeof picker.setStartDate === 'function' && typeof picker.setEndDate === 'function') {
                    const start = window.moment ? window.moment([target.year, target.month - 1, target.day]).startOf('day') : new Date(target.year, target.month - 1, target.day, 0, 0, 0);
                    const end = window.moment ? window.moment([target.year, target.month - 1, target.day]).endOf('day') : new Date(target.year, target.month - 1, target.day, 23, 59, 59);
                    picker.setStartDate(start);
                    picker.setEndDate(end);
                    picker.updateElement?.();
                    wrapped.trigger('apply.daterangepicker', [picker]);
                    dispatch(dateInput, 'change');
                    await delay(120);
                    return Boolean(engine.normalizeText(dateInput.value));
                }
            }

            dateInput.focus?.();
            dateInput.click();
            const picker = await waitFor(visiblePicker, 3500);
            if (!picker || !await navigateToMonth(picker, target)) return false;
            const startCell = findDayCell(picker, target);
            if (!startCell) return false;
            startCell.click();
            await delay(120);
            const endCell = findDayCell(picker, target);
            if (!endCell) return false;
            endCell.click();
            await delay(100);
            const apply = Array.from(picker.querySelectorAll('button, input[type="button"]')).find(button => {
                const text = engine.normalizeText(button.textContent || button.value).toLowerCase();
                return isVisible(button) && /^(apply|تطبيق)$/.test(text);
            });
            if (apply) apply.click();
            await delay(160);
            return Boolean(engine.normalizeText(dateInput.value));
        }

        function findAdvancedGrid(form) {
            return form?.querySelector('[id$="_advancedFilterFieldsGrid"]') || document.querySelector('[id$="_advancedFilterFieldsGrid"]');
        }

        function findFilterButton(form) {
            return Array.from((form || document).querySelectorAll('button, a, input[type="button"]')).find(element => {
                const text = engine.normalizeText(element.textContent || element.value).toLowerCase();
                const handler = String(element.getAttribute?.('onclick') || '').toLowerCase();
                return isVisible(element) && (/^filter$/.test(text) || handler.includes('advancedfilter.filterbuttonclick'));
            }) || null;
        }

        function fieldSelects(grid) {
            return Array.from(grid?.querySelectorAll('select[name^="AdvancedFilterFieldsForm"][name$="[fieldName]"]') || []);
        }

        try {
            const clipboardText = request.clipboardText != null ? String(request.clipboardText) : await navigator.clipboard.readText();
            const data = engine.parseClipboard(clipboardText, request.now);
            if (!data.amount || !data.date) return null;

            const dateInput = findDateInput();
            if (!dateInput || !await selectDateRange(dateInput, data.date)) return null;
            let grid = findAdvancedGrid(dateInput.closest?.('form'));
            const form = dateInput.closest?.('form') || grid?.closest?.('form') || null;
            const initialFieldCount = fieldSelects(grid).length;
            const filterButton = findFilterButton(form);
            if (filterButton) filterButton.click();
            else {
                const addRow = grid?.querySelector('button.add-row-button, .add-row-button');
                if (isVisible(addRow)) addRow.click();
            }

            grid = await waitFor(() => findAdvancedGrid(form), 4000);
            if (!grid) return null;
            const fieldSelect = await waitFor(() => {
                const selects = fieldSelects(grid);
                return selects.find(select => !select.value) || selects[initialFieldCount] || selects[selects.length - 1] || null;
            }, 4000);
            if (!fieldSelect) return null;
            const fieldMatch = setSelectOption(fieldSelect, text => /^amount$/.test(text) || text.split(' ').includes('amount'));
            if (!fieldMatch) return null;

            const nameMatch = String(fieldSelect.name).match(/^AdvancedFilterFieldsForm\[([^\]]+)]\[fieldName]$/);
            const key = nameMatch ? nameMatch[1] : fieldSelect.closest?.('tr[data-id]')?.getAttribute('data-id');
            if (key == null) return null;
            const controlName = field => `AdvancedFilterFieldsForm[${key}][${field}]`;
            const findNamedControl = (selector, field) => Array.from(grid.querySelectorAll(selector)).find(element => element.name === controlName(field)) || null;
            const operationSelect = await waitFor(() => findNamedControl('select', 'operation'), 8000);
            if (!operationSelect) return null;
            const operation = await waitFor(() => setSelectOption(operationSelect, text => text.split(' ').includes('=') || /\b(eq|equal|equals|exact)\b/.test(text)), 8000);
            if (!operation) return null;

            const valueInput = await waitFor(() => findNamedControl('input', 'value'), 8000);
            if (!valueInput || !setInputValue(valueInput, data.amount)) return null;
            const currencySelect = await waitFor(() => findNamedControl('select', 'currency'), 8000);
            if (!currencySelect) return null;
            const currency = await waitFor(() => setSelectOption(currencySelect, text => /\bsar\b|saudi.*riyal|riyal|ريال/.test(text)), 5000);
            if (!currency) return null;

            return Object.freeze({ amount: data.amount, date: data.date.iso, field: 'Amount', operation: '=', currency: 'SAR' });
        } catch (error) {
            return null;
        }
    }

    const engine = createPayFortSearchEngine();

    function getRuntimeSource() {
        return `void((${payFortSearchRuntime.toString()})(${createPayFortSearchEngine.toString()},{action:'run'}));`;
    }

    function buildBookmarklet() {
        return `javascript:${encodeURIComponent(getRuntimeSource())}`;
    }

    function install(options) {
        return payFortSearchRuntime(createPayFortSearchEngine, Object.assign({ action: 'run' }, options || {}));
    }

    return Object.freeze({
        normalizeDigits: engine.normalizeDigits,
        normalizeText: engine.normalizeText,
        parseAmount: engine.parseAmount,
        parseDate: engine.parseDate,
        parseClipboard: engine.parseClipboard,
        parseMonthLabel: engine.parseMonthLabel,
        isAllowedLocation: engine.isAllowedLocation,
        getRuntimeSource,
        buildBookmarklet,
        buildInlineBookmarklet: buildBookmarklet,
        install
    });
}));
