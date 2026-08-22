const test = require('node:test');
const assert = require('node:assert/strict');
const checkoutSearch = require('../checkout-search-bookmarklet.js');

function decodeBookmarklet(bookmarklet) {
    const normalized = new URL(bookmarklet).href;
    return decodeURIComponent(normalized.slice('javascript:'.length));
}

test('parses clipboard string with amount, card, time, and date', () => {
    const now = new Date(2026, 7, 22);
    const parsed = checkoutSearch.parseClipboard('125.50 // 4321 // 18:34 // 08-06', now);
    assert.equal(parsed.amount, '125.50');
    assert.equal(parsed.card, '4321');
    assert.equal(parsed.time, '18:34');
    assert.equal(parsed.date.iso, '2026-06-08');
    assert.equal(parsed.date.checkoutDateParam, '20260608..20260608');
});

test('supports flexible delimiters: //, \\\\, /, \\, - and various time formats in Checkout', () => {
    const now = new Date(2026, 7, 22);

    // Attached unspaced //
    const res1 = checkoutSearch.parseClipboard('125.50//4321//18:34 // 08-06', now);
    assert.equal(res1.amount, '125.50');
    assert.equal(res1.card, '4321');
    assert.equal(res1.time, '18:34');
    assert.equal(res1.date.checkoutDateParam, '20260608..20260608');

    // Double backslash \\
    const res2 = checkoutSearch.parseClipboard('1,288.00 \\\\ 4321 \\\\ 6:34 pm \\\\ 08/06/2026', now);
    assert.equal(res2.amount, '1288.00');
    assert.equal(res2.card, '4321');
    assert.equal(res2.time, '18:34');
    assert.equal(res2.date.checkoutDateParam, '20260608..20260608');

    // Single backslash \
    const res3 = checkoutSearch.parseClipboard('125.50\\4321\\18.34\\08-06', now);
    assert.equal(res3.amount, '125.50');
    assert.equal(res3.card, '4321');
    assert.equal(res3.time, '18:34');
    assert.equal(res3.date.checkoutDateParam, '20260608..20260608');

    // Single slash /
    const res4 = checkoutSearch.parseClipboard('125.50/4321/18:34/08-06', now);
    assert.equal(res4.amount, '125.50');
    assert.equal(res4.card, '4321');
    assert.equal(res4.time, '18:34');
    assert.equal(res4.date.checkoutDateParam, '20260608..20260608');

    // Dash / hyphen -
    const res5 = checkoutSearch.parseClipboard('125.50 - 4321 - 18-34 - 08-06', now);
    assert.equal(res5.amount, '125.50');
    assert.equal(res5.card, '4321');
    assert.equal(res5.time, '18:34');
    assert.equal(res5.date.checkoutDateParam, '20260608..20260608');

    // Arabic PM time format
    const res6 = checkoutSearch.parseClipboard('125.50 - 4321 - 6:34 م - 08-06', now);
    assert.equal(res6.amount, '125.50');
    assert.equal(res6.card, '4321');
    assert.equal(res6.time, '18:34');
});

test('normalizes thousands commas and formats Checkout URL with card', () => {
    const now = new Date(2026, 7, 22);
    const parsed = checkoutSearch.parseClipboard('1,288.00 // 4321 // 18:34 // 08-06-2026', now);
    const url = checkoutSearch.buildCheckoutUrl(parsed, 'with-card');
    assert.equal(url, 'https://dashboard.checkout.com/payments/all-payments?amount=1288.00&currency=SAR&card=4321&date=20260608..20260608');
});

test('builds Checkout URL without card when requested', () => {
    const now = new Date(2026, 7, 22);
    const parsed = checkoutSearch.parseClipboard('1,288.00 // 4321 // 18:34 // 08-06-2026', now);
    const url = checkoutSearch.buildCheckoutUrl(parsed, 'without-card');
    assert.equal(url, 'https://dashboard.checkout.com/payments/all-payments?amount=1288.00&currency=SAR&date=20260608..20260608');
});

test('identifies checkout domains and handles same tab vs new tab navigation', () => {
    assert.equal(checkoutSearch.isCheckoutDomain({ hostname: 'dashboard.checkout.com' }), true);
    assert.equal(checkoutSearch.isCheckoutDomain({ hostname: 'sandbox.checkout.com' }), true);
    assert.equal(checkoutSearch.isCheckoutDomain({ hostname: 'checkout.com' }), true);
    assert.equal(checkoutSearch.isCheckoutDomain({ hostname: 'crm.tabby.sa' }), false);
    assert.equal(checkoutSearch.isCheckoutDomain(null), false);
});

test('builds valid, self-contained bookmarklets for with-card and without-card modes', () => {
    const withCardBookmarklet = checkoutSearch.buildWithCardBookmarklet();
    const withoutCardBookmarklet = checkoutSearch.buildWithoutCardBookmarklet();

    assert.match(withCardBookmarklet, /^javascript:/);
    assert.match(withoutCardBookmarklet, /^javascript:/);
    assert.doesNotMatch(withCardBookmarklet, /[\r\n]/);
    assert.doesNotMatch(withoutCardBookmarklet, /[\r\n]/);

    const withCardSource = decodeBookmarklet(withCardBookmarklet);
    const withoutCardSource = decodeBookmarklet(withoutCardBookmarklet);

    assert.doesNotThrow(() => new Function(withCardSource));
    assert.doesNotThrow(() => new Function(withoutCardSource));

    assert.match(withCardSource, /dashboard\.checkout\.com/);
    assert.match(withCardSource, /isCheckoutDomain/);
    assert.match(withCardSource, /mode:\s*["']with-card["']/);
    assert.match(withoutCardSource, /dashboard\.checkout\.com/);
    assert.match(withoutCardSource, /isCheckoutDomain/);
    assert.match(withoutCardSource, /mode:\s*["']without-card["']/);
});
