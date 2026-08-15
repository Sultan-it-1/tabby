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
    assert.match(bookmarklet, /FastToolkitCrmTicketTracker/);
    assert.doesNotMatch(bookmarklet, /\bfetch\s*\(/);
    assert.doesNotMatch(bookmarklet, /XMLHttpRequest/);
});

test('index.html configures bookmarklet link with "اسحبني إلى شريط المفضلة" on page and "العداد" on drag', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

    assert.match(indexHtml, /id="crmTrackerBookmarklet">اسحبني إلى شريط المفضلة<\/a>/);
    assert.match(indexHtml, /const bookmarkTitle = 'العداد';/);
    assert.match(indexHtml, /bookmarkletLink\.addEventListener\('dragstart'/);
    assert.match(indexHtml, /bookmarkletLink\.addEventListener\('dragend'/);
});

test('bookmarklet hides ticket total unless ticket has repeated visits', () => {
    const runtime = tracker.getRuntimeSource();
    assert.match(runtime, /Number\(activeTicket\.visits\)\s*>\s*1/);
    assert.match(runtime, /Number\(ticket\.visits\)\s*>\s*1/);
});

test('bookmarklet supports dragging and stores window position', () => {
    const runtime = tracker.getRuntimeSource();
    assert.match(runtime, /fastToolkit_crm_ticket_tracker_pos_v1/);
    assert.match(runtime, /makeDraggable/);
    assert.match(runtime, /pointerdown/);
    assert.match(runtime, /width:295px/);
});

test('bookmarklet includes total sessions count, ABST label, and visited again label', () => {
    const runtime = tracker.getRuntimeSource();
    assert.match(runtime, /totalSessionsCount/);
    assert.match(runtime, /ABST/);
    assert.match(runtime, /data-role="sessions"/);
    assert.match(runtime, /زرتها/);
    assert.match(runtime, /visits-stat/);
});

test('bookmarklet copies full ticket url in summary', () => {
    const runtime = tracker.getRuntimeSource();
    assert.match(runtime, /buildTicketUrl\(ticketId\)/);
    assert.match(runtime, /buildTicketUrl\(state\.active\.id\)/);
});

test('bookmarklet turns yellow at 15m and red at 20m and above', () => {
    const runtime = tracker.getRuntimeSource();
    assert.match(runtime, /20\s*\*\s*60\s*\*\s*1000/);
    assert.match(runtime, /15\s*\*\s*60\s*\*\s*1000/);
    assert.match(runtime, /248,\s*113,\s*113|220,\s*38,\s*38/);
    assert.match(runtime, /251,\s*191,\s*36|217,\s*119,\s*6/);
});

test('bookmarklet supports light and dark themes with persistent toggle', () => {
    const runtime = tracker.getRuntimeSource();
    assert.match(runtime, /fastToolkit_crm_ticket_tracker_theme_v1/);
    assert.match(runtime, /data-action="toggle-theme"/);
    assert.match(runtime, /light-theme/);
    assert.match(runtime, /toggleTheme/);
});

test('bookmarklet tracks agent characters and words count', () => {
    const runtime = tracker.getRuntimeSource();
    assert.match(runtime, /totalChars/);
    assert.match(runtime, /totalWords/);
    assert.match(runtime, /data-role="chars-count"/);
    assert.match(runtime, /data-role="words-count"/);
    assert.match(runtime, /data-role="ticket-chars"/);
    assert.match(runtime, /onUserTyping/);
});

test('bookmarklet resets automatically after 4 hours of inactivity', () => {
    const runtime = tracker.getRuntimeSource();
    assert.match(runtime, /4\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
    assert.match(runtime, /INACTIVITY_TIMEOUT_MS/);
    assert.match(runtime, /lastActivityAt/);
});

test('bookmarklet includes analytics view, line chart, and cumulative writing stats', () => {
    const runtime = tracker.getRuntimeSource();
    assert.match(runtime, /toggle-analytics/);
    assert.match(runtime, /data-role="analytics-view"/);
    assert.match(runtime, /data-role="chart-container"/);
    assert.match(runtime, /data-role="all-chars"/);
    assert.match(runtime, /data-role="all-words"/);
    assert.match(runtime, /data-role="all-sessions"/);
    assert.match(runtime, /data-role="all-abst"/);
    assert.match(runtime, /chartGrad_/);
    assert.match(runtime, /polyline/);
    assert.match(runtime, /fastToolkit_crm_ticket_tracker_history_v1/);
});

test('bookmarklet discovers and displays Backoffice BO link beside ticket ID', () => {
    const runtime = tracker.getRuntimeSource();
    assert.match(runtime, /data-role="bo-link"/);
    assert.match(runtime, /findBackofficeUrl/);
    assert.match(runtime, /backoffice\.tabby\.(?:sa|ai)/);
    assert.match(runtime, /hd_ticket_link/);
    assert.match(runtime, /BO ↗/);
});







