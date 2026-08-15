(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.FastToolkitCrmProfileAnalytics = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function parseDateStr(str, fallbackDate = new Date()) {
        if (!str) return null;
        const fullMatch = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (fullMatch) {
            const day = parseInt(fullMatch[1], 10);
            const month = parseInt(fullMatch[2], 10) - 1;
            const year = parseInt(fullMatch[3], 10);
            const hours = parseInt(fullMatch[4], 10);
            const minutes = parseInt(fullMatch[5], 10);
            const seconds = fullMatch[6] ? parseInt(fullMatch[6], 10) : 0;
            return new Date(year, month, day, hours, minutes, seconds).getTime();
        }
        const timeMatch = str.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (timeMatch) {
            const d = new Date(fallbackDate);
            d.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), timeMatch[3] ? parseInt(timeMatch[3], 10) : 0, 0);
            return d.getTime();
        }
        return null;
    }

    function formatDuration(ms) {
        if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) ms = 0;
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (hours > 0) {
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function formatTime(timestamp) {
        if (!timestamp) return '--:--';
        const d = new Date(timestamp);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function parseTimeline(rawText) {
        if (!rawText) return [];
        const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
        const events = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            const statusMatch = line.match(/^Status:\s*([A-Za-z]+)\s+([A-Za-z]+)/i);
            if (statusMatch) {
                const fromStatus = statusMatch[1];
                const toStatus = statusMatch[2];
                let eventTime = null;
                for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 3); j++) {
                    const tMatch = lines[j].match(/(?:Status Changed At:\s*)?(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2})/i);
                    if (tMatch) {
                        eventTime = parseDateStr(tMatch[1]);
                        break;
                    }
                }
                if (!eventTime) {
                    for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 3); j++) {
                        const tMatch = lines[j].match(/\b\d{1,2}:\d{2}\b/);
                        if (tMatch) {
                            eventTime = parseDateStr(tMatch[0]);
                            break;
                        }
                    }
                }
                events.push({
                    type: 'status',
                    from: fromStatus,
                    to: toStatus,
                    time: eventTime || Date.now(),
                    label: `تغيير الحالة: ${fromStatus} ➔ ${toStatus}`
                });
            }

            const linkedMatch = line.match(/linked with Ticket\s*\(([^)]+)\)/i);
            if (linkedMatch) {
                const ticketId = linkedMatch[1];
                let eventTime = null;
                for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 3); j++) {
                    const tMatch = lines[j].match(/(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2})|(\b\d{1,2}:\d{2}\b)/);
                    if (tMatch) {
                        eventTime = parseDateStr(tMatch[0]);
                        break;
                    }
                }
                events.push({
                    type: 'ticket_linked',
                    ticketId,
                    time: eventTime || Date.now(),
                    label: `استلام تكت: ${ticketId}`
                });
            }

            const unlinkedMatch = line.match(/unlinked from Ticket\s*\(([^)]+)\)/i);
            if (unlinkedMatch) {
                const ticketId = unlinkedMatch[1];
                let eventTime = null;
                for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 3); j++) {
                    const tMatch = lines[j].match(/(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2})|(\b\d{1,2}:\d{2}\b)/);
                    if (tMatch) {
                        eventTime = parseDateStr(tMatch[0]);
                        break;
                    }
                }
                events.push({
                    type: 'ticket_unlinked',
                    ticketId,
                    time: eventTime || Date.now(),
                    label: `إنهاء تكت: ${ticketId}`
                });
            }
        }

        return events.sort((a, b) => a.time - b.time);
    }

    function calculateMetrics(events) {
        const statusEvents = events.filter(e => e.type === 'status');
        let shiftStart = null;
        let totalOnlineMs = 0;
        let totalBreakMs = 0;
        let totalOtherMs = 0;
        let totalOfflineMs = 0;

        for (const ev of statusEvents) {
            if (ev.to.toLowerCase() === 'online') {
                shiftStart = ev.time;
                break;
            }
        }

        if (!shiftStart && statusEvents.length > 0) {
            shiftStart = statusEvents[0].time;
        }

        for (let i = 0; i < statusEvents.length; i++) {
            const current = statusEvents[i];
            const next = statusEvents[i + 1];
            const startTime = current.time;
            const endTime = next ? next.time : Date.now();
            const duration = Math.max(0, endTime - startTime);
            const statusKey = current.to.toLowerCase();

            if (statusKey === 'online') {
                totalOnlineMs += duration;
            } else if (statusKey === 'break') {
                totalBreakMs += duration;
            } else if (statusKey === 'offline') {
                totalOfflineMs += duration;
            } else {
                totalOtherMs += duration;
            }
        }

        const linkedMap = new Map();
        const ticketsCompleted = [];
        let activeTicketsCount = 0;

        for (const ev of events) {
            if (ev.type === 'ticket_linked') {
                linkedMap.set(ev.ticketId, ev.time);
            } else if (ev.type === 'ticket_unlinked') {
                const linkTime = linkedMap.get(ev.ticketId);
                const unlinkedAt = ev.time;
                const durationMs = linkTime ? Math.max(0, unlinkedAt - linkTime) : 0;
                ticketsCompleted.push({
                    ticketId: ev.ticketId,
                    linkedAt: linkTime || null,
                    unlinkedAt,
                    durationMs
                });
                linkedMap.delete(ev.ticketId);
            }
        }

        activeTicketsCount = linkedMap.size;
        const totalTicketsLinked = ticketsCompleted.length + activeTicketsCount;
        const uniqueTickets = new Set();
        events.forEach(e => {
            if (e.ticketId) uniqueTickets.add(e.ticketId);
        });
        const totalHandledMs = ticketsCompleted.reduce((acc, t) => acc + t.durationMs, 0);
        const avgTicketDurationMs = ticketsCompleted.length > 0 ? Math.round(totalHandledMs / ticketsCompleted.length) : 0;
        const totalActiveMs = totalOnlineMs + totalBreakMs + totalOtherMs;
        const utilizationRate = totalActiveMs > 0 ? Math.min(100, Math.round((totalOnlineMs / totalActiveMs) * 100)) : 100;

        return {
            shiftStart,
            totalOnlineMs,
            totalBreakMs,
            totalOtherMs,
            totalOfflineMs,
            totalSessions: totalTicketsLinked,
            totalTicketsLinked,
            totalTicketsCompleted: ticketsCompleted.length,
            uniqueTicketsCount: uniqueTickets.size || totalTicketsLinked,
            activeTicketsCount,
            avgTicketDurationMs,
            utilizationRate,
            ticketsCompleted,
            events
        };
    }

    function extractTimelineTextFromDOM() {
        try {
            if (typeof document === 'undefined') return '';
            const aside = document.querySelector('[data-testid="object-aside"]');
            if (aside && aside.innerText) return aside.innerText;
            const groups = document.querySelectorAll('[role="group"]');
            let combined = '';
            groups.forEach(g => { combined += '\n' + (g.innerText || ''); });
            if (combined.trim()) return combined;
            return document.body ? document.body.innerText : '';
        } catch (e) {
            return '';
        }
    }

    function getRuntimeSource() {
        return `(${install.toString()})();`;
    }

    function buildBookmarklet() {
        return `javascript:(function(){var s=document.createElement('script');s.src='https://tabby.sultanops.com/crm-profile-analytics.js?v='+Date.now();document.head.appendChild(s);})();`;
    }

    function install() {
        if (typeof document === 'undefined') return null;

        const HOST_ID = 'fastToolkit_crm_profile_analytics_host_v1';
        const THEME_KEY = 'fastToolkit_crm_profile_analytics_theme_v1';

        function _parseDateStr(str, fallbackDate = new Date()) {
            if (!str) return null;
            const fullMatch = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
            if (fullMatch) {
                const day = parseInt(fullMatch[1], 10);
                const month = parseInt(fullMatch[2], 10) - 1;
                const year = parseInt(fullMatch[3], 10);
                const hours = parseInt(fullMatch[4], 10);
                const minutes = parseInt(fullMatch[5], 10);
                const seconds = fullMatch[6] ? parseInt(fullMatch[6], 10) : 0;
                return new Date(year, month, day, hours, minutes, seconds).getTime();
            }
            const timeMatch = str.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?/);
            if (timeMatch) {
                const d = new Date(fallbackDate);
                d.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), timeMatch[3] ? parseInt(timeMatch[3], 10) : 0, 0);
                return d.getTime();
            }
            return null;
        }

        function _formatDuration(ms) {
            if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) ms = 0;
            const totalSeconds = Math.floor(ms / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            if (hours > 0) {
                return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }
            return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        function _formatTime(timestamp) {
            if (!timestamp) return '--:--';
            const d = new Date(timestamp);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        function _parseTimeline(rawText) {
            if (!rawText) return [];
            const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
            const events = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                const statusMatch = line.match(/^Status:\s*([A-Za-z]+)\s+([A-Za-z]+)/i);
                if (statusMatch) {
                    const fromStatus = statusMatch[1];
                    const toStatus = statusMatch[2];
                    let eventTime = null;
                    for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 3); j++) {
                        const tMatch = lines[j].match(/(?:Status Changed At:\s*)?(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2})/i);
                        if (tMatch) {
                            eventTime = _parseDateStr(tMatch[1]);
                            break;
                        }
                    }
                    if (!eventTime) {
                        for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 3); j++) {
                            const tMatch = lines[j].match(/\b\d{1,2}:\d{2}\b/);
                            if (tMatch) {
                                eventTime = _parseDateStr(tMatch[0]);
                                break;
                            }
                        }
                    }
                    events.push({
                        type: 'status',
                        from: fromStatus,
                        to: toStatus,
                        time: eventTime || Date.now(),
                        label: `تغيير الحالة: ${fromStatus} ➔ ${toStatus}`
                    });
                }

                const linkedMatch = line.match(/linked with Ticket\s*\(([^)]+)\)/i);
                if (linkedMatch) {
                    const ticketId = linkedMatch[1];
                    let eventTime = null;
                    for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 3); j++) {
                        const tMatch = lines[j].match(/(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2})|(\b\d{1,2}:\d{2}\b)/);
                        if (tMatch) {
                            eventTime = _parseDateStr(tMatch[0]);
                            break;
                        }
                    }
                    events.push({
                        type: 'ticket_linked',
                        ticketId,
                        time: eventTime || Date.now(),
                        label: `استلام تكت: ${ticketId}`
                    });
                }

                const unlinkedMatch = line.match(/unlinked from Ticket\s*\(([^)]+)\)/i);
                if (unlinkedMatch) {
                    const ticketId = unlinkedMatch[1];
                    let eventTime = null;
                    for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 3); j++) {
                        const tMatch = lines[j].match(/(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2})|(\b\d{1,2}:\d{2}\b)/);
                        if (tMatch) {
                            eventTime = _parseDateStr(tMatch[0]);
                            break;
                        }
                    }
                    events.push({
                        type: 'ticket_unlinked',
                        ticketId,
                        time: eventTime || Date.now(),
                        label: `إنهاء تكت: ${ticketId}`
                    });
                }
            }

            return events.sort((a, b) => a.time - b.time);
        }

        function _calculateMetrics(events) {
            const statusEvents = events.filter(e => e.type === 'status');
            let shiftStart = null;
            let totalOnlineMs = 0;
            let totalBreakMs = 0;
            let totalOtherMs = 0;
            let totalOfflineMs = 0;

            for (const ev of statusEvents) {
                if (ev.to.toLowerCase() === 'online') {
                    shiftStart = ev.time;
                    break;
                }
            }

            if (!shiftStart && statusEvents.length > 0) {
                shiftStart = statusEvents[0].time;
            }

            for (let i = 0; i < statusEvents.length; i++) {
                const current = statusEvents[i];
                const next = statusEvents[i + 1];
                const startTime = current.time;
                const endTime = next ? next.time : Date.now();
                const duration = Math.max(0, endTime - startTime);
                const statusKey = current.to.toLowerCase();

                if (statusKey === 'online') {
                    totalOnlineMs += duration;
                } else if (statusKey === 'break') {
                    totalBreakMs += duration;
                } else if (statusKey === 'offline') {
                    totalOfflineMs += duration;
                } else {
                    totalOtherMs += duration;
                }
            }

            const linkedMap = new Map();
            const ticketsCompleted = [];
            let activeTicketsCount = 0;

            for (const ev of events) {
                if (ev.type === 'ticket_linked') {
                    linkedMap.set(ev.ticketId, ev.time);
                } else if (ev.type === 'ticket_unlinked') {
                    const linkTime = linkedMap.get(ev.ticketId);
                    const unlinkedAt = ev.time;
                    const durationMs = linkTime ? Math.max(0, unlinkedAt - linkTime) : 0;
                    ticketsCompleted.push({
                        ticketId: ev.ticketId,
                        linkedAt: linkTime || null,
                        unlinkedAt,
                        durationMs
                    });
                    linkedMap.delete(ev.ticketId);
                }
            }

            activeTicketsCount = linkedMap.size;
            const totalTicketsLinked = ticketsCompleted.length + activeTicketsCount;
            const uniqueTickets = new Set();
            events.forEach(e => {
                if (e.ticketId) uniqueTickets.add(e.ticketId);
            });
            const totalHandledMs = ticketsCompleted.reduce((acc, t) => acc + t.durationMs, 0);
            const avgTicketDurationMs = ticketsCompleted.length > 0 ? Math.round(totalHandledMs / ticketsCompleted.length) : 0;
            const totalActiveMs = totalOnlineMs + totalBreakMs + totalOtherMs;
            const utilizationRate = totalActiveMs > 0 ? Math.min(100, Math.round((totalOnlineMs / totalActiveMs) * 100)) : 100;

            return {
                shiftStart,
                totalOnlineMs,
                totalBreakMs,
                totalOtherMs,
                totalOfflineMs,
                totalSessions: totalTicketsLinked,
                totalTicketsLinked,
                totalTicketsCompleted: ticketsCompleted.length,
                uniqueTicketsCount: uniqueTickets.size || totalTicketsLinked,
                activeTicketsCount,
                avgTicketDurationMs,
                utilizationRate,
                ticketsCompleted,
                events
            };
        }

        function _extractTimelineTextFromDOM() {
            try {
                if (typeof document === 'undefined') return '';
                const aside = document.querySelector('[data-testid="object-aside"]');
                if (aside && aside.innerText) return aside.innerText;
                const groups = document.querySelectorAll('[role="group"]');
                let combined = '';
                groups.forEach(g => { combined += '\n' + (g.innerText || ''); });
                if (combined.trim()) return combined;
                return document.body ? document.body.innerText : '';
            } catch (e) {
                return '';
            }
        }

        const existing = document.getElementById(HOST_ID);
        if (existing) existing.remove();

        const host = document.createElement('div');
        host.id = HOST_ID;
        host.style.all = 'initial';
        document.documentElement.appendChild(host);

        const shadow = host.attachShadow({ mode: 'open' });
        let currentTheme = 'dark';
        try {
            const saved = localStorage.getItem(THEME_KEY);
            if (saved === 'light' || saved === 'dark') currentTheme = saved;
        } catch (e) {}

        shadow.innerHTML = `
            <style>
                :host{all:initial}
                *,*::before,*::after{box-sizing:border-box}
                :host{
                    --bg-panel:rgba(15,23,42,.92);
                    --border-panel:rgba(255,255,255,.1);
                    --card-bg:rgba(255,255,255,.05);
                    --card-border:rgba(255,255,255,.08);
                    --text-main:rgb(248,250,252);
                    --text-muted:rgb(148,163,184);
                    --text-sub:rgb(100,116,139);
                    --shadow-panel:0 20px 45px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.06);
                    --online-color:rgb(52,211,153);
                    --break-color:rgb(251,191,36);
                    --ticket-color:rgb(56,189,248);
                    --btn-bg:rgba(255,255,255,.08);
                }
                :host(.light-theme){
                    --bg-panel:rgba(255,255,255,.94);
                    --border-panel:rgba(0,0,0,.1);
                    --card-bg:rgba(241,245,249,.85);
                    --card-border:rgba(203,213,225,.7);
                    --text-main:rgb(15,23,42);
                    --text-muted:rgb(71,85,105);
                    --text-sub:rgb(100,116,139);
                    --shadow-panel:0 18px 40px rgba(0,0,0,.15),0 0 0 1px rgba(0,0,0,.05);
                    --online-color:rgb(5,150,105);
                    --break-color:rgb(217,119,6);
                    --ticket-color:rgb(2,132,199);
                    --btn-bg:rgba(0,0,0,.05);
                }
                .panel{position:fixed;z-index:2147483647;right:20px;bottom:20px;width:340px;padding:16px;background:var(--bg-panel);border:1px solid var(--border-panel);border-radius:20px;box-shadow:var(--shadow-panel);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);direction:rtl;font-family:'Segoe UI',Tahoma,sans-serif;color:var(--text-main);user-select:none;-webkit-user-select:none;touch-action:none}
                .header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;cursor:grab}
                .brand{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:800;color:var(--text-main)}
                .brand-icon{font-size:16px}
                .header-actions{display:flex;align-items:center;gap:5px}
                .icon-btn{border:0;background:var(--btn-bg);color:var(--text-main);width:28px;height:28px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;transition:all .15s}
                .icon-btn:hover{filter:brightness(1.15);transform:scale(1.05)}
                .metrics-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:10px}
                .metric-card{background:var(--card-bg);border:1px solid var(--card-border);border-radius:11px;padding:7px 6px;text-align:center}
                .metric-card span{display:block;font-size:9.5px;color:var(--text-muted);margin-bottom:3px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
                .metric-card b{display:block;font-size:13.5px;font-variant-numeric:tabular-nums;direction:ltr}
                .metric-online b{color:var(--online-color)}
                .metric-break b{color:var(--break-color)}
                .metric-sessions b{color:rgb(168,85,247)}
                .metric-tickets b{color:var(--ticket-color)}
                .metric-time b{color:var(--text-main)}
                .metric-start b{color:var(--text-main)}
                .progress-wrap{background:var(--card-bg);border:1px solid var(--card-border);border-radius:10px;padding:8px 10px;margin-bottom:10px}
                .progress-label{display:flex;justify-content:space-between;font-size:9.5px;color:var(--text-muted);margin-bottom:5px;font-weight:700}
                .progress-bar{display:flex;height:8px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.05);gap:2px}
                .bar-online{background:var(--online-color);transition:width .3s}
                .bar-break{background:var(--break-color);transition:width .3s}
                .timeline-list{display:grid;gap:4px;max-height:120px;overflow-y:auto;padding-left:3px;margin-bottom:10px;scrollbar-width:thin;scrollbar-color:var(--card-border) transparent}
                .timeline-list::-webkit-scrollbar{width:4px}
                .timeline-list::-webkit-scrollbar-thumb{background:var(--card-border);border-radius:4px}
                .timeline-row{display:flex;align-items:center;justify-content:space-between;background:var(--card-bg);padding:5px 8px;border-radius:8px;font-size:10px}
                .timeline-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;font-weight:600}
                .timeline-time{color:var(--text-muted);font-variant-numeric:tabular-nums;direction:ltr;font-size:9.5px}
                .actions{display:grid;grid-template-columns:1fr auto;gap:6px}
                .btn{border-radius:10px;padding:8px 10px;cursor:pointer;font-size:11px;font-weight:700;border:0;transition:all .15s}
                .btn-copy{background:rgba(52,211,153,.15);border:1px solid rgba(52,211,153,.35);color:var(--online-color)}
                .btn-scan{background:var(--btn-bg);border:1px solid var(--border-panel);color:var(--text-main)}
                .btn:hover{filter:brightness(1.15);transform:scale(1.02)}
                .toast{display:none;margin-top:7px;color:var(--online-color);font-size:10px;text-align:center;font-weight:700}
                .compact{display:none;align-items:center;gap:8px;position:fixed;z-index:2147483647;right:20px;bottom:20px;border:1px solid var(--border-panel);border-radius:999px;padding:8px 14px;background:var(--bg-panel);box-shadow:var(--shadow-panel);cursor:grab;font-size:11px;direction:rtl;font-family:'Segoe UI',Tahoma,sans-serif;color:var(--text-main)}
                .compact strong{color:var(--online-color);direction:ltr;font-variant-numeric:tabular-nums;font-size:12.5px}
            </style>
            <div class="panel" data-role="panel">
                <div class="header">
                    <div class="brand"><span class="brand-icon">⚡</span><span>محلل نشاط البروفايل و AUX</span></div>
                    <div class="header-actions">
                        <button class="icon-btn" data-action="toggle-theme" title="تبديل المظهر">☀️</button>
                        <button class="icon-btn" data-action="minimize" title="تصغير">−</button>
                        <button class="icon-btn" data-action="close" title="إغلاق">✕</button>
                    </div>
                </div>
                <div class="metrics-grid">
                    <div class="metric-card metric-online"><span>وقت الأونلاين</span><b data-role="online-time">00:00:00</b></div>
                    <div class="metric-card metric-break"><span>وقت البريك</span><b data-role="break-time">00:00:00</b></div>
                    <div class="metric-card metric-sessions"><span>السيشن</span><b data-role="sessions-count">0</b></div>
                    <div class="metric-card metric-tickets"><span>التكتات</span><b data-role="tickets-count">0</b></div>
                    <div class="metric-card metric-time"><span>متوسط التكت</span><b data-role="avg-time">00:00</b></div>
                    <div class="metric-card metric-start"><span>بداية الشفت</span><b data-role="shift-start-time">--:--</b></div>
                </div>
                <div class="progress-wrap">
                    <div class="progress-label"><span>توزيع وقت العمل والبريك</span><span data-role="utilization-label">100% عمل</span></div>
                    <div class="progress-bar">
                        <div class="bar-online" data-role="bar-online" style="width:100%"></div>
                        <div class="bar-break" data-role="bar-break" style="width:0%"></div>
                    </div>
                </div>
                <div class="timeline-list" data-role="timeline-list"></div>
                <div class="actions">
                    <button class="btn btn-copy" data-action="copy">نسخ تقرير الأداء اليومي</button>
                    <button class="btn btn-scan" data-action="scan" title="إعادة فحص التايم لاين">🔄 تحديث</button>
                </div>
                <div class="toast" data-role="toast"></div>
            </div>
            <button class="compact" data-role="compact" type="button"><span class="brand-icon">⚡</span><span>البروفايل:</span><strong data-role="compact-online">00:00:00</strong></button>
        `;

        if (currentTheme === 'light') shadow.host.classList.add('light-theme');

        const byRole = r => shadow.querySelector(`[data-role="${r}"]`);
        const panel = byRole('panel');
        const compact = byRole('compact');

        let lastMetrics = null;

        function renderMetrics() {
            const rawText = _extractTimelineTextFromDOM();
            const events = _parseTimeline(rawText);
            const metrics = _calculateMetrics(events);
            lastMetrics = metrics;

            byRole('online-time').textContent = _formatDuration(metrics.totalOnlineMs);
            byRole('break-time').textContent = _formatDuration(metrics.totalBreakMs);
            if (byRole('sessions-count')) byRole('sessions-count').textContent = String(metrics.totalSessions);
            byRole('tickets-count').textContent = String(metrics.uniqueTicketsCount || metrics.totalTicketsCompleted);
            byRole('avg-time').textContent = _formatDuration(metrics.avgTicketDurationMs);
            if (byRole('shift-start-time')) byRole('shift-start-time').textContent = metrics.shiftStart ? _formatTime(metrics.shiftStart) : '--:--';

            const onlinePercent = metrics.utilizationRate;
            const breakPercent = 100 - onlinePercent;
            byRole('bar-online').style.width = `${onlinePercent}%`;
            byRole('bar-break').style.width = `${breakPercent}%`;
            byRole('utilization-label').textContent = `${onlinePercent}% أونلاين (${breakPercent}% بريك)`;
            byRole('compact-online').textContent = _formatDuration(metrics.totalOnlineMs);

            const listElem = byRole('timeline-list');
            listElem.replaceChildren();

            if (events.length === 0) {
                const emptyRow = document.createElement('div');
                emptyRow.className = 'timeline-row';
                emptyRow.style.justifyContent = 'center';
                emptyRow.style.color = 'var(--text-muted)';
                emptyRow.textContent = 'بانتظار تحميل تايم لاين الـ CRM...';
                listElem.appendChild(emptyRow);
            } else {
                events.slice().reverse().forEach(ev => {
                    const row = document.createElement('div');
                    row.className = 'timeline-row';
                    const text = document.createElement('span');
                    text.className = 'timeline-text';
                    text.textContent = ev.label;
                    const time = document.createElement('span');
                    time.className = 'timeline-time';
                    time.textContent = _formatTime(ev.time);
                    row.append(text, time);
                    listElem.appendChild(row);
                });
            }
        }

        function showToast(msg) {
            const toast = byRole('toast');
            if (!toast) return;
            toast.textContent = msg;
            toast.style.display = 'block';
            setTimeout(() => { toast.style.display = 'none'; }, 2200);
        }

        function copyReport() {
            if (!lastMetrics) renderMetrics();
            const m = lastMetrics || _calculateMetrics([]);
            const shiftStartTime = m.shiftStart ? _formatTime(m.shiftStart) : '--:--';
            const report = [
                `📊 تقرير نشاط البروفايل و AUX اليومي:`,
                `---------------------------------`,
                `🟢 وقت الأونلاين (Online): ${_formatDuration(m.totalOnlineMs)}`,
                `🟡 وقت الاستراحة (Break): ${_formatDuration(m.totalBreakMs)}`,
                `🕒 بداية الشفت الفعلية: ${shiftStartTime}`,
                `📈 نسبة الالتزام والعمل: ${m.utilizationRate}%`,
                `🔵 إجمالي السيشن (Sessions): ${m.totalSessions}`,
                `🎯 إجمالي التكتات الفريدة: ${m.uniqueTicketsCount || m.totalTicketsCompleted}`,
                `⏱️ متوسط وقت التكت (ABST): ${_formatDuration(m.avgTicketDurationMs)}`,
                `---------------------------------`
            ].join('\n');

            navigator.clipboard.writeText(report).then(() => {
                showToast('✅ تم نسخ التقرير الشامل بنجاح!');
            }).catch(() => {
                showToast('❌ تعذر النسخ للحافظة');
            });
        }

        function toggleTheme() {
            currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
            try { localStorage.setItem(THEME_KEY, currentTheme); } catch (e) {}
            if (currentTheme === 'light') {
                shadow.host.classList.add('light-theme');
            } else {
                shadow.host.classList.remove('light-theme');
            }
        }

        function minimize() {
            panel.style.display = 'none';
            compact.style.display = 'flex';
        }

        function show() {
            compact.style.display = 'none';
            panel.style.display = 'block';
            renderMetrics();
        }

        function close() {
            host.remove();
        }

        shadow.querySelector('[data-action="toggle-theme"]').addEventListener('click', toggleTheme);
        shadow.querySelector('[data-action="minimize"]').addEventListener('click', minimize);
        shadow.querySelector('[data-action="close"]').addEventListener('click', close);
        shadow.querySelector('[data-action="scan"]').addEventListener('click', () => {
            renderMetrics();
            showToast('🔄 تم تحديث البيانات من التايم لاين');
        });
        shadow.querySelector('[data-action="copy"]').addEventListener('click', copyReport);
        compact.addEventListener('click', show);

        renderMetrics();
        const intervalId = setInterval(renderMetrics, 10000);
        window.addEventListener('pagehide', () => clearInterval(intervalId), { once: true });

        const api = { show, minimize, close, renderMetrics };
        window.__FAST_TOOLKIT_CRM_PROFILE_ANALYTICS__ = api;
        return api;
    }

    return {
        parseDateStr,
        formatDuration,
        formatTime,
        parseTimeline,
        calculateMetrics,
        extractTimelineTextFromDOM,
        getRuntimeSource,
        buildBookmarklet,
        install
    };
}));
