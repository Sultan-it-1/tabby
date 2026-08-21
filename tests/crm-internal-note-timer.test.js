'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const noteTimer = require('../crm-internal-note-timer.js');

function decodeBookmarklet(bookmarklet) {
    const normalized = new URL(bookmarklet).href;
    assert.match(normalized, /^javascript:/);
    return decodeURIComponent(normalized.slice('javascript:'.length));
}

function safePair(overrides = {}) {
    return {
        editorOwnText: 'textarea internal-note-editor Internal note',
        buttonOwnText: 'button add-internal-note Send',
        contextText: 'Internal note Add note',
        activeModeText: 'Internal note',
        editorIsEditable: true,
        buttonIsAction: true,
        buttonIsSubmit: true,
        sameContainer: true,
        multipleVisibleEditors: false,
        multipleMatchingButtons: false,
        ...overrides
    };
}

test('uses an exact two-minute interval', () => {
    assert.equal(noteTimer.DEFAULT_INTERVAL_MS, 120000);
});

test('cycles checking through zero, one, two, and three dots', () => {
    assert.deepEqual(
        [0, 1, 2, 3, 4, 5].map(index => noteTimer.getCheckingVariant(index)),
        ['checking', 'checking.', 'checking..', 'checking...', 'checking', 'checking.']
    );
});

test('allows only the exact CRM hosts plus local development', () => {
    assert.equal(noteTimer.isAllowedLocation({ protocol: 'https:', hostname: 'crm.tabby.sa' }), true);
    assert.equal(noteTimer.isAllowedLocation({ protocol: 'https:', hostname: 'crm.tabby.ai' }), true);
    assert.equal(noteTimer.isAllowedLocation({ protocol: 'http:', hostname: 'localhost' }), true);
    assert.equal(noteTimer.isAllowedLocation({ protocol: 'file:', hostname: '' }), true);
    assert.equal(noteTimer.isAllowedLocation({ protocol: 'https:', hostname: 'evil.crm.tabby.sa' }), false);
    assert.equal(noteTimer.isAllowedLocation({ protocol: 'http:', hostname: 'crm.tabby.sa' }), false);
    assert.equal(noteTimer.isAllowedLocation({ protocol: 'https:', hostname: 'example.com' }), false);
});

test('extracts only ticket routes on supported hosts', () => {
    assert.equal(noteTimer.extractTicketId('https://crm.tabby.sa/object/ticket/abc-123'), 'abc-123');
    assert.equal(noteTimer.extractTicketId('https://crm.tabby.ai/#/queue/ticket/ticket%2042'), 'ticket 42');
    assert.equal(noteTimer.extractTicketId('https://example.com/object/ticket/abc-123'), '');
    assert.equal(noteTimer.extractTicketId('https://crm.tabby.sa/profile/user'), '');
});

test('accepts a separately identified Internal Note editor and its action button', () => {
    const result = noteTimer.validateSemanticPair(safePair());
    assert.equal(result.safe, true);
    assert.deepEqual(result.reasons, []);
});

test('rejects a customer/public composer even when it has a Send button', () => {
    const result = noteTimer.validateSemanticPair(safePair({
        editorOwnText: 'Customer reply message',
        buttonOwnText: 'Send customer reply',
        contextText: 'Customer conversation Reply Send',
        activeModeText: 'Reply'
    }));
    assert.equal(result.safe, false);
    assert.ok(result.reasons.includes('editor-not-explicitly-internal'));
    assert.ok(result.reasons.includes('button-not-explicitly-internal'));
    assert.ok(result.reasons.includes('customer-editor'));
    assert.ok(result.reasons.includes('customer-mode-active'));
});

test('rejects a shared Reply/Internal Note composer when the active mode is unknown', () => {
    const result = noteTimer.validateSemanticPair(safePair({
        editorOwnText: 'composer textbox',
        buttonOwnText: 'button Send',
        contextText: 'Customer Reply Internal Note Send',
        activeModeText: ''
    }));
    assert.equal(result.safe, false);
    assert.ok(result.reasons.includes('editor-not-explicitly-internal'));
    assert.ok(result.reasons.includes('button-not-explicitly-internal'));
    assert.ok(result.reasons.includes('shared-mode-not-confirmed'));
});

test('rejects Public note controls and mixed active-mode labels', () => {
    const publicNote = noteTimer.validateSemanticPair(safePair({
        editorOwnText: 'Public note',
        buttonOwnText: 'Send public note',
        contextText: 'Public note',
        activeModeText: 'Public note'
    }));
    assert.equal(publicNote.safe, false);
    assert.ok(publicNote.reasons.includes('customer-editor'));
    assert.ok(publicNote.reasons.includes('customer-button'));

    const mixedMode = noteTimer.validateSemanticPair(safePair({ activeModeText: 'Internal Note Customer Reply' }));
    assert.equal(mixedMode.safe, false);
    assert.ok(mixedMode.reasons.includes('customer-mode-active'));
});

test('rejects a shared composer or ambiguous send button', () => {
    const shared = noteTimer.validateSemanticPair(safePair({ multipleVisibleEditors: true }));
    assert.equal(shared.safe, false);
    assert.ok(shared.reasons.includes('shared-or-ambiguous-composer'));

    const ambiguous = noteTimer.validateSemanticPair(safePair({ multipleMatchingButtons: true }));
    assert.equal(ambiguous.safe, false);
    assert.ok(ambiguous.reasons.includes('ambiguous-submit-button'));
});

test('rejects Internal Note context while Customer mode is active', () => {
    const result = noteTimer.validateSemanticPair(safePair({
        editorOwnText: 'composer textbox',
        contextText: 'Reply Internal note',
        activeModeText: 'Customer Reply'
    }));
    assert.equal(result.safe, false);
    assert.ok(result.reasons.includes('customer-mode-active'));
});

test('send readiness protects drafts, ticket changes, typing, offline pages, and overlap', () => {
    const base = {
        pairSafe: true,
        currentTicketId: 'ticket-a',
        configuredTicketId: 'ticket-a',
        editorConnected: true,
        buttonConnected: true,
        editorEmpty: true,
        buttonDisabled: false,
        documentHidden: false,
        offline: false,
        composing: false,
        userIdleMs: 2000,
        minimumIdleMs: 1400,
        buttonEnabledRequired: false,
        inFlight: false
    };
    assert.equal(noteTimer.evaluateSendReadiness(base).allowed, true);

    const cases = [
        ['note-has-draft', { editorEmpty: false }],
        ['ticket-changed', { currentTicketId: 'ticket-b' }],
        ['user-typing', { userIdleMs: 300 }],
        ['offline', { offline: true }],
        ['composition-active', { composing: true }],
        ['send-in-flight', { inFlight: true }]
    ];
    cases.forEach(([reason, overrides]) => {
        const result = noteTimer.evaluateSendReadiness({ ...base, ...overrides });
        assert.equal(result.allowed, false, reason);
        assert.ok(result.reasons.includes(reason), reason);
    });

    assert.equal(noteTimer.evaluateSendReadiness({ ...base, buttonDisabled: true }).allowed, true);
    const afterFillDisabled = noteTimer.evaluateSendReadiness({
        ...base,
        buttonEnabledRequired: true,
        buttonDisabled: true
    });
    assert.equal(afterFillDisabled.allowed, false);
    assert.ok(afterFillDisabled.reasons.includes('button-disabled'));
});

test('builds a URL-safe self-contained bookmarklet', () => {
    const bookmarklet = noteTimer.buildBookmarklet();
    const source = decodeBookmarklet(bookmarklet);
    assert.match(bookmarklet, /^javascript:/);
    assert.equal(bookmarklet, noteTimer.buildInlineBookmarklet());
    assert.doesNotMatch(bookmarklet, /[\r\n]/);
    assert.match(bookmarklet, /%0A/i);
    assert.ok(Buffer.byteLength(bookmarklet, 'utf8') < 2 * 1024 * 1024);
    assert.doesNotThrow(() => new Function(source));
    assert.doesNotMatch(source, /createElement\(['"]script/);
    assert.doesNotMatch(source, /https:\/\/tabby\.sultanops\.com/);
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest/);
});

test('runtime is fail-closed and never uses a generic auto-picked composer', () => {
    const runtime = noteTimer.getRuntimeSource();
    assert.match(runtime, /CHECKING_VARIANTS = Object\.freeze\(\['checking', 'checking\.', 'checking\.\.', 'checking\.\.\.'\]\)/);
    assert.match(runtime, /إيقاف Checking/);
    assert.match(runtime, /state\.sequenceIndex = \(state\.sequenceIndex \+ 1\) % 4/);
    assert.match(runtime, /waitForSendConfirmation\(ticketId, generation\)/);
    assert.match(runtime, /if \(!isAttemptActive\(generation, ticketId\)\) return false/);
    assert.match(runtime, /clearInjectedChecking\(state\.injectedEditor, resolveEditor\(\)\)/);
    assert.match(runtime, /INTERVAL_MS = safety\.DEFAULT_INTERVAL_MS/);
    assert.match(runtime, /editor-not-explicitly-internal/);
    assert.match(runtime, /button-not-explicitly-internal/);
    assert.match(runtime, /shared-or-ambiguous-composer/);
    assert.match(runtime, /shared-mode-not-confirmed/);
    assert.match(runtime, /customer-mode-active/);
    assert.match(runtime, /readEditorValue\(editor\) === ''/);
    assert.match(runtime, /getCurrentTicketId\(\) !== state\.configuredTicketId/);
    assert.match(runtime, /state\.attemptGeneration/);
    assert.match(runtime, /isAttemptActive/);
    assert.match(runtime, /waitForReadyControls/);
    assert.match(runtime, /navigator\.locks/);
    assert.match(runtime, /pagehide/);
    assert.doesNotMatch(runtime, /querySelector\(['"]textarea['"]\)/);
    assert.doesNotMatch(runtime, /querySelector\(['"]\[contenteditable/);
    assert.doesNotMatch(runtime, /editor\.textContent\s*=/);
    assert.doesNotMatch(runtime, /\.innerHTML\s*=/);
});

test('bookmarklet refuses to install outside CRM before touching the page', () => {
    let alertMessage = '';
    const context = {
        window: {
            location: {
                href: 'https://example.com/object/ticket/demo',
                origin: 'https://example.com',
                protocol: 'https:',
                hostname: 'example.com'
            },
            alert(message) { alertMessage = message; }
        },
        document: {},
        URL
    };
    context.window.window = context.window;
    vm.runInNewContext(decodeBookmarklet(noteTimer.buildBookmarklet()), context);
    assert.match(alertMessage, /CRM/);
    assert.equal(context.window.__FAST_TOOLKIT_CRM_INTERNAL_NOTE_TIMER__, undefined);
});

test('home Extra Tools modal wires drag, copy, and the generated Checking bookmarklet URL', () => {
    const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(index, /id="extraToolsModal"/);
    assert.match(index, /api:\s*window\.FastToolkitCrmInternalNoteTimer/);
    assert.match(index, /const bookmarklet = api\.buildBookmarklet\(\)/);
    assert.match(index, /link\.href = bookmarklet/);
    assert.match(index, /'dragstart'/);
    assert.match(index, /'dragend'/);
    assert.match(index, /navigator\.clipboard\.writeText\(bookmarklet\)/);
});

test('browser fixture keeps Customer Reply and Internal Note in separate forms', () => {
    const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'crm-internal-note-timer-fixture.html'), 'utf8');
    assert.match(fixture, /data-testid="customer-reply-composer"/);
    assert.match(fixture, /data-testid="internal-note-composer"/);
    assert.match(fixture, /aria-label="Customer message">مسودة العميل لا تتغير/);
    assert.match(fixture, /data-testid="internal-note-submit"/);
});
