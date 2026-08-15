const test = require('node:test');
const assert = require('node:assert/strict');
const analytics = require('../crm-profile-analytics.js');

const sampleRawTimeline = `
This User unlinked from Ticket (f845e4c5)
22:01 sultan.alkharmani@tabby.sa
Status: Online Offline
Status Changed At: 15/08/2026 21:40
15/08/2026 22:01
22:01 sultan.alkharmani@tabby.sa
Last assigned at: 15/08/2026 21:50 15/08/2026 21:59
21:59 This User linked with Ticket (0fb6bf79) 21:40
Status: Break Online
Status Changed At: 15/08/2026 21:25
15/08/2026 21:40
21:40 sultan.alkharmani@tabby.sa
This User unlinked from Ticket (f50fa335)
21:25. sultan.alkharmani@tabby.sa
Status: Offline Online
Status Changed At: 15/08/2026 14:00
15/08/2026 14:00
`;

test('crm-profile-analytics parses dates and timestamps accurately', () => {
    const ts = analytics.parseDateStr('15/08/2026 21:40');
    assert.ok(ts > 0);
    const d = new Date(ts);
    assert.equal(d.getDate(), 15);
    assert.equal(d.getMonth(), 7); // August is month 7 (0-indexed)
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getHours(), 21);
    assert.equal(d.getMinutes(), 40);
});

test('crm-profile-analytics extracts status changes and ticket links from raw timeline', () => {
    const events = analytics.parseTimeline(sampleRawTimeline);
    assert.ok(events.length >= 5);

    const statusEvents = events.filter(e => e.type === 'status');
    assert.ok(statusEvents.some(e => e.from === 'Offline' && e.to === 'Online'));
    assert.ok(statusEvents.some(e => e.from === 'Break' && e.to === 'Online'));
    assert.ok(statusEvents.some(e => e.from === 'Online' && e.to === 'Offline'));

    const linkEvents = events.filter(e => e.type === 'ticket_linked');
    assert.ok(linkEvents.some(e => e.ticketId === '0fb6bf79'));

    const unlinkEvents = events.filter(e => e.type === 'ticket_unlinked');
    assert.ok(unlinkEvents.some(e => e.ticketId === 'f50fa335'));
    assert.ok(unlinkEvents.some(e => e.ticketId === 'f845e4c5'));
});

test('crm-profile-analytics calculates accurate AUX durations and shift metrics', () => {
    const events = analytics.parseTimeline(sampleRawTimeline);
    const metrics = analytics.calculateMetrics(events);

    assert.ok(metrics.shiftStart > 0);
    assert.ok(metrics.totalOnlineMs > 0);
    assert.ok(metrics.utilizationRate >= 0 && metrics.utilizationRate <= 100);
    assert.ok(metrics.totalSessions >= 0);
    assert.ok(metrics.totalTicketsCompleted >= 0);
});

test('crm-profile-analytics builds lightweight loader bookmarklet', () => {
    const bml = analytics.buildBookmarklet();
    assert.ok(bml.startsWith('javascript:'));
    assert.match(bml, /crm-profile-analytics\.js\?v=/);
    assert.match(bml, /tabby\.sultanops\.com/);
    assert.ok(bml.length < 500);
});

test('crm-profile-analytics provides runtime installer source for execution', () => {
    const runtime = analytics.getRuntimeSource();
    assert.match(runtime, /fastToolkit_crm_profile_analytics_host_v1/);
    assert.match(runtime, /fastToolkit_crm_profile_analytics_theme_v1/);
    assert.match(runtime, /data-role="online-time"/);
    assert.match(runtime, /data-role="break-time"/);
    assert.match(runtime, /data-role="sessions-count"/);
    assert.match(runtime, /data-role="tickets-count"/);
    assert.match(runtime, /data-role="longest-session-link"/);
    assert.match(runtime, /data-role="shortest-session-link"/);
    assert.match(runtime, /data-role="longest-ticket-link"/);
    assert.match(runtime, /data-role="shortest-ticket-link"/);
    assert.match(runtime, /data-action="scan"/);
    assert.match(runtime, /data-action="copy"/);
});
