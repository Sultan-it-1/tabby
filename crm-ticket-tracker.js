(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.FastToolkitCrmTicketTracker = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function fastToolkitCrmTicketTrackerRuntime(request = {}) {
        const EXPECTED_HOST = 'crm.tabby.sa';

        function extractTicketId(input) {
            try {
                const url = new URL(input, `https://${EXPECTED_HOST}/`);
                if (url.hostname.toLowerCase() !== EXPECTED_HOST) return '';
                const match = url.pathname.match(/(?:^|\/)(?:queue|object)\/ticket\/([^/]+)/i);
                if (!match || !match[1]) return '';
                try { return decodeURIComponent(match[1]); }
                catch (e) { return match[1]; }
            } catch (e) {
                return '';
            }
        }

        function buildTicketUrl(ticketId) {
            if (!ticketId) return '';
            return `https://${EXPECTED_HOST}/object/ticket/${encodeURIComponent(ticketId)}`;
        }

        function formatDuration(milliseconds) {
            const totalSeconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
            const seconds = totalSeconds % 60;
            const totalMinutes = Math.floor(totalSeconds / 60);
            const minutes = totalMinutes % 60;
            const hours = Math.floor(totalMinutes / 60);
            const pad = value => String(value).padStart(2, '0');
            return hours > 0
                ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
                : `${pad(totalMinutes)}:${pad(seconds)}`;
        }

        if (request.action === 'extract') return extractTicketId(request.url);
        if (request.action === 'ticketUrl') return buildTicketUrl(request.ticketId);
        if (request.action === 'format') return formatDuration(request.milliseconds);
        if (request.action !== 'install' || typeof window === 'undefined' || typeof document === 'undefined') return null;

        if (window.location.hostname.toLowerCase() !== EXPECTED_HOST) {
            window.alert('افتح CRM أولًا ثم شغّل عداد التكتات من المفضلة.');
            return null;
        }

        const existing = window.__FAST_TOOLKIT_CRM_TICKET_TRACKER__;
        if (existing && typeof existing.show === 'function') {
            existing.show();
            return existing;
        }

        const STORAGE_KEY = 'fastToolkit_crm_ticket_tracker_v1';
        const HOST_ID = 'fastToolkitCrmTicketTrackerHost';
        const HEARTBEAT_INTERVAL = 500;
        const SAVE_INTERVAL = 2000;

        function localDayKey(timestamp) {
            const date = new Date(timestamp);
            return [
                date.getFullYear(),
                String(date.getMonth() + 1).padStart(2, '0'),
                String(date.getDate()).padStart(2, '0')
            ].join('-');
        }

        function createEmptyState(timestamp) {
            return {
                version: 1,
                day: localDayKey(timestamp),
                shiftStartedAt: timestamp,
                tickets: {},
                active: null
            };
        }

        function ensureTicket(ticketId, timestamp) {
            const current = state.tickets[ticketId];
            if (!current || typeof current !== 'object') {
                state.tickets[ticketId] = {
                    totalMs: 0,
                    visits: 0,
                    firstOpenedAt: timestamp,
                    lastOpenedAt: timestamp,
                    lastLeftAt: null
                };
            }
            return state.tickets[ticketId];
        }

        function normalizeState(candidate, timestamp) {
            if (!candidate || typeof candidate !== 'object' || candidate.day !== localDayKey(timestamp)) {
                return createEmptyState(timestamp);
            }
            const normalized = createEmptyState(timestamp);
            normalized.shiftStartedAt = Number(candidate.shiftStartedAt) || timestamp;
            normalized.tickets = candidate.tickets && typeof candidate.tickets === 'object' ? candidate.tickets : {};
            normalized.active = candidate.active && typeof candidate.active.id === 'string'
                ? {
                    id: candidate.active.id,
                    startedAt: Number(candidate.active.startedAt) || timestamp,
                    lastHeartbeatAt: Number(candidate.active.lastHeartbeatAt) || timestamp
                }
                : null;
            return normalized;
        }

        function loadState(timestamp) {
            try { return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'), timestamp); }
            catch (e) { return createEmptyState(timestamp); }
        }

        function saveState() {
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
            catch (e) { }
        }

        function recoverInterruptedSession(timestamp) {
            if (!state.active) return;
            const ticket = ensureTicket(state.active.id, timestamp);
            const safeEnd = Math.min(timestamp, Math.max(state.active.startedAt, state.active.lastHeartbeatAt));
            ticket.totalMs = Math.max(0, Number(ticket.totalMs) || 0) + Math.max(0, safeEnd - state.active.startedAt);
            ticket.lastLeftAt = safeEnd;
            state.active = null;
        }

        function finalizeActive(timestamp) {
            if (!state.active) return;
            const ticket = ensureTicket(state.active.id, timestamp);
            ticket.totalMs = Math.max(0, Number(ticket.totalMs) || 0) + Math.max(0, timestamp - state.active.startedAt);
            ticket.lastLeftAt = timestamp;
            state.active = null;
        }

        function startTicket(ticketId, timestamp) {
            if (!ticketId) return;
            const ticket = ensureTicket(ticketId, timestamp);
            ticket.visits = Math.max(0, Number(ticket.visits) || 0) + 1;
            ticket.lastOpenedAt = timestamp;
            state.active = { id: ticketId, startedAt: timestamp, lastHeartbeatAt: timestamp };
        }

        function syncCurrentTicket(timestamp) {
            if (state.day !== localDayKey(timestamp)) {
                finalizeActive(timestamp);
                state = createEmptyState(timestamp);
            }
            const ticketId = extractTicketId(window.location.href);
            const activeId = state.active ? state.active.id : '';
            if (ticketId === activeId) return;
            finalizeActive(timestamp);
            if (ticketId) startTicket(ticketId, timestamp);
            saveState();
        }

        function currentSessionMs(timestamp) {
            return state.active ? Math.max(0, timestamp - state.active.startedAt) : 0;
        }

        function currentTicketTotalMs(timestamp) {
            if (!state.active) return 0;
            const ticket = ensureTicket(state.active.id, timestamp);
            return Math.max(0, Number(ticket.totalMs) || 0) + currentSessionMs(timestamp);
        }

        function ticketTotalMs(ticketId, timestamp) {
            const ticket = state.tickets[ticketId];
            if (!ticket) return 0;
            const activeAddition = state.active && state.active.id === ticketId ? currentSessionMs(timestamp) : 0;
            return Math.max(0, Number(ticket.totalMs) || 0) + activeAddition;
        }

        function shiftTotalMs(timestamp) {
            const storedTotal = Object.values(state.tickets).reduce((sum, ticket) => (
                sum + Math.max(0, Number(ticket && ticket.totalMs) || 0)
            ), 0);
            return storedTotal + currentSessionMs(timestamp);
        }

        function shortTicketId(ticketId) {
            if (!ticketId) return '----';
            const text = String(ticketId);
            return `…${text.slice(-4)}`;
        }

        function summaryText(timestamp) {
            const ticketCount = Object.keys(state.tickets).length;
            const total = shiftTotalMs(timestamp);
            const average = ticketCount ? total / ticketCount : 0;
            const lines = [
                `ملخص التكتات ${state.day}`,
                `عدد التكتات: ${ticketCount}`,
                `إجمالي الوقت: ${formatDuration(total)}`,
                `متوسط التكت: ${formatDuration(average)}`
            ];
            if (state.active) {
                lines.push(`التكت الحالي ${shortTicketId(state.active.id)}: ${formatDuration(currentSessionMs(timestamp))}`);
                lines.push(`مجموع التكت الحالي: ${formatDuration(currentTicketTotalMs(timestamp))}`);
            }
            const ticketRows = Object.entries(state.tickets)
                .sort((first, second) => (Number(second[1].lastOpenedAt) || 0) - (Number(first[1].lastOpenedAt) || 0));
            if (ticketRows.length) {
                lines.push('', 'تفاصيل التكتات:');
                ticketRows.forEach(([ticketId, ticket]) => {
                    lines.push(`${shortTicketId(ticketId)} — ${formatDuration(ticketTotalMs(ticketId, timestamp))} — ${Math.max(0, Number(ticket.visits) || 0)} زيارات`);
                });
            }
            return lines.join('\n');
        }

        let state = loadState(Date.now());
        recoverInterruptedSession(Date.now());
        syncCurrentTicket(Date.now());

        const oldHost = document.getElementById(HOST_ID);
        if (oldHost) oldHost.remove();
        const host = document.createElement('div');
        host.id = HOST_ID;
        document.documentElement.appendChild(host);
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `
            <style>
                :host{all:initial}.panel,.compact{position:fixed;z-index:2147483647;left:16px;bottom:16px;direction:rtl;font-family:Segoe UI,Tahoma,sans-serif;color:#f8fafc;box-sizing:border-box}
                .panel{width:260px;padding:13px;background:linear-gradient(145deg,#111827,#080d14);border:1px solid rgba(52,211,153,.35);border-radius:16px;box-shadow:0 18px 55px rgba(0,0,0,.5)}
                .header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}.brand{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:800}.live{width:8px;height:8px;border-radius:50%;background:#34d399;box-shadow:0 0 9px #34d399}
                button,a{font:inherit}.min{border:0;background:rgba(255,255,255,.07);color:#cbd5e1;width:26px;height:26px;border-radius:8px;cursor:pointer}.ticket{display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,.04);padding:8px 9px;border-radius:10px;margin-bottom:8px}.ticket-label{font-size:10px;color:#94a3b8}.ticket-link{color:#6ee7b7;text-decoration:none;font-weight:800;font-size:13px;direction:ltr}
                .times{display:grid;grid-template-columns:1fr 1fr;gap:7px}.metric{background:rgba(255,255,255,.035);border:1px solid rgba(148,163,184,.12);padding:8px;border-radius:10px}.metric span{display:block;color:#94a3b8;font-size:9px;margin-bottom:3px}.metric strong{display:block;color:#f8fafc;font-size:16px;direction:ltr;text-align:right;font-variant-numeric:tabular-nums}
                .stats{display:flex;justify-content:space-between;gap:8px;margin-top:8px;color:#94a3b8;font-size:9px}.stats b{color:#e2e8f0;font-variant-numeric:tabular-nums}.actions{display:grid;grid-template-columns:1fr auto;gap:6px;margin-top:10px}.copy,.reset{border-radius:9px;padding:7px 8px;cursor:pointer}.copy{border:1px solid rgba(52,211,153,.35);background:rgba(16,185,129,.13);color:#a7f3d0}.reset{border:1px solid rgba(248,113,113,.2);background:rgba(127,29,29,.12);color:#fca5a5}.hint{margin-top:8px;color:#64748b;font-size:8px;text-align:center}.compact{display:none;align-items:center;gap:7px;border:1px solid rgba(52,211,153,.4);border-radius:999px;padding:7px 10px;background:#0b111a;box-shadow:0 10px 30px rgba(0,0,0,.45);cursor:pointer;font-size:10px}.compact strong{color:#6ee7b7;direction:ltr;font-variant-numeric:tabular-nums}.toast{display:none;margin-top:7px;color:#a7f3d0;font-size:9px;text-align:center}
                .recent-wrap{margin-top:9px;padding-top:8px;border-top:1px solid rgba(148,163,184,.12)}.recent-title{color:#64748b;font-size:8px;margin-bottom:4px}.recent{display:grid;gap:3px}.recent-row{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:7px;padding:4px 6px;border-radius:7px;background:rgba(255,255,255,.025);font-size:9px}.recent-row a{color:#a7f3d0;text-decoration:none;direction:ltr;font-weight:700}.recent-row span{color:#cbd5e1;direction:ltr;font-variant-numeric:tabular-nums}.recent-row small{color:#64748b;direction:rtl}
            </style>
            <section class="panel" data-role="panel" aria-label="عداد وقت التكتات">
                <div class="header"><div class="brand"><span class="live"></span><span>عداد التكتات</span></div><button class="min" data-action="minimize" title="تصغير">−</button></div>
                <div class="ticket"><span class="ticket-label" data-role="ticket-status">بانتظار تكت</span><a class="ticket-link" data-role="ticket-link" href="#">----</a></div>
                <div class="times">
                    <div class="metric"><span>الجلسة الحالية</span><strong data-role="current">00:00</strong></div>
                    <div class="metric"><span>مجموع التكت</span><strong data-role="ticket-total">00:00</strong></div>
                </div>
                <div class="stats"><span>التكتات: <b data-role="count">0</b></span><span>المتوسط: <b data-role="average">00:00</b></span><span>الزيارات: <b data-role="visits">0</b></span></div>
                <div class="recent-wrap"><div class="recent-title">آخر التكتات</div><div class="recent" data-role="recent"></div></div>
                <div class="actions"><button class="copy" data-action="copy">نسخ ملخص الشفت</button><button class="reset" data-action="reset" title="تصفير عداد اليوم">تصفير</button></div>
                <div class="toast" data-role="toast"></div>
                <div class="hint">قراءة فقط — لا يكتب ولا يرسل شيئًا داخل CRM</div>
            </section>
            <button class="compact" data-role="compact" type="button"><span class="live"></span><span data-role="compact-ticket">----</span><strong data-role="compact-time">00:00</strong></button>
        `;

        const byRole = role => shadow.querySelector(`[data-role="${role}"]`);
        const panel = byRole('panel');
        const compact = byRole('compact');
        const ticketLink = byRole('ticket-link');
        let toastTimer = null;

        function showToast(message) {
            const toast = byRole('toast');
            toast.textContent = message;
            toast.style.display = 'block';
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 1800);
        }

        function render(timestamp) {
            const ticketId = state.active ? state.active.id : '';
            const ticket = ticketId ? ensureTicket(ticketId, timestamp) : null;
            const ticketCount = Object.keys(state.tickets).length;
            const total = shiftTotalMs(timestamp);
            byRole('ticket-status').textContent = ticketId ? 'التكت الحالي' : 'بانتظار تكت من الرابط';
            ticketLink.textContent = shortTicketId(ticketId);
            ticketLink.style.visibility = ticketId ? 'visible' : 'hidden';
            ticketLink.href = ticketId ? buildTicketUrl(ticketId) : '#';
            byRole('current').textContent = formatDuration(currentSessionMs(timestamp));
            byRole('ticket-total').textContent = formatDuration(currentTicketTotalMs(timestamp));
            byRole('count').textContent = String(ticketCount);
            byRole('average').textContent = formatDuration(ticketCount ? total / ticketCount : 0);
            byRole('visits').textContent = String(ticket ? Math.max(0, Number(ticket.visits) || 0) : 0);
            byRole('compact-ticket').textContent = shortTicketId(ticketId);
            byRole('compact-time').textContent = formatDuration(currentTicketTotalMs(timestamp));

            const recent = byRole('recent');
            recent.replaceChildren();
            Object.entries(state.tickets)
                .sort((first, second) => (Number(second[1].lastOpenedAt) || 0) - (Number(first[1].lastOpenedAt) || 0))
                .slice(0, 4)
                .forEach(([recentId, recentTicket]) => {
                    const row = document.createElement('div');
                    row.className = 'recent-row';
                    const link = document.createElement('a');
                    link.href = buildTicketUrl(recentId);
                    link.textContent = shortTicketId(recentId);
                    link.addEventListener('click', () => {
                        finalizeActive(Date.now());
                        saveState();
                    });
                    const duration = document.createElement('span');
                    duration.textContent = formatDuration(ticketTotalMs(recentId, timestamp));
                    const visits = document.createElement('small');
                    visits.textContent = `${Math.max(0, Number(recentTicket.visits) || 0)} زيارة`;
                    row.append(link, duration, visits);
                    recent.appendChild(row);
                });
        }

        function minimize() {
            panel.style.display = 'none';
            compact.style.display = 'flex';
        }

        function show() {
            panel.style.display = 'block';
            compact.style.display = 'none';
        }

        async function copySummary() {
            const text = summaryText(Date.now());
            try {
                await navigator.clipboard.writeText(text);
                showToast('تم نسخ ملخص الشفت ✅');
            } catch (e) {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                textarea.remove();
                showToast('تم نسخ ملخص الشفت ✅');
            }
        }

        function resetShift() {
            if (!window.confirm('تصفير عداد تكتات اليوم؟')) return;
            state = createEmptyState(Date.now());
            const ticketId = extractTicketId(window.location.href);
            if (ticketId) startTicket(ticketId, Date.now());
            saveState();
            render(Date.now());
            showToast('تم تصفير العداد');
        }

        shadow.querySelector('[data-action="minimize"]').addEventListener('click', minimize);
        compact.addEventListener('click', show);
        shadow.querySelector('[data-action="copy"]').addEventListener('click', copySummary);
        shadow.querySelector('[data-action="reset"]').addEventListener('click', resetShift);
        ticketLink.addEventListener('click', () => {
            finalizeActive(Date.now());
            saveState();
        });

        let lastSavedAt = 0;
        const interval = window.setInterval(() => {
            const timestamp = Date.now();
            syncCurrentTicket(timestamp);
            if (state.active) state.active.lastHeartbeatAt = timestamp;
            if (timestamp - lastSavedAt >= SAVE_INTERVAL) {
                saveState();
                lastSavedAt = timestamp;
            }
            render(timestamp);
        }, HEARTBEAT_INTERVAL);

        window.addEventListener('pagehide', () => {
            finalizeActive(Date.now());
            saveState();
            window.clearInterval(interval);
        }, { once: true });

        const api = { show, minimize };
        window.__FAST_TOOLKIT_CRM_TICKET_TRACKER__ = api;
        render(Date.now());
        return api;
    }

    return Object.freeze({
        extractTicketId(url) {
            return fastToolkitCrmTicketTrackerRuntime({ action: 'extract', url });
        },
        buildTicketUrl(ticketId) {
            return fastToolkitCrmTicketTrackerRuntime({ action: 'ticketUrl', ticketId });
        },
        formatDuration(milliseconds) {
            return fastToolkitCrmTicketTrackerRuntime({ action: 'format', milliseconds });
        },
        buildBookmarklet() {
            return `javascript:(${fastToolkitCrmTicketTrackerRuntime.toString()})({action:'install'});`;
        }
    });
});
