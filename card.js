const statusDiv = document.getElementById('status');
const dropZone = document.getElementById('dropZone');
const linkToggle = document.getElementById('linkToggle');
const outputDiv = document.getElementById('output');
const outputEdit = document.getElementById('output-edit');
const editBtn = document.getElementById('editBtn');

const aiBtn = document.getElementById('aiBtn');
const settingsModal = document.getElementById('settingsModal');
const geminiKeyInput = document.getElementById('geminiKeyInput');
const groqKeyInput = document.getElementById('groqKeyInput');

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[character]));
}

function getAiSecret(key) {
    if (typeof window.fastToolkitGetAiSecret === 'function') {
        return window.fastToolkitGetAiSecret(key);
    }
    try {
        return sessionStorage.getItem(key) || '';
    } catch (e) {
        return '';
    }
}

function setAiSecret(key, value) {
    if (typeof window.fastToolkitSetAiSecret === 'function') {
        window.fastToolkitSetAiSecret(key, value);
        return;
    }
    try {
        localStorage.removeItem(key);
        if (value) {
            sessionStorage.setItem(key, value);
        } else {
            sessionStorage.removeItem(key);
        }
    } catch (e) { }
}

function getTesseractOptions() {
    return {
        workerBlobURL: false,
        workerPath: './vendor/tesseract/worker.min.js',
        corePath: './vendor/tesseract/core',
        langPath: './vendor/tesseract/lang'
    };
}

function showToast(message, isError = false, duration = 2500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : ''}`;
    toast.innerText = message;
    container.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    if (duration > 0) {
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
    
    return {
        remove: () => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        },
        update: (newMsg, newIsError = false) => {
            toast.innerText = newMsg;
            if (newIsError) toast.classList.add('error');
            else toast.classList.remove('error');
        }
    };
}

let isEditMode = false;
let currentProvider = localStorage.getItem('simah_ai_provider') || 'gemini';
let isAIActive = localStorage.getItem('simah_ai_pref') === 'true';
const CARD_SCAN_COPY_REQUEST_KEY = 'cardScannerCopyRequest';
const CARD_SCAN_COPY_ACK_KEY = 'cardScannerCopyAck';
const AI_SCAN_TIMEOUT_MS = 45000;
const LOCAL_SCAN_TIMEOUT_MS = 60000;
let lastHandledCopyRequestAt = 0;
let activeScanContext = null;
let scanSequence = 0;
const cardUtils = window.CardScannerUtils;

if (!cardUtils) {
    throw new Error('CardScannerUtils is required before card.js');
}

if (isAIActive && aiBtn) aiBtn.className = 'ai-btn active';

function loadSavedTabbyInput() {
    const savedInput = localStorage.getItem('tabbyInput_saved');
    const inputEl = document.getElementById('tabbyInput');
    if (savedInput && inputEl && !inputEl.value) {
        inputEl.value = savedInput;
        if (window.processTabbyInput) window.processTabbyInput();
    }
}

function loadSavedCardData() {
    const saved = localStorage.getItem('cardScannerData');
    if (!saved) {
        resetCardUI();
        return;
    }
    try {
        const data = JSON.parse(saved);
        if (!data || typeof data !== 'object') {
            resetCardUI();
            return;
        }

        if (data.status === 'processing' || data.status === 'error') {
            updateUI(data.fullText || (data.status === 'processing' ? 'جاري تحليل الصورة...' : 'تعذر تحليل الصورة'), '-', '-', '-', '-');
            applyCardMeta({ network: 'unknown', status: 'unknown' });
            return;
        }

        updateUI(data.fullText, data.card, data.amount, data.time, data.date);
        applyCardMeta({
            network: data.network || cardUtils.detectMeta(data.cleanText || '').network,
            status: data.transactionStatus || cardUtils.detectMeta(data.cleanText || '').status
        });
    } catch (e) {
        resetCardUI();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initCheckoutActionModeUI();
    loadSavedTabbyInput();
    loadSavedCardData();
    handlePipCopyRequest(localStorage.getItem(CARD_SCAN_COPY_REQUEST_KEY));
});

window.addEventListener('focus', () => {
    loadSavedTabbyInput();
    handlePipCopyRequest(localStorage.getItem(CARD_SCAN_COPY_REQUEST_KEY));
});
window.addEventListener('pageshow', loadSavedTabbyInput);
window.addEventListener('storage', (event) => {
    if (event.key === 'cardScannerData') {
        if (event.newValue === null) cancelActiveScan();
        loadSavedCardData();
    }
    if (event.key === 'tabbyInput_saved') loadSavedTabbyInput();
    if (event.key === CARD_SCAN_COPY_REQUEST_KEY) handlePipCopyRequest(event.newValue);
});

outputEdit.addEventListener('input', () => {
    const parts = outputEdit.value.split('//').map(p => p.trim());
    document.getElementById('chip-amount').innerText = parts[0] !== undefined ? parts[0] : "";
    document.getElementById('chip-card').innerText = parts[1] !== undefined ? parts[1] : "";
    document.getElementById('chip-time').innerText = parts[2] !== undefined ? parts[2] : "";
    document.getElementById('chip-date').innerText = parts[3] !== undefined ? parts[3] : "";
});

function syncFromChips() {
    if (!isEditMode) return;
    const a = document.getElementById('chip-amount').innerText.trim();
    const c = document.getElementById('chip-card').innerText.trim();
    const t = document.getElementById('chip-time').innerText.trim();
    const d = document.getElementById('chip-date').innerText.trim();
    outputEdit.value = `${a} // ${c} // ${t} // ${d}`;
}

document.querySelectorAll('.chips-container .chip').forEach(chip => {
    chip.addEventListener('input', syncFromChips);
    chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            chip.blur();
        }
    });
});

async function secureCopy(text) {
    if (typeof text !== 'string' || !text) return false;
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        let textArea;
        try {
            textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.setAttribute('readonly', '');
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            return document.execCommand('copy') === true;
        } catch (fallbackError) {
            return false;
        } finally {
            if (textArea && textArea.parentNode) textArea.parentNode.removeChild(textArea);
        }
    }
}

function isInsidePipFrame() {
    try {
        if (window.fastToolkitIsPip === true || window.name === 'fast-toolkit-pip') return true;
        if (new URLSearchParams(window.location.search).get('fastToolkitPip') === '1') return true;
    } catch (e) { }

    try {
        if (window.top && window.top !== window && window.top.isPip) return true;
    } catch (e) { }

    try {
        if (window.parent && window.parent !== window && window.parent.opener) return true;
    } catch (e) { }

    try {
        if (window.opener) return true;
    } catch (e) { }

    return false;
}

function requestPipCopy(text) {
    try {
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(CARD_SCAN_COPY_REQUEST_KEY, JSON.stringify({
            requestId,
            text,
            requestedAt: Date.now()
        }));
        return requestId;
    } catch (e) {
        return null;
    }
}

function readPipCopyAck(requestId) {
    try {
        const ack = JSON.parse(localStorage.getItem(CARD_SCAN_COPY_ACK_KEY) || 'null');
        return Boolean(ack && ack.requestId === requestId && ack.copied === true);
    } catch (e) {
        return false;
    }
}

function waitForPipCopyAck(requestId, timeoutMs = 1800) {
    if (!requestId) return Promise.resolve(false);
    if (readPipCopyAck(requestId)) return Promise.resolve(true);

    return new Promise(resolve => {
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            window.removeEventListener('storage', onStorage);
            resolve(value);
        };
        const onStorage = event => {
            if (event.key === CARD_SCAN_COPY_ACK_KEY && readPipCopyAck(requestId)) finish(true);
        };
        const timer = setTimeout(() => finish(readPipCopyAck(requestId)), timeoutMs);
        window.addEventListener('storage', onStorage);
    });
}

function cleanupPipCopyRequest(requestId) {
    try {
        const current = JSON.parse(localStorage.getItem(CARD_SCAN_COPY_REQUEST_KEY) || 'null');
        if (current && current.requestId === requestId) localStorage.removeItem(CARD_SCAN_COPY_REQUEST_KEY);
        const ack = JSON.parse(localStorage.getItem(CARD_SCAN_COPY_ACK_KEY) || 'null');
        if (ack && ack.requestId === requestId) localStorage.removeItem(CARD_SCAN_COPY_ACK_KEY);
    } catch (e) { }
}

async function copyScanResult(text, requestPip = false) {
    if (!requestPip || isInsidePipFrame()) return secureCopy(text);

    const requestId = requestPipCopy(text);
    const localCopiedPromise = secureCopy(text);
    const pipCopiedPromise = waitForPipCopyAck(requestId);
    const [localCopied, pipCopied] = await Promise.all([localCopiedPromise, pipCopiedPromise]);
    cleanupPipCopyRequest(requestId);
    return localCopied || pipCopied;
}

async function copyWithToast(text, successMessage, failureMessage = 'تعذر النسخ، حاول مرة أخرى ❌') {
    const copied = await secureCopy(text);
    showToast(copied ? successMessage : failureMessage, !copied);
    return copied;
}

async function handlePipCopyRequest(rawRequest) {
    if (!isInsidePipFrame() || !rawRequest) return;
    try {
        const request = JSON.parse(rawRequest);
        if (!request || typeof request.requestId !== 'string' || typeof request.text !== 'string' || typeof request.requestedAt !== 'number') return;
        if (request.requestedAt <= lastHandledCopyRequestAt) return;
        if (Date.now() - request.requestedAt > 60000) return;

        const copied = await secureCopy(request.text);
        if (copied) {
            lastHandledCopyRequestAt = request.requestedAt;
            localStorage.setItem(CARD_SCAN_COPY_ACK_KEY, JSON.stringify({
                requestId: request.requestId,
                copied: true,
                copiedAt: Date.now()
            }));
            localStorage.removeItem(CARD_SCAN_COPY_REQUEST_KEY);
        }
    } catch (e) { }
}

document.addEventListener('paste', async (e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            processImage(items[i].getAsFile());
            break;
        }
    }
});

// === معالجة الصورة مسبقاً بـ Canvas لتحسين دقة Tesseract ===
async function preprocessImage(file) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = Math.min(2, 1200 / Math.max(img.width, img.height));
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // تحويل للرمادي وزيادة التباين
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                // تطبيق threshold للتحويل الثنائي (بالأبيض والأسود)
                const binary = gray > 128 ? 255 : 0;
                data[i] = data[i + 1] = data[i + 2] = binary;
            }
            ctx.putImageData(imageData, 0, 0);
            URL.revokeObjectURL(url);
            canvas.toBlob(resolve, 'image/png');
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
    });
}

// === سجل المسح - آخر 10 عمليات ناجحة ===
function getScanHistory() {
    try { return JSON.parse(localStorage.getItem('cardScannerHistory') || '[]'); } catch { return []; }
}

function saveScanToHistory(data) {
    if (!data || !data.card || data.card === '-' || data.card === '0000') return;
    let history = getScanHistory();
    // إزالة التكرار لنفس البطاقة والمبلغ والوقت
    history = history.filter(h => h.fullText !== data.fullText);
    history.unshift({ ...data, scannedAt: new Date().toISOString() });
    if (history.length > 10) history = history.slice(0, 10);
    localStorage.setItem('cardScannerHistory', JSON.stringify(history));
}

function activateCardScanPopup() {
    if (window.clearTabbyInput) {
        window.clearTabbyInput();
    }

    if (!isInsidePipFrame() && window.launchPip) {
        try {
            const launchResult = window.launchPip();
            if (launchResult && typeof launchResult.catch === 'function') launchResult.catch(() => { });
        } catch (e) { }
    }
}

function focusCardScanPopup() {
    try {
        if (window.activePipWindow && !window.activePipWindow.closed) {
            window.activePipWindow.focus();
        }
    } catch (e) { }
}

function setCardScannerTransientState(status, message) {
    const state = {
        status,
        fullText: message,
        card: '-',
        amount: '-',
        time: '-',
        date: '-',
        cleanText: '',
        network: 'unknown',
        transactionStatus: 'unknown',
        updatedAt: new Date().toISOString()
    };
    localStorage.setItem('cardScannerData', JSON.stringify(state));
    loadSavedCardData();
}

function createScanError(name, message) {
    const error = new Error(message);
    error.name = name;
    return error;
}

function beginScan() {
    cancelActiveScan(false);
    activeScanContext = {
        id: ++scanSequence,
        controller: new AbortController(),
        loadingToast: null,
        timedOut: false
    };
    dropZone.classList.add('active', 'processing');
    return activeScanContext;
}

function isCurrentScan(context) {
    return Boolean(context && activeScanContext && context.id === activeScanContext.id);
}

function cancelActiveScan(removeProcessing = true) {
    if (activeScanContext) {
        try { activeScanContext.controller.abort(); } catch (e) { }
        if (activeScanContext.loadingToast) activeScanContext.loadingToast.remove();
        activeScanContext = null;
    }
    if (removeProcessing) dropZone.classList.remove('active', 'processing');
}

function finishScan(context) {
    if (context && context.loadingToast) context.loadingToast.remove();
    if (isCurrentScan(context)) {
        activeScanContext = null;
        dropZone.classList.remove('active', 'processing');
    }
}

function runWithScanDeadline(taskPromise, context, timeoutMs = AI_SCAN_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let timer;

        const finish = (handler, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            context.controller.signal.removeEventListener('abort', onAbort);
            handler(value);
        };

        const onAbort = () => finish(reject, createScanError('AbortError', 'تم إلغاء العملية'));
        context.controller.signal.addEventListener('abort', onAbort, { once: true });

        timer = setTimeout(() => {
            context.timedOut = true;
            finish(reject, createScanError('TimeoutError', 'انتهت مهلة التحليل'));
            try { context.controller.abort(); } catch (e) { }
        }, timeoutMs);

        Promise.resolve(taskPromise).then(
            value => finish(resolve, value),
            error => finish(reject, error)
        );
    });
}

async function processImage(file) {
    if (!file || typeof file.type !== 'string' || !file.type.startsWith('image/')) {
        showToast('الملف المحدد ليس صورة صالحة ❌', true);
        return false;
    }

    const provider = currentProvider === 'groq' ? 'groq' : 'gemini';
    const apiKey = isAIActive
        ? getAiSecret(provider === 'groq' ? 'simah_groq_key' : 'simah_ai_key')
        : '';

    if (isAIActive && !apiKey) {
        const message = `مفتاح ${provider === 'groq' ? 'Groq' : 'Gemini'} مفقود`;
        setCardScannerTransientState('error', `فشل التحليل: ${message}`);
        showToast(`${message} ❌`, true);
        return false;
    }

    const context = beginScan();

    try {
        if (isAIActive) {
            context.loadingToast = showToast(`جاري الاستخراج عبر ${provider === 'groq' ? 'Groq' : 'Gemini'}... 🧠`, false, 0);
            setCardScannerTransientState('processing', 'جاري تحليل الصورة بالـ AI...');
            activateCardScanPopup();

            const extraction = provider === 'groq'
                ? extractCardWithGroq(file, apiKey, context.controller.signal)
                : extractCardWithAI(file, apiKey, context.controller.signal);
            const aiText = await runWithScanDeadline(extraction, context);
            if (!isCurrentScan(context)) return false;

            const parsed = await parseAIResult(aiText);
            if (!parsed) throw createScanError('InvalidAIResult', 'نتيجة AI غير مكتملة أو غير صالحة');
        } else {
            context.loadingToast = showToast('جاري معالجة الصورة... 🔧', false, 0);
            setCardScannerTransientState('processing', 'جاري قراءة الصورة...');
            const localExtraction = (async () => {
                const processedFile = await preprocessImage(file);
                if (context.controller.signal.aborted) throw createScanError('AbortError', 'تم إلغاء العملية');
                context.loadingToast.update('جاري القراءة... ⏳');
                const result = await Tesseract.recognize(processedFile, 'eng+ara', getTesseractOptions());
                return result?.data?.text || '';
            })();
            const text = await runWithScanDeadline(localExtraction, context, LOCAL_SCAN_TIMEOUT_MS);
            if (!isCurrentScan(context)) return false;
            const parsed = await parseData(text);
            if (!parsed) throw createScanError('InvalidOCRResult', 'تعذر استخراج بيانات مكتملة من الصورة');
        }

        return true;
    } catch (error) {
        if (!isCurrentScan(context)) return false;
        if (error && error.name === 'AbortError' && !context.timedOut) return false;

        const message = error && error.message ? error.message : 'تعذر تحليل الصورة';
        setCardScannerTransientState('error', `فشل التحليل: ${message}`);
        showToast(message + ' ❌', true, 5000);
        return false;
    } finally {
        finishScan(context);
    }
}

function applyCardMeta(meta = {}, isNewScan = false) {
    const badge = document.getElementById('declineBadge');
    const networkBadge = document.getElementById('networkBadge');
    const status = cardUtils.normalizeStatus(meta.status || '');
    const network = cardUtils.normalizeNetwork(meta.network || '');

    badge.style.display = status === 'declined' ? 'inline-flex' : 'none';

    networkBadge.style.display = 'none';
    networkBadge.innerHTML = '';
    if (network === 'apple pay') {
        networkBadge.style.background = '#fff';
        networkBadge.style.color = '#000';
        networkBadge.style.border = '1px solid #ccc';
        networkBadge.innerHTML = `<img src="Apple.png?v=${typeof APP_VERSION !== 'undefined' ? APP_VERSION : '1.0.0'}" height="12" style="display: block;">`;
        networkBadge.style.display = 'inline-flex';
        networkBadge.style.fontStyle = 'normal';
        networkBadge.setAttribute('dir', 'ltr');
        updateCheckoutOptionsForApplePay(true, isNewScan);
    } else if (network === 'mada') {
        networkBadge.style.background = '#00c853';
        networkBadge.style.color = '#fff';
        networkBadge.style.border = 'none';
        networkBadge.innerHTML = 'mada';
        networkBadge.style.display = 'inline-flex';
        networkBadge.style.fontStyle = 'normal';
        networkBadge.setAttribute('dir', 'ltr');
        updateCheckoutOptionsForApplePay(false, isNewScan);
    } else if (network === 'visa') {
        networkBadge.style.background = '#1a1f71';
        networkBadge.style.color = '#fff';
        networkBadge.style.border = 'none';
        networkBadge.innerHTML = 'VISA';
        networkBadge.style.display = 'inline-flex';
        networkBadge.style.fontStyle = 'italic';
        networkBadge.setAttribute('dir', 'ltr');
        updateCheckoutOptionsForApplePay(false, isNewScan);
    } else if (network === 'mastercard') {
        networkBadge.style.background = '#ff5f00';
        networkBadge.style.color = '#fff';
        networkBadge.style.border = 'none';
        networkBadge.innerHTML = 'MasterCard';
        networkBadge.style.display = 'inline-flex';
        networkBadge.style.fontStyle = 'normal';
        networkBadge.setAttribute('dir', 'ltr');
        updateCheckoutOptionsForApplePay(false, isNewScan);
    } else {
        updateCheckoutOptionsForApplePay(false, isNewScan);
    }
}

async function commitScanResult(result, options = {}) {
    const savedData = {
        status: 'ready',
        fullText: result.fullText,
        card: result.card,
        amount: result.amount,
        time: result.time,
        date: result.date,
        cleanText: result.cleanText,
        network: result.network,
        transactionStatus: result.status,
        updatedAt: new Date().toISOString()
    };

    updateUI(result.fullText, result.card, result.amount, result.time, result.date);
    applyCardMeta({ network: result.network, status: result.status }, true);
    localStorage.setItem('cardScannerData', JSON.stringify(savedData));
    saveScanToHistory(savedData);

    if (options.requestPipCopy) focusCardScanPopup();
    const copied = await copyScanResult(result.fullText, options.requestPipCopy === true);
    if (options.openPopupAfterCopy) activateCardScanPopup();

    const successMessage = options.ai ? 'تم النسخ والتحليل بالـ AI! ✅' : 'تم النسخ والتحليل! ✅';
    showToast(copied ? successMessage : 'تم التحليل، لكن تعذر النسخ التلقائي ❌', !copied);
    return true;
}

async function parseData(rawText) {
    const parsed = cardUtils.parseLocalOcrText(rawText, new Date());
    if (!parsed.valid || !parsed.result) return false;
    await commitScanResult(parsed.result, { ai: false, openPopupAfterCopy: true });
    return true;
}

function updateUI(fullText, card, amount, time, date) {
    outputDiv.innerText = fullText;
    document.getElementById('chip-card').innerText = card;
    document.getElementById('chip-amount').innerText = amount;
    document.getElementById('chip-time').innerText = time;
    document.getElementById('chip-date').innerText = date;
}

function resetCardUI(message = 'البيانات ستظهر هنا') {
    updateUI(message, '-', '-', '-', '-');
    applyCardMeta({ network: 'unknown', status: 'unknown' });
    outputEdit.value = '';
}

function setCardChipsEditable(enabled) {
    document.querySelectorAll('.chips-container .chip').forEach(chip => {
        chip.contentEditable = enabled ? 'true' : 'false';
    });
}

async function toggleEditMode() {
    if (!isEditMode) {
        try {
            const saved = JSON.parse(localStorage.getItem('cardScannerData') || 'null');
            if (saved && saved.status && saved.status !== 'ready') {
                showToast('لا يمكن التعديل أثناء معالجة الصورة أو بعد فشلها ❌', true);
                return;
            }
        } catch (e) { }

        isEditMode = true;
        setCardChipsEditable(true);

        // إذا كان النص هو النص الافتراضي، اجعل حقل الإدخال فارغاً للكتابة المباشرة
        if (outputDiv.innerText.includes("البيانات ستظهر هنا")) {
            outputEdit.value = "";
        } else {
            outputEdit.value = outputDiv.innerText;
        }
        outputEdit.dispatchEvent(new Event('input'));

        outputDiv.style.display = 'none';
        outputEdit.style.display = 'block';
        editBtn.innerText = '✅';
        outputEdit.focus();
    } else {
        const updatedText = outputEdit.value.trim();

        if (updatedText) {
            const parts = updatedText.split('//').map(p => p.trim());
            const amount = cardUtils.normalizeAmount(parts[0]);
            const card = cardUtils.normalizeCard(parts[1]) || (parts[1] === '0000' ? '0000' : null);
            const time = cardUtils.normalizeTime(parts[2]);
            const date = cardUtils.normalizeDate(parts[3], new Date());

            if (parts.length < 4 || amount === null || !card || !time || !date) {
                showToast('صيغة البيانات غير صالحة. استخدم: المبلغ // البطاقة // الوقت // التاريخ ❌', true, 5000);
                outputEdit.focus();
                return;
            }

            let previous = {};
            try { previous = JSON.parse(localStorage.getItem('cardScannerData') || '{}') || {}; } catch (e) { }
            const network = previous.network || cardUtils.detectMeta(previous.cleanText || '').network;
            const transactionStatus = previous.transactionStatus || cardUtils.detectMeta(previous.cleanText || '').status;
            const syncedText = `${amount} // ${card} // ${time} // ${date}`;

            isEditMode = false;
            setCardChipsEditable(false);
            outputDiv.style.display = 'block';
            outputEdit.style.display = 'none';
            editBtn.innerText = '✏️';

            updateUI(syncedText, card, amount, time, date);
            applyCardMeta({ network, status: transactionStatus });

            const savedData = {
                status: 'ready',
                fullText: syncedText,
                card: card,
                amount: amount,
                time: time,
                date: date,
                cleanText: previous.cleanText || syncedText,
                network,
                transactionStatus,
                updatedAt: new Date().toISOString()
            };
            localStorage.setItem('cardScannerData', JSON.stringify(savedData));
            saveScanToHistory(savedData);

            const copied = await secureCopy(syncedText);
            showToast(copied ? 'تم تحديث البيانات ونسخها! 💾' : 'تم تحديث البيانات، لكن تعذر النسخ ❌', !copied);
        } else {
            isEditMode = false;
            setCardChipsEditable(false);
            outputDiv.style.display = 'block';
            outputEdit.style.display = 'none';
            editBtn.innerText = '✏️';
            clearData();
        }
    }
}

function clearData() {
    cancelActiveScan();
    localStorage.removeItem('cardScannerData');
    localStorage.removeItem(CARD_SCAN_COPY_REQUEST_KEY);
    localStorage.removeItem(CARD_SCAN_COPY_ACK_KEY);
    resetCardUI();

    if (isEditMode) {
        isEditMode = false;
        setCardChipsEditable(false);
        outputDiv.style.display = 'block';
        outputEdit.style.display = 'none';
        editBtn.innerText = '✏️';
    }

    if (window.clearTabbyInput) {
        window.clearTabbyInput();
    }

    showToast("تم مسح البيانات 🗑️");
}

function toggleCheckoutParam(param) {
    const key = param.charAt(0).toUpperCase() + param.slice(1);
    const chk = document.getElementById('chk' + key);
    const lbl = document.getElementById('lblChk' + key);
    if (chk && lbl) {
        chk.checked = !chk.checked;
        if (chk.checked) {
            lbl.classList.add('active');
        } else {
            lbl.classList.remove('active');
        }
    }
}

function updateCheckoutOptionsForApplePay(isApplePay) {
    const chkCard = document.getElementById('chkCard');
    const chkDate = document.getElementById('chkDate');
    const chkAmount = document.getElementById('chkAmount');
    
    const lblCard = document.getElementById('lblChkCard');
    const lblDate = document.getElementById('lblChkDate');
    const lblAmount = document.getElementById('lblChkAmount');
    
    if (isApplePay) {
        if (chkCard) chkCard.checked = false;
        if (chkDate) chkDate.checked = true;
        if (chkAmount) chkAmount.checked = true;

        if (lblCard) lblCard.classList.remove('active');
        if (lblDate) lblDate.classList.add('active');
        if (lblAmount) lblAmount.classList.add('active');
    } else {
        if (chkCard) chkCard.checked = true;
        if (chkDate) chkDate.checked = true;
        if (chkAmount) chkAmount.checked = true;

        if (lblCard) lblCard.classList.add('active');
        if (lblDate) lblDate.classList.add('active');
        if (lblAmount) lblAmount.classList.add('active');
    }
}

function openCheckoutDirectly(copyOnly = false) {
    const card = document.getElementById('chip-card').innerText.trim();
    const amount = document.getElementById('chip-amount').innerText.trim();
    const date = document.getElementById('chip-date').innerText.trim();
    
    const useCard = document.getElementById('chkCard')?.checked ?? true;
    const useDate = document.getElementById('chkDate')?.checked ?? true;
    const useAmount = document.getElementById('chkAmount')?.checked ?? true;
    
    let c = (card && card !== "-" && card !== "0000") ? card : "";
    let a = (amount && amount !== "-" && amount !== "0.00") ? amount : "";
    let d = (date && date !== "-" && date !== "00-00") ? date : "";
    
    let checkoutUrl = "https://dashboard.checkout.com/payments/all-payments?";
    let params = [];
    
    if (useAmount && a) {
        params.push(`amount=${a}`);
        const isApplePay = document.getElementById('networkBadge').innerHTML.toLowerCase().includes('apple');
        if (isApplePay) {
            params.push(`currency=SAR`);
        }
    }

    if (useCard && c) {
        params.push(`card=${c}`);
    }

    if (useDate && d) {
        const parts = d.split(/[-/]/);
        let day = parts[0] || "", month = parts[1] || "", year = parts[2] || new Date().getFullYear().toString();
        if (year.length === 2) year = "20" + year;
        day = day.padStart(2, '0');
        month = month.padStart(2, '0');
        if (day && month) {
            const formattedDate = `${year}${month}${day}`;
            params.push(`date=${formattedDate}..${formattedDate}`);
        }
    }

    if (params.length > 0) {
        checkoutUrl += params.join('&');
    } else {
        checkoutUrl = checkoutUrl.replace(/\?$/, '');
    }
    
    if (copyOnly) {
        copyWithToast(checkoutUrl, 'تم نسخ رابط Checkout 🔗');
    } else {
        if (linkToggle && linkToggle.checked) {
            window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
        } else {
            copyWithToast(checkoutUrl, 'تم نسخ رابط Checkout 🔍');
            window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
        }
    }
}

let checkoutActionMode = localStorage.getItem('checkout_action_mode') || 'copy';

function initCheckoutActionModeUI() {
    const toggleBtn = document.getElementById('btnCheckoutMode');
    const actionBtn = document.getElementById('btnExecuteCheckout');
    if (!toggleBtn || !actionBtn) return;

    if (checkoutActionMode === 'open') {
        toggleBtn.innerText = '🚀 فتح';
        toggleBtn.style.color = '#00e676';
        toggleBtn.style.borderColor = '#00e676';
        actionBtn.innerHTML = '🚀 فتح البحث في Checkout';
    } else {
        toggleBtn.innerText = '📋 نسخ';
        toggleBtn.style.color = 'var(--accent-blue, #00d4ff)';
        toggleBtn.style.borderColor = 'var(--accent-blue, #00d4ff)';
        actionBtn.innerHTML = '📋 نسخ رابط البحث في Checkout';
    }
}

function toggleCheckoutActionMode() {
    checkoutActionMode = checkoutActionMode === 'copy' ? 'open' : 'copy';
    localStorage.setItem('checkout_action_mode', checkoutActionMode);
    initCheckoutActionModeUI();
    showToast(checkoutActionMode === 'open' ? 'تم التغيير إلى: 🚀 فتح الرابط مباشرة' : 'تم التغيير إلى: 📋 نسخ الرابط');
}

function executeCheckoutAction() {
    const copyOnly = (checkoutActionMode === 'copy');
    openCheckoutDirectly(copyOnly);
}

window.toggleCheckoutParam = toggleCheckoutParam;
window.updateCheckoutOptionsForApplePay = updateCheckoutOptionsForApplePay;
window.openCheckoutDirectly = openCheckoutDirectly;
window.toggleCheckoutActionMode = toggleCheckoutActionMode;
window.executeCheckoutAction = executeCheckoutAction;

function openGateway(url, name) {
    const card = document.getElementById('chip-card').innerText.trim();
    const amount = document.getElementById('chip-amount').innerText.trim();
    const time = document.getElementById('chip-time').innerText.trim();
    const date = document.getElementById('chip-date').innerText.trim();
    
    const isApplePay = document.getElementById('networkBadge').innerHTML.toLowerCase().includes('apple');
    
    let c = (card && card !== "-" && card !== "0000") ? card : "";
    let a = (amount && amount !== "-" && amount !== "0.00") ? amount : "";
    let ti = (time && time !== "-" && time !== "00:00") ? time : "";
    let d = (date && date !== "-" && date !== "00-00") ? date : "";
    
    if (name === 'checkout') {
        if (linkToggle.checked) {
            openCheckoutDirectly(false);
            return;
        }
    } else {
        if (linkToggle.checked && url) {
            window.open(url, '_blank', 'noopener,noreferrer');
            return;
        }
    }
    
    // Always copy the Checking text so the automation can catch it
    let copyText = `Checking ${name} gateway`;
    copyWithToast(copyText, `تم نسخ: ${copyText} 🔍`);
}

function copyMe(element) {
    if (isEditMode) return;
    if (element.innerText === "-") return;
    copyWithToast(element.innerText, `نسخ: ${element.innerText}`);
}

function copyFull() {
    if (isEditMode) return;
    try {
        const saved = JSON.parse(localStorage.getItem('cardScannerData') || 'null');
        if (!saved || (saved.status && saved.status !== 'ready')) {
            showToast('لا توجد نتيجة جاهزة للنسخ ❌', true);
            return;
        }
    } catch (e) {
        showToast('لا توجد نتيجة جاهزة للنسخ ❌', true);
        return;
    }
    const text = outputDiv.innerText;
    if (text.includes("البيانات")) return;
    copyWithToast(text, 'تم نسخ السطر كاملاً');
}

function copyFriendlySummary() {
    if (isEditMode) return;
    const card = document.getElementById('chip-card').innerText.trim();
    const amount = document.getElementById('chip-amount').innerText.trim();
    const time = document.getElementById('chip-time').innerText.trim();
    const date = document.getElementById('chip-date').innerText.trim();

    if (card === "-" && amount === "-" && time === "-" && date === "-") {
        showToast("لا توجد بيانات لنسخها! ❌", true);
        return;
    }

    let fullDate = date;
    if (date && date !== "-") {
        const parts = date.split(/[-/]/);
        if (parts.length === 2) {
            const currentYearStr = new Date().getFullYear();
            fullDate = `${date}-${currentYearStr}`;
        }
    }

    let summary = `Here are the transaction details:\nAmount: ${amount}\nCard ending in: ${card}\nTime: ${time}\nDate: ${fullDate}`;
    
    // Add Apple Pay / Declined status as requested
    const isApplePay = document.getElementById('networkBadge').innerHTML.includes('Apple.png');
    const isDeclined = document.getElementById('declineBadge').style.display !== 'none';
    
    if (isApplePay && isDeclined) {
        summary += `\nType: Apple Pay (Declined)`;
    } else if (isApplePay) {
        summary += `\nType: Apple Pay`;
    } else if (isDeclined) {
        summary += `\nStatus: Declined`;
    }

    copyWithToast(summary, 'تم نسخ التقرير الملخص 📋');
}

// ==========================================
// AI Extraction & Settings / Usage Sharing
// ==========================================
function toggleAI() {
    isAIActive = !isAIActive;
    localStorage.setItem('simah_ai_pref', isAIActive);
    if (isAIActive) {
        aiBtn.className = 'ai-btn active';
        showToast("تم تفعيل الـ AI للاستخراج 🧠");
    } else {
        aiBtn.className = 'ai-btn';
        showToast("تم إيقاف الـ AI (استخدام القارئ المحلي) 📁");
    }
}

function switchProvider(provider) {
    currentProvider = provider;
    document.getElementById('tabGemini').className = provider === 'gemini' ? 'provider-tab active' : 'provider-tab';
    document.getElementById('tabGroq').className = provider === 'groq' ? 'provider-tab active' : 'provider-tab';
    document.getElementById('sectionGemini').className = provider === 'gemini' ? 'provider-section active' : 'provider-section';
    document.getElementById('sectionGroq').className = provider === 'groq' ? 'provider-section active' : 'provider-section';
}

function openSettings() {
    if (typeof window.fastToolkitSetExpand === 'function') {
        window.fastToolkitSetExpand(true);
    }
    geminiKeyInput.value = getAiSecret('simah_ai_key');
    groqKeyInput.value = getAiSecret('simah_groq_key');
    switchProvider(currentProvider);
    settingsModal.style.display = 'block';
}

function closeSettings() {
    settingsModal.style.display = 'none';
}

function saveApiKey() {
    const geminiKey = geminiKeyInput.value.trim();
    const groqKey = groqKeyInput.value.trim();
    setAiSecret('simah_ai_key', geminiKey);
    setAiSecret('simah_groq_key', groqKey);
    localStorage.setItem('simah_ai_provider', currentProvider);
    closeSettings();

    const providerName = currentProvider === 'groq' ? 'Groq' : 'Gemini';
    showToast(`تم الحفظ — المزود: ${providerName} ✅`);
}

// ======== نظام تتبع الاستخدام المشترك ========
function getUsageData() {
    try {
        return JSON.parse(localStorage.getItem('simah_usage') || '{}');
    } catch { return {}; }
}

function saveUsageData(data) {
    localStorage.setItem('simah_usage', JSON.stringify(data));
}

function recordUsage(provider) {
    const now = new Date();
    const hourKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
    const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    const monthKey = `${now.getFullYear()}-${now.getMonth()}`;

    let data = getUsageData();
    if (!data[provider]) data[provider] = {};
    let p = data[provider];

    // ساعة
    if (p._hourKey !== hourKey) { p.hour = 0; p._hourKey = hourKey; }
    p.hour = (p.hour || 0) + 1;

    // يوم
    if (p._dayKey !== dayKey) { p.day = 0; p._dayKey = dayKey; }
    p.day = (p.day || 0) + 1;

    // شهر
    if (p._monthKey !== monthKey) { p.month = 0; p._monthKey = monthKey; }
    p.month = (p.month || 0) + 1;

    // إجمالي
    p.total = (p.total || 0) + 1;

    p.lastUsed = now.toISOString();
    data[provider] = p;
    saveUsageData(data);
}

const PROVIDER_LIMITS = {
    groq: { rphLimit: 1800, rpdLimit: 1000, label: 'Groq' },
    gemini: { rphLimit: 600, rpdLimit: 1500, label: 'Gemini' }
};

function toggleUsageModal() {
    const modal = document.getElementById('usageModal');
    if (modal.style.display === 'block') {
        modal.style.display = 'none';
        return;
    }
    if (typeof window.fastToolkitSetExpand === 'function') {
        window.fastToolkitSetExpand(true);
    }
    refreshUsageModal();
    modal.style.display = 'block';
}

function refreshUsageModal() {
    const data = getUsageData();
    const provider = currentProvider;
    const p = data[provider] || {};
    const limits = PROVIDER_LIMITS[provider] || PROVIDER_LIMITS.groq;
    const now = new Date();
    const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    const hourKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;

    const dayCount = p._dayKey === dayKey ? (p.day || 0) : 0;
    const hourCount = p._hourKey === hourKey ? (p.hour || 0) : 0;
    const totalCount = p.total || 0;

    document.getElementById('usageProviderTitle').innerText = `📊 استهلاك ${limits.label}`;
    document.getElementById('usageDay').innerText = dayCount;
    document.getElementById('usageTotal').innerText = totalCount;

    const reqSection = document.getElementById('reqSection');
    const noData = document.getElementById('usageNoData');
    reqSection.style.display = 'block';

    const rpdMax = limits.rpdLimit;
    const rpdUsed = dayCount;
    const rpdRemaining = Math.max(0, rpdMax - rpdUsed);
    const rpdPct = rpdMax > 0 ? Math.round((rpdUsed / rpdMax) * 100) : 0;

    document.getElementById('reqUsed').innerText = rpdUsed;
    document.getElementById('reqMax').innerText = rpdMax;
    document.getElementById('reqRemaining').innerText = `${rpdRemaining} متبقي`;
    document.getElementById('reqPercent').innerText = `${rpdPct}% مستهلك`;
    document.getElementById('reqResetTime').innerText = `يتجدد كل يوم`;

    const reqBar = document.getElementById('reqBarFill');
    reqBar.style.width = Math.min(rpdPct, 100) + '%';
    reqBar.style.background = rpdPct < 50 ? 'var(--accent-green)' : rpdPct < 80 ? '#ffcc00' : '#ff3333';

    const tokenSection = document.getElementById('tokenSection');
    tokenSection.style.display = 'block';

    const rphMax = limits.rphLimit;
    const rpmUsed = hourCount;
    const rpmRemaining = Math.max(0, rphMax - rpmUsed);
    const rpmPct = rphMax > 0 ? Math.round((rpmUsed / rphMax) * 100) : 0;

    document.getElementById('tokenUsed').innerText = rpmUsed;
    document.getElementById('tokenMax').innerText = rphMax;
    document.getElementById('tokenRemaining').innerText = `${rpmRemaining} متبقي`;
    document.getElementById('tokenPercent').innerText = `${rpmPct}% مستهلك`;
    document.getElementById('tokenResetTime').innerText = `يتجدد كل ساعة`;

    const tokenBar = document.getElementById('tokenBarFill');
    tokenBar.style.width = Math.min(rpmPct, 100) + '%';
    tokenBar.style.background = rpmPct < 50 ? 'var(--accent-green)' : rpmPct < 80 ? '#ffcc00' : '#ff3333';

    noData.style.display = 'none';

    const lastUpdate = document.getElementById('usageLastUpdate');
    if (p.lastUsed) {
        const t = new Date(p.lastUsed);
        lastUpdate.innerText = `آخر استخدام: ${t.toLocaleTimeString('ar-SA')}`;
    } else {
        lastUpdate.innerText = 'لم يتم الاستخدام بعد';
    }
}

function buildPaymentExtractionPrompt(rawText = '') {
    const currentYear = new Date().getFullYear();
    const currentYearShort = String(currentYear).slice(-2);
    const basePrompt = `Extract the payment/transaction details from this input. CRITICAL TABBY RULE: If the input contains multiple transaction messages or SMS, you MUST ONLY extract the details for the transaction that explicitly mentions 'Tabby', 'تابي', or 'tabby'. Completely ignore all other transactions. You MUST find: 1. Last 4 digits of the card number (e.g. 1234 or 9876). CARD NUMBER RULES: Rule A: The word 'عبر' or 'by' ALWAYS indicates the card; the digits immediately after 'عبر' or 'by' are the card digits. Rule B: If 'عبر' (or 'by') and 'من' (or 'from') appear on the same line, the digits after 'عبر' (or 'by') are the card, and the digits after 'من' (or 'from') are an account number; ignore those. Rule C: If 'من' (or 'from') appears WITHOUT 'عبر' (or 'by') AND without the word 'حساب' (account), then the digits after 'من' (or 'from') ARE the card number. Rule D: If 'من' (or 'from') appears with 'حساب' (account), those digits are an account number; ignore them. If no card number found by any rule, return 0000. 2. The amount of the transaction (e.g. 100.00 or 49.50). 3. The time of the transaction in HH:MM format. 4. The date of the transaction. CRITICAL YEAR/DATE RULE: The current year is ${currentYear}. In Saudi/Arabian alerts, the date is often in YY-MM-DD format where 'YY' is the year (e.g. '${currentYearShort}' for ${currentYear}) and 'DD' is the day. A 2-digit year of '${currentYearShort}' is ALWAYS the current year. If the transaction year is the current year (${currentYear} or '${currentYearShort}'), return strictly in DD-MM format (Day-Month, e.g. 22-08). If the transaction year is NOT the current year, return in DD-MM-YYYY format. 5. The card network (e.g. mada, visa, mastercard, apple pay, or unknown). CRITICAL NETWORK RULE: If both Apple Pay (or apple pay, apple, ابل باي, أبل باي, ابل, أبل) and another network (like visa, mada, mastercard) are mentioned or present, the network MUST be 'apple pay'. 6. The status of the transaction (e.g. declined or success). CRITICAL STATUS RULE: If the text mentions 'مرفوض', 'مرفوضة', 'مرفوضه', 'الرصيد غير كافي', 'insufficient', 'failed', 'فشل', 'فشلت', or any declination/failure term, the status MUST be 'declined'. If the amount, time, or date cannot be read confidently, return exactly INVALID. Otherwise return ONLY in this exact format: CARD // AMOUNT // TIME // DATE // NETWORK // STATUS. Do not write any markdown code blocks, explanation, or notes. Example output: 4321 // 125.00 // 18:34 // 18-05 // mada // success`;
    return rawText ? `${basePrompt}\n\nRAW TEXT:\n${rawText}` : basePrompt;
}

function readFileAsDataUrl(file, signal) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        let settled = false;
        const finish = (handler, value) => {
            if (settled) return;
            settled = true;
            if (signal) signal.removeEventListener('abort', onAbort);
            handler(value);
        };
        const onAbort = () => {
            try { reader.abort(); } catch (e) { }
            finish(reject, createScanError('AbortError', 'تم إلغاء قراءة الصورة'));
        };

        if (signal && signal.aborted) return onAbort();
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
        reader.onload = () => finish(resolve, String(reader.result || ''));
        reader.onerror = () => finish(reject, new Error('فشل قراءة ملف الصورة'));
        reader.onabort = () => finish(reject, createScanError('AbortError', 'تم إلغاء قراءة الصورة'));
        reader.readAsDataURL(file);
    });
}

async function extractCardWithAI(file, apiKey, signal) {
    const dataUrl = await readFileAsDataUrl(file, signal);
    const base64String = dataUrl.split(',')[1];
    if (!base64String) throw new Error('تعذر تجهيز الصورة للإرسال');

    const payload = {
        contents: [{
            parts: [
                { text: buildPaymentExtractionPrompt() },
                { inlineData: { mimeType: file.type || 'image/png', data: base64String } }
            ]
        }]
    };

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
        },
        body: JSON.stringify(payload),
        signal
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.error?.message || `خطأ Gemini (${response.status})`);
    }

    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.map(part => part?.text || '').join('\n').trim();
    if (!text) {
        const reason = candidate?.finishReason || data?.error?.message || 'استجابة Gemini فارغة';
        throw new Error(`تعذر استخراج البيانات: ${reason}`);
    }

    recordUsage('gemini');
    return text;
}

async function extractCardWithGroq(file, groqKey, signal) {
    if (typeof Tesseract === 'undefined') throw new Error('قارئ الصور المحلي غير متوفر');

    let result;
    try {
        result = await Tesseract.recognize(file, 'eng+ara', getTesseractOptions());
    } catch (error) {
        if (signal?.aborted) throw createScanError('AbortError', 'تم إلغاء العملية');
        throw new Error('تعذر قراءة نص الصورة قبل إرساله إلى Groq');
    }

    if (signal?.aborted) throw createScanError('AbortError', 'تم إلغاء العملية');
    const rawOcrText = result?.data?.text?.trim() || '';
    if (rawOcrText.length < 8 || !/\d/.test(cardUtils.normalizeDigits(rawOcrText))) {
        throw new Error('تعذر قراءة نص واضح من الصورة؛ لم يتم إرسال طلب AI');
    }

    const payload = {
        model: 'llama-3.3-70b-versatile',
        messages: [{
            role: 'user',
            content: buildPaymentExtractionPrompt(rawOcrText)
        }],
        temperature: 0
    };

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`
        },
        body: JSON.stringify(payload),
        signal
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `خطأ Groq (${response.status})`);

    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('استجابة Groq فارغة');
    recordUsage('groq');
    return text;
}

async function parseAIResult(aiText) {
    const parsed = cardUtils.parseAIResultText(aiText, new Date());
    if (!parsed.valid || !parsed.result) return false;

    await commitScanResult(parsed.result, {
        ai: true,
        requestPipCopy: !isInsidePipFrame(),
        openPopupAfterCopy: false
    });
    return true;
}


// === نافذة سجل المسح ===
function toggleHistoryModal() {
    let modal = document.getElementById('historyModal');
    if (modal) {
        modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
        if (modal.style.display === 'block') renderHistoryModal();
        return;
    }
    // إنشاء النافذة للمرة الأولى
    modal = document.createElement('div');
    modal.id = 'historyModal';
    modal.style.cssText = 'position:absolute;top:35px;left:8px;right:8px;bottom:30px;background:#151515;border:1px solid #333;border-radius:8px;padding:8px;z-index:102;box-shadow:0 4px 15px rgba(0,0,0,0.8);direction:rtl;overflow-y:auto;display:block;';
    document.querySelector('.app-container').appendChild(modal);
    renderHistoryModal();
}

function renderHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (!modal) return;
    const history = getScanHistory();
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-green').trim() || '#00ff00';
    
    if (history.length === 0) {
        modal.innerHTML = `<div style="color:#555;text-align:center;padding:20px;font-size:10px;">لا يوجد سجل مسح بعد 🕒</div><button onclick="document.getElementById('historyModal').style.display='none'" style="width:100%;padding:5px;background:rgba(255,255,255,0.05);color:#888;border:1px solid rgba(255,255,255,0.1);border-radius:6px;font-size:10px;font-weight:bold;cursor:pointer;margin-top:4px;transition:0.2s;" onmouseover="this.style.color='#fff';this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.color='#888';this.style.background='rgba(255,255,255,0.05)'">إغلاق</button>`;
        return;
    }

    modal.innerHTML = `
        <div style="font-size:10px;font-weight:bold;color:${accent};margin-bottom:8px;text-align:center;padding-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
            <span style="flex-grow:1;">🕒 آخر ${history.length} عمليات مسح</span>
            <button onclick="localStorage.removeItem('cardScannerHistory');renderHistoryModal();showToast('تم مسح السجل 🗑️');" style="background:transparent;border:none;color:#ff4444;cursor:pointer;font-size:12px;opacity:0.6;transition:0.2s;" onmouseover="this.style.opacity=1;this.style.transform='scale(1.1)'" onmouseout="this.style.opacity=0.6;this.style.transform='scale(1)'" title="مسح السجل">🗑️</button>
        </div>
        ${history.map((h, i) => {
            const t = new Date(h.scannedAt);
            const timeStr = t.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
            const dateStr = t.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
            return `<div onclick="restoreFromHistory(${i})" style="cursor:pointer;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-right:3px solid ${accent};border-radius:6px;padding:6px 8px;margin-bottom:4px;direction:ltr;transition:0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.08)';this.style.borderColor='${accent}'" onmouseout="this.style.background='rgba(255,255,255,0.02)';this.style.borderColor='rgba(255,255,255,0.05)'" title="اضغط لاستعادة وتحديد">
                <div style="font-family:monospace;font-size:11px;font-weight:bold;color:#eee;">${escapeHtml(h.fullText)}</div>
                <div style="font-size:8px;color:#777;margin-top:4px;display:flex;justify-content:space-between;"><span>${dateStr}</span><span>${timeStr}</span></div>
            </div>`;
        }).join('')}
        <button onclick="document.getElementById('historyModal').style.display='none'" style="width:100%;padding:5px;background:rgba(255,255,255,0.05);color:#888;border:1px solid rgba(255,255,255,0.1);border-radius:6px;font-size:10px;font-weight:bold;cursor:pointer;margin-top:6px;transition:0.2s;" onmouseover="this.style.color='#fff';this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.color='#888';this.style.background='rgba(255,255,255,0.05)'">إغلاق</button>
    `;
}

async function restoreFromHistory(index) {
    const history = getScanHistory();
    const h = history[index];
    if (!h) return;
    const meta = {
        network: h.network || cardUtils.detectMeta(h.cleanText || '').network,
        status: h.transactionStatus || cardUtils.detectMeta(h.cleanText || '').status
    };
    updateUI(h.fullText, h.card, h.amount, h.time, h.date);
    applyCardMeta(meta);
    const savedData = {
        status: 'ready',
        fullText: h.fullText,
        card: h.card,
        amount: h.amount,
        time: h.time,
        date: h.date,
        cleanText: h.cleanText || h.fullText,
        network: meta.network,
        transactionStatus: meta.status,
        updatedAt: new Date().toISOString()
    };
    localStorage.setItem('cardScannerData', JSON.stringify(savedData));
    const copied = await secureCopy(h.fullText);
    showToast(copied ? 'تم استعادة البيانات ونسخها! ✅' : 'تمت الاستعادة، لكن تعذر النسخ ❌', !copied);
    document.getElementById('historyModal').style.display = 'none';
}
window.restoreFromHistory = restoreFromHistory;

// Bind UI actions to window context
window.toggleHistoryModal = toggleHistoryModal;
window.toggleAI = toggleAI;
window.switchProvider = switchProvider;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveApiKey = saveApiKey;
window.toggleUsageModal = toggleUsageModal;
window.clearData = clearData;
window.toggleEditMode = toggleEditMode;
window.copyFriendlySummary = copyFriendlySummary;
window.openGateway = openGateway;
window.copyMe = copyMe;
window.copyFull = copyFull;
window.handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
        await processImage(file);
    }
};

// === Tabby Link Converter ===
window.processTabbyInput = function() {
    const inputEl = document.getElementById('tabbyInput');
    if (!inputEl) return;
    
    let input = inputEl.value;

    // Automatically strip '@' and everything after '@' in input field if present
    if (input.includes('@')) {
        input = input.split('@')[0].trim();
        inputEl.value = input;
    } else {
        input = input.trim();
    }

    const idChip = document.getElementById('chip-tabby-id');
    const linkChip = document.getElementById('chip-tabby-link');

    if (inputEl.value) {
        localStorage.setItem('tabbyInput_saved', inputEl.value);
    } else {
        localStorage.removeItem('tabbyInput_saved');
    }

    if (!input) {
        idChip.innerText = "ID";
        linkChip.innerText = "الرابط";
        linkChip.dataset.link = "";
        return;
    }

    let id = "";
    if (input.includes('customers/')) {
        const match = input.match(/customers\/([^\/\?]+)/);
        if (match) {
            id = match[1];
        } else {
            id = input.split('customers/')[1].split('?')[0].split('/')[0];
        }
    } else {
        id = input.replace(/https?:\/\/[^\s]+/, '').trim(); 
        if (!id) id = input.trim();
        id = id.split('?')[0].split('/')[0].trim();
    }

    // Double-ensure any remaining '@' is stripped from ID
    if (id.includes('@')) {
        id = id.split('@')[0].trim();
    }

    if (id) {
        idChip.innerText = id;
        linkChip.innerText = "نسخ الرابط";
        linkChip.dataset.link = `https://backoffice.tabby.sa/customers/${id}`;
        
        // Remove the popup when a user ID is pasted (closes PiP and returns to normal)
        if (window.top && window.top.isPip) {
            window.top.close();
        } else if (window.documentPictureInPicture && window.documentPictureInPicture.window) {
            window.documentPictureInPicture.window.close();
        } else if (window.closePip) {
            window.closePip();
        }
    } else {
        idChip.innerText = "غير صالح";
        linkChip.innerText = "الرابط";
        linkChip.dataset.link = "";
    }
}

window.copyTabbyId = async function() {
    const id = document.getElementById('chip-tabby-id').innerText;
    if (id === "ID" || id === "غير صالح") {
        showToast("لا يوجد ID لنسخه ❌", true);
        return;
    }
    await copyWithToast(id, 'تم نسخ الـ ID 📋');
}

window.copyTabbyLink = async function() {
    const link = document.getElementById('chip-tabby-link').dataset.link;
    if (link) {
        await copyWithToast(link, 'تم نسخ الرابط 🔗');
    } else {
        showToast("لا يوجد رابط لنسخه ❌", true);
    }
}

window.copyTabbyDetails = async function() {
    const id = document.getElementById('chip-tabby-id').innerText;
    const link = document.getElementById('chip-tabby-link').dataset.link;

    if (id === "ID" || id === "غير صالح" || !link) {
        showToast("لا توجد بيانات لنسخها ❌", true);
        return;
    }

    const details = `user id :  \n${id}\n\n${link}`;
    await copyWithToast(details, 'تم نسخ التفاصيل 📋');
}

window.clearTabbyInput = function() {
    localStorage.removeItem('tabbyInput_saved');
    const inputEl = document.getElementById('tabbyInput');
    inputEl.value = '';
    window.processTabbyInput();
    inputEl.focus();
}

// Keyboard Shortcuts for Card Scan
document.addEventListener('keydown', (e) => {
    const shortcuts = window.getFastToolkitShortcuts ? window.getFastToolkitShortcuts() : { enabled: true, ai: 'a', settings: 's', usage: 'u', clear: 'c', edit: 'e' };
    if (!shortcuts.enabled) return;

    const activeEl = document.activeElement;
    const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);

    // Escape closes modals
    if (e.key === 'Escape') {
        closeSettings();
        const usageModal = document.getElementById('usageModal');
        if (usageModal) usageModal.style.display = 'none';
        return;
    }

    if (isInput) return;
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

    const pressedKey = e.key.toLowerCase();
    if (pressedKey === shortcuts.ai.toLowerCase()) {
        toggleAI();
    } else if (pressedKey === shortcuts.settings.toLowerCase() || pressedKey === ',') {
        openSettings();
    } else if (pressedKey === shortcuts.usage.toLowerCase()) {
        toggleUsageModal();
    } else if (pressedKey === shortcuts.clear.toLowerCase()) {
        clearData();
    } else if (pressedKey === shortcuts.edit.toLowerCase()) {
        toggleEditMode();
    }
});
