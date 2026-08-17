const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const analytics = require('../crm-profile-analytics.js');

function decodeBookmarklet(bookmarklet) {
    const normalized = new URL(bookmarklet).href;
    return decodeURIComponent(normalized.slice('javascript:'.length));
}

const sampleRawTimeline = `
22:01 sultan.alkharmani@tabby.sa
This User unlinked from Ticket (f845e4c5)

22:01 sultan.alkharmani@tabby.sa
Status: Online Offline
Status Changed At: 15/08/2026 21:40
15/08/2026 22:01

21:59 sultan.alkharmani@tabby.sa
This User linked with Ticket (f845e4c5)

21:59 sultan.alkharmani@tabby.sa
This User unlinked from Ticket (17bfd86d)

21:50 sultan.alkharmani@tabby.sa
This User linked with Ticket (17bfd86d)

21:50 sultan.alkharmani@tabby.sa
This User unlinked from Ticket (0fb6bf79)

21:40 sultan.alkharmani@tabby.sa
This User linked with Ticket (0fb6bf79)

21:40 sultan.alkharmani@tabby.sa
Status: Break Online
Status Changed At: 15/08/2026 21:25
15/08/2026 21:40

21:25 sultan.alkharmani@tabby.sa
Status: Online Break
Status Changed At: 15/08/2026 19:05
15/08/2026 21:25

19:05 sultan.alkharmani@tabby.sa
Status: Offline Online
Status Changed At: 15/08/2026 14:00
15/08/2026 19:05
`;

test('parses valid CRM dates, Arabic digits, and rejects impossible dates', () => {
    const timestamp = analytics.parseDateStr('15/08/2026 21:40');
    const date = new Date(timestamp);
    assert.equal(date.getFullYear(), 2026);
    assert.equal(date.getMonth(), 7);
    assert.equal(date.getDate(), 15);
    assert.equal(date.getHours(), 21);
    assert.equal(date.getMinutes(), 40);
    assert.equal(analytics.parseDateStr('١٥/٠٨/٢٠٢٦ ٢١:٤٠'), timestamp);
    assert.equal(analytics.parseDateStr('31/02/2026 21:40'), null);
    assert.equal(analytics.parseDateStr('15/13/2026 21:40'), null);
});

test('uses the second Status Changed At value as the real transition time', () => {
    const events = analytics.parseTimeline(sampleRawTimeline);
    const statuses = events.filter(event => event.type === 'status');
    const transitions = statuses.map(event => [event.from, event.to, new Date(event.time).getHours(), new Date(event.time).getMinutes()]);
    assert.deepEqual(transitions, [
        ['Offline', 'Online', 19, 5],
        ['Online', 'Break', 21, 25],
        ['Break', 'Online', 21, 40],
        ['Online', 'Offline', 22, 1]
    ]);
    assert.equal(statuses[2].previousStatusStartedAt, analytics.parseDateStr('15/08/2026 21:25'));
});

test('extracts exact link and unlink times without stealing a neighbouring field time', () => {
    const events = analytics.parseTimeline(sampleRawTimeline).filter(event => event.type.startsWith('ticket_'));
    const compact = events.map(event => `${event.type}:${event.ticketId}:${new Date(event.time).getHours()}:${String(new Date(event.time).getMinutes()).padStart(2, '0')}`);
    assert.deepEqual(compact, [
        'ticket_linked:0fb6bf79:21:40',
        'ticket_linked:17bfd86d:21:50',
        'ticket_unlinked:0fb6bf79:21:50',
        'ticket_linked:f845e4c5:21:59',
        'ticket_unlinked:17bfd86d:21:59',
        'ticket_unlinked:f845e4c5:22:01'
    ]);
});

test('calculates exact shift, AUX, ticket, and occupancy metrics from the sample', () => {
    const parsed = analytics.parseTimelineDetailed(sampleRawTimeline);
    const metrics = analytics.calculateMetrics(parsed, {
        scrapedAt: analytics.parseDateStr('15/08/2026 22:01'),
        scanComplete: true
    });
    assert.equal(metrics.shiftStart, analytics.parseDateStr('15/08/2026 19:05'));
    assert.equal(metrics.shiftEnd, analytics.parseDateStr('15/08/2026 22:01'));
    assert.equal(metrics.totalOnlineMs, 161 * 60 * 1000);
    assert.equal(metrics.totalBreakMs, 15 * 60 * 1000);
    assert.equal(metrics.totalAuxMs, 15 * 60 * 1000);
    assert.equal(metrics.totalSessions, 3);
    assert.equal(metrics.uniqueTicketsCount, 3);
    assert.equal(metrics.totalTicketsCompleted, 3);
    assert.equal(metrics.totalHandledMs, 21 * 60 * 1000);
    assert.equal(metrics.avgTicketDurationMs, 7 * 60 * 1000);
    assert.equal(metrics.medianTicketDurationMs, 9 * 60 * 1000);
    assert.equal(metrics.p90TicketDurationMs, 10 * 60 * 1000);
    assert.equal(metrics.utilizationRate, 13);
    assert.equal(metrics.isComplete, true);
});

test('deduplicates overlapping lazy-scroll snapshots without removing real sessions', () => {
    const parsed = analytics.parseTimelineDetailed([
        { id: 'snapshot-a', text: sampleRawTimeline },
        { id: 'snapshot-b', text: sampleRawTimeline }
    ]);
    assert.equal(parsed.events.filter(event => event.type === 'ticket_linked').length, 3);
    assert.equal(parsed.events.filter(event => event.type === 'ticket_unlinked').length, 3);
    assert.ok(parsed.quality.duplicatesRemoved >= 10);
});

test('resolves time-only ticket rows from a neighbouring full-date audit row', () => {
    const blocks = sampleRawTimeline.trim().split(/\n\s*\n/).map((text, index) => ({ id: `row-${index}`, text, order: index }));
    const parsed = analytics.parseTimelineDetailed(blocks);
    const metrics = analytics.calculateMetrics(parsed, {
        scrapedAt: analytics.parseDateStr('15/08/2026 22:01'),
        scanComplete: true
    });
    assert.equal(parsed.quality.missingTimes, 0);
    assert.equal(metrics.totalSessions, 3);
    assert.equal(metrics.totalTicketsCompleted, 3);
    assert.equal(metrics.totalHandledMs, 21 * 60 * 1000);
});

test('Last assigned changes are audit metadata and are not counted as ticket duration', () => {
    const raw = `
    21:59 sultan.alkharmani@tabby.sa
    Last assigned at: 15/08/2026 21:50
    15/08/2026 21:59
    19:05 sultan.alkharmani@tabby.sa
    Status: Offline Online
    Status Changed At: 15/08/2026 18:00
    15/08/2026 19:05
    `;
    const parsed = analytics.parseTimelineDetailed(raw);
    assert.equal(parsed.events.filter(event => event.type === 'last_assigned').length, 1);
    const metrics = analytics.calculateMetrics(parsed, {
        scrapedAt: analytics.parseDateStr('15/08/2026 22:00'),
        scanComplete: true
    });
    assert.equal(metrics.totalSessions, 0);
    assert.equal(metrics.totalHandledMs, 0);
});

test('supports a shift and ticket session that cross midnight', () => {
    const events = [
        { id: 's1', type: 'status', from: 'Offline', to: 'Online', time: analytics.parseDateStr('15/08/2026 22:00'), sourceOrder: 1 },
        { id: 'l1', type: 'ticket_linked', ticketId: 'cross123', ticketKey: 'cross123', time: analytics.parseDateStr('15/08/2026 23:58'), sourceOrder: 2, confidence: 'high' },
        { id: 'u1', type: 'ticket_unlinked', ticketId: 'cross123', ticketKey: 'cross123', time: analytics.parseDateStr('16/08/2026 00:07'), sourceOrder: 3, confidence: 'high' },
        { id: 's2', type: 'status', from: 'Online', to: 'Offline', time: analytics.parseDateStr('16/08/2026 07:00'), sourceOrder: 4 }
    ];
    const metrics = analytics.calculateMetrics(events, {
        scrapedAt: analytics.parseDateStr('16/08/2026 07:00'),
        scanComplete: true
    });
    assert.equal(metrics.shiftStart, analytics.parseDateStr('15/08/2026 22:00'));
    assert.equal(metrics.shiftEnd, analytics.parseDateStr('16/08/2026 07:00'));
    assert.equal(metrics.totalOnlineMs, 9 * 60 * 60 * 1000);
    assert.equal(metrics.totalHandledMs, 9 * 60 * 1000);
});

test('counts only Break and Lunch as rest, keeps other AUX labels as working time, and ignores older shifts', () => {
    const at = value => analytics.parseDateStr(value);
    const events = [
        { id: 'old-start', type: 'status', from: 'Offline', to: 'Online', time: at('14/08/2026 10:00'), sourceOrder: 1 },
        { id: 'old-end', type: 'status', from: 'Online', to: 'Offline', time: at('14/08/2026 18:00'), sourceOrder: 2 },
        { id: 'start', type: 'status', from: 'Offline', to: 'Online', time: at('15/08/2026 10:00'), sourceOrder: 3 },
        { id: 'training', type: 'status', from: 'Online', to: 'Training', time: at('15/08/2026 10:30'), sourceOrder: 4 },
        { id: 'meeting', type: 'status', from: 'Training', to: 'Meeting', time: at('15/08/2026 11:00'), sourceOrder: 5 },
        { id: 'break-1', type: 'status', from: 'Meeting', to: 'Break', time: at('15/08/2026 11:15'), sourceOrder: 6 },
        { id: 'online-1', type: 'status', from: 'Break', to: 'Online', time: at('15/08/2026 11:30'), sourceOrder: 7 },
        { id: 'lunch', type: 'status', from: 'Online', to: 'Lunch', time: at('15/08/2026 12:00'), sourceOrder: 8 },
        { id: 'online-2', type: 'status', from: 'Lunch', to: 'Online', time: at('15/08/2026 12:30'), sourceOrder: 9 },
        { id: 'break-2', type: 'status', from: 'Online', to: 'Break', time: at('15/08/2026 13:00'), sourceOrder: 10 },
        { id: 'online-3', type: 'status', from: 'Break', to: 'Online', time: at('15/08/2026 13:15'), sourceOrder: 11 },
        { id: 'end', type: 'status', from: 'Online', to: 'Offline', time: at('15/08/2026 14:00'), sourceOrder: 12 }
    ];
    const metrics = analytics.calculateMetrics(events, {
        scrapedAt: at('15/08/2026 14:00'),
        scanComplete: true
    });
    assert.equal(metrics.shiftStart, at('15/08/2026 10:00'));
    assert.equal(metrics.shiftEnd, at('15/08/2026 14:00'));
    assert.equal(metrics.totalOnlineMs, 180 * 60 * 1000);
    assert.equal(metrics.totalOtherMs, 45 * 60 * 1000);
    assert.equal(metrics.workStatusBreakdown.Training, 30 * 60 * 1000);
    assert.equal(metrics.workStatusBreakdown.Meeting, 15 * 60 * 1000);
    assert.equal(metrics.totalBreakMs, 30 * 60 * 1000);
    assert.equal(metrics.totalLunchMs, 30 * 60 * 1000);
    assert.equal(metrics.totalAuxMs, 60 * 60 * 1000);
    assert.equal(metrics.breakBudget.sessionsCount, 2);
    assert.equal(metrics.breakBudget.allowanceMs, 30 * 60 * 1000);
    assert.equal(metrics.breakBudget.remainingMs, 0);
    assert.equal(metrics.breakBudget.overageMs, 0);
    assert.equal(metrics.lunchBudget.allowanceMs, 30 * 60 * 1000);
    assert.equal(metrics.lunchBudget.remainingMs, 0);
    assert.equal(metrics.lunchBudget.overageMs, 0);
    assert.equal(metrics.restBudget.allowanceMs, 60 * 60 * 1000);
});

test('reports per-break and lunch allowance overages separately', () => {
    const at = value => analytics.parseDateStr(value);
    const events = [
        { type: 'status', from: 'Offline', to: 'Online', time: at('15/08/2026 10:00'), sourceOrder: 1 },
        { type: 'status', from: 'Online', to: 'Break', time: at('15/08/2026 10:10'), sourceOrder: 2 },
        { type: 'status', from: 'Break', to: 'Online', time: at('15/08/2026 10:30'), sourceOrder: 3 },
        { type: 'status', from: 'Online', to: 'Lunch', time: at('15/08/2026 11:00'), sourceOrder: 4 },
        { type: 'status', from: 'Lunch', to: 'Online', time: at('15/08/2026 11:40'), sourceOrder: 5 },
        { type: 'status', from: 'Online', to: 'Offline', time: at('15/08/2026 12:00'), sourceOrder: 6 }
    ];
    const metrics = analytics.calculateMetrics(events, { scrapedAt: at('15/08/2026 12:00'), scanComplete: true });
    assert.equal(metrics.breakBudget.entries[0].overageMs, 5 * 60 * 1000);
    assert.equal(metrics.breakBudget.entries[1].remainingMs, 15 * 60 * 1000);
    assert.equal(metrics.lunchBudget.overageMs, 10 * 60 * 1000);
    assert.equal(metrics.restBudget.overageMs, 15 * 60 * 1000);
});

test('keeps orphan and open sessions separate from confirmed ABST', () => {
    const events = [
        { id: 's1', type: 'status', from: 'Offline', to: 'Online', time: analytics.parseDateStr('15/08/2026 10:00'), sourceOrder: 1 },
        { id: 'orphan', type: 'ticket_unlinked', ticketId: 'missing1', ticketKey: 'missing1', time: analytics.parseDateStr('15/08/2026 10:10'), sourceOrder: 2 },
        { id: 'open', type: 'ticket_linked', ticketId: 'active1', ticketKey: 'active1', time: analytics.parseDateStr('15/08/2026 10:20'), sourceOrder: 3 }
    ];
    const metrics = analytics.calculateMetrics(events, {
        scrapedAt: analytics.parseDateStr('15/08/2026 10:30'),
        scanComplete: true
    });
    assert.equal(metrics.totalTicketsCompleted, 0);
    assert.equal(metrics.avgTicketDurationMs, 0);
    assert.equal(metrics.quality.orphanUnlinks, 1);
    assert.equal(metrics.quality.estimatedSessions, 1);
    assert.equal(metrics.activeTicketsCount, 1);
});

test('marks results partial when Offline to Online has not loaded', () => {
    const partial = analytics.parseTimelineDetailed(`
        Status: Break Online
        Status Changed At: 15/08/2026 21:25
        15/08/2026 21:40
    `);
    const metrics = analytics.calculateMetrics(partial, {
        scrapedAt: analytics.parseDateStr('15/08/2026 22:00'),
        scanComplete: false
    });
    assert.equal(metrics.shiftStart, null);
    assert.equal(metrics.isComplete, false);
    assert.equal(metrics.quality.shiftStartFound, false);
});

test('builds a URL-safe self-contained bookmarklet that survives URL normalization', () => {
    const bookmarklet = analytics.buildBookmarklet();
    const source = decodeBookmarklet(bookmarklet);
    assert.match(bookmarklet, /^javascript:/);
    assert.equal(bookmarklet, analytics.buildInlineBookmarklet());
    assert.doesNotMatch(bookmarklet, /[\r\n]/);
    assert.match(bookmarklet, /%0A/i);
    assert.ok(Buffer.byteLength(bookmarklet, 'utf8') < 2 * 1024 * 1024);
    assert.doesNotMatch(source, /createElement\(['"]script/);
    assert.doesNotMatch(source, /https:\/\/tabby\.sultanops\.com/);
    assert.doesNotThrow(() => new Function(source));
});

test('runtime includes picker, cancellable lazy scrolling, quality UI, and no innerHTML sink', () => {
    const runtime = analytics.getRuntimeSource();
    assert.match(runtime, /fastToolkit_crm_profile_analytics_host_v1/);
    assert.match(runtime, /MutationObserver/);
    assert.match(runtime, /AbortController/);
    assert.match(runtime, /initialScrollTop/);
    assert.match(runtime, /MIN_END_STABLE_MS = 3200/);
    assert.match(runtime, /shift-start-found/);
    assert.match(runtime, /addMetric\('online-time'/);
    assert.match(runtime, /setAttribute\('data-role'/);
    assert.doesNotMatch(runtime, /\.innerHTML\s*=/);
});

test('bookmarklet refuses to install outside the exact CRM allowlist', () => {
    let alertMessage = '';
    const context = {
        window: {
            location: { protocol: 'https:', hostname: 'example.com' },
            alert(message) { alertMessage = message; }
        },
        document: {}
    };
    context.window.window = context.window;
    vm.runInNewContext(decodeBookmarklet(analytics.buildBookmarklet()), context);
    assert.match(alertMessage, /CRM/);
    assert.equal(context.window.__FAST_TOOLKIT_CRM_PROFILE_ANALYTICS__, undefined);
});
