(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.FastToolkitCrmTicketTracker = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function fastToolkitCrmTicketTrackerRuntime(request = {}) {
        const EXPECTED_HOST = 'crm.tabby.sa';

        function extractTicketId(input) {
            try {
                const currentOrigin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : `https://${EXPECTED_HOST}`;
                const url = new URL(input, currentOrigin);
                const host = url.hostname.toLowerCase();
                if (host !== EXPECTED_HOST && host !== 'crm.tabby.ai' && !host.endsWith('.tabby.sa') && !host.endsWith('.tabby.ai') && host !== 'localhost' && host !== '127.0.0.1') {
                    return '';
                }
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
                active: null,
                totalChars: 0,
                totalSentences: 0
            };
        }

        function ensureTicket(ticketId, timestamp) {
            const current = state.tickets[ticketId];
            if (!current || typeof current !== 'object') {
                state.tickets[ticketId] = {
                    totalMs: 0,
                    visits: 0,
                    chars: 0,
                    sentences: 0,
                    firstOpenedAt: timestamp,
                    lastOpenedAt: timestamp,
                    lastLeftAt: null
                };
            }
            if (typeof current.chars !== 'number') current.chars = 0;
            if (typeof current.sentences !== 'number') current.sentences = 0;
            return state.tickets[ticketId];
        }

        function normalizeState(candidate, timestamp) {
            if (!candidate || typeof candidate !== 'object' || candidate.day !== localDayKey(timestamp)) {
                return createEmptyState(timestamp);
            }
            const normalized = createEmptyState(timestamp);
            normalized.shiftStartedAt = Number(candidate.shiftStartedAt) || timestamp;
            normalized.tickets = candidate.tickets && typeof candidate.tickets === 'object' ? candidate.tickets : {};
            normalized.totalChars = Math.max(0, Number(candidate.totalChars) || 0);
            normalized.totalSentences = Math.max(0, Number(candidate.totalSentences) || 0);
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

        function totalSessionsCount() {
            return Object.values(state.tickets).reduce((sum, ticket) => (
                sum + Math.max(1, Number(ticket && ticket.visits) || 0)
            ), 0);
        }

        function summaryText(timestamp) {
            const ticketCount = Object.keys(state.tickets).length;
            const sessionsCount = totalSessionsCount();
            const total = shiftTotalMs(timestamp);
            const average = ticketCount ? total / ticketCount : 0;
            const lines = [
                `ملخص التكتات ${state.day}`,
                `عدد التكتات: ${ticketCount}`,
                `عدد السيشن: ${sessionsCount}`,
                `إجمالي الوقت: ${formatDuration(total)}`,
                `ABST: ${formatDuration(average)}`,
                `إجمالي الحروف: ${Math.max(0, Number(state.totalChars) || 0)}`,
                `إجمالي الجمل: ${Math.max(0, Number(state.totalSentences) || 0)}`
            ];
            if (state.active) {
                const activeTicket = state.tickets[state.active.id];
                const isRepeated = Boolean(activeTicket && Number(activeTicket.visits) > 1);
                const activeUrl = buildTicketUrl(state.active.id);
                lines.push(`التكت الحالي (${activeUrl}): ${formatDuration(currentSessionMs(timestamp))}`);
                if (isRepeated) {
                    lines.push(`مجموع التكت الحالي: ${formatDuration(currentTicketTotalMs(timestamp))}`);
                    lines.push(`زرتها: ${Number(activeTicket.visits)} مرات`);
                }
            }
            const ticketRows = Object.entries(state.tickets)
                .sort((first, second) => (Number(second[1].lastOpenedAt) || 0) - (Number(first[1].lastOpenedAt) || 0));
            if (ticketRows.length) {
                lines.push('', 'تفاصيل التكتات:');
                ticketRows.forEach(([ticketId, ticket]) => {
                    const visits = Math.max(0, Number(ticket.visits) || 0);
                    const visitsText = visits > 1 ? ` — زرتها ${visits} مرات` : '';
                    const charsText = ticket.chars ? ` (${ticket.chars} حرف)` : '';
                    lines.push(`${buildTicketUrl(ticketId)} — ${formatDuration(ticketTotalMs(ticketId, timestamp))}${charsText}${visitsText}`);
                });
            }
            return lines.join('\n');
        }

        const POS_STORAGE_KEY = 'fastToolkit_crm_ticket_tracker_pos_v1';

        function loadSavedPosition() {
            try {
                const raw = localStorage.getItem(POS_STORAGE_KEY);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                if (typeof parsed.left === 'number' && typeof parsed.top === 'number') {
                    return parsed;
                }
            } catch (e) {}
            return null;
        }

        function savePosition(pos) {
            try {
                localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(pos));
            } catch (e) {}
        }

        let compactPos = loadSavedPosition();
        let panelPos = null;

        function applyPosition(elem, pos) {
            if (!pos || !elem) return;
            const margin = 8;
            const width = elem.offsetWidth || 295;
            const height = elem.offsetHeight || 220;
            const maxLeft = Math.max(margin, (window.innerWidth || 1200) - width - margin);
            const maxTop = Math.max(margin, (window.innerHeight || 800) - height - margin);
            const left = Math.min(Math.max(margin, pos.left), maxLeft);
            const top = Math.min(Math.max(margin, pos.top), maxTop);
            elem.style.left = `${left}px`;
            elem.style.top = `${top}px`;
            elem.style.bottom = 'auto';
            elem.style.right = 'auto';
        }

        const THEME_STORAGE_KEY = 'fastToolkit_crm_ticket_tracker_theme_v1';

        function loadSavedTheme() {
            try {
                const saved = localStorage.getItem(THEME_STORAGE_KEY);
                if (saved === 'light' || saved === 'dark') return saved;
                if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
                    return 'light';
                }
            } catch (e) {}
            return 'dark';
        }

        function saveTheme(theme) {
            try { localStorage.setItem(THEME_STORAGE_KEY, theme); }
            catch (e) {}
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
                :host{
                    all:initial;
                    --bg-panel:linear-gradient(145deg,#111827,#080d14);
                    --border-panel:rgba(52,211,153,.38);
                    --shadow-panel:0 22px 65px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.05);
                    --text-main:#f8fafc;
                    --text-muted:#94a3b8;
                    --text-sub:#64748b;
                    --card-bg:rgba(255,255,255,.04);
                    --card-border:rgba(148,163,184,.14);
                    --link-color:#6ee7b7;
                    --btn-icon-bg:rgba(255,255,255,.08);
                    --btn-icon-color:#cbd5e1;
                    --copy-bg:rgba(16,185,129,.14);
                    --copy-border:rgba(52,211,153,.35);
                    --copy-color:#a7f3d0;
                    --reset-bg:rgba(127,29,29,.14);
                    --reset-border:rgba(248,113,113,.22);
                    --reset-color:#fca5a5;
                    --compact-bg:#0b111a;
                    --compact-time:#6ee7b7;
                }
                :host(.light-theme){
                    --bg-panel:linear-gradient(145deg,#ffffff,#f8fafc);
                    --border-panel:rgba(16,185,129,.35);
                    --shadow-panel:0 18px 50px rgba(15,23,42,.14),0 0 0 1px rgba(0,0,0,.06);
                    --text-main:#0f172a;
                    --text-muted:#64748b;
                    --text-sub:#94a3b8;
                    --card-bg:rgba(0,0,0,.035);
                    --card-border:rgba(0,0,0,.08);
                    --link-color:#059669;
                    --btn-icon-bg:rgba(0,0,0,.05);
                    --btn-icon-color:#475569;
                    --copy-bg:rgba(16,185,129,.12);
                    --copy-border:rgba(16,185,129,.35);
                    --copy-color:#047857;
                    --reset-bg:rgba(239,68,68,.08);
                    --reset-border:rgba(239,68,68,.25);
                    --reset-color:#b91c1c;
                    --compact-bg:#ffffff;
                    --compact-time:#059669;
                }
                .panel,.compact{position:fixed;z-index:2147483647;left:20px;bottom:20px;direction:rtl;font-family:'Segoe UI',Tahoma,sans-serif;color:var(--text-main);box-sizing:border-box;user-select:none;-webkit-user-select:none;touch-action:none}
                .panel{width:295px;padding:15px 16px;background:var(--bg-panel);border:1px solid var(--border-panel);border-radius:18px;box-shadow:var(--shadow-panel);cursor:grab}
                .panel:active{cursor:grabbing}
                .header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:11px;cursor:grab}
                .brand{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:800;color:var(--text-main)}
                .live{width:9px;height:9px;border-radius:50%;background:#34d399;box-shadow:0 0 10px #34d399}
                .header-actions{display:flex;align-items:center;gap:5px}
                button,a{font:inherit}
                .icon-btn{border:0;background:var(--btn-icon-bg);color:var(--btn-icon-color);width:28px;height:28px;border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;transition:background .2s,transform .1s}
                .icon-btn:hover{filter:brightness(1.15);transform:scale(1.04)}
                .ticket{display:flex;align-items:center;justify-content:space-between;background:var(--card-bg);padding:9px 11px;border-radius:11px;margin-bottom:9px}
                .ticket-label{font-size:11px;color:var(--text-muted)}
                .ticket-link{color:var(--link-color);text-decoration:none;font-weight:800;font-size:14.5px;direction:ltr}
                .times{display:grid;grid-template-columns:1fr;gap:8px}
                .metric{background:var(--card-bg);border:1px solid var(--card-border);padding:9px 10px;border-radius:11px}
                .metric span{display:block;color:var(--text-muted);font-size:10px;margin-bottom:4px;font-weight:600}
                .metric strong{display:block;color:var(--text-main);font-size:19px;direction:ltr;text-align:right;font-variant-numeric:tabular-nums}
                .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:10px;color:var(--text-muted);font-size:9.5px;background:var(--card-bg);border:1px solid var(--card-border);padding:6px 4px;border-radius:9px;text-align:center}
                .stats span{display:flex;flex-direction:column;gap:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
                .stats b{color:var(--text-main);font-variant-numeric:tabular-nums;font-size:11.5px}
                .typing-bar{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:6px;color:var(--text-muted);font-size:9px;background:var(--card-bg);border:1px solid var(--card-border);padding:5px 4px;border-radius:9px;text-align:center}
                .typing-metric{display:flex;flex-direction:column;gap:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
                .typing-metric b{color:var(--text-main);font-variant-numeric:tabular-nums;font-size:11px}
                .actions{display:grid;grid-template-columns:1fr auto;gap:7px;margin-top:12px}
                .copy,.reset{border-radius:10px;padding:8px 10px;cursor:pointer;font-size:10.5px;font-weight:700}
                .copy{border:1px solid var(--copy-border);background:var(--copy-bg);color:var(--copy-color)}
                .reset{border:1px solid var(--reset-border);background:var(--reset-bg);color:var(--reset-color)}
                .hint{margin-top:9px;color:var(--text-sub);font-size:8.5px;text-align:center}
                .compact{display:none;align-items:center;gap:8px;border:1px solid var(--border-panel);border-radius:999px;padding:8px 13px;background:var(--compact-bg);box-shadow:var(--shadow-panel);cursor:grab;font-size:11px}
                .compact:active{cursor:grabbing}
                .compact strong{color:var(--compact-time);direction:ltr;font-variant-numeric:tabular-nums;font-size:13px}
                .toast{display:none;margin-top:8px;color:var(--copy-color);font-size:10px;text-align:center}
                .recent-wrap{margin-top:10px;padding-top:9px;border-top:1px solid var(--card-border)}
                .recent-title{color:var(--text-sub);font-size:9px;margin-bottom:5px}
                .recent{display:grid;gap:4px}
                .recent-row{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:8px;padding:5px 7px;border-radius:8px;background:var(--card-bg);font-size:10px}
                .recent-row a{color:var(--link-color);text-decoration:none;direction:ltr;font-weight:700}
                .recent-row span{color:var(--text-main);direction:ltr;font-variant-numeric:tabular-nums}
                .recent-row small{color:var(--text-sub);direction:rtl}
            </style>
            <section class="panel" data-role="panel" aria-label="عداد وقت التكتات">
                <div class="header">
                    <div class="brand"><span class="live"></span><span>عداد التكتات</span></div>
                    <div class="header-actions">
                        <button class="icon-btn" data-action="toggle-theme" title="تبديل المظهر النهاري/الليلي">☀️</button>
                        <button class="icon-btn" data-action="minimize" title="تصغير">−</button>
                    </div>
                </div>
                <div class="ticket"><span class="ticket-label" data-role="ticket-status">بانتظار تكت</span><a class="ticket-link" data-role="ticket-link" href="#">----</a></div>
                <div class="times" data-role="times">
                    <div class="metric"><span>الجلسة الحالية</span><strong data-role="current">00:00</strong></div>
                    <div class="metric" data-role="ticket-total-metric" style="display:none;"><span>مجموع التكت</span><strong data-role="ticket-total">00:00</strong></div>
                </div>
                <div class="stats" data-role="stats">
                    <span>التكتات<b data-role="count">0</b></span>
                    <span>السيشن<b data-role="sessions">0</b></span>
                    <span>ABST<b data-role="average">00:00</b></span>
                    <span data-role="visits-stat" style="display:none;">زرتها<b data-role="visits">0</b></span>
                </div>
                <div class="typing-bar" data-role="typing-bar">
                    <div class="typing-metric"><span>الحروف</span><b data-role="chars-count">0</b></div>
                    <div class="typing-metric"><span>الجمل</span><b data-role="sentences-count">0</b></div>
                    <div class="typing-metric"><span>حروف التكت</span><b data-role="ticket-chars">0</b></div>
                </div>
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

        let currentTheme = loadSavedTheme();

        function applyTheme(theme) {
            currentTheme = theme;
            const themeBtn = shadow.querySelector('[data-action="toggle-theme"]');
            if (theme === 'light') {
                host.classList.add('light-theme');
                if (themeBtn) {
                    themeBtn.textContent = '🌙';
                    themeBtn.title = 'تفعيل الوضع الليلي';
                }
            } else {
                host.classList.remove('light-theme');
                if (themeBtn) {
                    themeBtn.textContent = '☀️';
                    themeBtn.title = 'تفعيل الوضع النهاري';
                }
            }
        }

        function toggleTheme() {
            const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
            applyTheme(nextTheme);
            saveTheme(nextTheme);
            render(Date.now());
        }

        applyTheme(currentTheme);

        function makeDraggable(elem, onDragEnd) {
            let isDragging = false;
            let startX = 0;
            let startY = 0;
            let initialLeft = 0;
            let initialTop = 0;
            let hasMoved = false;

            elem.addEventListener('pointerdown', (event) => {
                if (event.button !== 0) return;
                if (event.target.closest('button:not([data-role="compact"]), a, input, select, textarea')) return;

                isDragging = true;
                hasMoved = false;
                startX = event.clientX;
                startY = event.clientY;

                const rect = elem.getBoundingClientRect();
                initialLeft = rect.left;
                initialTop = rect.top;

                elem.setPointerCapture(event.pointerId);
            });

            elem.addEventListener('pointermove', (event) => {
                if (!isDragging) return;
                const dx = event.clientX - startX;
                const dy = event.clientY - startY;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                    hasMoved = true;
                }
                if (!hasMoved) return;

                const margin = 8;
                const maxLeft = Math.max(margin, window.innerWidth - elem.offsetWidth - margin);
                const maxTop = Math.max(margin, window.innerHeight - elem.offsetHeight - margin);
                const targetLeft = Math.min(Math.max(margin, initialLeft + dx), maxLeft);
                const targetTop = Math.min(Math.max(margin, initialTop + dy), maxTop);

                elem.style.left = `${targetLeft}px`;
                elem.style.top = `${targetTop}px`;
                elem.style.bottom = 'auto';
                elem.style.right = 'auto';
            });

            const onEnd = (event) => {
                if (!isDragging) return;
                isDragging = false;
                try {
                    elem.releasePointerCapture(event.pointerId);
                } catch (e) {}

                if (hasMoved) {
                    const rect = elem.getBoundingClientRect();
                    const newPos = { left: rect.left, top: rect.top };
                    savePosition(newPos);
                    if (onDragEnd) onDragEnd(newPos);
                }
            };

            elem.addEventListener('pointerup', onEnd);
            elem.addEventListener('pointercancel', onEnd);

            return () => hasMoved;
        }

        if (compactPos) {
            applyPosition(compact, compactPos);
            applyPosition(panel, compactPos);
        }

        const isCompactMoved = makeDraggable(compact, (pos) => {
            compactPos = pos;
            savePosition(pos);
        });

        makeDraggable(panel, (pos) => {
            panelPos = pos;
        });

        window.addEventListener('resize', () => {
            if (compactPos) {
                applyPosition(compact, compactPos);
            }
            if (panel.style.display !== 'none') {
                applyPosition(panel, panelPos || compactPos);
            }
        });

        function showToast(message) {
            const toast = byRole('toast');
            toast.textContent = message;
            toast.style.display = 'block';
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 1800);
        }

        function getDurationColor(durationMs, isLight) {
            if (durationMs >= 20 * 60 * 1000) return isLight ? '#dc2626' : '#f87171';
            if (durationMs >= 15 * 60 * 1000) return isLight ? '#d97706' : '#fbbf24';
            return '';
        }

        function getLiveDotStyle(durationMs, isLight) {
            if (durationMs >= 20 * 60 * 1000) return { bg: isLight ? '#dc2626' : '#f87171', shadow: `0 0 10px ${isLight ? '#dc2626' : '#f87171'}` };
            if (durationMs >= 15 * 60 * 1000) return { bg: isLight ? '#d97706' : '#fbbf24', shadow: `0 0 10px ${isLight ? '#d97706' : '#fbbf24'}` };
            return { bg: '#10b981', shadow: '0 0 10px #10b981' };
        }

        function render(timestamp) {
            const ticketId = state.active ? state.active.id : '';
            const ticket = ticketId ? ensureTicket(ticketId, timestamp) : null;
            const ticketCount = Object.keys(state.tickets).length;
            const sessionsCount = totalSessionsCount();
            const total = shiftTotalMs(timestamp);
            const isRepeated = Boolean(ticket && Number(ticket.visits) > 1);
            const isLight = currentTheme === 'light';
            const sessionMs = currentSessionMs(timestamp);
            const totalMs = currentTicketTotalMs(timestamp);
            const sessionColor = getDurationColor(sessionMs, isLight);
            const totalColor = getDurationColor(totalMs, isLight);

            byRole('ticket-status').textContent = ticketId ? 'التكت الحالي' : 'بانتظار تكت من الرابط';
            ticketLink.textContent = shortTicketId(ticketId);
            ticketLink.style.visibility = ticketId ? 'visible' : 'hidden';
            ticketLink.href = ticketId ? buildTicketUrl(ticketId) : '#';

            const currentElem = byRole('current');
            currentElem.textContent = formatDuration(sessionMs);
            currentElem.style.color = sessionColor || (isLight ? '#0f172a' : '#f8fafc');

            const totalMetric = byRole('ticket-total-metric');
            const timesWrap = byRole('times');
            if (totalMetric) {
                totalMetric.style.display = isRepeated ? 'block' : 'none';
            }
            if (timesWrap) {
                timesWrap.style.gridTemplateColumns = isRepeated ? '1fr 1fr' : '1fr';
            }

            const totalElem = byRole('ticket-total');
            totalElem.textContent = formatDuration(totalMs);
            totalElem.style.color = totalColor || (isLight ? '#0f172a' : '#f8fafc');

            byRole('count').textContent = String(ticketCount);
            if (byRole('sessions')) byRole('sessions').textContent = String(sessionsCount);
            byRole('average').textContent = formatDuration(ticketCount ? total / ticketCount : 0);
            const visitsStat = byRole('visits-stat');
            const statsWrap = byRole('stats');
            if (visitsStat) {
                visitsStat.style.display = isRepeated ? 'flex' : 'none';
            }
            if (statsWrap) {
                statsWrap.style.gridTemplateColumns = isRepeated ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)';
            }
            byRole('visits').textContent = String(ticket ? Math.max(0, Number(ticket.visits) || 0) : 0);
            if (byRole('chars-count')) byRole('chars-count').textContent = String(Math.max(0, Number(state.totalChars) || 0));
            if (byRole('sentences-count')) byRole('sentences-count').textContent = String(Math.max(0, Number(state.totalSentences) || 0));
            if (byRole('ticket-chars')) byRole('ticket-chars').textContent = String(ticket ? (Math.max(0, Number(ticket.chars) || 0)) : 0);
            byRole('compact-ticket').textContent = shortTicketId(ticketId);

            const compactTimeElem = byRole('compact-time');
            const compactTimeMs = isRepeated ? totalMs : sessionMs;
            const compactColor = getDurationColor(compactTimeMs, isLight);
            compactTimeElem.textContent = formatDuration(compactTimeMs);
            compactTimeElem.style.color = compactColor || (isLight ? '#059669' : '#6ee7b7');

            const dotStyle = getLiveDotStyle(compactTimeMs, isLight);
            shadow.querySelectorAll('.live').forEach(dot => {
                dot.style.background = dotStyle.bg;
                dot.style.boxShadow = dotStyle.shadow;
            });

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
                    const visitsCount = Math.max(0, Number(recentTicket.visits) || 0);
                    visits.textContent = visitsCount > 1 ? `زرتها ${visitsCount} مرات` : '';
                    row.append(link, duration, visits);
                    recent.appendChild(row);
                });
        }

        function minimize() {
            panel.style.display = 'none';
            compact.style.display = 'flex';
            if (compactPos) {
                applyPosition(compact, compactPos);
            }
        }

        function show() {
            panel.style.display = 'block';
            compact.style.display = 'none';
            const targetPos = panelPos || compactPos;
            if (targetPos) {
                applyPosition(panel, targetPos);
            }
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

        shadow.querySelector('[data-action="toggle-theme"]').addEventListener('click', toggleTheme);
        shadow.querySelector('[data-action="minimize"]').addEventListener('click', minimize);
        compact.addEventListener('click', () => {
            if (isCompactMoved && isCompactMoved()) return;
            show();
        });
        shadow.querySelector('[data-action="copy"]').addEventListener('click', copySummary);
        shadow.querySelector('[data-action="reset"]').addEventListener('click', resetShift);
        ticketLink.addEventListener('click', () => {
            finalizeActive(Date.now());
            saveState();
        });

        function onUserTyping(event) {
            if (!event || !event.target) return;
            try {
                if (event.target.getRootNode && event.target.getRootNode() === shadow) return;
            } catch (e) {}
            const target = event.target;
            const isEditable = Boolean(target.isContentEditable || target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && target.type !== 'password' && target.type !== 'hidden'));
            if (!isEditable) return;

            if (event.type === 'input') {
                const inserted = typeof event.data === 'string' ? event.data : '';
                const count = inserted.length || 1;
                state.totalChars = (Math.max(0, Number(state.totalChars) || 0)) + count;
                if (state.active) {
                    const ticket = ensureTicket(state.active.id, Date.now());
                    ticket.chars = (Math.max(0, Number(ticket.chars) || 0)) + count;
                }
                if (/[.!?؟\n]/.test(inserted)) {
                    state.totalSentences = (Math.max(0, Number(state.totalSentences) || 0)) + 1;
                    if (state.active) {
                        const ticket = ensureTicket(state.active.id, Date.now());
                        ticket.sentences = (Math.max(0, Number(ticket.sentences) || 0)) + 1;
                    }
                }
            } else if (event.type === 'keydown' && event.key === 'Enter') {
                state.totalSentences = (Math.max(0, Number(state.totalSentences) || 0)) + 1;
                if (state.active) {
                    const ticket = ensureTicket(state.active.id, Date.now());
                    ticket.sentences = (Math.max(0, Number(ticket.sentences) || 0)) + 1;
                }
            }
            render(Date.now());
        }

        document.addEventListener('input', onUserTyping, true);
        document.addEventListener('keydown', onUserTyping, true);

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
            document.removeEventListener('input', onUserTyping, true);
            document.removeEventListener('keydown', onUserTyping, true);
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
        install() {
            return fastToolkitCrmTicketTrackerRuntime({ action: 'install' });
        },
        buildBookmarklet() {
            return `javascript:(${fastToolkitCrmTicketTrackerRuntime.toString()})({action:'install'});`;
        }
    });
});
