const appContainer = document.getElementById('appContainer');
const resultsArea = document.getElementById('results');
const finalListArea = document.getElementById('finalList');
const listCounter = document.getElementById('listCounter');
const statusDiv = document.getElementById('status');
const aiBtn = document.getElementById('aiBtn');
const settingsModal = document.getElementById('settingsModal');
const geminiKeyInput = document.getElementById('geminiKeyInput');
const groqKeyInput = document.getElementById('groqKeyInput');

let savedAccountsList = [];
let currentProvider = localStorage.getItem('simah_ai_provider') || 'gemini';
let isAIActive = localStorage.getItem('simah_ai_pref') === 'true';
let lastRateLimitInfo = {};
if (isAIActive && aiBtn) aiBtn.className = 'ai-btn active';

const speechDictionary = {
    '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
    '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
    '-': ' dash '
};

function toggleSpeed(cardId) {
    const btn = document.getElementById(`sp_${cardId}`);
    const speeds = ['1', '1.5', '2', '0.25', '0.5'];
    const currentSpeed = btn.getAttribute('data-speed');

    let currentIndex = speeds.indexOf(currentSpeed);
    let nextIndex = (currentIndex + 1) % speeds.length;
    let nextSpeed = speeds[nextIndex];

    btn.setAttribute('data-speed', nextSpeed);
    btn.innerText = `×${nextSpeed}`;
}

function toggleAI() {
    isAIActive = !isAIActive;
    aiBtn.className = isAIActive ? 'ai-btn active' : 'ai-btn';
    localStorage.setItem('simah_ai_pref', isAIActive);
    localStorage.setItem('simah_ai_provider', currentProvider);
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
    geminiKeyInput.value = localStorage.getItem('simah_ai_key') || '';
    groqKeyInput.value = localStorage.getItem('simah_groq_key') || '';
    switchProvider(currentProvider);
    settingsModal.style.display = 'block';
}

function closeSettings() {
    settingsModal.style.display = 'none';
}

function saveApiKey() {
    const geminiKey = geminiKeyInput.value.trim();
    const groqKey = groqKeyInput.value.trim();
    localStorage.setItem('simah_ai_key', geminiKey);
    localStorage.setItem('simah_groq_key', groqKey);
    localStorage.setItem('simah_ai_provider', currentProvider);
    closeSettings();

    const providerName = currentProvider === 'groq' ? 'Groq' : 'Gemini';
    statusDiv.innerText = `تم الحفظ — المزود: ${providerName} ✅`;
    setTimeout(() => statusDiv.innerText = "جاهز لسحب الحسابات", 2000);
}

// ======== نظام تتبع الاستخدام ========
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
    groq: { rpmLimit: 30, rpdLimit: 1000, label: 'Groq' },
    gemini: { rpmLimit: 10, rpdLimit: 1500, label: 'Gemini' }
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

    // === بار الطلبات اليومية ===
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

    // === بار طلبات الدقيقة ===
    const tokenSection = document.getElementById('tokenSection');
    tokenSection.style.display = 'block';

    const rpmMax = limits.rpmLimit;
    const rpmUsed = hourCount;
    const rpmRemaining = Math.max(0, rpmMax - rpmUsed);
    const rpmPct = rpmMax > 0 ? Math.round((rpmUsed / rpmMax) * 100) : 0;

    document.getElementById('tokenUsed').innerText = rpmUsed;
    document.getElementById('tokenMax').innerText = rpmMax;
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

document.addEventListener('paste', e => {
    const item = e.clipboardData.items[0];
    if (item && item.type.indexOf('image') !== -1) processImage(item.getAsFile());
});

function handleFileUpload(e) {
    if (e.target.files && e.target.files[0]) {
        processImage(e.target.files[0]);
        e.target.value = '';
    }
}

async function processImage(file) {
    resultsArea.innerHTML = '';

    if (isAIActive) {
        if (currentProvider === 'groq') {
            statusDiv.innerText = "جاري الاستخراج عبر Groq... 🧠";
            const groqKey = localStorage.getItem('simah_groq_key');
            if (!groqKey) {
                statusDiv.innerText = "مفتاح Groq مفقود ❌";
                return;
            }
            await extractWithGroq(file, groqKey);
        } else {
            statusDiv.innerText = "جاري الاستخراج عبر Gemini... 🧠";
            const apiKey = localStorage.getItem('simah_ai_key');
            if (!apiKey) {
                statusDiv.innerText = "مفتاح Gemini مفقود ❌";
                return;
            }
            await extractWithAI(file, apiKey);
        }
    } else {
        statusDiv.innerText = "جاري استخراج البيانات... ⏳";
        await extractWithTesseract(file);
    }
}

async function extractWithAI(file, apiKey) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
        try {
            const base64String = reader.result.split(',')[1];
            const payload = {
                contents: [{
                    parts: [
                        { text: "Extract account numbers (UUID format 8-4-4-4-12 or 20-36 continuous alphanumeric characters). Note that accounts might be wrapped/broken into multiple lines, so merge lines and clear whitespace first. Return only the extracted raw accounts separated by newlines, with NO extra text or markdown formatting." },
                        { inlineData: { mimeType: file.type, data: base64String } }
                    ]
                }]
            };

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('API Error');

            recordUsage('gemini');

            const data = await response.json();
            if (data.candidates && data.candidates[0].content.parts[0].text) {
                extractAccounts(data.candidates[0].content.parts[0].text);
            } else {
                extractAccounts('');
            }
        } catch (err) {
            statusDiv.innerText = "خطأ في المفتاح أو الـ AI ❌";
        }
    };
}

async function extractWithGroq(file, groqKey) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
        try {
            const base64Url = reader.result;
            const payload = {
                model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Extract account numbers (UUID format 8-4-4-4-12 or 20-36 continuous alphanumeric characters). Note that accounts might be wrapped/broken into multiple lines, so merge lines and clear whitespace first. Return only the extracted raw accounts separated by newlines, with NO extra text or markdown formatting.' },
                        { type: 'image_url', image_url: { url: base64Url } }
                    ]
                }]
            };

            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${groqKey}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Groq API Error');

            recordUsage('groq');

            const data = await response.json();
            if (data.choices && data.choices[0].message.content) {
                extractAccounts(data.choices[0].message.content);
            } else {
                extractAccounts('');
            }
        } catch (err) {
            statusDiv.innerText = "خطأ في مفتاح Groq أو الاتصال ❌";
        }
    };
}

async function extractWithTesseract(file) {
    try {
        const worker = await Tesseract.createWorker('eng');
        await worker.setParameters({ tesseract_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-' });
        const { data: { text } } = await worker.recognize(file);
        await worker.terminate();
        extractAccounts(text);
    } catch (err) { statusDiv.innerText = "فشل في القراءة ❌"; }
}

function extractAccounts(rawText) {
    resultsArea.innerHTML = '';
    let found = [];

    let cleanText = rawText.replace(/[ \t]+/g, '');
    const regex = /[A-Z0-9]{8}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{12}|[A-Z0-9]{20,36}/g;
    let matches = cleanText.match(regex);

    if (matches) {
        matches.forEach(acc => {
            if (!found.includes(acc)) {
                found.push(acc);
                addReviewCard(acc);
            }
        });
    }

    if (found.length === 0) {
        let ultraCleanText = rawText.replace(/[^A-Z0-9-]/g, '');
        let ultraMatches = ultraCleanText.match(/[A-Z0-9]{8}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{12}/g);
        if (ultraMatches) {
            ultraMatches.forEach(acc => {
                if (!found.includes(acc)) {
                    found.push(acc);
                    addReviewCard(acc);
                }
            });
        }
    }

    if (found.length === 0) {
        let lines = rawText.split('\n').map(l => l.replace(/[^A-Z0-9-]/g, '')).filter(l => l.length > 0);
        for (let i = 0; i < lines.length - 1; i++) {
            let combined = lines[i] + lines[i + 1];
            if (combined.length >= 30 && combined.length <= 42) {
                let cleanedCombined = combined.replace(/-+/g, '-').replace(/-$/, '');
                if (cleanedCombined.length === 36 || cleanedCombined.length === 20) {
                    addReviewCard(cleanedCombined);
                    found.push(cleanedCombined);
                    break;
                }
            }
        }
    }

    statusDiv.innerText = found.length > 0 ? `وجد ${found.length} حسابات` : "لم يتم العثور على حسابات ❌";
}

function highlightSuspectCharacters(text) {
    return text.replace(/[0DO8BIL15S]/g, m => `<span class="highlight">${m}</span>`);
}

function speakAccount(inputId, cardId) {
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();

    const textToRead = document.getElementById(inputId).value.trim().toLowerCase();
    const speedValue = parseFloat(document.getElementById(`sp_${cardId}`).getAttribute('data-speed'));

    let verbalizedText = textToRead.split('').map(char => {
        return speechDictionary[char] || ` ${char} `;
    }).join(' ');

    const utterance = new SpeechSynthesisUtterance(verbalizedText);
    utterance.lang = 'en-US';
    utterance.rate = speedValue;
    utterance.pitch = 1;

    window.speechSynthesis.speak(utterance);
}

function updateCounter(cardId) {
    const inputEl = document.getElementById(`i_${cardId}`);
    const counterEl = document.getElementById(`count_${cardId}`);
    const len = inputEl.value.trim().length;

    counterEl.innerText = len + " خانة";

    if (len === 20 || len === 36) {
        counterEl.className = 'char-counter counter-valid';
    } else {
        counterEl.className = 'char-counter counter-invalid';
    }
}

function addReviewCard(value) {
    const cardId = 'c_' + Math.random().toString(36).substr(2, 5);
    const div = document.createElement('div');
    div.className = 'card';
    div.id = cardId;
    div.innerHTML = `
    <div class="card-header">
        <div class="card-header-right">
            <button class="delete-card-btn" onclick="removeCard('${cardId}')" title="حذف وإلغاء هذه البطاقة">✕ حذف</button>
            <span class="label">| تأكيد الحساب</span>
            <span id="count_${cardId}" class="char-counter">0 خانة</span>
        </div>
        <div class="card-header-left">
            <div id="sp_${cardId}" class="speed-toggle-btn" data-speed="1" onclick="toggleSpeed('${cardId}')">×1</div>
            <button class="play-btn" onclick="speakAccount('i_${cardId}', '${cardId}')" title="استماع للحساب">🔊</button>
        </div>
    </div>
    <div class="visual-check" id="v_${cardId}">${highlightSuspectCharacters(value)}</div>
    <input type="text" class="edit-input" id="i_${cardId}" value="${value}" oninput="updateCounter('${cardId}')">
    <button class="action-btn" onclick="approve('${cardId}')">إعتماد للحفظ</button>
`;
    resultsArea.appendChild(div);

    updateCounter(cardId);
}

function removeCard(cardId) {
    document.getElementById(cardId).remove();
    window.speechSynthesis.cancel();
    if (resultsArea.children.length === 0) {
        resultsArea.innerHTML = '<div style="color: #444; text-align: center; margin-top: 15px; font-size: 10px;">بانتظار الصورة...</div>';
        statusDiv.innerText = "جاهز لسحب الحسابات";
    }
}

function approve(cardId) {
    const val = document.getElementById('i_' + cardId).value.trim().toUpperCase();
    if (val && !savedAccountsList.includes(val)) {
        savedAccountsList.push(val);
        renderList();
    }
    document.getElementById(cardId).remove();
    window.speechSynthesis.cancel();
}

function renderList() {
    listCounter.innerText = `(${savedAccountsList.length})`;
    finalListArea.innerHTML = savedAccountsList.map((acc, index) => `
    <div class="final-card" id="fc_${index}" onclick="copy('${acc}', ${index})">
        <div class="final-value">
            <span>${acc}</span>
            <span class="check-mark">✔</span>
        </div>
    </div>
`).join('');
}

function copy(val, index) {
    const proceedWithVisuals = () => {
        statusDiv.innerText = "تم النسخ! 📋";
        const cardEl = document.getElementById(`fc_${index}`);
        if (cardEl && !cardEl.classList.contains('copied')) {
            cardEl.classList.add('copied');
        }
        setTimeout(() => statusDiv.innerText = "جاهز..", 1000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(val).then(proceedWithVisuals).catch(() => fallbackCopy(val, proceedWithVisuals));
    } else {
        fallbackCopy(val, proceedWithVisuals);
    }
}

function fallbackCopy(text, callback) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        callback();
    } catch (err) {
        statusDiv.innerText = "فشل النسخ ❌";
    }
    document.body.removeChild(textArea);
}

function clearFinalList() {
    savedAccountsList = [];
    renderList();
    window.speechSynthesis.cancel();
    statusDiv.innerText = "تم مسح القائمة 🗑️";
    setTimeout(() => statusDiv.innerText = "جاهز..", 1000);
}

// Global window bindings
window.toggleSpeed = toggleSpeed;
window.toggleAI = toggleAI;
window.switchProvider = switchProvider;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveApiKey = saveApiKey;
window.toggleUsageModal = toggleUsageModal;
window.handleFileUpload = handleFileUpload;
window.speakAccount = speakAccount;
window.updateCounter = updateCounter;
window.removeCard = removeCard;
window.approve = approve;
window.copy = copy;
window.clearFinalList = clearFinalList;

// Keyboard Shortcuts for Simah Tool
document.addEventListener('keydown', (e) => {
    const shortcuts = window.getFastToolkitShortcuts ? window.getFastToolkitShortcuts() : { enabled: true, ai: 'a', settings: 's', usage: 'u', clear: 'c' };
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
        clearFinalList();
    }
});
