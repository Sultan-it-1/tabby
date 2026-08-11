'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const tracker = require('../crm-ticket-tracker.js');

test('extracts a long queue ticket id and ignores query and hash suffixes', () => {
    const id = 'bb2cf92a1234567890abcdef1234567890';
    assert.equal(
        tracker.extractTicketId(`https://crm.tabby.sa/queue/ticket/${id}?tab=customer#messages`),
        id
    );
});

test('extracts object ticket ids and stops at the next path segment', () => {
    const id = 'ticket-id-with-a-very-long-value';
    assert.equal(
        tracker.extractTicketId(`https://crm.tabby.sa/object/ticket/${id}/details/activity`),
        id
    );
});

test('rejects non-CRM hosts and malformed ticket paths', () => {
    assert.equal(tracker.extractTicketId('https://example.com/queue/ticket/secret'), '');
    assert.equal(tracker.extractTicketId('https://crm.tabby.sa/queue/customer/123'), '');
    assert.equal(tracker.extractTicketId('not a ticket url'), '');
});

test('builds the direct object ticket link with an encoded id', () => {
    assert.equal(
        tracker.buildTicketUrl('abc 123/value'),
        'https://crm.tabby.sa/object/ticket/abc%20123%2Fvalue'
    );
});

test('formats current and accumulated ticket durations consistently', () => {
    assert.equal(tracker.formatDuration(0), '00:00');
    assert.equal(tracker.formatDuration(102000), '01:42');
    assert.equal(tracker.formatDuration(3798000), '01:03:18');
});

test('bookmarklet is self-contained and does not make network requests', () => {
    const bookmarklet = tracker.buildBookmarklet();
    assert.match(bookmarklet, /^javascript:/);
    assert.match(bookmarklet, /action:'install'/);
    assert.doesNotMatch(bookmarklet, /\bfetch\s*\(/);
    assert.doesNotMatch(bookmarklet, /XMLHttpRequest/);
});
