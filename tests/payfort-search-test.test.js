const test = require('node:test');
const assert = require('node:assert/strict');
const payFortSearch = require('../payfort-search-test.js');

function decodeBookmarklet(bookmarklet) {
    const normalized = new URL(bookmarklet).href;
    return decodeURIComponent(normalized.slice('javascript:'.length));
}

test('parses the copied amount and date for PayFort', () => {
    const result = payFortSearch.parseClipboard('1,288 // 4321 // 18:34 // 08-06', new Date(2026, 7, 21));
    assert.equal(result.amount, '1288');
    assert.equal(result.date.iso, '2026-06-08');
});

test('recognizes official PayFort live and sandbox hosts only', () => {
    assert.equal(payFortSearch.isAllowedLocation({ protocol: 'https:', hostname: 'fort.payfort.com' }), true);
    assert.equal(payFortSearch.isAllowedLocation({ protocol: 'https:', hostname: 'testfort.payfort.com' }), true);
    assert.equal(payFortSearch.isAllowedLocation({ protocol: 'https:', hostname: 'evil.fort.payfort.com' }), false);
    assert.equal(payFortSearch.isAllowedLocation({ protocol: 'https:', hostname: 'payfort.example' }), false);
});

test('builds a self-contained test4 bookmarklet with exact PayFort advanced filter fields', () => {
    const bookmarklet = payFortSearch.buildBookmarklet();
    const source = decodeBookmarklet(bookmarklet);
    assert.match(bookmarklet, /^javascript:/);
    assert.ok(bookmarklet.length < 60000, `bookmarklet is too long: ${bookmarklet.length}`);
    assert.doesNotMatch(bookmarklet, /[\r\n]/);
    assert.doesNotThrow(() => new Function(source));
    assert.doesNotMatch(source, /<script|https?:\/\//i);
    assert.match(source, /AdvancedFilterFieldsForm/);
    assert.match(source, /fieldName/);
    assert.match(source, /operation/);
    assert.match(source, /currency/);
    assert.match(source, /daterangepicker/);
    assert.match(source, /Custom Range/);
    assert.match(source, /fast-toolkit-payfort-test4-status/);
    assert.match(source, /report-search-form/);
    assert.match(source, /btn-a-s-filter/);
    assert.match(source, /Transactions Report/);
});
