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

test('index.html configures bookmarklet link as "العداد" for bookmarks bar drag', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

    assert.match(indexHtml, /id="crmTrackerBookmarklet"[^>]*>العداد<\/a>/);
    assert.match(indexHtml, /buildBookmarklet/);
});

test('bookmarklet hides ticket total unless ticket has repeated visits', () => {
    const bookmarklet = tracker.buildBookmarklet();
    assert.match(bookmarklet, /Number\(activeTicket\.visits\)\s*>\s*1/);
    assert.match(bookmarklet, /Number\(ticket\.visits\)\s*>\s*1/);
});

test('bookmarklet supports dragging and stores window position', () => {
    const bookmarklet = tracker.buildBookmarklet();
    assert.match(bookmarklet, /fastToolkit_crm_ticket_tracker_pos_v1/);
    assert.match(bookmarklet, /makeDraggable/);
    assert.match(bookmarklet, /pointerdown/);
    assert.match(bookmarklet, /width:295px/);
});

test('bookmarklet includes total sessions count, ABST label, and repeated visits label', () => {
    const bookmarklet = tracker.buildBookmarklet();
    assert.match(bookmarklet, /totalSessionsCount/);
    assert.match(bookmarklet, /ABST/);
    assert.match(bookmarklet, /data-role="sessions"/);
    assert.match(bookmarklet, /تكررت/);
});

test('bookmarklet copies full ticket url in summary', () => {
    const bookmarklet = tracker.buildBookmarklet();
    assert.match(bookmarklet, /buildTicketUrl\(ticketId\)/);
    assert.match(bookmarklet, /buildTicketUrl\(state\.active\.id\)/);
});

test('bookmarklet turns yellow at 15m and red at 20m and above', () => {
    const bookmarklet = tracker.buildBookmarklet();
    assert.match(bookmarklet, /20\s*\*\s*60\s*\*\s*1000/);
    assert.match(bookmarklet, /15\s*\*\s*60\s*\*\s*1000/);
    assert.match(bookmarklet, /#f87171/);
    assert.match(bookmarklet, /#fbbf24/);
});

test('bookmarklet supports light and dark themes with persistent toggle', () => {
    const bookmarklet = tracker.buildBookmarklet();
    assert.match(bookmarklet, /fastToolkit_crm_ticket_tracker_theme_v1/);
    assert.match(bookmarklet, /data-action="toggle-theme"/);
    assert.match(bookmarklet, /light-theme/);
    assert.match(bookmarklet, /toggleTheme/);
});







