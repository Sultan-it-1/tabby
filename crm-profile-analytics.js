(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.FastToolkitCrmProfileAnalytics = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createAnalyticsEngine() {
        const STATUS_NAMES = [
            'Training Session', 'Technical Issue', 'Quality Session', 'Back Office',
            'Customer Follow Up', 'Team Meeting', 'Offline', 'Online', 'Break',
            'Lunch', 'Meeting', 'Training', 'Coaching', 'Prayer', 'Backoffice',
            'Email', 'Busy', 'Away', 'Unavailable'
        ];

        function normalizeDigits(value) {
            const arabic = '٠١٢٣٤٥٦٧٨٩';
            const persian = '۰۱۲۳۴۵۶۷۸۹';
            return String(value == null ? '' : value)
                .replace(/[٠-٩]/g, ch => String(arabic.indexOf(ch)))
                .replace(/[۰-۹]/g, ch => String(persian.indexOf(ch)));
        }

        function normalizeAuditText(value) {
            return normalizeDigits(value)
                .replace(/\u00a0/g, ' ')
                .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
                .replace(/[‐‑–—]/g, '-')
                .replace(/\r\n?/g, '\n')
                .split('\n')
                .map(line => line.trim().replace(/[ \t]+/g, ' '))
                .filter(Boolean)
                .join('\n');
        }

        function parseDateStr(value) {
            const text = normalizeDigits(value);
            const match = text.match(/(?:^|\D)(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?!\d)/);
            if (!match) return null;
            const day = Number(match[1]);
            const month = Number(match[2]) - 1;
            const year = Number(match[3]);
            const hour = Number(match[4]);
            const minute = Number(match[5]);
            const second = Number(match[6] || 0);
            if (year < 2000 || year > 2200 || month < 0 || month > 11 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
            const date = new Date(year, month, day, hour, minute, second, 0);
            if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second) return null;
            return date.getTime();
        }

        function extractFullDates(text, offset) {
            const normalized = normalizeDigits(text);
            const dates = [];
            const regex = /(\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?)/g;
            let match;
            while ((match = regex.exec(normalized))) {
                const time = parseDateStr(match[1]);
                dates.push({
                    raw: match[1],
                    time,
                    valid: time != null,
                    index: (offset || 0) + match.index
                });
            }
            return dates;
        }

        function parseTimeOnly(value) {
            const match = normalizeDigits(value).match(/(?:^|\D)(\d{1,2}):(\d{2})(?::(\d{2}))?(?!\d)/);
            if (!match) return null;
            const hour = Number(match[1]);
            const minute = Number(match[2]);
            const second = Number(match[3] || 0);
            if (hour > 23 || minute > 59 || second > 59) return null;
            return { hour, minute, second, raw: match[0].trim() };
        }

        function combineTimeWithReference(timeValue, referenceTime) {
            const parsed = typeof timeValue === 'string' ? parseTimeOnly(timeValue) : timeValue;
            if (!parsed || !referenceTime) return null;
            const date = new Date(referenceTime);
            date.setHours(parsed.hour, parsed.minute, parsed.second || 0, 0);
            return date.getTime();
        }

        function combineTimeClosestToReference(timeValue, referenceTime) {
            const parsed = typeof timeValue === 'string' ? parseTimeOnly(timeValue) : timeValue;
            if (!parsed || !referenceTime) return null;
            const reference = new Date(referenceTime);
            const candidates = [-1, 0, 1].map(dayOffset => {
                const candidate = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() + dayOffset, parsed.hour, parsed.minute, parsed.second || 0, 0);
                return candidate.getTime();
            });
            candidates.sort((a, b) => Math.abs(a - referenceTime) - Math.abs(b - referenceTime));
            return candidates[0];
        }

        function nearestReferenceDate(text, position) {
            const validDates = extractFullDates(text).filter(item => item.valid);
            if (!validDates.length) return null;
            validDates.sort((a, b) => Math.abs(a.index - position) - Math.abs(b.index - position));
            return validDates[0].time;
        }

        function hashString(value) {
            const text = String(value || '');
            let hash = 2166136261;
            for (let i = 0; i < text.length; i++) {
                hash ^= text.charCodeAt(i);
                hash = Math.imul(hash, 16777619);
            }
            return (hash >>> 0).toString(36);
        }

        function normalizeStatus(value) {
            return String(value || '').trim().replace(/\s+/g, ' ');
        }

        function parseStatusPair(value) {
            const raw = normalizeStatus(value).replace(/^[-:>\s]+|[-:>\s]+$/g, '');
            if (!raw) return { from: '', to: '', confidence: 'low', warning: 'missing-status-value' };

            const arrow = raw.match(/^(.*?)\s*(?:->|→|➔|\bto\b)\s*(.*?)$/i);
            if (arrow && arrow[1] && arrow[2]) {
                return { from: normalizeStatus(arrow[1]), to: normalizeStatus(arrow[2]), confidence: 'high' };
            }

            const lower = raw.toLowerCase();
            const names = STATUS_NAMES.slice().sort((a, b) => b.length - a.length);
            for (const first of names) {
                if (!lower.startsWith(first.toLowerCase())) continue;
                const rest = raw.slice(first.length).trim();
                const second = names.find(name => name.toLowerCase() === rest.toLowerCase());
                if (second) return { from: first, to: second, confidence: 'high' };
            }

            const pieces = raw.split(/\s+/);
            if (pieces.length === 1) return { from: '', to: pieces[0], confidence: 'medium', warning: 'missing-previous-status' };
            if (pieces.length === 2) return { from: pieces[0], to: pieces[1], confidence: 'medium' };
            return {
                from: pieces[0],
                to: pieces.slice(1).join(' '),
                confidence: 'low',
                warning: 'ambiguous-multi-word-status'
            };
        }

        function findSectionEnd(text, start) {
            const tail = text.slice(start);
            const marker = tail.match(/\n(?=\s*(?:Status\s*:|Last\s+assigned\s+at\s*:|This\s+User\s+|\d{1,2}:\d{2}\.?\s+[\w.+-]+@[\w.-]+))/i);
            return marker ? start + marker.index : text.length;
        }

        function extractActor(text) {
            const match = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
            return match ? match[0].toLowerCase() : '';
        }

        function findTimeOnlyNear(text, position) {
            const before = text.slice(Math.max(0, position - 120), position);
            const after = text.slice(position, Math.min(text.length, position + 160));
            let direct = null;
            const beforeRegex = /(?:^|\n)\s*(\d{1,2}:\d{2}(?::\d{2})?)\.?\s*(?:[\w.+-]+@[\w.-]+)?[^\n]*(?=\n|$)/g;
            let match;
            while ((match = beforeRegex.exec(before))) direct = match[1];
            if (!direct) {
                const afterMatch = after.match(/^.{0,70}?(?:\n|^|\s)(\d{1,2}:\d{2}(?::\d{2})?)\.?\s+(?:[\w.+-]+@[\w.-]+|This\s+User)/i);
                if (afterMatch) direct = afterMatch[1];
            }
            return direct;
        }

        function findLastAssignedNewValue(text, position) {
            const matches = [];
            const regex = /Last\s+assigned\s+at\s*:/gi;
            let match;
            while ((match = regex.exec(text))) {
                const end = findSectionEnd(text, match.index + match[0].length);
                const dates = extractFullDates(text.slice(match.index + match[0].length, end), match.index + match[0].length).filter(item => item.valid);
                if (dates.length) {
                    matches.push({
                        distance: Math.abs(match.index - position),
                        time: dates.length >= 2 ? dates[1].time : dates[0].time
                    });
                }
            }
            matches.sort((a, b) => a.distance - b.distance);
            return matches.length ? matches[0].time : null;
        }

        function parseBlock(block, blockOrder) {
            const text = normalizeAuditText(block.text || block);
            const blockId = block.id || `block-${hashString(text)}`;
            const sourceStableId = block.stableDomId || '';
            const actor = extractActor(text);
            const events = [];
            const warnings = [];
            let localOrder = 0;

            const statusRegex = /Status\s*:/gi;
            let statusMatch;
            while ((statusMatch = statusRegex.exec(text))) {
                const valueStart = statusMatch.index + statusMatch[0].length;
                const changedMatch = /Status\s+Changed\s+At\s*:/i.exec(text.slice(valueStart));
                const nextStatusMatch = /\n\s*Status\s*:/i.exec(text.slice(valueStart));
                if (!changedMatch || (nextStatusMatch && nextStatusMatch.index < changedMatch.index)) continue;
                const changedAtIndex = valueStart + changedMatch.index;
                const lineEnd = text.indexOf('\n', valueStart);
                const valueEnd = Math.min(changedAtIndex, lineEnd >= 0 ? lineEnd : changedAtIndex);
                const pair = parseStatusPair(text.slice(valueStart, valueEnd));
                const detailsStart = changedAtIndex + changedMatch[0].length;
                const detailsEnd = findSectionEnd(text, detailsStart);
                const dates = extractFullDates(text.slice(detailsStart, detailsEnd), detailsStart);
                const validDates = dates.filter(item => item.valid);
                const invalidDates = dates.filter(item => !item.valid);
                const eventTime = validDates.length >= 2 ? validDates[1].time : (validDates[0] ? validDates[0].time : null);
                const confidence = pair.confidence === 'low' || !eventTime ? 'low' : (validDates.length >= 2 ? pair.confidence : 'medium');
                if (pair.warning) warnings.push(pair.warning);
                if (invalidDates.length) warnings.push('invalid-status-date');
                if (!eventTime) warnings.push('missing-status-time');
                events.push({
                    id: `${blockId}-status-${localOrder}`,
                    type: 'status',
                    from: pair.from,
                    to: pair.to,
                    previousStatusStartedAt: validDates.length >= 2 ? validDates[0].time : null,
                    time: eventTime,
                    at: eventTime,
                    actor,
                    confidence,
                    sourceBlockId: blockId,
                    sourceStableId,
                    sourceOrder: blockOrder * 100 + localOrder++,
                    raw: text.slice(statusMatch.index, detailsEnd)
                });
            }

            const assignedRegex = /Last\s+assigned\s+at\s*:/gi;
            let assignedMatch;
            while ((assignedMatch = assignedRegex.exec(text))) {
                const detailsStart = assignedMatch.index + assignedMatch[0].length;
                const detailsEnd = findSectionEnd(text, detailsStart);
                const dates = extractFullDates(text.slice(detailsStart, detailsEnd), detailsStart);
                const validDates = dates.filter(item => item.valid);
                if (!validDates.length) continue;
                events.push({
                    id: `${blockId}-assigned-${localOrder}`,
                    type: 'last_assigned',
                    oldValue: validDates.length >= 2 ? validDates[0].time : null,
                    newValue: validDates.length >= 2 ? validDates[1].time : validDates[0].time,
                    time: validDates.length >= 2 ? validDates[1].time : validDates[0].time,
                    actor,
                    confidence: validDates.length >= 2 ? 'high' : 'medium',
                    sourceBlockId: blockId,
                    sourceStableId,
                    sourceOrder: blockOrder * 100 + localOrder++,
                    raw: text.slice(assignedMatch.index, detailsEnd)
                });
            }

            const ticketRegex = /This\s+User\s+(unlinked\s+from|linked\s+(?:with|to))\s+Ticket(?:\s*[\(\[]\s*([^\)\]\s]+)\s*[\)\]])?/gi;
            let ticketMatch;
            while ((ticketMatch = ticketRegex.exec(text))) {
                const action = /^unlinked/i.test(ticketMatch[1]) ? 'unlink' : 'link';
                let ticketId = String(ticketMatch[2] || '').trim();
                if (!ticketId) {
                    const after = text.slice(ticketMatch.index + ticketMatch[0].length, ticketMatch.index + ticketMatch[0].length + 50);
                    const plainId = after.match(/^\s+([A-Za-z0-9][A-Za-z0-9_-]{3,})(?=\s|$)/);
                    if (plainId && !plainId[1].includes(':')) ticketId = plainId[1];
                }

                const directTime = findTimeOnlyNear(text, ticketMatch.index);
                const reference = nearestReferenceDate(text, ticketMatch.index);
                let eventTime = directTime && reference ? combineTimeWithReference(directTime, reference) : null;
                let timeSource = eventTime ? 'row-time' : '';
                if (!eventTime && action === 'link') {
                    eventTime = findLastAssignedNewValue(text, ticketMatch.index);
                    if (eventTime) timeSource = 'last-assigned-new';
                }
                if (!eventTime) {
                    const nearbyDates = extractFullDates(text.slice(Math.max(0, ticketMatch.index - 180), Math.min(text.length, ticketMatch.index + 180)));
                    const validNearby = nearbyDates.filter(item => item.valid);
                    if (validNearby.length === 1) {
                        eventTime = validNearby[0].time;
                        timeSource = 'nearby-full-date';
                    }
                }
                if (!ticketId) warnings.push('missing-ticket-id');
                if (!eventTime) warnings.push('missing-ticket-time');
                events.push({
                    id: `${blockId}-ticket-${localOrder}`,
                    type: action === 'link' ? 'ticket_linked' : 'ticket_unlinked',
                    action,
                    ticketId,
                    ticketKey: ticketId.toLowerCase(),
                    time: eventTime,
                    at: eventTime,
                    timeOnlyRaw: directTime || '',
                    timeSource,
                    actor,
                    confidence: !eventTime || !ticketId ? 'low' : (timeSource === 'row-time' ? 'high' : 'medium'),
                    sourceBlockId: blockId,
                    sourceStableId,
                    sourceOrder: blockOrder * 100 + localOrder++,
                    raw: ticketMatch[0]
                });
            }

            return { events, warnings, text, blockId };
        }

        function eventDedupeKey(event) {
            const minute = event.time == null ? 'missing' : Math.floor(event.time / 60000);
            const stableSuffix = event.sourceStableId ? `|dom:${event.sourceStableId}` : '';
            if (event.type === 'status') return `status|${normalizeStatus(event.from).toLowerCase()}|${normalizeStatus(event.to).toLowerCase()}|${minute}${stableSuffix}`;
            if (event.type === 'ticket_linked' || event.type === 'ticket_unlinked') return `${event.type}|${event.ticketKey}|${minute}${stableSuffix}`;
            if (event.type === 'last_assigned') return `assigned|${event.oldValue || 'missing'}|${event.newValue || 'missing'}${stableSuffix}`;
            return `${event.type}|${minute}|${hashString(event.raw || '')}`;
        }

        function parseTimelineDetailed(input) {
            let blocks;
            if (Array.isArray(input)) {
                blocks = input.map((item, index) => typeof item === 'string'
                    ? { id: `block-${index}-${hashString(item)}`, text: item, order: index }
                    : { id: item.id || `block-${index}-${hashString(item.text || '')}`, stableDomId: item.stableDomId || '', text: item.text || '', order: Number.isFinite(item.order) ? item.order : index });
            } else {
                const raw = String(input || '');
                const pieces = raw.split(/\n\s*---FT-AUDIT-BLOCK---\s*\n/g).filter(Boolean);
                blocks = (pieces.length ? pieces : [raw]).map((text, index) => ({ id: `block-${index}-${hashString(text)}`, text, order: index }));
            }

            const parsedEvents = [];
            const warnings = [];
            blocks.forEach((block, index) => {
                const result = parseBlock(block, Number.isFinite(block.order) ? block.order : index);
                parsedEvents.push(...result.events);
                warnings.push(...result.warnings);
            });

            const timeAnchors = parsedEvents.filter(event => event.time != null);
            parsedEvents.forEach(event => {
                if (event.time != null || !event.timeOnlyRaw || !timeAnchors.length) return;
                const anchor = timeAnchors.slice().sort((a, b) => Math.abs((a.sourceOrder || 0) - (event.sourceOrder || 0)) - Math.abs((b.sourceOrder || 0) - (event.sourceOrder || 0)))[0];
                const resolved = combineTimeClosestToReference(event.timeOnlyRaw, anchor.time);
                if (resolved == null) return;
                event.time = resolved;
                event.at = resolved;
                event.timeSource = 'row-time-global-date';
                event.confidence = event.ticketId ? 'medium' : 'low';
            });

            const deduped = new Map();
            let duplicatesRemoved = 0;
            parsedEvents.forEach(event => {
                const key = eventDedupeKey(event);
                const existing = deduped.get(key);
                if (!existing) {
                    deduped.set(key, event);
                } else {
                    duplicatesRemoved++;
                    if (existing.confidence !== 'high' && event.confidence === 'high') deduped.set(key, event);
                }
            });

            const events = Array.from(deduped.values()).sort((a, b) => {
                if (a.time == null && b.time == null) return a.sourceOrder - b.sourceOrder;
                if (a.time == null) return 1;
                if (b.time == null) return -1;
                return a.time - b.time || a.sourceOrder - b.sourceOrder;
            });
            const quality = {
                blocksCaptured: blocks.length,
                eventsParsed: events.length,
                duplicatesRemoved,
                missingTimes: events.filter(event => event.time == null).length,
                missingTicketIds: events.filter(event => (event.type === 'ticket_linked' || event.type === 'ticket_unlinked') && !event.ticketId).length,
                lowConfidenceEvents: events.filter(event => event.confidence === 'low').length,
                timestampCoverage: events.length ? Math.round((events.filter(event => event.time != null).length / events.length) * 100) : 0
            };
            return { events, warnings: Array.from(new Set(warnings)), quality, blocks };
        }

        function parseTimeline(input) {
            const result = parseTimelineDetailed(input);
            result.events.quality = result.quality;
            result.events.warnings = result.warnings;
            return result.events;
        }

        function mergeIntervals(intervals) {
            const sorted = intervals
                .filter(item => item && Number.isFinite(item.start) && Number.isFinite(item.end) && item.end >= item.start)
                .map(item => ({ start: item.start, end: item.end }))
                .sort((a, b) => a.start - b.start || a.end - b.end);
            const merged = [];
            sorted.forEach(interval => {
                const last = merged[merged.length - 1];
                if (!last || interval.start > last.end) merged.push(interval);
                else if (interval.end > last.end) last.end = interval.end;
            });
            return merged;
        }

        function intervalTotal(intervals) {
            return mergeIntervals(intervals).reduce((sum, item) => sum + Math.max(0, item.end - item.start), 0);
        }

        function intersectIntervals(first, second) {
            const a = mergeIntervals(first);
            const b = mergeIntervals(second);
            const intersections = [];
            let i = 0;
            let j = 0;
            while (i < a.length && j < b.length) {
                const start = Math.max(a[i].start, b[j].start);
                const end = Math.min(a[i].end, b[j].end);
                if (end > start) intersections.push({ start, end });
                if (a[i].end < b[j].end) i++;
                else j++;
            }
            return intersections;
        }

        function percentile(values, ratio) {
            if (!values.length) return 0;
            const sorted = values.slice().sort((a, b) => a - b);
            const index = Math.max(0, Math.ceil(ratio * sorted.length) - 1);
            return sorted[Math.min(index, sorted.length - 1)];
        }

        function calculateMetrics(input, options) {
            const parsed = Array.isArray(input) ? { events: input, quality: input.quality || {}, warnings: input.warnings || [] } : (input || { events: [] });
            const opts = options || {};
            const scrapedAt = Number(opts.scrapedAt) || Date.now();
            const allEvents = (parsed.events || []).slice().sort((a, b) => {
                if (a.time == null && b.time == null) return (a.sourceOrder || 0) - (b.sourceOrder || 0);
                if (a.time == null) return 1;
                if (b.time == null) return -1;
                return a.time - b.time || (a.sourceOrder || 0) - (b.sourceOrder || 0);
            });
            const statusEventsAll = allEvents.filter(event => event.type === 'status' && event.time != null);
            let shiftStartEvent = null;
            for (let i = statusEventsAll.length - 1; i >= 0; i--) {
                const event = statusEventsAll[i];
                if (String(event.from || '').toLowerCase() === 'offline' && String(event.to || '').toLowerCase() === 'online') {
                    shiftStartEvent = event;
                    break;
                }
            }

            const provisionalStart = shiftStartEvent
                ? shiftStartEvent.time
                : (statusEventsAll[0] ? (statusEventsAll[0].previousStatusStartedAt || statusEventsAll[0].time) : null);
            const shiftStart = shiftStartEvent ? shiftStartEvent.time : null;
            const windowStart = shiftStart || provisionalStart || (allEvents.find(event => event.time != null) || {}).time || null;
            const statusEvents = statusEventsAll.filter(event => windowStart == null || event.time >= windowStart);
            const latestStatus = statusEvents[statusEvents.length - 1] || null;
            let shiftEnd = null;
            if (latestStatus && String(latestStatus.to || '').toLowerCase() === 'offline') {
                shiftEnd = latestStatus.time;
            } else if (windowStart != null) {
                const latestKnown = allEvents.reduce((max, event) => event.time != null ? Math.max(max, event.time) : max, windowStart);
                shiftEnd = scrapedAt - windowStart <= 18 * 60 * 60 * 1000 ? scrapedAt : latestKnown;
            }

            const BREAK_ALLOWANCE_PER_SESSION_MS = 15 * 60 * 1000;
            const BREAK_ALLOWANCE_COUNT = 2;
            const LUNCH_ALLOWANCE_MS = 30 * 60 * 1000;
            const auxBreakdown = {};
            const workStatusBreakdown = {};
            const statusIntervals = [];
            const onlineIntervals = [];
            const breakIntervals = [];
            const lunchIntervals = [];
            let totalOnlineMs = 0;
            let totalBreakMs = 0;
            let totalLunchMs = 0;
            let totalOtherMs = 0;
            let totalOfflineMs = 0;
            for (let i = 0; i < statusEvents.length; i++) {
                const current = statusEvents[i];
                const next = statusEvents[i + 1];
                const start = Math.max(windowStart == null ? current.time : windowStart, current.time);
                const end = Math.max(start, Math.min(next ? next.time : (shiftEnd || start), shiftEnd || (next ? next.time : start)));
                const duration = Math.max(0, end - start);
                const status = normalizeStatus(current.to || 'Unknown');
                const key = status.toLowerCase();
                const interval = { status, start, end, durationMs: duration };
                statusIntervals.push(interval);
                if (key === 'offline') {
                    totalOfflineMs += duration;
                } else if (key === 'break') {
                    auxBreakdown[status || 'Unknown'] = (auxBreakdown[status || 'Unknown'] || 0) + duration;
                    totalBreakMs += duration;
                    breakIntervals.push(interval);
                } else if (key === 'lunch') {
                    auxBreakdown[status || 'Unknown'] = (auxBreakdown[status || 'Unknown'] || 0) + duration;
                    totalLunchMs += duration;
                    lunchIntervals.push(interval);
                } else {
                    // Training, Meeting and every other non-rest status count as
                    // working/Online time. Their raw labels remain visible in the
                    // breakdown so the total is transparent.
                    totalOnlineMs += duration;
                    onlineIntervals.push({ start, end });
                    workStatusBreakdown[status || 'Unknown'] = (workStatusBreakdown[status || 'Unknown'] || 0) + duration;
                    if (key !== 'online') totalOtherMs += duration;
                }
            }

            function buildAllowanceBudget(intervals, allowances) {
                const entries = intervals.map((interval, index) => {
                    const allowanceMs = allowances[index] || 0;
                    return {
                        index: index + 1,
                        durationMs: interval.durationMs,
                        allowanceMs,
                        remainingMs: Math.max(0, allowanceMs - interval.durationMs),
                        overageMs: Math.max(0, interval.durationMs - allowanceMs),
                        start: interval.start,
                        end: interval.end
                    };
                });
                while (entries.length < allowances.length) {
                    const allowanceMs = allowances[entries.length];
                    entries.push({
                        index: entries.length + 1,
                        durationMs: 0,
                        allowanceMs,
                        remainingMs: allowanceMs,
                        overageMs: 0,
                        start: null,
                        end: null
                    });
                }
                return {
                    entries,
                    sessionsCount: intervals.length,
                    usedMs: intervals.reduce((sum, interval) => sum + interval.durationMs, 0),
                    allowanceMs: allowances.reduce((sum, allowance) => sum + allowance, 0),
                    remainingMs: entries.reduce((sum, entry) => sum + entry.remainingMs, 0),
                    overageMs: entries.reduce((sum, entry) => sum + entry.overageMs, 0)
                };
            }

            const breakBudget = buildAllowanceBudget(
                breakIntervals,
                Array.from({ length: BREAK_ALLOWANCE_COUNT }, () => BREAK_ALLOWANCE_PER_SESSION_MS)
            );
            const lunchBudget = buildAllowanceBudget(lunchIntervals, [LUNCH_ALLOWANCE_MS]);
            const restBudget = {
                usedMs: totalBreakMs + totalLunchMs,
                allowanceMs: breakBudget.allowanceMs + lunchBudget.allowanceMs,
                remainingMs: breakBudget.remainingMs + lunchBudget.remainingMs,
                overageMs: breakBudget.overageMs + lunchBudget.overageMs
            };

            const ticketEvents = allEvents.filter(event => {
                if (event.type !== 'ticket_linked' && event.type !== 'ticket_unlinked') return false;
                if (event.time == null || !event.ticketId) return false;
                if (windowStart != null && event.time < windowStart) return false;
                if (shiftEnd != null && event.time > shiftEnd) return false;
                return true;
            });
            const open = new Map();
            const sessions = [];
            const anomalies = [];

            function closeSession(session, end, endKind, sourceEvent) {
                session.unlinkedAt = Number.isFinite(end) ? end : null;
                session.endKind = endKind;
                session.durationMs = session.linkedAt != null && session.unlinkedAt != null && session.unlinkedAt >= session.linkedAt
                    ? session.unlinkedAt - session.linkedAt
                    : null;
                session.confidence = endKind === 'explicit' ? 'high' : 'low';
                if (sourceEvent) session.sourceEventIds.push(sourceEvent.id);
                sessions.push(session);
                open.delete(session.ticketKey);
            }

            function processLink(event) {
                Array.from(open.values()).forEach(existing => {
                    existing.anomalies.push(existing.ticketKey === event.ticketKey ? 'duplicate-link' : 'closed-by-next-link');
                    anomalies.push(existing.ticketKey === event.ticketKey ? 'duplicate-link' : 'missing-unlink');
                    closeSession(existing, event.time, 'next-link', event);
                });
                open.set(event.ticketKey, {
                    ticketId: event.ticketId,
                    ticketKey: event.ticketKey,
                    linkedAt: event.time,
                    unlinkedAt: null,
                    endKind: 'open',
                    durationMs: null,
                    confidence: event.confidence,
                    anomalies: [],
                    sourceEventIds: [event.id]
                });
            }

            function processUnlink(event) {
                const existing = open.get(event.ticketKey);
                if (existing) {
                    if (event.time === existing.linkedAt) existing.anomalies.push('same-minute');
                    closeSession(existing, event.time, 'explicit', event);
                } else {
                    anomalies.push('orphan-unlink');
                    sessions.push({
                        ticketId: event.ticketId,
                        ticketKey: event.ticketKey,
                        linkedAt: null,
                        unlinkedAt: event.time,
                        endKind: 'orphan-unlink',
                        durationMs: null,
                        confidence: 'low',
                        anomalies: ['orphan-unlink'],
                        sourceEventIds: [event.id]
                    });
                }
            }

            const grouped = new Map();
            ticketEvents.forEach(event => {
                const key = String(event.time);
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key).push(event);
            });
            Array.from(grouped.keys()).map(Number).sort((a, b) => a - b).forEach(time => {
                const group = grouped.get(String(time));
                const handled = new Set();
                group.forEach((event, index) => {
                    if (event.type === 'ticket_unlinked' && open.has(event.ticketKey)) {
                        processUnlink(event);
                        handled.add(index);
                    }
                });
                group.forEach((event, index) => {
                    if (!handled.has(index) && event.type === 'ticket_linked') {
                        processLink(event);
                        handled.add(index);
                    }
                });
                group.forEach((event, index) => {
                    if (!handled.has(index) && event.type === 'ticket_unlinked') processUnlink(event);
                });
            });

            Array.from(open.values()).forEach(session => {
                if (shiftEnd != null) {
                    const endedOffline = latestStatus && String(latestStatus.to || '').toLowerCase() === 'offline';
                    session.anomalies.push(endedOffline ? 'closed-at-shift-end' : 'still-open');
                    closeSession(session, shiftEnd, endedOffline ? 'shift-end' : 'open', null);
                } else {
                    sessions.push(session);
                }
            });

            const explicitSessions = sessions.filter(session => session.endKind === 'explicit' && session.durationMs != null);
            const estimatedSessions = sessions.filter(session => ['next-link', 'shift-end', 'open'].includes(session.endKind) && session.durationMs != null);
            const incompleteSessions = sessions.filter(session => session.durationMs == null);
            const explicitDurations = explicitSessions.map(session => session.durationMs);
            const totalHandledMs = explicitDurations.reduce((sum, value) => sum + value, 0);
            const totalEstimatedHandledMs = sessions.reduce((sum, session) => sum + (session.durationMs || 0), 0);
            const avgTicketDurationMs = explicitDurations.length ? Math.round(totalHandledMs / explicitDurations.length) : 0;
            const medianTicketDurationMs = percentile(explicitDurations, 0.5);
            const p90TicketDurationMs = percentile(explicitDurations, 0.9);
            const validSessions = sessions.filter(session => session.durationMs != null);
            const longestSession = validSessions.slice().sort((a, b) => b.durationMs - a.durationMs)[0] || null;
            const shortestSession = validSessions.slice().sort((a, b) => a.durationMs - b.durationMs)[0] || null;
            const ticketTotalsMap = new Map();
            validSessions.forEach(session => {
                const current = ticketTotalsMap.get(session.ticketKey) || { ticketId: session.ticketId, ticketKey: session.ticketKey, totalMs: 0, sessions: 0 };
                current.totalMs += session.durationMs;
                current.sessions++;
                ticketTotalsMap.set(session.ticketKey, current);
            });
            const ticketTotals = Array.from(ticketTotalsMap.values());
            const longestTicket = ticketTotals.slice().sort((a, b) => b.totalMs - a.totalMs)[0] || null;
            const shortestTicket = ticketTotals.slice().sort((a, b) => a.totalMs - b.totalMs)[0] || null;
            const ticketIntervals = validSessions.map(session => ({ start: session.linkedAt, end: session.unlinkedAt }));
            const ticketOccupancyMs = intervalTotal(ticketIntervals);
            const ticketOnlineOccupancyMs = intervalTotal(intersectIntervals(ticketIntervals, onlineIntervals));
            const utilizationRate = totalOnlineMs > 0 ? Math.min(100, Math.round((ticketOnlineOccupancyMs / totalOnlineMs) * 100)) : 0;
            const uniqueTicketKeys = new Set(ticketEvents.map(event => event.ticketKey));
            const linkedEventsCount = ticketEvents.filter(event => event.type === 'ticket_linked').length;
            const revisitCounts = {};
            ticketEvents.filter(event => event.type === 'ticket_linked').forEach(event => {
                revisitCounts[event.ticketKey] = (revisitCounts[event.ticketKey] || 0) + 1;
            });
            const repeatedTicketsCount = Object.values(revisitCounts).filter(count => count > 1).length;
            const quality = Object.assign({}, parsed.quality || {}, {
                orphanUnlinks: sessions.filter(session => session.endKind === 'orphan-unlink').length,
                estimatedSessions: estimatedSessions.length,
                incompleteSessions: incompleteSessions.length,
                scanComplete: opts.scanComplete !== false,
                shiftStartFound: Boolean(shiftStart)
            });

            return {
                shiftStart,
                provisionalShiftStart: provisionalStart,
                shiftEnd,
                latestStatus: latestStatus ? latestStatus.to : '',
                statusIntervals,
                totalOnlineMs,
                totalBreakMs,
                totalLunchMs,
                totalOtherMs,
                totalOfflineMs,
                totalAuxMs: totalBreakMs + totalLunchMs,
                auxBreakdown,
                workStatusBreakdown,
                breakIntervals,
                lunchIntervals,
                breakBudget,
                lunchBudget,
                restBudget,
                totalSessions: linkedEventsCount,
                totalTicketsLinked: linkedEventsCount,
                totalTicketsCompleted: explicitSessions.length,
                uniqueTicketsCount: uniqueTicketKeys.size,
                activeTicketsCount: sessions.filter(session => session.endKind === 'open').length,
                repeatedTicketsCount,
                avgTicketDurationMs,
                medianTicketDurationMs,
                p90TicketDurationMs,
                totalHandledMs,
                totalEstimatedHandledMs,
                ticketOccupancyMs,
                ticketOnlineOccupancyMs,
                utilizationRate,
                sessions,
                explicitSessions,
                estimatedSessions,
                incompleteSessions,
                extremes: { longestSession, shortestSession, longestTicket, shortestTicket },
                events: allEvents.filter(event => windowStart == null || event.time == null || event.time >= windowStart),
                quality,
                warnings: parsed.warnings || [],
                isComplete: Boolean(shiftStart) && opts.scanComplete !== false,
                anomalies
            };
        }

        function formatDuration(ms, minutePrecision) {
            if (!Number.isFinite(ms) || ms < 0) return '--';
            if (minutePrecision && ms < 60000) return '< دقيقة';
            const seconds = Math.floor(ms / 1000);
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const remainder = seconds % 60;
            if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
            return `${minutes}:${String(remainder).padStart(2, '0')}`;
        }

        function formatDateTime(timestamp) {
            if (!timestamp) return '--';
            const date = new Date(timestamp);
            return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        }

        return {
            normalizeAuditText,
            parseDateStr,
            parseTimeline,
            parseTimelineDetailed,
            calculateMetrics,
            formatDuration,
            formatDateTime,
            mergeIntervals,
            hashString
        };
    }

    function crmProfileAnalyticsRuntime(engineFactory, runtimeOptions) {
        'use strict';
        const options = runtimeOptions || {};
        const engine = engineFactory();
        if (typeof window === 'undefined' || typeof document === 'undefined') return null;

        const hostname = String(window.location && window.location.hostname || '').toLowerCase();
        const protocol = String(window.location && window.location.protocol || '').toLowerCase();
        const isCrm = protocol === 'https:' && (hostname === 'crm.tabby.sa' || hostname === 'crm.tabby.ai');
        const isDev = hostname === 'localhost' || hostname === '127.0.0.1' || protocol === 'file:';
        if (!isCrm && !isDev) {
            try { window.alert('افتح صفحة CRM أولاً ثم شغّل «إحصائيات الشفت».'); } catch (e) {}
            return null;
        }

        const existing = window.__FAST_TOOLKIT_CRM_PROFILE_ANALYTICS__;
        if (existing && typeof existing.show === 'function') {
            existing.show();
            return existing;
        }

        const HOST_ID = 'fastToolkit_crm_profile_analytics_host_v1';
        const THEME_KEY = 'fastToolkit_crm_profile_analytics_theme_v1';
        const POSITION_KEY = 'fastToolkit_crm_profile_analytics_position_v1';
        const SELECTOR_KEY = 'fastToolkit_crm_profile_analytics_selector_v1';
        const MAX_SCAN_MS = 45000;
        const MAX_ROUNDS = 100;
        const MAX_CAPTURE_CHARS = 5 * 1024 * 1024;
        const MIN_END_STABLE_MS = 3200;

        const previousHost = document.getElementById(HOST_ID);
        if (previousHost) previousHost.remove();
        const host = document.createElement('div');
        host.id = HOST_ID;
        host.style.position = 'fixed';
        host.style.zIndex = '2147483647';
        host.style.inset = '0 auto auto 0';
        document.documentElement.appendChild(host);
        const shadow = host.attachShadow({ mode: 'open' });

        function create(tag, className, textValue) {
            const element = document.createElement(tag);
            if (className) element.className = className;
            if (textValue != null) element.textContent = String(textValue);
            return element;
        }

        function actionButton(action, label, className) {
            const button = create('button', className || 'btn', label);
            button.type = 'button';
            button.setAttribute('data-action', action);
            return button;
        }

        const style = create('style');
        style.textContent = `
            :host{all:initial;color-scheme:dark;font-family:Tahoma,Arial,sans-serif}
            *{box-sizing:border-box}
            .panel,.compact{position:fixed;z-index:2147483647;direction:rtl;font-family:Tahoma,Arial,sans-serif;color:var(--text);background:var(--bg);border:1px solid var(--border);box-shadow:0 18px 55px rgba(0,0,0,.45)}
            .panel{--bg:#111827;--surface:#172033;--surface2:#1f2a40;--text:#f8fafc;--muted:#9ca3af;--border:#334155;--accent:#22c55e;--warn:#f59e0b;--danger:#ef4444;width:min(470px,calc(100vw - 16px));max-height:min(720px,calc(100vh - 16px));right:12px;bottom:12px;border-radius:16px;overflow:hidden;display:flex;flex-direction:column}
            .panel.light{--bg:#f8fafc;--surface:#fff;--surface2:#eef2f7;--text:#111827;--muted:#64748b;--border:#cbd5e1}
            .head{display:flex;align-items:center;gap:8px;padding:11px 12px;background:linear-gradient(135deg,var(--surface2),var(--surface));cursor:move;user-select:none}
            .title{font-weight:800;font-size:14px;flex:1}.subtitle{display:block;color:var(--muted);font-size:10px;margin-top:2px;font-weight:400}
            .icon-btn{border:0;background:transparent;color:var(--muted);font-size:16px;cursor:pointer;border-radius:8px;padding:4px 6px}.icon-btn:hover{background:var(--surface2);color:var(--text)}
            .body{padding:10px;overflow:auto;display:flex;flex-direction:column;gap:9px}
            .toolbar{display:flex;gap:6px;flex-wrap:wrap}.btn{border:1px solid var(--border);background:var(--surface2);color:var(--text);padding:7px 9px;border-radius:9px;font-size:11px;font-weight:700;cursor:pointer}.btn.primary{background:var(--accent);border-color:var(--accent);color:#052e16}.btn.danger{background:var(--danger);border-color:var(--danger);color:white}.btn:disabled{opacity:.45;cursor:not-allowed}
            .scan-status{font-size:10.5px;color:var(--muted);background:var(--surface);padding:7px 9px;border-radius:9px;border:1px solid var(--border);line-height:1.55}.scan-status.good{color:#86efac}.scan-status.warn{color:#fbbf24}.scan-status.bad{color:#fca5a5}
            .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.metric{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:7px;min-height:58px}.metric-label{font-size:9px;color:var(--muted)}.metric-value{font-size:15px;font-weight:900;margin-top:5px;direction:ltr;text-align:right}
            .section{background:var(--surface);border:1px solid var(--border);border-radius:11px;padding:9px}.section-title{font-size:11px;font-weight:800;margin-bottom:7px}.aux-row,.quality-row{display:flex;justify-content:space-between;gap:8px;font-size:10.5px;padding:4px 0;border-bottom:1px dashed var(--border)}.aux-row:last-child,.quality-row:last-child{border-bottom:0}
            .table{display:flex;flex-direction:column;gap:5px}.ticket-row{display:grid;grid-template-columns:1.15fr .8fr .8fr .7fr;gap:5px;align-items:center;background:var(--surface2);padding:7px;border-radius:8px;font-size:9.5px;direction:rtl}.ticket-id{direction:ltr;text-align:right;font-weight:800;overflow:hidden;text-overflow:ellipsis}.ticket-time{direction:ltr;text-align:center}.chip{font-size:8px;border-radius:999px;padding:3px 5px;text-align:center}.chip.ok{background:rgba(34,197,94,.18);color:#86efac}.chip.estimate{background:rgba(245,158,11,.18);color:#fbbf24}.chip.missing{background:rgba(239,68,68,.18);color:#fca5a5}
            .empty{font-size:10px;color:var(--muted);text-align:center;padding:12px}.notice{font-size:10px;line-height:1.6;color:var(--muted)}
            .compact{--bg:#111827;--text:#fff;--border:#334155;width:52px;height:52px;right:12px;bottom:12px;border-radius:50%;display:none;align-items:center;justify-content:center;font-size:22px;cursor:pointer}
            @media(max-width:520px){.metrics{grid-template-columns:repeat(2,1fr)}.ticket-row{grid-template-columns:1fr 1fr}.panel{right:8px;bottom:8px}}
        `;

        const panel = create('section', 'panel');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'إحصائيات الشفت من سجل CRM');
        const header = create('header', 'head');
        const titleWrap = create('div', 'title', 'إحصائيات الشفت من النظام');
        titleWrap.appendChild(create('span', 'subtitle', 'قراءة سجل البروفايل — بدون تعديل أو إرسال بيانات'));
        const themeButton = actionButton('theme', '◐', 'icon-btn');
        themeButton.setAttribute('aria-label', 'تبديل المظهر');
        const minimizeButton = actionButton('minimize', '—', 'icon-btn');
        minimizeButton.setAttribute('aria-label', 'تصغير');
        const closeButton = actionButton('close', '×', 'icon-btn');
        closeButton.setAttribute('aria-label', 'إغلاق');
        header.append(titleWrap, themeButton, minimizeButton, closeButton);

        const body = create('div', 'body');
        const toolbar = create('div', 'toolbar');
        const pickButton = actionButton('pick', 'تحديد مربع السجل');
        const scanButton = actionButton('scan', 'سحب وتحليل', 'btn primary');
        const cancelButton = actionButton('cancel', 'إلغاء السحب', 'btn danger');
        cancelButton.hidden = true;
        const copyButton = actionButton('copy', 'نسخ التقرير');
        toolbar.append(pickButton, scanButton, cancelButton, copyButton);
        const scanStatus = create('div', 'scan-status', 'حدّد مربع سجل النشاط أولاً.');
        scanStatus.setAttribute('data-role', 'scan-status');

        const metricsGrid = create('div', 'metrics');
        const metricNodes = {};
        function addMetric(role, label) {
            const card = create('div', 'metric');
            card.appendChild(create('div', 'metric-label', label));
            const value = create('div', 'metric-value', '--');
            value.setAttribute('data-role', role);
            card.appendChild(value);
            metricsGrid.appendChild(card);
            metricNodes[role] = value;
        }
        addMetric('shift-start', 'بداية الشفت');
        addMetric('online-time', 'وقت العمل');
        addMetric('break-time', 'Break + Lunch');
        addMetric('sessions-count', 'جلسات link');
        addMetric('tickets-count', 'تكتات فريدة');
        addMetric('completed-count', 'مكتملة مؤكدة');
        addMetric('confirmed-abst', 'متوسط المؤكد');
        addMetric('median-time', 'الوسيط');
        addMetric('p90-time', 'P90');
        addMetric('handled-time', 'المعالجة المؤكدة');
        addMetric('estimated-time', 'مع التقديرات');
        addMetric('occupancy-rate', 'انشغال وقت العمل');

        const auxSection = create('section', 'section');
        auxSection.appendChild(create('div', 'section-title', 'تفصيل الحالات'));
        const auxList = create('div');
        auxList.setAttribute('data-role', 'aux-breakdown');
        auxSection.appendChild(auxList);
        const ticketSection = create('section', 'section');
        ticketSection.appendChild(create('div', 'section-title', 'تفصيل جلسات التكتات'));
        const ticketsList = create('div', 'table');
        ticketsList.setAttribute('data-role', 'tickets-list');
        ticketSection.appendChild(ticketsList);
        const qualitySection = create('section', 'section');
        qualitySection.appendChild(create('div', 'section-title', 'جودة البيانات'));
        const qualityList = create('div');
        qualityList.setAttribute('data-role', 'quality-report');
        qualitySection.appendChild(qualityList);
        body.append(toolbar, scanStatus, metricsGrid, auxSection, ticketSection, qualitySection);
        panel.append(header, body);
        const compact = create('button', 'compact', '📊');
        compact.type = 'button';
        compact.title = 'إظهار إحصائيات الشفت';
        shadow.append(style, panel, compact);

        const runtimeState = {
            target: null,
            targetSelector: '',
            blocks: new Map(),
            ticketLinks: new Map(),
            parsed: null,
            metrics: null,
            scanInfo: null,
            scanController: null,
            pickerCleanup: null,
            position: null
        };

        function setStatus(message, tone) {
            scanStatus.textContent = message;
            scanStatus.className = `scan-status${tone ? ` ${tone}` : ''}`;
        }

        function safeStorageGet(key) {
            try { return localStorage.getItem(key); } catch (e) { return null; }
        }

        function safeStorageSet(key, value) {
            try { localStorage.setItem(key, value); } catch (e) {}
        }

        function applyTheme(theme) {
            panel.classList.toggle('light', theme === 'light');
            safeStorageSet(THEME_KEY, theme);
        }
        applyTheme(safeStorageGet(THEME_KEY) === 'light' ? 'light' : 'dark');

        function formatClock(timestamp) {
            if (!timestamp) return '--';
            const date = new Date(timestamp);
            return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        }

        function row(label, value, className) {
            const item = create('div', className || 'quality-row');
            item.append(create('span', '', label), create('b', '', value));
            return item;
        }

        function renderMetrics() {
            const metrics = runtimeState.metrics;
            if (!metrics) return;
            metricNodes['shift-start'].textContent = formatClock(metrics.shiftStart || metrics.provisionalShiftStart);
            metricNodes['online-time'].textContent = engine.formatDuration(metrics.totalOnlineMs);
            metricNodes['break-time'].textContent = engine.formatDuration(metrics.totalAuxMs);
            metricNodes['sessions-count'].textContent = String(metrics.totalSessions);
            metricNodes['tickets-count'].textContent = String(metrics.uniqueTicketsCount);
            metricNodes['completed-count'].textContent = String(metrics.totalTicketsCompleted);
            metricNodes['confirmed-abst'].textContent = engine.formatDuration(metrics.avgTicketDurationMs, true);
            metricNodes['median-time'].textContent = engine.formatDuration(metrics.medianTicketDurationMs, true);
            metricNodes['p90-time'].textContent = engine.formatDuration(metrics.p90TicketDurationMs, true);
            metricNodes['handled-time'].textContent = engine.formatDuration(metrics.totalHandledMs);
            metricNodes['estimated-time'].textContent = engine.formatDuration(metrics.totalEstimatedHandledMs);
            metricNodes['occupancy-rate'].textContent = `${metrics.utilizationRate}%`;

            auxList.replaceChildren();
            auxList.appendChild(row('وقت العمل المحسوب', engine.formatDuration(metrics.totalOnlineMs), 'aux-row'));
            Object.entries(metrics.workStatusBreakdown || {}).forEach(([name, duration]) => {
                auxList.appendChild(row(`↳ ${name}`, engine.formatDuration(duration), 'aux-row'));
            });
            (metrics.breakBudget.entries || []).forEach(entry => {
                const suffix = entry.overageMs > 0
                    ? ` — تجاوز ${engine.formatDuration(entry.overageMs)}`
                    : ` — متبقي ${engine.formatDuration(entry.remainingMs)}`;
                auxList.appendChild(row(`Break ${entry.index}`, `${engine.formatDuration(entry.durationMs)} / ${engine.formatDuration(entry.allowanceMs)}${suffix}`, 'aux-row'));
            });
            (metrics.lunchBudget.entries || []).forEach(entry => {
                const suffix = entry.overageMs > 0
                    ? ` — تجاوز ${engine.formatDuration(entry.overageMs)}`
                    : ` — متبقي ${engine.formatDuration(entry.remainingMs)}`;
                const label = entry.index === 1 ? 'Lunch' : `Lunch إضافي ${entry.index}`;
                auxList.appendChild(row(label, `${engine.formatDuration(entry.durationMs)} / ${engine.formatDuration(entry.allowanceMs)}${suffix}`, 'aux-row'));
            });
            auxList.appendChild(row('إجمالي الراحة', `${engine.formatDuration(metrics.restBudget.usedMs)} / ${engine.formatDuration(metrics.restBudget.allowanceMs)}`, 'aux-row'));
            if (metrics.restBudget.overageMs > 0) {
                auxList.appendChild(row('تجاوز وقت الراحة', engine.formatDuration(metrics.restBudget.overageMs), 'aux-row'));
            } else {
                auxList.appendChild(row('المتبقي من الراحة', engine.formatDuration(metrics.restBudget.remainingMs), 'aux-row'));
            }

            ticketsList.replaceChildren();
            const sessions = metrics.sessions.slice().sort((a, b) => (b.linkedAt || b.unlinkedAt || 0) - (a.linkedAt || a.unlinkedAt || 0));
            sessions.forEach(session => {
                const item = create('div', 'ticket-row');
                const id = create('div', 'ticket-id', session.ticketId || 'ID غير ظاهر');
                const knownUrl = runtimeState.ticketLinks.get(String(session.ticketId || '').toLowerCase());
                if (knownUrl) {
                    const link = create('a', 'ticket-id', session.ticketId);
                    link.href = knownUrl;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    id.replaceChildren(link);
                }
                const times = create('div', 'ticket-time', `${formatClock(session.linkedAt)} ← ${formatClock(session.unlinkedAt)}`);
                const duration = create('div', 'ticket-time', engine.formatDuration(session.durationMs, true));
                let chipClass = 'missing';
                let chipText = 'ناقص';
                if (session.endKind === 'explicit') { chipClass = 'ok'; chipText = 'مؤكد'; }
                else if (session.durationMs != null) { chipClass = 'estimate'; chipText = session.endKind === 'open' ? 'مفتوحة' : 'مقدّر'; }
                const chip = create('div', `chip ${chipClass}`, chipText);
                item.append(id, times, duration, chip);
                ticketsList.appendChild(item);
            });
            if (!sessions.length) ticketsList.appendChild(create('div', 'empty', 'لم تُقرأ أحداث link/unlink بعد.'));

            const quality = metrics.quality || {};
            qualityList.replaceChildren();
            qualityList.appendChild(row('اكتمال بداية الشفت', metrics.shiftStart ? 'موجودة ✅' : 'غير موجودة ⚠️'));
            qualityList.appendChild(row('اكتمال التمرير', quality.scanComplete ? 'مكتمل ✅' : 'جزئي ⚠️'));
            qualityList.appendChild(row('تغطية الأوقات', `${quality.timestampCoverage || 0}%`));
            qualityList.appendChild(row('صفوف جُمعت', String(quality.blocksCaptured || runtimeState.blocks.size)));
            qualityList.appendChild(row('تكرارات حُذفت', String(quality.duplicatesRemoved || 0)));
            qualityList.appendChild(row('جلسات مقدّرة', String(quality.estimatedSessions || 0)));
            qualityList.appendChild(row('Unlink بلا Link', String(quality.orphanUnlinks || 0)));
            qualityList.appendChild(row('تكتات أُعيد ربطها', String(metrics.repeatedTicketsCount || 0)));
            qualityList.appendChild(row('أطول جلسة', metrics.extremes.longestSession ? `${metrics.extremes.longestSession.ticketId} — ${engine.formatDuration(metrics.extremes.longestSession.durationMs, true)}` : '--'));
            qualityList.appendChild(row('أقصر جلسة', metrics.extremes.shortestSession ? `${metrics.extremes.shortestSession.ticketId} — ${engine.formatDuration(metrics.extremes.shortestSession.durationMs, true)}` : '--'));
            if (!metrics.isComplete) setStatus('النتائج جزئية: لم يظهر انتقال Offline → Online أو لم يكتمل تحميل السجل.', 'warn');
        }

        function show() {
            panel.style.display = 'flex';
            compact.style.display = 'none';
            applySavedPosition(panel);
        }

        function minimize() {
            rememberCurrentPosition(panel);
            panel.style.display = 'none';
            compact.style.display = 'flex';
            applySavedPosition(compact);
        }

        function close() {
            cancelScan();
            stopPicker();
            host.remove();
            delete window.__FAST_TOOLKIT_CRM_PROFILE_ANALYTICS__;
        }

        function readSavedPosition() {
            try {
                const value = JSON.parse(safeStorageGet(POSITION_KEY) || 'null');
                return value && Number.isFinite(value.left) && Number.isFinite(value.top) ? value : null;
            } catch (e) { return null; }
        }

        function applySavedPosition(element) {
            const pos = runtimeState.position || readSavedPosition();
            if (!pos || !element) return;
            const margin = 8;
            const width = element.offsetWidth || 470;
            const height = element.offsetHeight || 620;
            element.style.left = `${Math.min(Math.max(margin, pos.left), Math.max(margin, window.innerWidth - width - margin))}px`;
            element.style.top = `${Math.min(Math.max(margin, pos.top), Math.max(margin, window.innerHeight - height - margin))}px`;
            element.style.right = 'auto';
            element.style.bottom = 'auto';
        }

        function rememberCurrentPosition(element) {
            if (!element) return;
            const rect = element.getBoundingClientRect();
            runtimeState.position = { left: rect.left, top: rect.top };
            safeStorageSet(POSITION_KEY, JSON.stringify(runtimeState.position));
        }

        function makeDraggable(handle, element) {
            handle.addEventListener('pointerdown', event => {
                if (event.target && event.target.closest && event.target.closest('button')) return;
                const rect = element.getBoundingClientRect();
                const startX = event.clientX;
                const startY = event.clientY;
                const originLeft = rect.left;
                const originTop = rect.top;
                const onMove = moveEvent => {
                    element.style.left = `${originLeft + moveEvent.clientX - startX}px`;
                    element.style.top = `${originTop + moveEvent.clientY - startY}px`;
                    element.style.right = 'auto';
                    element.style.bottom = 'auto';
                };
                const onUp = () => {
                    document.removeEventListener('pointermove', onMove, true);
                    document.removeEventListener('pointerup', onUp, true);
                    rememberCurrentPosition(element);
                };
                document.addEventListener('pointermove', onMove, true);
                document.addEventListener('pointerup', onUp, true);
            });
        }
        makeDraggable(header, panel);

        function isScrollable(element) {
            if (!element || element === document.body || element === document.documentElement) return false;
            try {
                const styleValue = window.getComputedStyle(element);
                return /(auto|scroll)/.test(styleValue.overflowY || '') && element.scrollHeight > element.clientHeight + 8;
            } catch (e) { return element.scrollHeight > element.clientHeight + 8; }
        }

        function findScrollable(element) {
            let current = element;
            while (current && current !== document.body && current !== document.documentElement) {
                if (isScrollable(current)) return current;
                current = current.parentElement;
            }
            return element && element !== host ? element : null;
        }

        function bestScrollableWithin(rootElement) {
            if (!rootElement) return null;
            if (isScrollable(rootElement)) return rootElement;
            let best = null;
            let bestRange = 0;
            Array.from(rootElement.querySelectorAll('*')).slice(0, 1800).forEach(element => {
                const range = (element.scrollHeight || 0) - (element.clientHeight || 0);
                if (range > bestRange && isScrollable(element)) {
                    best = element;
                    bestRange = range;
                }
            });
            return best || rootElement;
        }

        function buildStableSelector(element) {
            if (!element) return '';
            if (element.id && !/^fastToolkit/.test(element.id)) return `#${CSS.escape(element.id)}`;
            const testId = element.getAttribute && element.getAttribute('data-testid');
            if (testId) return `[data-testid="${String(testId).replace(/"/g, '\\"')}"]`;
            return '';
        }

        function setTarget(element, selector) {
            const chosen = bestScrollableWithin(findScrollable(element) || element);
            if (!chosen) return false;
            runtimeState.target = chosen;
            runtimeState.targetSelector = selector || buildStableSelector(chosen);
            if (runtimeState.targetSelector) safeStorageSet(SELECTOR_KEY, runtimeState.targetSelector);
            const descriptor = chosen.getAttribute && (chosen.getAttribute('data-testid') || chosen.getAttribute('aria-label'));
            setStatus(`تم تحديد المربع${descriptor ? `: ${descriptor}` : ''}. اضغط «سحب وتحليل».`, 'good');
            return true;
        }

        function autoDetectTarget() {
            const savedSelector = safeStorageGet(SELECTOR_KEY);
            if (savedSelector) {
                try {
                    const saved = document.querySelector(savedSelector);
                    if (saved && !host.contains(saved)) return setTarget(saved, savedSelector);
                } catch (e) {}
            }
            const aside = document.querySelector('[data-testid="object-aside"]');
            if (aside) return setTarget(aside, '[data-testid="object-aside"]');
            const candidates = Array.from(document.querySelectorAll('aside,[role="group"],[data-testid]')).slice(0, 1200);
            let best = null;
            let bestScore = 0;
            candidates.forEach(element => {
                if (host.contains(element)) return;
                const text = engine.normalizeAuditText(element.innerText || '').slice(0, 12000);
                let score = 0;
                if (/Status\s+Changed\s+At/i.test(text)) score += 4;
                if (/This\s+User\s+(?:linked|unlinked)/i.test(text)) score += 4;
                if (/Last\s+assigned\s+at/i.test(text)) score += 2;
                if (score > bestScore) { best = element; bestScore = score; }
            });
            return best ? setTarget(best) : false;
        }

        function stopPicker() {
            if (runtimeState.pickerCleanup) runtimeState.pickerCleanup();
            runtimeState.pickerCleanup = null;
        }

        function startPicker() {
            stopPicker();
            setStatus('حرّك المؤشر ثم انقر داخل مربع سجل النشاط. زر Esc يلغي التحديد.', 'warn');
            const outline = document.createElement('div');
            outline.style.position = 'fixed';
            outline.style.zIndex = '2147483646';
            outline.style.pointerEvents = 'none';
            outline.style.border = '3px solid #22c55e';
            outline.style.background = 'rgba(34,197,94,.08)';
            outline.style.borderRadius = '8px';
            outline.style.display = 'none';
            document.documentElement.appendChild(outline);
            let hovered = null;
            const resolveElement = event => {
                const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
                return path.find(item => item && item.nodeType === 1 && item !== host && !host.contains(item) && item !== outline) || null;
            };
            const onMove = event => {
                hovered = resolveElement(event);
                if (!hovered) return;
                const suggested = findScrollable(hovered) || hovered;
                const rect = suggested.getBoundingClientRect();
                outline.style.display = 'block';
                outline.style.left = `${rect.left}px`;
                outline.style.top = `${rect.top}px`;
                outline.style.width = `${rect.width}px`;
                outline.style.height = `${rect.height}px`;
            };
            const cleanup = () => {
                document.removeEventListener('pointermove', onMove, true);
                document.removeEventListener('click', onClick, true);
                document.removeEventListener('keydown', onKey, true);
                outline.remove();
            };
            const onClick = event => {
                const selected = findScrollable(resolveElement(event) || hovered) || hovered;
                if (!selected) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                cleanup();
                runtimeState.pickerCleanup = null;
                setTarget(selected);
            };
            const onKey = event => {
                if (event.key !== 'Escape') return;
                cleanup();
                runtimeState.pickerCleanup = null;
                setStatus('تم إلغاء التحديد.', 'warn');
            };
            runtimeState.pickerCleanup = cleanup;
            document.addEventListener('pointermove', onMove, true);
            document.addEventListener('click', onClick, true);
            document.addEventListener('keydown', onKey, true);
        }

        function captureVisibleBlocks(target) {
            const selectors = '[data-testid*="activity" i],[data-testid*="audit" i],[role="group"],article,li';
            let candidates = [];
            try { candidates = Array.from(target.querySelectorAll(selectors)); } catch (e) {}
            const relevant = candidates.filter(element => {
                const text = engine.normalizeAuditText(element.innerText || element.textContent || '');
                return text.length > 5 && text.length < 30000 && /(Status\s*:|Last\s+assigned\s+at|This\s+User\s+(?:linked|unlinked))/i.test(text);
            });
            const deepest = relevant.filter(element => !relevant.some(other => other !== element && element.contains(other)));
            const source = deepest.length ? deepest : [target];
            let capturedChars = Array.from(runtimeState.blocks.values()).reduce((sum, item) => sum + item.text.length, 0);
            source.forEach((element, index) => {
                if (capturedChars >= MAX_CAPTURE_CHARS) return;
                const text = engine.normalizeAuditText(element.innerText || element.textContent || '');
                if (!text || !/(Status\s*:|Last\s+assigned\s+at|This\s+User\s+(?:linked|unlinked))/i.test(text)) return;
                const domId = element.getAttribute && (element.getAttribute('data-id') || element.getAttribute('data-testid') || element.id);
                const id = `${domId || 'row'}-${engine.hashString(text)}`;
                if (!runtimeState.blocks.has(id)) {
                    runtimeState.blocks.set(id, { id, stableDomId: domId || '', text, order: runtimeState.blocks.size + index });
                    capturedChars += text.length;
                }
                try {
                    Array.from(element.querySelectorAll('a[href]')).forEach(anchor => {
                        const idMatch = String(anchor.textContent || anchor.href || '').match(/\b([A-Za-z0-9][A-Za-z0-9_-]{5,})\b/);
                        if (!idMatch) return;
                        const url = new URL(anchor.href, window.location.href);
                        if (url.protocol === 'https:' && (url.hostname === 'crm.tabby.sa' || url.hostname === 'crm.tabby.ai')) {
                            runtimeState.ticketLinks.set(idMatch[1].toLowerCase(), url.href);
                        }
                    });
                } catch (e) {}
            });
        }

        function waitForQuiet(target, signal) {
            return new Promise((resolve, reject) => {
                let quietTimer = null;
                let hardTimer = null;
                let observer = null;
                let settled = false;
                const finish = (error) => {
                    if (settled) return;
                    settled = true;
                    if (quietTimer) clearTimeout(quietTimer);
                    if (hardTimer) clearTimeout(hardTimer);
                    if (observer) observer.disconnect();
                    signal.removeEventListener('abort', onAbort);
                    if (error) reject(error);
                    else resolve();
                };
                const schedule = () => {
                    if (quietTimer) clearTimeout(quietTimer);
                    quietTimer = setTimeout(() => finish(), 400);
                };
                const onAbort = () => finish(new Error('scan-aborted'));
                signal.addEventListener('abort', onAbort, { once: true });
                if (typeof MutationObserver === 'function') {
                    observer = new MutationObserver(schedule);
                    try { observer.observe(target, { childList: true, subtree: true, characterData: true }); } catch (e) {}
                }
                hardTimer = setTimeout(() => finish(), 2600);
                schedule();
            });
        }

        function scanFingerprint(target) {
            const text = engine.normalizeAuditText(target.innerText || target.textContent || '');
            return [target.scrollHeight || 0, target.clientHeight || 0, text.length, text.slice(0, 120), text.slice(-120), runtimeState.blocks.size].join('|');
        }

        function cancelScan() {
            if (runtimeState.scanController) runtimeState.scanController.abort();
        }

        async function scanTimeline() {
            if (runtimeState.scanController) return;
            if (!runtimeState.target || !runtimeState.target.isConnected) {
                if (!autoDetectTarget()) {
                    startPicker();
                    return;
                }
            }
            const target = runtimeState.target;
            const controller = new AbortController();
            runtimeState.scanController = controller;
            scanButton.disabled = true;
            pickButton.disabled = true;
            cancelButton.hidden = false;
            runtimeState.blocks.clear();
            runtimeState.ticketLinks.clear();
            const startedAt = Date.now();
            const initialScrollTop = Number(target.scrollTop) || 0;
            let rounds = 0;
            let stableRounds = 0;
            let endStableSince = 0;
            let previousFingerprint = '';
            let complete = false;
            let stopReason = 'unknown';

            try {
                target.scrollTop = 0;
                await waitForQuiet(target, controller.signal);
                while (rounds < MAX_ROUNDS && Date.now() - startedAt < MAX_SCAN_MS) {
                    if (controller.signal.aborted) throw new Error('scan-aborted');
                    if (!target.isConnected) throw new Error('target-removed');
                    rounds++;
                    captureVisibleBlocks(target);
                    const parsedNow = engine.parseTimelineDetailed(Array.from(runtimeState.blocks.values()));
                    const hasShiftStart = parsedNow.events.some(event => event.type === 'status' && String(event.from || '').toLowerCase() === 'offline' && String(event.to || '').toLowerCase() === 'online');
                    const maxScroll = Math.max(0, (target.scrollHeight || 0) - (target.clientHeight || 0));
                    const atEnd = maxScroll <= 1 || (target.scrollTop || 0) >= maxScroll - 2;
                    const fingerprint = scanFingerprint(target);
                    const fingerprintUnchanged = fingerprint === previousFingerprint;
                    stableRounds = fingerprintUnchanged ? stableRounds + 1 : 0;
                    if (!atEnd) endStableSince = 0;
                    else if (!endStableSince || !fingerprintUnchanged) endStableSince = Date.now();
                    previousFingerprint = fingerprint;
                    setStatus(`جاري التحميل… الجولة ${rounds} — جُمعت ${runtimeState.blocks.size} كتلة`, 'warn');

                    if (hasShiftStart) {
                        complete = true;
                        stopReason = 'shift-start-found';
                        break;
                    }
                    if (atEnd && stableRounds >= 3 && Date.now() - endStableSince >= MIN_END_STABLE_MS) {
                        stopReason = 'end-without-shift-start';
                        break;
                    }
                    const step = Math.max(220, Math.floor((target.clientHeight || 500) * 0.78));
                    target.scrollTop = Math.min(maxScroll, (target.scrollTop || 0) + step);
                    await waitForQuiet(target, controller.signal);
                }
                if (rounds >= MAX_ROUNDS) stopReason = 'round-limit';
                else if (Date.now() - startedAt >= MAX_SCAN_MS) stopReason = 'time-limit';
                captureVisibleBlocks(target);
                runtimeState.parsed = engine.parseTimelineDetailed(Array.from(runtimeState.blocks.values()));
                runtimeState.scanInfo = {
                    complete,
                    stopReason,
                    rounds,
                    durationMs: Date.now() - startedAt,
                    blocksCaptured: runtimeState.blocks.size
                };
                runtimeState.metrics = engine.calculateMetrics(runtimeState.parsed, { scrapedAt: Date.now(), scanComplete: complete });
                renderMetrics();
                if (complete) setStatus(`اكتمل السحب: ${runtimeState.blocks.size} كتلة في ${rounds} جولة.`, 'good');
                else setStatus('اكتمل الجزء المتاح، لكن بداية Offline → Online لم تظهر؛ النتائج معلّمة كجزئية.', 'warn');
            } catch (error) {
                stopReason = error && error.message || 'scan-error';
                if (stopReason === 'scan-aborted') setStatus('تم إلغاء السحب مع الاحتفاظ بآخر نتيجة.', 'warn');
                else setStatus(`تعذر إكمال السحب: ${stopReason}`, 'bad');
            } finally {
                try { target.scrollTop = initialScrollTop; } catch (e) {}
                runtimeState.scanController = null;
                scanButton.disabled = false;
                pickButton.disabled = false;
                cancelButton.hidden = true;
            }
        }

        function buildReport() {
            const metrics = runtimeState.metrics;
            if (!metrics) return 'لا توجد نتيجة بعد.';
            const lines = [
                'إحصائيات الشفت من CRM',
                `النتيجة: ${metrics.isComplete ? 'مكتملة' : 'جزئية'}`,
                `بداية الشفت: ${engine.formatDateTime(metrics.shiftStart || metrics.provisionalShiftStart)}`,
                `نهاية/وقت السحب: ${engine.formatDateTime(metrics.shiftEnd)}`,
                `وقت العمل (Online + الحالات الأخرى): ${engine.formatDuration(metrics.totalOnlineMs)}`,
                `Break: ${engine.formatDuration(metrics.totalBreakMs)} من ${engine.formatDuration(metrics.breakBudget.allowanceMs)}`,
                `Lunch: ${engine.formatDuration(metrics.totalLunchMs)} من ${engine.formatDuration(metrics.lunchBudget.allowanceMs)}`,
                `إجمالي الراحة: ${engine.formatDuration(metrics.totalAuxMs)} من ${engine.formatDuration(metrics.restBudget.allowanceMs)}`,
                `جلسات link: ${metrics.totalSessions}`,
                `تكتات فريدة: ${metrics.uniqueTicketsCount}`,
                `جلسات مؤكدة: ${metrics.totalTicketsCompleted}`,
                `مجموع المعالجة المؤكد: ${engine.formatDuration(metrics.totalHandledMs)}`,
                `مجموع المعالجة مع التقديرات: ${engine.formatDuration(metrics.totalEstimatedHandledMs)}`,
                `متوسط المؤكد: ${engine.formatDuration(metrics.avgTicketDurationMs, true)}`,
                `الوسيط: ${engine.formatDuration(metrics.medianTicketDurationMs, true)}`,
                `P90: ${engine.formatDuration(metrics.p90TicketDurationMs, true)}`,
                `انشغال وقت العمل: ${metrics.utilizationRate}%`
            ];
            lines.push('', 'تفصيل حالات العمل:');
            Object.entries(metrics.workStatusBreakdown || {}).forEach(([name, duration]) => {
                lines.push(`${name}: ${engine.formatDuration(duration)}`);
            });
            lines.push('', 'التكتات:');
            metrics.sessions.forEach(session => {
                const kind = session.endKind === 'explicit' ? 'مؤكد' : (session.durationMs == null ? 'ناقص' : 'مقدّر');
                lines.push(`${session.ticketId || 'بدون ID'} | ${engine.formatDateTime(session.linkedAt)} → ${engine.formatDateTime(session.unlinkedAt)} | ${engine.formatDuration(session.durationMs, true)} | ${kind}`);
            });
            return lines.join('\n');
        }

        async function copyReport() {
            const report = buildReport();
            try {
                await navigator.clipboard.writeText(report);
                setStatus('تم نسخ التقرير ✅', 'good');
            } catch (e) {
                try {
                    const textarea = document.createElement('textarea');
                    textarea.value = report;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.select();
                    const copied = document.execCommand('copy');
                    textarea.remove();
                    setStatus(copied ? 'تم نسخ التقرير ✅' : 'تعذر النسخ تلقائيًا.', copied ? 'good' : 'bad');
                } catch (copyError) { setStatus('تعذر النسخ تلقائيًا.', 'bad'); }
            }
        }

        pickButton.addEventListener('click', startPicker);
        scanButton.addEventListener('click', scanTimeline);
        cancelButton.addEventListener('click', cancelScan);
        copyButton.addEventListener('click', copyReport);
        themeButton.addEventListener('click', () => applyTheme(panel.classList.contains('light') ? 'dark' : 'light'));
        minimizeButton.addEventListener('click', minimize);
        closeButton.addEventListener('click', close);
        compact.addEventListener('click', show);
        window.addEventListener('pagehide', cancelScan, { once: true });

        const api = Object.freeze({
            show,
            minimize,
            close,
            selectTarget: startPicker,
            scan: scanTimeline,
            cancel: cancelScan,
            getResult: () => ({ metrics: runtimeState.metrics, scan: runtimeState.scanInfo })
        });
        window.__FAST_TOOLKIT_CRM_PROFILE_ANALYTICS__ = api;
        show();
        if (autoDetectTarget()) {
            setTimeout(scanTimeline, 600);
        } else {
            setTimeout(startPicker, 250);
        }
        return api;
    }

    const engine = createAnalyticsEngine();

    function getRuntimeSource() {
        return `void((${crmProfileAnalyticsRuntime.toString()})(${createAnalyticsEngine.toString()},{action:'install'}));`;
    }

    function buildInlineBookmarklet() {
        return `javascript:${encodeURIComponent(getRuntimeSource())}`;
    }

    function buildBookmarklet() {
        return buildInlineBookmarklet();
    }

    function install() {
        return crmProfileAnalyticsRuntime(createAnalyticsEngine, { action: 'install' });
    }

    return Object.freeze({
        parseDateStr: engine.parseDateStr,
        formatDuration: engine.formatDuration,
        formatDateTime: engine.formatDateTime,
        normalizeAuditText: engine.normalizeAuditText,
        parseTimeline: engine.parseTimeline,
        parseTimelineDetailed: engine.parseTimelineDetailed,
        calculateMetrics: engine.calculateMetrics,
        getRuntimeSource,
        buildBookmarklet,
        buildInlineBookmarklet,
        install
    });
}));
