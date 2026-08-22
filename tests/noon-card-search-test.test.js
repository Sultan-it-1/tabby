const test = require('node:test');
const assert = require('node:assert/strict');
const noonSearch = require('../noon-card-search-test.js');

function decodeBookmarklet(bookmarklet) {
    const normalized = new URL(bookmarklet).href;
    return decodeURIComponent(normalized.slice('javascript:'.length));
}

test('reads the fourth clipboard part as the Noon date range', () => {
    const result = noonSearch.parseClipboard('125.50 // 4321 // 18:34 // 08-06', new Date(2026, 7, 21));
    assert.equal(result.amount, '125.50');
    assert.equal(result.card, '4321');
    assert.equal(result.time, '18:34');
    assert.equal(result.date.iso, '2026-06-08');
    assert.equal(result.date.range, '2026-06-08 00:00 - 2026-06-08 23:59');
});

test('supports flexible delimiters: //, \\\\, /, \\, - with or without spaces, and flexible time formats', () => {
    const now = new Date(2026, 7, 21);

    // Attached or unspaced //
    const res1 = noonSearch.parseClipboard('125.50//4321//18:34 // 08-06', now);
    assert.equal(res1.amount, '125.50');
    assert.equal(res1.card, '4321');
    assert.equal(res1.time, '18:34');
    assert.equal(res1.date.iso, '2026-06-08');

    // Double backslash \\
    const res2 = noonSearch.parseClipboard('125.50 \\\\ 4321 \\\\ 6:34 pm \\\\ 08/06/2026', now);
    assert.equal(res2.amount, '125.50');
    assert.equal(res2.card, '4321');
    assert.equal(res2.time, '18:34');
    assert.equal(res2.date.iso, '2026-06-08');

    // Single backslash \
    const res3 = noonSearch.parseClipboard('125.50\\4321\\18.34\\08-06', now);
    assert.equal(res3.amount, '125.50');
    assert.equal(res3.card, '4321');
    assert.equal(res3.time, '18:34');
    assert.equal(res3.date.iso, '2026-06-08');

    // Single slash /
    const res4 = noonSearch.parseClipboard('125.50/4321/18:34/08-06', now);
    assert.equal(res4.amount, '125.50');
    assert.equal(res4.card, '4321');
    assert.equal(res4.time, '18:34');
    assert.equal(res4.date.iso, '2026-06-08');

    // Hyphen / dash -
    const res5 = noonSearch.parseClipboard('125.50 - 4321 - 18-34 - 08-06', now);
    assert.equal(res5.amount, '125.50');
    assert.equal(res5.card, '4321');
    assert.equal(res5.time, '18:34');
    assert.equal(res5.date.iso, '2026-06-08');

    // Military time in 3rd slot e.g. 1834
    const res6 = noonSearch.parseClipboard('125.50 // 4321 // 1834 // 08-06', now);
    assert.equal(res6.amount, '125.50');
    assert.equal(res6.card, '4321');
    assert.equal(res6.time, '18:34');
});

test('normalizes thousands separators and compares amounts numerically', () => {
    assert.deepEqual(noonSearch.parseAmount('SAR 1,288.00'), { number: 1288, normalized: '1288.00' });
    assert.deepEqual(noonSearch.parseAmount('1,288'), { number: 1288, normalized: '1288' });
    assert.deepEqual(noonSearch.parseAmount('1 288.50 SAR'), { number: 1288.5, normalized: '1288.50' });
    assert.deepEqual(noonSearch.parseAmount('47,99'), { number: 47.99, normalized: '47.99' });
    assert.equal(noonSearch.amountMatchesText('Amount: SAR 1,288.00', '1,288'), true);
    assert.equal(noonSearch.amountMatchesText('Amount: SAR 1288', '1,288.00'), true);
    assert.equal(noonSearch.amountMatchesText('Amount: SAR 11,288.00', '1,288'), false);
});

test('does not steal amounts from dates, times, masked cards, or long transaction ids', () => {
    const values = noonSearch.extractAmountValues('2026-06-08 18:34 VISA****4321 transaction 123456789012 SAR 9.50');
    assert.deepEqual(values, [9.5]);
    assert.equal(noonSearch.amountMatchesText('2026-06-08 18:34 VISA****4321', '8'), false);
});

test('matches card and time as complete numeric tokens only', () => {
    assert.equal(noonSearch.exactDigitsMatch('Mada card ****4321', '4321'), true);
    assert.equal(noonSearch.exactDigitsMatch('transaction 943219', '4321'), false);
    assert.equal(noonSearch.exactTimeMatch('Created at 18:34:22', '18:34'), true);
    assert.equal(noonSearch.exactTimeMatch('Created at 118:34', '18:34'), false);
});

test('supports full ISO, full day-first, short year, and Arabic-digit dates', () => {
    const now = new Date(2026, 7, 21);
    assert.equal(noonSearch.parseDate('2026-06-08', now).iso, '2026-06-08');
    assert.equal(noonSearch.parseDate('08/06/2026', now).iso, '2026-06-08');
    assert.equal(noonSearch.parseDate('08-06-26', now).iso, '2026-06-08');
    assert.equal(noonSearch.parseDate('٠٨-٠٦-٢٠٢٦', now).iso, '2026-06-08');
    assert.equal(noonSearch.parseDate('31-02-2026', now), null);
});

test('infers the nearest sensible year for dates without a year', () => {
    assert.equal(noonSearch.parseDate('31-12', new Date(2026, 0, 5)).iso, '2025-12-31');
    assert.equal(noonSearch.parseDate('08-06', new Date(2026, 7, 21)).iso, '2026-06-08');
});

test('understands English and Arabic calendar month headers', () => {
    assert.deepEqual(noonSearch.parseMonthLabel('June 2026'), { year: 2026, month: 6 });
    assert.deepEqual(noonSearch.parseMonthLabel('يونيو ٢٠٢٦'), { year: 2026, month: 6 });
    assert.deepEqual(noonSearch.parseMonthLabel('06 / 2026'), { year: 2026, month: 6 });
});

test('limits execution to Noon Payments portals', () => {
    assert.equal(noonSearch.isAllowedLocation({ protocol: 'https:', hostname: 'portal.noonpayments.com' }), true);
    assert.equal(noonSearch.isAllowedLocation({ protocol: 'https:', hostname: 'portal.sa.noonpayments.com' }), true);
    assert.equal(noonSearch.isAllowedLocation({ protocol: 'https:', hostname: 'evil.example' }), false);
});

test('builds a self-contained URL-safe test2 bookmarklet with Custom range handling', () => {
    const bookmarklet = noonSearch.buildBookmarklet();
    const source = decodeBookmarklet(bookmarklet);
    assert.match(bookmarklet, /^javascript:/);
    assert.equal(bookmarklet, noonSearch.buildInlineBookmarklet());
    assert.doesNotMatch(bookmarklet, /[\r\n]/);
    assert.doesNotMatch(source, /<script|https?:\/\//i);
    assert.doesNotThrow(() => new Function(source));
    assert.match(source, /calendar-input/);
    assert.match(source, /add-search-button/);
    assert.match(source, /clear-search-button|reset-search-button|activateResetButtonIfPresent/);
    assert.match(source, /quick-search-btn/);
    assert.match(source, /np-common-search/);
    assert.match(source, /custom\\s\*range/);
    assert.match(source, /23:59/);
    assert.match(source, /selectOptionalSarCurrency/);
    assert.match(source, /isSarChoice/);
    assert.match(source, /currenc\(\?:y\|ies\)/);
    assert.match(source, /mat-mdc-select-multiple/);
    assert.match(source, /return false/);
    assert.doesNotMatch(source, /const notify|function notify/);
});

test('builds test3 without a card filter or injected notifications', () => {
    const bookmarklet = noonSearch.buildWithoutCardBookmarklet();
    const source = decodeBookmarklet(bookmarklet);
    assert.match(bookmarklet, /^javascript:/);
    assert.doesNotMatch(bookmarklet, /[\r\n]/);
    assert.doesNotThrow(() => new Function(source));
    assert.match(source, /mode:\s*["']without-card["']/);
    assert.match(source, /CARD_NOT_CLEARED/);
    assert.doesNotMatch(source, /const notify|function notify/);
});
