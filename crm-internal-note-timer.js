(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.FastToolkitCrmInternalNoteTimer = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createInternalNoteSafety() {
        const DEFAULT_INTERVAL_MS = 2 * 60 * 1000;
        const CHECKING_VARIANTS = Object.freeze(['checking', 'checking.', 'checking..', 'checking...']);

        function getCheckingVariant(index) {
            const numericIndex = Number.isFinite(Number(index)) ? Math.trunc(Number(index)) : 0;
            const normalizedIndex = ((numericIndex % CHECKING_VARIANTS.length) + CHECKING_VARIANTS.length) % CHECKING_VARIANTS.length;
            return CHECKING_VARIANTS[normalizedIndex];
        }

        function normalizeText(value) {
            return String(value == null ? '' : value)
                .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
                .replace(/\u00a0/g, ' ')
                .replace(/[_-]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
        }

        function analyzeSemanticText(value) {
            const text = normalizeText(value);
            const strongNote = /\b(?:internal|private)\s+(?:note|comment|memo)s?\b|\b(?:note|comment|memo)s?\s+(?:internal|privately)\b|ملاحظ(?:ة|ات)\s+داخلي(?:ة|ه)|تعليق\s+داخلي|نوت(?:ة)?\s+داخلي(?:ة|ه)/i.test(text);
            const note = strongNote || /\b(?:note|notes|comment|comments|memo|memos)\b|ملاحظ(?:ة|ات)|تعليق|نوتة?/i.test(text);
            const customer = /\b(?:customer|public|reply|chat|conversation|customer\s+message|send\s+message)\b|رسالة\s+العميل|رد\s+للعميل|محادثة\s+العميل|عام(?:ة)?/i.test(text);
            const action = /\b(?:send|save|add|submit|post|create)\b|إرسال|ارسال|حفظ|إضافة|اضافة|نشر/i.test(text);
            return { text, strongNote, note, customer, action };
        }

        function isAllowedLocation(locationLike) {
            if (!locationLike) return false;
            const protocol = String(locationLike.protocol || '').toLowerCase();
            const hostname = String(locationLike.hostname || '').toLowerCase();
            if (protocol === 'file:') return true;
            if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
            return protocol === 'https:' && (hostname === 'crm.tabby.sa' || hostname === 'crm.tabby.ai');
        }

        function extractTicketId(input, base) {
            try {
                const url = new URL(String(input || ''), base || 'https://crm.tabby.sa');
                if (!isAllowedLocation(url)) return '';
                const source = `${url.pathname}${url.hash || ''}`;
                const match = source.match(/(?:^|[\/#])(?:queue|object)\/ticket\/([^/?#]+)/i);
                return match ? decodeURIComponent(match[1]).trim() : '';
            } catch (error) {
                return '';
            }
        }

        function validateSemanticPair(input) {
            const data = input || {};
            const editorOwn = analyzeSemanticText(data.editorOwnText);
            const buttonOwn = analyzeSemanticText(data.buttonOwnText);
            const context = analyzeSemanticText(data.contextText);
            const activeMode = analyzeSemanticText(data.activeModeText);
            const hasActiveMode = Boolean(normalizeText(data.activeModeText));
            const reasons = [];

            if (!data.editorIsEditable) reasons.push('not-editable');
            if (!data.buttonIsAction) reasons.push('not-action-button');
            if (!data.sameContainer) reasons.push('different-container');
            if (data.multipleVisibleEditors) reasons.push('shared-or-ambiguous-composer');
            if (data.multipleMatchingButtons) reasons.push('ambiguous-submit-button');

            const activeInternalNoteConfirmed = hasActiveMode && activeMode.strongNote && !activeMode.customer;
            if (!editorOwn.strongNote && !activeInternalNoteConfirmed) reasons.push('editor-not-explicitly-internal');
            if (!buttonOwn.strongNote) reasons.push('button-not-explicitly-internal');

            const mixedReplyAndNoteContext = context.note && context.customer;
            if (mixedReplyAndNoteContext) reasons.push('shared-mode-not-confirmed');

            if (editorOwn.customer) reasons.push('customer-editor');
            if (buttonOwn.customer) reasons.push('customer-button');
            if (context.customer) reasons.push('customer-context');
            if (hasActiveMode && activeMode.customer) reasons.push('customer-mode-active');
            if (hasActiveMode && !activeMode.strongNote) reasons.push('note-mode-not-confirmed');
            if (!buttonOwn.action && !data.buttonIsSubmit && !context.action) reasons.push('button-action-not-confirmed');

            return Object.freeze({
                safe: reasons.length === 0,
                reasons: Object.freeze(reasons),
                evidence: Object.freeze({
                    editor: editorOwn.text,
                    button: buttonOwn.text,
                    context: context.text,
                    activeMode: activeMode.text
                })
            });
        }

        function evaluateSendReadiness(input) {
            const data = input || {};
            const reasons = [];
            if (!data.pairSafe) reasons.push('unsafe-pair');
            if (!data.currentTicketId || data.currentTicketId !== data.configuredTicketId) reasons.push('ticket-changed');
            if (!data.editorConnected || !data.buttonConnected) reasons.push('controls-missing');
            if (!data.editorEmpty) reasons.push('note-has-draft');
            if (data.buttonEnabledRequired && data.buttonDisabled) reasons.push('button-disabled');
            if (data.documentHidden) reasons.push('page-hidden');
            if (data.offline) reasons.push('offline');
            if (data.composing) reasons.push('composition-active');
            if (Number(data.userIdleMs || 0) < Number(data.minimumIdleMs || 0)) reasons.push('user-typing');
            if (data.inFlight) reasons.push('send-in-flight');
            return Object.freeze({ allowed: reasons.length === 0, reasons: Object.freeze(reasons) });
        }

        return Object.freeze({
            DEFAULT_INTERVAL_MS,
            getCheckingVariant,
            normalizeText,
            analyzeSemanticText,
            isAllowedLocation,
            extractTicketId,
            validateSemanticPair,
            evaluateSendReadiness
        });
    }

    function fastToolkitCrmInternalNoteTimerRuntime(createSafety, request = {}) {
        const safety = createSafety();
        const HOST_ID = 'fast-toolkit-crm-internal-note-timer-host-v1';
        const CONFIG_KEY = 'fastToolkit_crm_internal_note_timer_config_v1';
        const LEASE_PREFIX = 'fastToolkit_crm_internal_note_timer_lease_v1:';
        const LAST_SENT_PREFIX = 'fastToolkit_crm_internal_note_timer_last_sent_v1:';
        const INTERVAL_MS = safety.DEFAULT_INTERVAL_MS;
        const MINIMUM_USER_IDLE_MS = 1400;
        const LEASE_MS = 45000;
        const CONFIRM_TIMEOUT_MS = 10000;

        if (request.action !== 'install') return null;
        if (typeof window === 'undefined' || typeof document === 'undefined') return null;
        if (!safety.isAllowedLocation(window.location)) {
            if (typeof window.alert === 'function') window.alert('أداة Checking تعمل فقط داخل CRM.');
            return null;
        }

        const existing = window.__FAST_TOOLKIT_CRM_INTERNAL_NOTE_TIMER__;
        if (existing && typeof existing.show === 'function') {
            existing.show();
            return existing;
        }

        function createElement(tagName, properties, children) {
            const element = document.createElement(tagName);
            Object.entries(properties || {}).forEach(([key, value]) => {
                if (key === 'className') element.className = value;
                else if (key === 'textContent') element.textContent = value;
                else if (key === 'type') element.type = value;
                else if (key === 'disabled') element.disabled = Boolean(value);
                else element.setAttribute(key, value);
            });
            (children || []).forEach(child => element.appendChild(child));
            return element;
        }

        function safeJsonRead(key) {
            try {
                const value = window.localStorage.getItem(key);
                return value ? JSON.parse(value) : null;
            } catch (error) {
                return null;
            }
        }

        function safeJsonWrite(key, value) {
            try {
                window.localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                return false;
            }
        }

        function safeRemove(key) {
            try { window.localStorage.removeItem(key); } catch (error) { }
        }

        function ticketStorageSuffix(ticketId) {
            return encodeURIComponent(String(ticketId || '')).slice(0, 180);
        }

        function getCurrentTicketId() {
            return safety.extractTicketId(window.location.href, window.location.origin);
        }

        function makeOwnerId() {
            try {
                if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
            } catch (error) { }
            return `note-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        }

        const state = {
            ownerId: makeOwnerId(),
            editor: null,
            button: null,
            editorLocator: null,
            buttonLocator: null,
            injectedEditor: null,
            injectedText: '',
            configuredTicketId: '',
            running: false,
            inFlight: false,
            nextAt: 0,
            lastSentAt: 0,
            sequenceIndex: 0,
            lastUserInputAt: 0,
            userActivityGeneration: 0,
            attemptGeneration: 0,
            composing: false,
            picker: null,
            minimized: false,
            destroyed: false,
            leaseRenewedAt: 0,
            message: 'حدد خانة Internal Note وزر الإرسال.',
            tone: 'neutral'
        };

        const host = document.createElement('div');
        host.id = HOST_ID;
        document.documentElement.appendChild(host);
        const shadow = host.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
            :host{all:initial}*{box-sizing:border-box}.panel{position:fixed;z-index:2147483646;right:18px;bottom:18px;width:330px;background:#101826;color:#e5edf7;border:1px solid #334155;border-radius:14px;box-shadow:0 18px 45px rgba(0,0,0,.42);font-family:Tahoma,Arial,sans-serif;direction:rtl;overflow:hidden}.panel.hidden{display:none}.head{display:flex;align-items:center;gap:8px;padding:11px 12px;background:#172033;border-bottom:1px solid #334155}.title{font-size:13px;font-weight:800;flex:1}.icon-btn{border:0;background:#26344d;color:#dce8f8;border-radius:7px;width:27px;height:27px;cursor:pointer}.body{padding:12px}.status{font-size:11px;line-height:1.6;padding:8px 9px;border-radius:8px;background:#172033;color:#cbd5e1;margin-bottom:9px}.status.good{background:#0b3b2e;color:#a7f3d0}.status.warn{background:#49330c;color:#fde68a}.status.bad{background:#4c171b;color:#fecaca}.grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:8px}.select-btn,.main-btn{border:1px solid #3b4b66;background:#1d2a40;color:#e5edf7;border-radius:8px;padding:8px 7px;font-size:10px;font-weight:700;cursor:pointer}.select-btn.ready{border-color:#10b981;color:#a7f3d0}.main-btn{width:100%;background:#0d8f67;border-color:#10b981;font-size:12px}.main-btn.pause{background:#8a5b11;border-color:#f59e0b}.main-btn:disabled,.select-btn:disabled{opacity:.48;cursor:not-allowed}.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:10px;color:#94a3b8;margin-bottom:9px}.meta b{display:block;color:#f1f5f9;margin-top:2px;font-size:11px}.warning{font-size:9px;line-height:1.55;color:#94a3b8;margin-top:8px}.bubble{position:fixed;z-index:2147483646;right:18px;bottom:18px;border:1px solid #10b981;background:#0f2f28;color:#a7f3d0;border-radius:999px;padding:9px 12px;font:700 11px Tahoma,Arial,sans-serif;cursor:pointer;direction:rtl}.bubble.hidden{display:none}`;
        shadow.appendChild(style);

        const panel = createElement('section', { className: 'panel' });
        const header = createElement('div', { className: 'head' });
        const title = createElement('div', { className: 'title', textContent: 'Checking — Internal Note' });
        const minimizeButton = createElement('button', { className: 'icon-btn', type: 'button', title: 'تصغير', textContent: '−' });
        const closeButton = createElement('button', { className: 'icon-btn', type: 'button', title: 'إيقاف وإغلاق', textContent: '×' });
        header.append(title, minimizeButton, closeButton);

        const body = createElement('div', { className: 'body' });
        const statusBox = createElement('div', { className: 'status', textContent: state.message });
        const meta = createElement('div', { className: 'meta' });
        const ticketCell = createElement('div', {}, [createElement('span', { textContent: 'التكت' }), createElement('b', { textContent: '—' })]);
        const nextCell = createElement('div', {}, [createElement('span', { textContent: 'الإرسال القادم' }), createElement('b', { textContent: 'متوقف' })]);
        meta.append(ticketCell, nextCell);
        const grid = createElement('div', { className: 'grid' });
        const pickEditorButton = createElement('button', { className: 'select-btn', type: 'button', textContent: '1) حدد خانة النوتة' });
        const pickSendButton = createElement('button', { className: 'select-btn', type: 'button', textContent: '2) حدد زر الإرسال' });
        grid.append(pickEditorButton, pickSendButton);
        const mainButton = createElement('button', { className: 'main-btn', type: 'button', disabled: true, textContent: 'ابدأ — أول إرسال بعد دقيقتين' });
        const warning = createElement('div', { className: 'warning', textContent: 'تعمل فقط مع textarea/input مستقل وزر يحمل تعريف Internal Note صريحًا. ترفض المحرر المشترك أو rich-text ولا تبدّل Reply/Note.' });
        body.append(statusBox, meta, grid, mainButton, warning);
        panel.append(header, body);
        const bubble = createElement('button', { className: 'bubble hidden', type: 'button', textContent: 'Checking: متوقف' });
        shadow.append(panel, bubble);

        const ticketValue = ticketCell.querySelector('b');
        const nextValue = nextCell.querySelector('b');

        function setMessage(message, tone) {
            state.message = String(message || '');
            state.tone = tone || 'neutral';
            render();
        }

        function formatCountdown(milliseconds) {
            const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
            const minutes = Math.floor(seconds / 60);
            const rest = seconds % 60;
            return `${minutes}:${String(rest).padStart(2, '0')}`;
        }

        function render() {
            if (state.destroyed) return;
            const ticketId = getCurrentTicketId();
            ticketValue.textContent = ticketId ? ticketId.slice(0, 18) : 'لا يوجد تكت';
            statusBox.textContent = state.message;
            statusBox.className = `status${state.tone === 'good' ? ' good' : state.tone === 'warn' ? ' warn' : state.tone === 'bad' ? ' bad' : ''}`;
            pickEditorButton.classList.toggle('ready', Boolean(state.editor));
            pickSendButton.classList.toggle('ready', Boolean(state.button));
            pickEditorButton.textContent = state.editor ? '✓ خانة النوتة محددة' : '1) حدد خانة النوتة';
            pickSendButton.textContent = state.button ? '✓ زر الإرسال محدد' : '2) حدد زر الإرسال';
            const pair = validateDomPair();
            mainButton.disabled = state.running ? false : !pair.safe || !ticketId;
            mainButton.classList.toggle('pause', state.running);
            mainButton.textContent = state.running ? 'إيقاف Checking' : 'ابدأ — أول إرسال بعد دقيقتين';
            nextValue.textContent = state.running ? formatCountdown(state.nextAt - Date.now()) : 'متوقف';
            bubble.textContent = state.running ? `Checking: ${formatCountdown(state.nextAt - Date.now())}` : 'Checking: متوقف';
            panel.classList.toggle('hidden', state.minimized);
            bubble.classList.toggle('hidden', !state.minimized);
        }

        function isEditable(element) {
            if (!element || element.nodeType !== 1) return false;
            const tag = String(element.tagName || '').toLowerCase();
            if (tag === 'textarea') return !element.disabled && !element.readOnly;
            if (tag === 'input') {
                const type = String(element.type || 'text').toLowerCase();
                return !element.disabled && !element.readOnly && !['hidden', 'password', 'checkbox', 'radio', 'submit', 'button'].includes(type);
            }
            return false;
        }

        function isActionButton(element) {
            if (!element || element.nodeType !== 1) return false;
            const tag = String(element.tagName || '').toLowerCase();
            return tag === 'button' || (tag === 'input' && ['submit', 'button'].includes(String(element.type || '').toLowerCase())) || element.getAttribute('role') === 'button';
        }

        function isVisible(element) {
            if (!element || !element.isConnected) return false;
            try {
                const styleValue = window.getComputedStyle(element);
                if (styleValue.display === 'none' || styleValue.visibility === 'hidden') return false;
                const rect = element.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            } catch (error) {
                return true;
            }
        }

        function ownSemanticText(element) {
            if (!element) return '';
            const parts = [];
            ['id', 'name', 'placeholder', 'aria-label', 'title', 'data-testid', 'data-test-id', 'data-role', 'role', 'type'].forEach(name => {
                try {
                    const value = element.getAttribute(name);
                    if (value) parts.push(value);
                } catch (error) { }
            });
            if (isActionButton(element)) parts.push(String(element.innerText || element.textContent || '').slice(0, 180));
            if (element.id) {
                try {
                    const label = document.querySelector(`label[for="${escapeAttribute(element.id)}"]`);
                    if (label) parts.push(String(label.textContent || '').slice(0, 180));
                } catch (error) { }
            }
            return parts.join(' ');
        }

        function contextSemanticText(element, stopAt) {
            const parts = [];
            let node = element;
            let depth = 0;
            while (node && node.nodeType === 1 && depth < 6) {
                parts.push(ownSemanticText(node));
                if (node === stopAt) {
                    parts.push(String(node.innerText || node.textContent || '').slice(0, 500));
                    break;
                }
                node = node.parentElement;
                depth += 1;
            }
            return parts.join(' ');
        }

        function activeModeText(root) {
            if (!root || typeof root.querySelectorAll !== 'function') return '';
            const selectors = '[aria-selected="true"],[aria-pressed="true"],[data-state="active"],[data-active="true"],.active[role="tab"],.selected[role="tab"]';
            try {
                return Array.from(root.querySelectorAll(selectors))
                    .filter(element => {
                        const semantic = safety.analyzeSemanticText(`${ownSemanticText(element)} ${String(element.innerText || element.textContent || '').slice(0, 120)}`);
                        return semantic.note || semantic.customer;
                    })
                    .slice(0, 8)
                    .map(element => `${ownSemanticText(element)} ${String(element.innerText || element.textContent || '').slice(0, 120)}`)
                    .join(' ');
            } catch (error) {
                return '';
            }
        }

        function findSharedContainer(editor, button) {
            if (!editor || !button) return null;
            const form = typeof editor.closest === 'function' ? editor.closest('form') : null;
            if (form && form.contains(button)) return form;
            let node = editor.parentElement;
            let depth = 0;
            while (node && node !== document.body && node !== document.documentElement && depth < 7) {
                if (node.contains(button)) return node;
                node = node.parentElement;
                depth += 1;
            }
            return null;
        }

        function visibleEditorsIn(root) {
            if (!root || typeof root.querySelectorAll !== 'function') return [];
            try {
                return Array.from(root.querySelectorAll('textarea,input,[contenteditable="true"],[role="textbox"]'))
                    .filter(element => isEditable(element) && isVisible(element));
            } catch (error) {
                return [];
            }
        }

        function matchingActionButtons(root, selectedButton) {
            if (!root || typeof root.querySelectorAll !== 'function') return [];
            try {
                const selectedMeaning = safety.analyzeSemanticText(ownSemanticText(selectedButton));
                return Array.from(root.querySelectorAll('button,input[type="submit"],input[type="button"],[role="button"]'))
                    .filter(element => {
                        if (!isVisible(element)) return false;
                        const meaning = safety.analyzeSemanticText(ownSemanticText(element));
                        if (element === selectedButton) return true;
                        return meaning.action && (selectedMeaning.action || selectedButton.type === 'submit');
                    });
            } catch (error) {
                return [];
            }
        }

        function validateDomPair() {
            const editor = resolveEditor();
            const button = resolveButton();
            const root = findSharedContainer(editor, button);
            if (!editor || !button || !root) {
                return safety.validateSemanticPair({
                    editorIsEditable: Boolean(editor && isEditable(editor)),
                    buttonIsAction: Boolean(button && isActionButton(button)),
                    sameContainer: false
                });
            }
            const editors = visibleEditorsIn(root);
            const buttons = matchingActionButtons(root, button);
            return safety.validateSemanticPair({
                editorOwnText: ownSemanticText(editor),
                buttonOwnText: ownSemanticText(button),
                contextText: contextSemanticText(editor, root),
                activeModeText: activeModeText(root),
                editorIsEditable: isEditable(editor),
                buttonIsAction: isActionButton(button),
                buttonIsSubmit: String(button.type || '').toLowerCase() === 'submit',
                sameContainer: root.contains(editor) && root.contains(button),
                multipleVisibleEditors: editors.some(item => item !== editor),
                multipleMatchingButtons: buttons.filter(item => item !== button).length > 0
            });
        }

        function escapeAttribute(value) {
            return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        }

        function candidateSelectors(element) {
            if (!element) return [];
            const tag = String(element.tagName || '').toLowerCase();
            const candidates = [];
            const id = element.getAttribute && element.getAttribute('id');
            if (id) candidates.push(`#${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/[^a-zA-Z0-9_-]/g, '\\$&')}`);
            ['data-testid', 'data-test-id', 'aria-label', 'name', 'placeholder'].forEach(attribute => {
                const value = element.getAttribute && element.getAttribute(attribute);
                if (value) candidates.push(`${tag}[${attribute}="${escapeAttribute(value)}"]`);
            });
            return candidates;
        }

        function makeUniqueLocator(element) {
            for (const selector of candidateSelectors(element)) {
                try {
                    const matches = document.querySelectorAll(selector);
                    if (matches.length === 1 && matches[0] === element) return selector;
                } catch (error) { }
            }
            return null;
        }

        function resolveUnique(selector) {
            if (!selector) return null;
            try {
                const matches = document.querySelectorAll(selector);
                return matches.length === 1 ? matches[0] : null;
            } catch (error) {
                return null;
            }
        }

        function resolveEditor() {
            if (state.editor && state.editor.isConnected) return state.editor;
            const resolved = resolveUnique(state.editorLocator);
            state.editor = resolved && isEditable(resolved) ? resolved : null;
            return state.editor;
        }

        function resolveButton() {
            if (state.button && state.button.isConnected) return state.button;
            const resolved = resolveUnique(state.buttonLocator);
            state.button = resolved && isActionButton(resolved) ? resolved : null;
            return state.button;
        }

        function saveConfiguration() {
            if (!state.editorLocator || !state.buttonLocator) return;
            safeJsonWrite(CONFIG_KEY, {
                editorLocator: state.editorLocator,
                buttonLocator: state.buttonLocator,
                savedAt: Date.now()
            });
        }

        function restoreConfiguration() {
            const saved = safeJsonRead(CONFIG_KEY);
            if (!saved || !saved.editorLocator || !saved.buttonLocator) return false;
            state.editorLocator = saved.editorLocator;
            state.buttonLocator = saved.buttonLocator;
            state.editor = resolveUnique(saved.editorLocator);
            state.button = resolveUnique(saved.buttonLocator);
            const result = validateDomPair();
            if (!result.safe) {
                state.editor = null;
                state.button = null;
                return false;
            }
            setMessage('تم استعادة إعداد Internal Note. راجعه ثم ابدأ.', 'good');
            return true;
        }

        function readEditorValue(editor) {
            if (!editor) return '';
            const tag = String(editor.tagName || '').toLowerCase();
            const value = tag === 'textarea' || tag === 'input' ? editor.value : editor.textContent;
            return String(value == null ? '' : value).replace(/[\u200b-\u200f\u2060\ufeff]/g, '').trim();
        }

        function setEditorValue(editor, value) {
            if (!editor) return false;
            const tag = String(editor.tagName || '').toLowerCase();
            try {
                if (tag === 'textarea' || tag === 'input') {
                    const prototype = tag === 'textarea' ? window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype : window.HTMLInputElement && window.HTMLInputElement.prototype;
                    const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, 'value');
                    if (descriptor && descriptor.set) descriptor.set.call(editor, value);
                    else editor.value = value;
                } else return false;
                let event;
                try {
                    event = new InputEvent('input', { bubbles: true, composed: true, data: value, inputType: value ? 'insertText' : 'deleteContentBackward' });
                } catch (error) {
                    event = new Event('input', { bubbles: true, composed: true });
                }
                editor.dispatchEvent(event);
                editor.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                return readEditorValue(editor) === String(value).trim();
            } catch (error) {
                return false;
            }
        }

        function saveFocus() {
            const active = document.activeElement;
            if (!active || active === document.body || active === document.documentElement) return null;
            const snapshot = { active, activityGeneration: state.userActivityGeneration, ranges: [] };
            try {
                if (typeof active.selectionStart === 'number') {
                    snapshot.start = active.selectionStart;
                    snapshot.end = active.selectionEnd;
                    snapshot.direction = active.selectionDirection;
                }
            } catch (error) { }
            try {
                if (active.isContentEditable && window.getSelection) {
                    const selection = window.getSelection();
                    for (let index = 0; selection && index < selection.rangeCount; index += 1) {
                        const range = selection.getRangeAt(index);
                        if (active.contains(range.commonAncestorContainer)) snapshot.ranges.push(range.cloneRange());
                    }
                }
            } catch (error) { }
            return snapshot;
        }

        function restoreFocus(snapshot) {
            if (!snapshot || !snapshot.active || !snapshot.active.isConnected || state.userActivityGeneration !== snapshot.activityGeneration) return;
            try {
                snapshot.active.focus({ preventScroll: true });
                if (typeof snapshot.start === 'number' && typeof snapshot.active.setSelectionRange === 'function') {
                    snapshot.active.setSelectionRange(snapshot.start, snapshot.end, snapshot.direction || 'none');
                }
                if (snapshot.ranges && snapshot.ranges.length && window.getSelection) {
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    snapshot.ranges.forEach(range => selection.addRange(range));
                }
            } catch (error) { }
        }

        function wait(milliseconds) {
            return new Promise(resolve => window.setTimeout(resolve, milliseconds));
        }

        function nextFrames() {
            return new Promise(resolve => {
                const raf = window.requestAnimationFrame || (callback => window.setTimeout(callback, 16));
                raf(() => raf(resolve));
            });
        }

        function getLeaseKey(ticketId) {
            return LEASE_PREFIX + ticketStorageSuffix(ticketId);
        }

        function getLastSentKey(ticketId) {
            return LAST_SENT_PREFIX + ticketStorageSuffix(ticketId);
        }

        async function acquireLease(ticketId) {
            const key = getLeaseKey(ticketId);
            const now = Date.now();
            const current = safeJsonRead(key);
            if (current && current.ownerId !== state.ownerId && Number(current.expiresAt) > now) return false;
            safeJsonWrite(key, { ownerId: state.ownerId, expiresAt: now + LEASE_MS });
            await wait(70);
            const confirmed = safeJsonRead(key);
            const owned = Boolean(confirmed && confirmed.ownerId === state.ownerId);
            if (owned) state.leaseRenewedAt = now;
            return owned;
        }

        function renewLease(ticketId) {
            if (!ticketId || Date.now() - state.leaseRenewedAt < 12000) return;
            const key = getLeaseKey(ticketId);
            const current = safeJsonRead(key);
            if (current && current.ownerId === state.ownerId) {
                safeJsonWrite(key, { ownerId: state.ownerId, expiresAt: Date.now() + LEASE_MS });
                state.leaseRenewedAt = Date.now();
            }
        }

        function releaseLease(ticketId) {
            if (!ticketId) return;
            const key = getLeaseKey(ticketId);
            const current = safeJsonRead(key);
            if (current && current.ownerId === state.ownerId) safeRemove(key);
        }

        function readLastSentRecord(ticketId) {
            const stored = safeJsonRead(getLastSentKey(ticketId));
            return {
                at: stored && Number.isFinite(Number(stored.at)) ? Number(stored.at) : 0,
                nextSequenceIndex: stored && Number.isFinite(Number(stored.nextSequenceIndex))
                    ? ((Math.trunc(Number(stored.nextSequenceIndex)) % 4) + 4) % 4
                    : 0
            };
        }

        function writeLastSent(ticketId, timestamp, nextSequenceIndex) {
            safeJsonWrite(getLastSentKey(ticketId), {
                at: timestamp,
                nextSequenceIndex,
                ownerId: state.ownerId
            });
        }

        async function withBrowserLock(ticketId, task) {
            const locks = window.navigator && window.navigator.locks;
            if (!locks || typeof locks.request !== 'function') return false;
            const name = `fast-toolkit-internal-note:${ticketStorageSuffix(ticketId)}`;
            let executed = false;
            let result = false;
            await locks.request(name, { ifAvailable: true }, async lock => {
                if (!lock) return;
                executed = true;
                result = await task();
            });
            return executed && result;
        }

        function isAttemptActive(generation, ticketId, activityGeneration) {
            return state.running && !state.destroyed && state.attemptGeneration === generation &&
                state.configuredTicketId === ticketId && getCurrentTicketId() === ticketId &&
                (activityGeneration == null || state.userActivityGeneration === activityGeneration);
        }

        function clearInjectedChecking(...editors) {
            const injectedText = state.injectedText;
            const unique = Array.from(new Set(editors.filter(Boolean)));
            unique.forEach(editor => {
                if (injectedText && editor.isConnected && readEditorValue(editor) === injectedText) setEditorValue(editor, '');
            });
            state.injectedEditor = null;
            state.injectedText = '';
        }

        async function waitForReadyControls(ticketId, originalEditor, generation, activityGeneration, noteText) {
            for (let attempt = 0; attempt < 18; attempt += 1) {
                if (!isAttemptActive(generation, ticketId, activityGeneration)) {
                    clearInjectedChecking(originalEditor, resolveEditor());
                    return null;
                }
                const currentEditor = resolveEditor();
                const currentButton = resolveButton();
                const pair = validateDomPair();
                if (getCurrentTicketId() !== ticketId || !pair.safe) return null;
                const buttonEnabled = Boolean(currentButton && currentButton.isConnected && !currentButton.disabled && currentButton.getAttribute('aria-disabled') !== 'true');
                if (currentEditor && currentEditor.isConnected && readEditorValue(currentEditor) === noteText && buttonEnabled) {
                    return { editor: currentEditor, button: currentButton };
                }
                await wait(80);
            }
            clearInjectedChecking(originalEditor, resolveEditor());
            return null;
        }

        async function waitForSendConfirmation(ticketId, generation) {
            const attempts = Math.max(1, Math.ceil(CONFIRM_TIMEOUT_MS / 180));
            for (let attempt = 0; attempt < attempts; attempt += 1) {
                await wait(180);
                if (!isAttemptActive(generation, ticketId)) return false;
                const current = resolveEditor();
                if (current && current.isConnected && readEditorValue(current) === '') return true;
            }
            return false;
        }

        async function performSend(ticketId, generation) {
            if (!isAttemptActive(generation, ticketId)) return false;
            const lastSentRecord = readLastSentRecord(ticketId);
            const lastSent = lastSentRecord.at;
            if (lastSent && Date.now() - lastSent < INTERVAL_MS) {
                state.lastSentAt = lastSent;
                state.sequenceIndex = lastSentRecord.nextSequenceIndex;
                state.nextAt = lastSent + INTERVAL_MS;
                setMessage('تبويب آخر أرسل Checking؛ تم توحيد المؤقت.', 'warn');
                return false;
            }
            if (lastSent > state.lastSentAt) state.sequenceIndex = lastSentRecord.nextSequenceIndex;
            const noteText = safety.getCheckingVariant(state.sequenceIndex);

            const editor = resolveEditor();
            const button = resolveButton();
            const pair = validateDomPair();
            const readiness = safety.evaluateSendReadiness({
                pairSafe: pair.safe,
                currentTicketId: getCurrentTicketId(),
                configuredTicketId: ticketId,
                editorConnected: Boolean(editor && editor.isConnected),
                buttonConnected: Boolean(button && button.isConnected),
                editorEmpty: readEditorValue(editor) === '',
                buttonEnabledRequired: false,
                buttonDisabled: Boolean(button && (button.disabled || button.getAttribute('aria-disabled') === 'true')),
                documentHidden: Boolean(document.hidden),
                offline: Boolean(window.navigator && window.navigator.onLine === false),
                composing: state.composing,
                userIdleMs: Date.now() - state.lastUserInputAt,
                minimumIdleMs: MINIMUM_USER_IDLE_MS,
                inFlight: false
            });
            if (!readiness.allowed) {
                const hardStop = readiness.reasons.some(reason => ['unsafe-pair', 'ticket-changed', 'controls-missing'].includes(reason));
                if (hardStop) pause(`توقفت للحماية: ${readiness.reasons.join(', ')}`, 'bad');
                else setMessage('مؤجل مؤقتًا: توجد كتابة أو مسودة أو الصفحة غير جاهزة.', 'warn');
                return false;
            }

            const activityGeneration = state.userActivityGeneration;
            if (!isAttemptActive(generation, ticketId, activityGeneration)) return false;
            const focusSnapshot = saveFocus();
            if (!setEditorValue(editor, noteText)) {
                pause('تعذر إدخال checking بأمان؛ لم يتم الضغط على أي زر.', 'bad');
                return false;
            }
            state.injectedEditor = editor;
            state.injectedText = noteText;

            await nextFrames();
            if (!isAttemptActive(generation, ticketId, activityGeneration)) {
                clearInjectedChecking(editor, resolveEditor());
                return false;
            }
            const readyControls = await waitForReadyControls(ticketId, editor, generation, activityGeneration, noteText);
            if (!readyControls) {
                clearInjectedChecking(editor, resolveEditor());
                if (isAttemptActive(generation, ticketId, activityGeneration)) {
                    pause('أُلغي الإرسال: لم يتأكد وضع Internal Note أو لم يتفعّل زرها.', 'bad');
                }
                return false;
            }

            if (!isAttemptActive(generation, ticketId, activityGeneration)) {
                clearInjectedChecking(editor, readyControls.editor, resolveEditor());
                return false;
            }
            state.injectedEditor = readyControls.editor;

            try {
                readyControls.button.click();
            } catch (error) {
                clearInjectedChecking(editor, readyControls.editor, resolveEditor());
                pause('تعذر الضغط على زر Internal Note؛ لم تتم إعادة المحاولة.', 'bad');
                return false;
            }

            window.setTimeout(() => restoreFocus(focusSnapshot), 0);
            const confirmed = await waitForSendConfirmation(ticketId, generation);
            if (!confirmed) {
                clearInjectedChecking(editor, readyControls.editor, resolveEditor());
                if (isAttemptActive(generation, ticketId)) {
                    pause('لم يؤكد CRM نجاح النوتة؛ توقفت لمنع التكرار.', 'bad');
                }
                return false;
            }

            const sentAt = Date.now();
            state.injectedEditor = null;
            state.injectedText = '';
            state.sequenceIndex = (state.sequenceIndex + 1) % 4;
            writeLastSent(ticketId, sentAt, state.sequenceIndex);
            state.lastSentAt = sentAt;
            if (isAttemptActive(generation, ticketId)) {
                state.nextAt = sentAt + INTERVAL_MS;
                setMessage(`تم إرسال ${noteText} في Internal Note فقط.`, 'good');
            }
            return true;
        }

        async function attemptSend() {
            if (!state.running || state.inFlight || Date.now() < state.nextAt) return;
            const ticketId = state.configuredTicketId;
            const generation = state.attemptGeneration;
            state.inFlight = true;
            try {
                const lease = await acquireLease(ticketId);
                if (!isAttemptActive(generation, ticketId)) return;
                if (!lease) {
                    pause('الأداة تعمل في تبويب آخر لهذا التكت.', 'warn');
                    return;
                }
                await withBrowserLock(ticketId, () => performSend(ticketId, generation));
            } catch (error) {
                pause('حدث خطأ غير متوقع؛ توقفت الأداة دون إعادة إرسال.', 'bad');
            } finally {
                state.inFlight = false;
                render();
            }
        }

        function start() {
            const ticketId = getCurrentTicketId();
            const pair = validateDomPair();
            if (!ticketId) {
                setMessage('افتح تكت أولًا ثم ابدأ.', 'bad');
                return;
            }
            if (!pair.safe) {
                setMessage(`لم يثبت Internal Note بأمان: ${pair.reasons.join(', ')}`, 'bad');
                return;
            }
            if (!window.navigator || !window.navigator.locks || typeof window.navigator.locks.request !== 'function') {
                setMessage('المتصفح لا يدعم القفل الآمن بين التبويبات؛ لم يبدأ الإرسال.', 'bad');
                return;
            }
            state.attemptGeneration += 1;
            state.configuredTicketId = ticketId;
            state.running = true;
            const lastSentRecord = readLastSentRecord(ticketId);
            state.lastSentAt = lastSentRecord.at;
            state.sequenceIndex = lastSentRecord.nextSequenceIndex;
            state.nextAt = Math.max(Date.now() + INTERVAL_MS, lastSentRecord.at + INTERVAL_MS);
            state.lastUserInputAt = 0;
            setMessage(`نشط. الإرسال القادم ${safety.getCheckingVariant(state.sequenceIndex)} بعد دقيقتين.`, 'good');
        }

        function pause(message, tone) {
            const ticketId = state.configuredTicketId;
            state.attemptGeneration += 1;
            state.running = false;
            state.nextAt = 0;
            clearInjectedChecking(state.injectedEditor, resolveEditor());
            releaseLease(ticketId);
            setMessage(message || 'متوقف مؤقتًا.', tone || 'neutral');
        }

        function clearPicker() {
            if (!state.picker) return;
            const picker = state.picker;
            document.removeEventListener('pointermove', picker.onMove, true);
            document.removeEventListener('pointerdown', picker.onPointerDown, true);
            document.removeEventListener('click', picker.onClick, true);
            document.removeEventListener('keydown', picker.onKey, true);
            if (picker.overlay && picker.overlay.remove) picker.overlay.remove();
            state.picker = null;
        }

        function pathCandidate(event, kind) {
            const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
            for (const element of path) {
                if (!element || element.nodeType !== 1 || element === host || (typeof element.getRootNode === 'function' && element.getRootNode() === shadow) || (host.contains && host.contains(element))) continue;
                if (kind === 'editor' && isEditable(element)) return element;
                if (kind === 'button' && isActionButton(element)) return element;
            }
            let target = event.target;
            if (target && typeof target.closest === 'function') {
                target = kind === 'editor'
                    ? target.closest('textarea,input,[contenteditable="true"],[role="textbox"]')
                    : target.closest('button,input[type="submit"],input[type="button"],[role="button"]');
            }
            if (!target || target === host) return null;
            return kind === 'editor' ? (isEditable(target) ? target : null) : (isActionButton(target) ? target : null);
        }

        function beginPicker(kind) {
            pause('وضع التحديد: انقر العنصر؛ للزر المعطّل مرّر عليه واضغط Enter.', 'warn');
            clearPicker();
            const overlay = document.createElement('div');
            overlay.setAttribute('aria-hidden', 'true');
            overlay.style.position = 'fixed';
            overlay.style.zIndex = '2147483645';
            overlay.style.pointerEvents = 'none';
            overlay.style.border = '3px solid #10b981';
            overlay.style.borderRadius = '7px';
            overlay.style.background = 'rgba(16,185,129,.10)';
            overlay.style.display = 'none';
            document.documentElement.appendChild(overlay);
            const picker = { kind, overlay, current: null };
            picker.onMove = event => {
                const element = pathCandidate(event, kind);
                picker.current = element;
                if (!element) {
                    overlay.style.display = 'none';
                    return;
                }
                const rect = element.getBoundingClientRect();
                overlay.style.display = 'block';
                overlay.style.left = `${Math.max(0, rect.left - 3)}px`;
                overlay.style.top = `${Math.max(0, rect.top - 3)}px`;
                overlay.style.width = `${Math.max(0, rect.width + 6)}px`;
                overlay.style.height = `${Math.max(0, rect.height + 6)}px`;
            };
            const finishSelection = element => {
                clearPicker();
                if (!element) {
                    setMessage('لم يتم تحديد عنصر صالح.', 'bad');
                    return;
                }
                if (kind === 'editor') {
                    const meaning = safety.analyzeSemanticText(ownSemanticText(element));
                    if (!meaning.strongNote || meaning.customer) {
                        setMessage('رفضت الخانة: يجب أن يحمل العنصر نفسه تعريف Internal Note صريحًا.', 'bad');
                        return;
                    }
                    state.editor = element;
                    state.editorLocator = makeUniqueLocator(element);
                    state.button = null;
                    state.buttonLocator = null;
                    setMessage('تم تحديد خانة النوتة. الآن حدد زر إرسالها.', 'good');
                } else {
                    state.button = element;
                    state.buttonLocator = makeUniqueLocator(element);
                    const pair = validateDomPair();
                    if (!pair.safe) {
                        state.button = null;
                        state.buttonLocator = null;
                        setMessage(`رفضت الربط للحماية: ${pair.reasons.join(', ')}`, 'bad');
                        return;
                    }
                    saveConfiguration();
                    setMessage(state.editorLocator && state.buttonLocator ? 'تمت المعايرة وحفظها. يمكنك البدء.' : 'تمت المعايرة لهذه الصفحة. يمكنك البدء.', 'good');
                }
                render();
            };
            const consumeEvent = event => {
                event.preventDefault();
                event.stopPropagation();
                if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
            };
            picker.onPointerDown = event => {
                const element = pathCandidate(event, kind) || picker.current;
                if (!element) return;
                consumeEvent(event);
                const suppressClick = clickEvent => {
                    consumeEvent(clickEvent);
                    document.removeEventListener('click', suppressClick, true);
                };
                document.addEventListener('click', suppressClick, true);
                window.setTimeout(() => document.removeEventListener('click', suppressClick, true), 600);
                finishSelection(element);
            };
            picker.onClick = event => {
                consumeEvent(event);
                finishSelection(pathCandidate(event, kind) || picker.current);
            };
            picker.onKey = event => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    clearPicker();
                    setMessage('أُلغي التحديد.', 'neutral');
                    return;
                }
                if (event.key === 'Enter' && picker.current) {
                    consumeEvent(event);
                    finishSelection(picker.current);
                }
            };
            state.picker = picker;
            document.addEventListener('pointermove', picker.onMove, true);
            document.addEventListener('pointerdown', picker.onPointerDown, true);
            document.addEventListener('click', picker.onClick, true);
            document.addEventListener('keydown', picker.onKey, true);
        }

        function onUserActivity(event) {
            if (event && event.isTrusted === false) return;
            state.lastUserInputAt = Date.now();
            state.userActivityGeneration += 1;
        }

        function onCompositionStart() {
            state.composing = true;
            state.lastUserInputAt = Date.now();
            state.userActivityGeneration += 1;
        }

        function onCompositionEnd() {
            state.composing = false;
            state.lastUserInputAt = Date.now();
            state.userActivityGeneration += 1;
        }

        function onStorage(event) {
            if (!state.running || !event || !state.configuredTicketId) return;
            if (event.key === getLastSentKey(state.configuredTicketId)) {
                const lastSentRecord = readLastSentRecord(state.configuredTicketId);
                if (lastSentRecord.at > state.lastSentAt) {
                    state.lastSentAt = lastSentRecord.at;
                    state.sequenceIndex = lastSentRecord.nextSequenceIndex;
                    state.nextAt = lastSentRecord.at + INTERVAL_MS;
                    setMessage('تم توحيد المؤقت مع تبويب آخر.', 'warn');
                }
            }
        }

        function tick() {
            if (state.destroyed) return;
            if (state.running) {
                if (getCurrentTicketId() !== state.configuredTicketId) {
                    pause('توقف تلقائيًا لأن التكت تغيّر.', 'warn');
                    return;
                }
                renewLease(state.configuredTicketId);
                attemptSend();
            }
            render();
        }

        function show() {
            state.minimized = false;
            render();
        }

        function minimize() {
            state.minimized = true;
            render();
        }

        function destroy() {
            if (state.destroyed) return;
            pause('تم الإيقاف.', 'neutral');
            state.destroyed = true;
            clearPicker();
            window.clearInterval(intervalId);
            document.removeEventListener('keydown', onUserActivity, true);
            document.removeEventListener('pointerdown', onUserActivity, true);
            document.removeEventListener('beforeinput', onUserActivity, true);
            document.removeEventListener('paste', onUserActivity, true);
            document.removeEventListener('compositionstart', onCompositionStart, true);
            document.removeEventListener('compositionend', onCompositionEnd, true);
            window.removeEventListener('storage', onStorage);
            if (host.remove) host.remove();
            delete window.__FAST_TOOLKIT_CRM_INTERNAL_NOTE_TIMER__;
        }

        pickEditorButton.addEventListener('click', () => beginPicker('editor'));
        pickSendButton.addEventListener('click', () => {
            if (!resolveEditor()) {
                setMessage('حدد خانة Internal Note أولًا.', 'warn');
                return;
            }
            beginPicker('button');
        });
        mainButton.addEventListener('click', () => state.running ? pause() : start());
        minimizeButton.addEventListener('click', minimize);
        bubble.addEventListener('click', show);
        closeButton.addEventListener('click', destroy);

        document.addEventListener('keydown', onUserActivity, true);
        document.addEventListener('pointerdown', onUserActivity, true);
        document.addEventListener('beforeinput', onUserActivity, true);
        document.addEventListener('paste', onUserActivity, true);
        document.addEventListener('compositionstart', onCompositionStart, true);
        document.addEventListener('compositionend', onCompositionEnd, true);
        window.addEventListener('storage', onStorage);
        window.addEventListener('pagehide', () => pause('توقف عند مغادرة الصفحة.', 'neutral'));
        window.addEventListener('pageshow', event => {
            if (event && event.persisted) setMessage('عادت الصفحة؛ اضغط ابدأ لاستئناف Checking.', 'warn');
        });

        const intervalId = window.setInterval(tick, 500);
        const api = Object.freeze({
            show,
            minimize,
            pause,
            start,
            close: destroy,
            selectEditor: () => beginPicker('editor'),
            selectButton: () => beginPicker('button'),
            getState: () => ({
                running: state.running,
                inFlight: state.inFlight,
                ticketId: state.configuredTicketId,
                nextAt: state.nextAt,
                lastSentAt: state.lastSentAt,
                calibrated: validateDomPair().safe
            })
        });
        window.__FAST_TOOLKIT_CRM_INTERNAL_NOTE_TIMER__ = api;
        restoreConfiguration();
        render();
        return api;
    }

    const safety = createInternalNoteSafety();

    function getRuntimeSource() {
        return `void((${fastToolkitCrmInternalNoteTimerRuntime.toString()})(${createInternalNoteSafety.toString()},{action:'install'}));`;
    }

    function buildInlineBookmarklet() {
        return `javascript:${encodeURIComponent(getRuntimeSource())}`;
    }

    function buildBookmarklet() {
        return buildInlineBookmarklet();
    }

    function install() {
        return fastToolkitCrmInternalNoteTimerRuntime(createInternalNoteSafety, { action: 'install' });
    }

    return Object.freeze({
        DEFAULT_INTERVAL_MS: safety.DEFAULT_INTERVAL_MS,
        getCheckingVariant: safety.getCheckingVariant,
        normalizeText: safety.normalizeText,
        analyzeSemanticText: safety.analyzeSemanticText,
        isAllowedLocation: safety.isAllowedLocation,
        extractTicketId: safety.extractTicketId,
        validateSemanticPair: safety.validateSemanticPair,
        evaluateSendReadiness: safety.evaluateSendReadiness,
        getRuntimeSource,
        buildBookmarklet,
        buildInlineBookmarklet,
        install
    });
}));
