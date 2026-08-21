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
            return protocol === 'https:' && (hostname === 'fort.payfort.com' || hostname === 'testfort.payfort.com');
        }

        return Object.freeze({ normalizeDigits, normalizeText, parseAmount, parseDate, parseClipboard, parseMonthLabel, isAllowedLocation });
    }

    async function payFortSearchRuntime(createEngine, request = {}) {
        const engine = createEngine();
        if (request.action !== 'run') return null;
        if (typeof window === 'undefined' || typeof document === 'undefined') return null;

        document.getElementById('fast-toolkit-payfort-test4-status')?.remove();
        const statusElement = document.createElement('div');
        statusElement.id = 'fast-toolkit-payfort-test4-status';
        statusElement.setAttribute('role', 'status');
        statusElement.setAttribute('aria-live', 'polite');
        statusElement.style.cssText = [
            'position:fixed', 'left:18px', 'bottom:18px', 'z-index:2147483647',
            'max-width:420px', 'padding:12px 16px', 'border-radius:10px',
            'background:#17324d', 'color:#fff', 'font:600 14px/1.6 Arial,sans-serif',
            'box-shadow:0 6px 24px rgba(0,0,0,.3)', 'direction:rtl', 'text-align:right'
        ].join(';');
        (document.body || document.documentElement).appendChild(statusElement);
        const setStatus = (message, state = 'working') => {
            statusElement.textContent = `test4: ${message}`;
            statusElement.style.background = state === 'error' ? '#a61b1b' : state === 'success' ? '#12613b' : '#17324d';
        };
        const fail = message => { throw new Error(message); };

        setStatus('بدأ التشغيل…');
        if (!engine.isAllowedLocation(window.location)) {
            setStatus(`افتح صفحة تقارير PayFort أولًا. الصفحة الحالية: ${window.location.hostname || 'غير معروفة'}`, 'error');
            return null;
        }

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
            if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
            if (element.isConnected && typeof element.getClientRects === 'function' && element.getClientRects().length === 0) return false;
            return true;
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

        function findSelectOption(select, matcher) {
            if (!select) return null;
            return Array.from(select.options || []).find(item => !item.disabled && matcher(optionText(item), item)) || null;
        }

        function setSelectOption(select, matcher) {
            if (!select) return null;
            const option = findSelectOption(select, matcher);
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

        function pickerContainerElement(picker) {
            const container = picker?.container;
            if (!container) return null;
            if (container.nodeType === 1) return container;
            if (container.jquery && container[0]?.nodeType === 1) return container[0];
            if (typeof container === 'string') return document.querySelector(container);
            return null;
        }

        function isDateRangePicker(picker) {
            if (!picker) return false;
            const container = pickerContainerElement(picker);
            const rangeContainer = container?.matches?.('.daterangepicker, [class*="daterangepicker"]');
            const rangeApi = typeof picker.setStartDate === 'function' && typeof picker.setEndDate === 'function' &&
                picker.startDate != null && picker.endDate != null;
            return Boolean(rangeContainer || rangeApi);
        }

        function pickerFor(element) {
            if (!window.jQuery || !element) return null;
            try {
                const wrapped = window.jQuery(element);
                const knownKeys = ['daterangepicker', 'dateRangePicker', 'daterangePicker'];
                for (const key of knownKeys) {
                    const picker = wrapped.data(key);
                    if (isDateRangePicker(picker)) return picker;
                }
                const data = wrapped.data() || {};
                return Object.values(data).find(isDateRangePicker) || null;
            } catch (error) {
                return null;
            }
        }

        function findDateInput() {
            const reportForms = Array.from(document.querySelectorAll('form.report-search-form'));
            const reportForm = reportForms.find(isVisible) || reportForms[0] || document;
            const dateRangeLabel = Array.from(reportForm.querySelectorAll('label')).find(label =>
                /^date\s*range\b/i.test(engine.normalizeText(label.textContent))
            );
            if (dateRangeLabel) {
                const labelledInput = dateRangeLabel.htmlFor ? document.getElementById(dateRangeLabel.htmlFor) : null;
                const groupedInput = dateRangeLabel.closest('.form-group, .input-group, td, th')?.querySelector('input');
                const exactInput = labelledInput || groupedInput;
                if (exactInput && !exactInput.closest('[id$="_advancedFilterFieldsGrid"], .advanced-report-filter')) return exactInput;
            }
            const inputs = Array.from(reportForm.querySelectorAll('input')).filter(input => !input.closest('[id$="_advancedFilterFieldsGrid"], .advanced-report-filter'));
            return inputs
                .map(input => {
                    const meta = metadata(input);
                    let score = 0;
                    if (pickerFor(input)) score += 250;
                    if (/daterange|date-range|date_range/.test(meta)) score += 100;
                    if (/date\s*range/.test(meta)) score += 80;
                    if (/date|from|to/.test(meta)) score += 25;
                    if (isVisible(input)) score += 20;
                    else if (!pickerFor(input)) score -= 200;
                    return { input, score };
                })
                .sort((left, right) => right.score - left.score)
                /* Order Transaction Management has Date From/Date To inputs but no
                   range picker. Never mistake either one for the Transactions Report
                   Date Range control when Custom Range is required. */
                .find(item => item.score >= 80 || pickerFor(item.input))?.input || null;
        }

        function visiblePicker(dateInput) {
            const attachedElement = pickerContainerElement(pickerFor(dateInput));
            if (isVisible(attachedElement)) return attachedElement;
            return Array.from(document.querySelectorAll('.daterangepicker, [class*="daterangepicker"], .date-range-picker-container'))
                .find(element => isVisible(element) && element.querySelector('table, .ranges, button, li')) || null;
        }

        function visibleCalendars(picker) {
            return Array.from(picker.querySelectorAll('.drp-calendar, .calendar')).filter(calendar => isVisible(calendar) && calendar.querySelector('table'));
        }

        function calendarMonth(calendar) {
            const label = calendar.querySelector('.month, .month-name, th.month');
            if (!label) return null;
            const monthSelect = label.querySelector('.monthselect, select[name*="month"]');
            const yearSelect = label.querySelector('.yearselect, select[name*="year"]');
            if (monthSelect && yearSelect) {
                const rawMonth = Number(monthSelect.value);
                const year = Number(yearSelect.value);
                if (Number.isInteger(rawMonth) && Number.isInteger(year)) {
                    const zeroBased = Array.from(monthSelect.options || []).some(option => String(option.value).trim() !== '' && Number(option.value) === 0);
                    return { year, month: zeroBased ? rawMonth + 1 : rawMonth };
                }
            }
            return engine.parseMonthLabel(label.textContent);
        }

        async function revealCalendars(picker) {
            if (visibleCalendars(picker).length) return true;
            const customOptions = Array.from(picker.querySelectorAll('.ranges li, .ranges button, [data-range-key], li, button'))
                .filter(element => {
                    const text = engine.normalizeText(element.textContent || element.getAttribute?.('data-range-key')).toLowerCase();
                    return isVisible(element) && /custom\s*range|custom|نطاق\s*مخصص|مخصص|تخصيص/.test(text);
                });
            const customOption = customOptions[customOptions.length - 1];
            if (!customOption) return false;
            const clickable = customOption.matches?.('li')
                ? (customOption.querySelector('button, a, [role="button"]') || customOption)
                : customOption;
            clickable.click();
            return Boolean(await waitFor(() => visibleCalendars(picker).length ? true : null, 3000));
        }

        function setRawSelectValue(select, values) {
            if (!select) return false;
            const candidates = values.map(value => String(value).toLowerCase());
            const option = Array.from(select.options || []).find(item => candidates.includes(String(item.value).toLowerCase()) || candidates.includes(engine.normalizeText(item.textContent).toLowerCase()));
            if (!option) return false;
            select.value = option.value;
            dispatch(select, 'input');
            dispatch(select, 'change');
            return true;
        }

        function setMonthSelectValue(select, targetMonth, monthNames) {
            if (!select) return false;
            const options = Array.from(select.options || []);
            const zeroBased = options.some(option => String(option.value).trim() !== '' && Number(option.value) === 0);
            const numericTarget = zeroBased ? targetMonth - 1 : targetMonth;
            const names = monthNames.map(value => String(value).toLowerCase());
            const option = options.find(item => String(item.value).trim() !== '' && Number(item.value) === numericTarget) ||
                options.find(item => names.includes(engine.normalizeText(item.textContent).toLowerCase()));
            if (!option) return false;
            select.value = option.value;
            dispatch(select, 'input');
            dispatch(select, 'change');
            return true;
        }

        async function useCalendarDropdowns(picker, target) {
            let calendar = visibleCalendars(picker).find(item => item.querySelector('.monthselect, select[name*="month"]') && item.querySelector('.yearselect, select[name*="year"]'));
            if (!calendar) return false;
            const yearSelect = calendar.querySelector('.yearselect, select[name*="year"]');
            if (!setRawSelectValue(yearSelect, [target.year])) return false;
            await delay(100);
            calendar = visibleCalendars(picker).find(item => item.querySelector('.monthselect, select[name*="month"]') && item.querySelector('.yearselect, select[name*="year"]')) || calendar;
            const monthSelect = calendar.querySelector('.monthselect, select[name*="month"]');
            const monthNames = [
                ['jan', 'january'], ['feb', 'february'], ['mar', 'march'], ['apr', 'april'],
                ['may'], ['jun', 'june'], ['jul', 'july'], ['aug', 'august'],
                ['sep', 'sept', 'september'], ['oct', 'october'], ['nov', 'november'], ['dec', 'december']
            ][target.month - 1] || [];
            if (!setMonthSelectValue(monthSelect, target.month, monthNames)) return false;
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

        function setTime(picker, side, hour, minute, second) {
            const calendars = visibleCalendars(picker);
            const calendar = picker.querySelector(`.calendar.${side}, .drp-calendar.${side}`) || calendars[side === 'left' ? 0 : 1];
            if (!calendar || !calendar.querySelector('.calendar-time, .time')) return true;
            const set = (selector, values) => {
                const select = calendar.querySelector(selector);
                return !select || setRawSelectValue(select, values);
            };
            const useTwelveHours = Boolean(calendar.querySelector('.ampmselect'));
            const displayHour = useTwelveHours ? (hour % 12 || 12) : hour;
            return set('.hourselect', [displayHour, String(displayHour).padStart(2, '0')]) &&
                set('.minuteselect', [minute, String(minute).padStart(2, '0')]) &&
                set('.secondselect', [second, String(second).padStart(2, '0')]) &&
                set('.ampmselect', [hour >= 12 ? 'PM' : 'AM']);
        }

        function dateParts(value) {
            if (!value) return null;
            if (typeof value.year === 'function' && typeof value.month === 'function' && typeof value.date === 'function') {
                return {
                    year: value.year(), month: value.month() + 1, day: value.date(),
                    hour: typeof value.hour === 'function' ? value.hour() : 0,
                    minute: typeof value.minute === 'function' ? value.minute() : 0
                };
            }
            const date = value instanceof Date ? value : new Date(value);
            if (Number.isNaN(date.getTime())) return null;
            return {
                year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
                hour: date.getHours(), minute: date.getMinutes()
            };
        }

        function pickerMatchesFullDay(picker, target) {
            if (!picker) return false;
            const start = dateParts(picker.startDate);
            const end = dateParts(picker.endDate);
            const sameTarget = parts => parts && parts.year === target.year && parts.month === target.month && parts.day === target.day;
            return sameTarget(start) && sameTarget(end) && start.hour === 0 && start.minute === 0 && end.hour === 23 && end.minute === 59;
        }

        function targetDateTokens(target) {
            const escapedDay = String(target.day).padStart(2, '0');
            const escapedMonth = String(target.month).padStart(2, '0');
            const year = String(target.year);
            return [
                `${year}-${escapedMonth}-${escapedDay}`,
                `${escapedDay}-${escapedMonth}-${year}`,
                `${escapedDay}/${escapedMonth}/${year}`,
                `${target.day}/${target.month}/${year}`
            ];
        }

        function inputMatchesFullDay(input, target) {
            const value = engine.normalizeDigits(input?.value || '');
            const sameDateAtBothEnds = targetDateTokens(target).some(token => value.split(token).length - 1 >= 2);
            return sameDateAtBothEnds && /(?:^|\D)00:00(?:\D|$)/.test(value) && /(?:^|\D)23:59(?:\D|$)/.test(value);
        }

        async function applyPickerDirectly(dateInput, target) {
            const picker = pickerFor(dateInput);
            if (!picker || typeof picker.setStartDate !== 'function' || typeof picker.setEndDate !== 'function') return false;
            const start = window.moment ? window.moment([target.year, target.month - 1, target.day]).startOf('day') : new Date(target.year, target.month - 1, target.day, 0, 0, 0);
            const end = window.moment ? window.moment([target.year, target.month - 1, target.day]).endOf('day') : new Date(target.year, target.month - 1, target.day, 23, 59, 59);
            picker.setStartDate(start);
            picker.setEndDate(end);
            picker.updateView?.();
            picker.updateCalendars?.();
            picker.updateElement?.();
            window.jQuery(dateInput).trigger('apply.daterangepicker', [picker]);
            dispatch(dateInput, 'input');
            dispatch(dateInput, 'change');
            await delay(180);
            return inputMatchesFullDay(dateInput, target) || pickerMatchesFullDay(picker, target);
        }

        async function selectDateRange(dateInput, target) {
            let uiError = '';
            try {
                setStatus('فتح Date Range…');
                dateInput.focus?.();
                dateInput.click();
                const picker = await waitFor(() => visiblePicker(dateInput), 4000);
                if (!picker) throw new Error('لم يفتح تقويم Date Range.');

                setStatus('اختيار Custom Range…');
                if (!await revealCalendars(picker)) throw new Error('لم أجد خيار Custom Range أو لم تظهر أيام التقويم.');
                setStatus(`تحديد ${target.iso} من التقويم…`);
                if (!await navigateToMonth(picker, target)) throw new Error(`تعذر الانتقال إلى ${target.iso}.`);
                const startCell = findDayCell(picker, target);
                if (!startCell) throw new Error(`اليوم ${target.iso} غير متاح كبداية.`);
                startCell.click();
                await delay(130);
                if (!setTime(picker, 'left', 0, 0, 0)) throw new Error('تعذر ضبط بداية اليوم على 00:00.');

                if (!visibleCalendars(picker).some(calendar => {
                    const shown = calendarMonth(calendar);
                    return shown && shown.year === target.year && shown.month === target.month;
                })) await navigateToMonth(picker, target);
                const endCell = findDayCell(picker, target);
                if (!endCell) throw new Error(`اليوم ${target.iso} غير متاح كنهاية.`);
                endCell.click();
                await delay(130);
                if (!setTime(picker, 'right', 23, 59, 59)) throw new Error('تعذر ضبط نهاية اليوم على 23:59.');

                const apply = Array.from(picker.querySelectorAll('.applyBtn, button, input[type="button"]')).find(button => {
                    const text = engine.normalizeText(button.textContent || button.value || button.title).toLowerCase();
                    return isVisible(button) && !button.disabled && /apply|okay|ok|تطبيق|اعتماد|موافق/.test(text) && !/cancel|clear|إلغاء|مسح/.test(text);
                });
                if (!apply) throw new Error('لم أجد زر Apply في التقويم.');
                apply.click();
                await delay(220);
                if (!inputMatchesFullDay(dateInput, target) && !pickerMatchesFullDay(pickerFor(dateInput), target)) {
                    throw new Error('التقويم لم يعتمد النطاق الكامل 00:00–23:59.');
                }
                return true;
            } catch (error) {
                uiError = error?.message || 'تعذر استخدام التقويم.';
            }

            setStatus('محاولة اعتماد التاريخ مباشرة…');
            if (await applyPickerDirectly(dateInput, target)) return true;
            throw new Error(uiError);
        }

        function findAdvancedGrid(form) {
            const reportForm = form?.matches?.('form.report-search-form') ? form : form?.closest?.('form.report-search-form');
            return reportForm?.querySelector('[id$="_advancedFilterFieldsGrid"]') ||
                document.querySelector('form.report-search-form [id$="_advancedFilterFieldsGrid"]') ||
                form?.querySelector('[id$="_advancedFilterFieldsGrid"]') || null;
        }

        function findFilterButton(form) {
            const exactButton = form?.querySelector('button.btn-a-s-filter') || document.querySelector('form.report-search-form button.btn-a-s-filter');
            if (isVisible(exactButton)) return exactButton;
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
            let clipboardText = request.clipboardText != null ? String(request.clipboardText) : '';
            if (!clipboardText) {
                setStatus('قراءة البيانات المنسوخة…');
                try {
                    clipboardText = await navigator.clipboard.readText();
                } catch (error) {
                    clipboardText = '';
                }
            }
            if (!clipboardText.trim() && typeof window.prompt === 'function') {
                clipboardText = window.prompt('تعذر قراءة الحافظة. ألصق النتيجة كاملة هنا ثم اضغط OK:') || '';
            }
            if (!clipboardText.trim()) fail('الحافظة فارغة؛ انسخ النتيجة كاملة ثم شغّل test4.');
            const data = engine.parseClipboard(clipboardText, request.now);
            if (!data.amount) fail('لم أجد المبلغ في البيانات المنسوخة.');
            if (!data.date) fail('لم أجد التاريخ. انسخ: المبلغ // البطاقة // الوقت // التاريخ.');

            const dateInput = findDateInput();
            if (!dateInput) fail('افتح تبويب Transactions Report (وليس Order Transaction Management) ثم شغّل test4؛ التقويم لا يظهر في Date From/Date To.');
            await selectDateRange(dateInput, data.date);
            setStatus('فتح Filter…');
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
            if (!grid) fail('لم أجد جدول الفلاتر المتقدمة بعد فتح Filter.');
            const fieldSelect = await waitFor(() => {
                const selects = fieldSelects(grid);
                return selects.find(select => !select.value) || selects[initialFieldCount] || selects[selects.length - 1] || null;
            }, 4000);
            if (!fieldSelect) fail('لم يظهر حقل Field Name.');
            setStatus('اختيار Field Name = Amount…');
            const fieldMatch = setSelectOption(fieldSelect, (text, option) => {
                const value = engine.normalizeText(option.value).toLowerCase();
                const label = engine.normalizeText(option.textContent).toLowerCase();
                return value === 'amount' || label === 'amount';
            });
            if (!fieldMatch) fail('لم أجد خيار Amount داخل Field Name.');

            const nameMatch = String(fieldSelect.name).match(/^AdvancedFilterFieldsForm\[([^\]]+)]\[fieldName]$/);
            const key = nameMatch ? nameMatch[1] : fieldSelect.closest?.('tr[data-id]')?.getAttribute('data-id');
            if (key == null) fail('تعذر تحديد صف الفلتر الجديد.');
            const controlName = field => `AdvancedFilterFieldsForm[${key}][${field}]`;
            const findNamedControl = (selector, field) => Array.from(grid.querySelectorAll(selector)).find(element => element.name === controlName(field)) || null;
            const operationMatcher = (text, option) => {
                const value = engine.normalizeText(option.value).toLowerCase();
                const label = engine.normalizeText(option.textContent).toLowerCase();
                if (/!=|<>|\b(?:not|neq)\b/.test(`${value} ${label}`)) return false;
                return ['=', '==', 'eq', 'equal', 'equals', 'equal to', 'exact', 'exact match'].includes(value) ||
                    ['=', '==', 'eq', 'equal', 'equals', 'equal to', 'exact', 'exact match'].includes(label);
            };
            const operationSelect = await waitFor(() => {
                const select = findNamedControl('select', 'operation');
                return select && !select.disabled && findSelectOption(select, operationMatcher) ? select : null;
            }, 8000);
            if (!operationSelect) fail('لم تظهر قائمة Operation.');
            const valueBeforeOperation = findNamedControl('input', 'value');
            const currencyBeforeOperation = findNamedControl('select', 'currency');
            setStatus('اختيار Operation =…');
            const operation = setSelectOption(operationSelect, operationMatcher);
            if (!operation) fail('لم أجد عملية المساواة (= أو Exact).');

            setStatus('انتظار حقول Value وCurrency الجديدة…');
            let lastValueInput = null;
            let lastCurrencySelect = null;
            let stableControlChecks = 0;
            const controls = await waitFor(() => {
                const valueInput = findNamedControl('input', 'value');
                const currencySelect = findNamedControl('select', 'currency');
                if (!valueInput || !currencySelect || valueInput.disabled || currencySelect.disabled) return null;
                const valueReplaced = !valueBeforeOperation || valueInput !== valueBeforeOperation;
                const currencyReplaced = !currencyBeforeOperation || currencySelect !== currencyBeforeOperation;
                if (!valueReplaced || !currencyReplaced) return null;
                if (valueInput === lastValueInput && currencySelect === lastCurrencySelect) stableControlChecks += 1;
                else {
                    lastValueInput = valueInput;
                    lastCurrencySelect = currencySelect;
                    stableControlChecks = 1;
                }
                return stableControlChecks >= 3 ? { valueInput, currencySelect } : null;
            }, 12000);
            if (!controls) fail('لم تستقر حقول Value وCurrency بعد اختيار Operation.');
            const valueInput = controls.valueInput;
            setStatus(`تعبئة Value = ${data.amount}…`);
            if (!setInputValue(valueInput, data.amount)) fail('تعذر تعبئة المبلغ في Value.');
            const currencySelect = controls.currencySelect;
            setStatus('اختيار Currency = SAR…');
            const currency = await waitFor(() => setSelectOption(currencySelect, (text, option) => {
                const value = engine.normalizeText(option.value).toLowerCase();
                const label = engine.normalizeText(option.textContent).toLowerCase();
                return value === 'sar' || label === 'sar' || /\bsar\b/.test(label) || /saudi.*riyal|ريال\s*سعودي/.test(label);
            }), 5000);
            if (!currency) fail('لم أجد عملة SAR في القائمة.');

            setStatus('تم تجهيز التاريخ وفلتر Amount وSAR ✅', 'success');
            window.setTimeout(() => statusElement.remove(), 5000);
            return Object.freeze({ amount: data.amount, date: data.date.iso, field: 'Amount', operation: '=', currency: 'SAR' });
        } catch (error) {
            setStatus(error?.message || 'توقف التنفيذ لسبب غير معروف.', 'error');
            if (window.console?.warn) window.console.warn('[Fast Toolkit test4]', error);
            return null;
        }
    }

    const engine = createPayFortSearchEngine();

    function getRuntimeSource() {
        return `void((${payFortSearchRuntime.toString()})(${createPayFortSearchEngine.toString()},{action:'run'}));`;
    }

    function buildBookmarklet() {
        const compactSource = getRuntimeSource().replace(/\s*\r?\n\s*/g, ' ').trim();
        return `javascript:${encodeURIComponent(compactSource)}`;
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
