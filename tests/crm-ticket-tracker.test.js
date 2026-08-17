'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const tracker = require('../crm-ticket-tracker.js');

function decodeBookmarkletSource(bookmarklet) {
    const normalizedUrl = new URL(bookmarklet).href;
    assert.match(normalizedUrl, /^javascript:/);
    return decodeURIComponent(normalizedUrl.slice('javascript:'.length));
}

function createBookmarkletTestEnvironment(locationOverride = {}, initialTimestamp = Date.now()) {
    let currentTimestamp = Number(initialTimestamp);
    const NativeDate = Date;
    class TestDate extends NativeDate {
        constructor(...args) {
            super(...(args.length ? args : [currentTimestamp]));
        }
        static now() {
            return currentTimestamp;
        }
    }

    const makeElement = (tagName = 'div') => {
        const listeners = new Map();
        const classes = new Set();
        return {
            tagName: String(tagName).toUpperCase(),
            nodeType: 1,
            style: {},
            children: [],
            classList: {
                add(name) { classes.add(name); },
                remove(name) { classes.delete(name); },
                contains(name) { return classes.has(name); }
            },
            appendChild(child) {
                this.children.push(child);
                child.parentNode = this;
                return child;
            },
            append(...children) {
                children.forEach(child => this.appendChild(child));
            },
            replaceChildren(...children) {
                this.children = [];
                this.append(...children);
            },
            addEventListener(type, handler) {
                if (!listeners.has(type)) listeners.set(type, []);
                listeners.get(type).push(handler);
            },
            removeEventListener() {},
            getBoundingClientRect() {
                const styledLeft = Number.parseFloat(this.style.left);
                const styledTop = Number.parseFloat(this.style.top);
                return {
                    left: Number.isFinite(styledLeft) ? styledLeft : 8,
                    top: Number.isFinite(styledTop) ? styledTop : 8,
                    width: this.offsetWidth,
                    height: this.offsetHeight
                };
            },
            setPointerCapture() {},
            releasePointerCapture() {},
            select() {},
            remove() {
                this.removed = true;
            },
            offsetWidth: 310,
            offsetHeight: 220
        };
    };

    const shadowElements = new Map();
    const shadow = makeElement('shadow-root');
    shadow.querySelector = (selector) => {
        if (!shadowElements.has(selector)) shadowElements.set(selector, makeElement());
        return shadowElements.get(selector);
    };
    shadow.querySelectorAll = (selector) => (
        selector === '.live' ? [shadow.querySelector('.live-1'), shadow.querySelector('.live-2')] : []
    );

    const documentElement = makeElement('html');
    const body = makeElement('body');
    const appendedHosts = [];
    documentElement.appendChild = (child) => {
        documentElement.children.push(child);
        child.parentNode = documentElement;
        appendedHosts.push(child);
        return child;
    };

    const document = {
        documentElement,
        body,
        createElement(tagName) {
            const element = makeElement(tagName);
            if (String(tagName).toLowerCase() === 'div') {
                element.attachShadow = () => {
                    element.shadowRoot = shadow;
                    return shadow;
                };
            }
            return element;
        },
        getElementById(id) {
            return appendedHosts.find(element => element.id === id && !element.removed) || null;
        },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {},
        removeEventListener() {},
        execCommand() { return true; }
    };

    const storedValues = new Map();
    const localStorage = {
        getItem(key) { return storedValues.has(key) ? storedValues.get(key) : null; },
        setItem(key, value) { storedValues.set(key, String(value)); },
        removeItem(key) { storedValues.delete(key); }
    };
    const alerts = [];
    const windowListeners = new Map();
    const intervalCallbacks = [];
    const window = {
        document,
        localStorage,
        location: {
            href: 'https://crm.tabby.sa/object/ticket/test-ticket-123',
            origin: 'https://crm.tabby.sa',
            protocol: 'https:',
            hostname: 'crm.tabby.sa',
            ...locationOverride
        },
        innerWidth: 1280,
        innerHeight: 800,
        matchMedia() { return { matches: false }; },
        addEventListener(type, handler) {
            if (!windowListeners.has(type)) windowListeners.set(type, []);
            windowListeners.get(type).push(handler);
        },
        setInterval(callback) {
            intervalCallbacks.push(callback);
            return intervalCallbacks.length;
        },
        clearInterval() {},
        confirm() { return true; },
        alert(message) { alerts.push(message); }
    };

    return {
        appendedHosts,
        alerts,
        context: {
            window,
            document,
            localStorage,
            navigator: {},
            URL,
            Date: TestDate,
            setTimeout,
            clearTimeout
        },
        advanceTime(milliseconds) {
            currentTimestamp += milliseconds;
        },
        window,
        windowListeners,
        localStorage,
        shadow,
        runHeartbeat() {
            intervalCallbacks.forEach(callback => callback());
        }
    };
}

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

test('bookmarklet is self-contained, parseable, and does not load remote scripts', () => {
    const bookmarklet = tracker.buildBookmarklet();
    const source = decodeBookmarkletSource(bookmarklet);
    assert.match(bookmarklet, /^javascript:/);
    assert.equal(bookmarklet, tracker.buildInlineBookmarklet());
    assert.ok(Buffer.byteLength(bookmarklet, 'utf8') < 2 * 1024 * 1024);
    assert.doesNotMatch(bookmarklet, /[\r\n]/);
    assert.match(bookmarklet, /%0A/i);
    assert.match(source, /action:'install'/);
    assert.doesNotThrow(() => new Function(source));
    assert.doesNotMatch(source, /tabby\.sultanops\.com/);
    assert.doesNotMatch(source, /createElement\(['"]script['"]\)/);
    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /XMLHttpRequest/);
});

test('bookmarklet installs on CRM and a second run reuses the existing instance', () => {
    const environment = createBookmarkletTestEnvironment();
    const source = decodeBookmarkletSource(tracker.buildBookmarklet());

    vm.runInNewContext(source, environment.context);
    assert.equal(environment.alerts.length, 0);
    assert.equal(environment.appendedHosts.length, 1);
    assert.equal(environment.appendedHosts[0].id, 'fastToolkitCrmTicketTrackerHost');
    assert.equal(typeof environment.window.__FAST_TOOLKIT_CRM_TICKET_TRACKER__.show, 'function');

    vm.runInNewContext(source, environment.context);
    assert.equal(environment.appendedHosts.length, 1);
});

test('bookmarklet refuses to monitor pages outside the CRM allowlist', () => {
    const environment = createBookmarkletTestEnvironment({
        href: 'https://example.com/account',
        origin: 'https://example.com',
        hostname: 'example.com'
    });

    vm.runInNewContext(decodeBookmarkletSource(tracker.buildBookmarklet()), environment.context);
    assert.equal(environment.appendedHosts.length, 0);
    assert.equal(environment.alerts.length, 1);
    assert.equal(environment.window.__FAST_TOOLKIT_CRM_TICKET_TRACKER__, undefined);
});

test('bookmarklet resumes cleanly after a back-forward cache restore', () => {
    const environment = createBookmarkletTestEnvironment();
    vm.runInNewContext(decodeBookmarkletSource(tracker.buildBookmarklet()), environment.context);

    const pagehide = environment.windowListeners.get('pagehide')[0];
    const pageshow = environment.windowListeners.get('pageshow')[0];
    assert.doesNotThrow(() => pagehide({ persisted: true }));
    assert.doesNotThrow(() => pageshow({ persisted: true }));
    assert.equal(environment.appendedHosts.length, 1);
    assert.equal(typeof environment.window.__FAST_TOOLKIT_CRM_TICKET_TRACKER__.show, 'function');
});

test('large panel opens from the current compact counter position', () => {
    const environment = createBookmarkletTestEnvironment();
    vm.runInNewContext(decodeBookmarkletSource(tracker.buildBookmarklet()), environment.context);

    const api = environment.window.__FAST_TOOLKIT_CRM_TICKET_TRACKER__;
    const compact = environment.shadow.querySelector('[data-role="compact"]');
    const panel = environment.shadow.querySelector('[data-role="panel"]');
    api.minimize();
    compact.style.left = '420px';
    compact.style.top = '260px';
    api.show();

    assert.equal(panel.style.left, '420px');
    assert.equal(panel.style.top, '260px');
    assert.equal(compact.style.display, 'none');
});

test('index.html configures bookmarklet link with "اسحبني إلى شريط المفضلة" on page and "العداد" on drag', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

    assert.match(indexHtml, /id="crmTrackerBookmarklet">اسحبني إلى شريط المفضلة<\/a>/);
    assert.match(indexHtml, /const bookmarkTitle = 'العداد';/);
    assert.match(indexHtml, /bookmarkletLink\.addEventListener\('dragstart'/);
    assert.match(indexHtml, /bookmarkletLink\.addEventListener\('dragend'/);
    assert.match(indexHtml, /crm-ticket-tracker\.js\?v='\s*\+\s*\(typeof APP_VERSION/);
    assert.doesNotMatch(indexHtml, /crm-ticket-tracker\.js\?v=\d/);
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
    assert.match(runtime, /makeDraggable\(compact,\s*rememberPosition\)/);
    assert.match(runtime, /makeDraggable\(panel,\s*rememberPosition\)/);
    assert.doesNotMatch(runtime, /panelPos/);
    assert.match(runtime, /pointerdown/);
    assert.match(runtime, /width:310px/);
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

test('bookmarklet tracks total and typed characters and words count', () => {
    const runtime = tracker.getRuntimeSource();
    assert.match(runtime, /totalChars/);
    assert.match(runtime, /totalWords/);
    assert.match(runtime, /typedChars/);
    assert.match(runtime, /typedWords/);
    assert.match(runtime, /data-role="words-count"/);
    assert.match(runtime, /data-role="chars-count"/);
    assert.match(runtime, /onUserTyping/);
    assert.match(runtime, /onUserPaste/);
});

test('bookmarklet resets automatically after 4 hours of inactivity', () => {
    const runtime = tracker.getRuntimeSource();
    assert.match(runtime, /4\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
    assert.match(runtime, /INACTIVITY_TIMEOUT_MS/);
    assert.match(runtime, /lastActivityAt/);
});

test('bookmarklet pauses on AUX and keeps the same shift across midnight', () => {
    const startTimestamp = new Date(2026, 7, 17, 22, 0, 0).getTime();
    const environment = createBookmarkletTestEnvironment({}, startTimestamp);
    vm.runInNewContext(decodeBookmarkletSource(tracker.buildBookmarklet()), environment.context);

    const storageKey = 'fastToolkit_crm_ticket_tracker_v1';
    const initialState = JSON.parse(environment.localStorage.getItem(storageKey));
    const initialDay = initialState.day;

    environment.advanceTime(30 * 60 * 1000);
    environment.window.location.href = 'https://crm.tabby.sa/queue';
    environment.runHeartbeat();
    const auxStartedState = JSON.parse(environment.localStorage.getItem(storageKey));
    const pausedTicketMs = auxStartedState.tickets['test-ticket-123'].totalMs;
    const auxStartedAt = auxStartedState.lastActivityAt;
    assert.equal(auxStartedState.active, null);

    environment.advanceTime(60 * 60 * 1000);
    environment.runHeartbeat();
    const duringAuxState = JSON.parse(environment.localStorage.getItem(storageKey));
    assert.equal(duringAuxState.tickets['test-ticket-123'].totalMs, pausedTicketMs);
    assert.equal(duringAuxState.lastActivityAt, auxStartedAt);

    environment.advanceTime(90 * 60 * 1000);
    environment.window.location.href = 'https://crm.tabby.sa/object/ticket/night-ticket-2';
    environment.runHeartbeat();
    const afterMidnightState = JSON.parse(environment.localStorage.getItem(storageKey));
    assert.equal(afterMidnightState.day, initialDay);
    assert.equal(afterMidnightState.shiftStartedAt, startTimestamp);
    assert.deepEqual(Object.keys(afterMidnightState.tickets).sort(), ['night-ticket-2', 'test-ticket-123']);
    assert.equal(afterMidnightState.active.id, 'night-ticket-2');
});

test('bookmarklet starts a new shift only after four hours without a ticket', () => {
    const startTimestamp = new Date(2026, 7, 17, 10, 0, 0).getTime();
    const environment = createBookmarkletTestEnvironment({}, startTimestamp);
    vm.runInNewContext(decodeBookmarkletSource(tracker.buildBookmarklet()), environment.context);

    const storageKey = 'fastToolkit_crm_ticket_tracker_v1';
    const historyKey = 'fastToolkit_crm_ticket_tracker_history_v1';
    environment.advanceTime(10 * 60 * 1000);
    environment.window.location.href = 'https://crm.tabby.sa/queue';
    environment.runHeartbeat();

    environment.advanceTime((4 * 60 * 60 * 1000) + 1);
    environment.runHeartbeat();
    const resetState = JSON.parse(environment.localStorage.getItem(storageKey));
    const history = JSON.parse(environment.localStorage.getItem(historyKey));
    assert.deepEqual(resetState.tickets, {});
    assert.ok(resetState.shiftStartedAt > startTimestamp);
    assert.equal(history.length, 1);

    environment.window.location.href = 'https://crm.tabby.sa/object/ticket/new-shift-ticket';
    environment.runHeartbeat();
    const newShiftState = JSON.parse(environment.localStorage.getItem(storageKey));
    assert.deepEqual(Object.keys(newShiftState.tickets), ['new-shift-ticket']);
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

test('bookmarklet preserves totalWords and totalChars during state normalization', () => {
    const runtime = tracker.getRuntimeSource();
    assert.match(runtime, /normalized\.totalWords\s*=\s*Math\.max\(0,\s*Number\(candidate\.totalWords\)/);
    assert.match(runtime, /normalized\.totalChars\s*=\s*Math\.max\(0,\s*Number\(candidate\.totalChars\)/);
});

test('bookmarklet tracks pasted text and words in customer rich-text composer and notes', () => {
    const runtime = tracker.getRuntimeSource();
    assert.match(runtime, /onUserPaste/);
    assert.match(runtime, /isEditableElement/);
    assert.match(runtime, /contenteditable/);
    assert.match(runtime, /clipboardData/);
    assert.match(runtime, /addEventListener\('paste',\s*onUserPaste/);
});

test('formats numbers compactly for analytics and preserves full value in hover title', () => {
    assert.equal(tracker.formatCompactNumber(0), '0');
    assert.equal(tracker.formatCompactNumber(850), '850');
    assert.equal(tracker.formatCompactNumber(1000), '1K');
    assert.equal(tracker.formatCompactNumber(1300), '1.3K');
    assert.equal(tracker.formatCompactNumber(20000), '20K');
    assert.equal(tracker.formatCompactNumber(21500), '21.5K');
    assert.equal(tracker.formatCompactNumber(1000000), '1M');
    assert.equal(tracker.formatCompactNumber(1400000), '1.4M');

    const runtime = tracker.getRuntimeSource();
    assert.match(runtime, /formatCompactNumber/);
    assert.match(runtime, /allCharsElem\.title/);
    assert.match(runtime, /allWordsElem\.title/);
    assert.match(runtime, /allSessionsElem\.title/);
});
