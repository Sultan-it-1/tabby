const appContainer = document.getElementById('appContainer');
const resultsArea = document.getElementById('results');
const finalListArea = document.getElementById('finalList');
const listCounter = document.getElementById('listCounter');
const aiBtn = document.getElementById('aiBtn');
const settingsModal = document.getElementById('settingsModal');
const geminiKeyInput = document.getElementById('geminiKeyInput');
const groqKeyInput = document.getElementById('groqKeyInput');

function showToast(message, isError = false, duration = 2500) {
    const container = document.getElementById('toastContainer');
    if (!container) return { remove: () => {}, update: () => {} };

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = message;
    
    if (isError) {
        toast.style.color = '#ff4444';
        toast.style.borderColor = 'rgba(255,68,68,0.3)';
    }

    container.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    let timeoutId;
    const remove = () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    };

    if (duration > 0) {
        timeoutId = setTimeout(remove, duration);
    }

    return {
        remove,
        update: (newMessage, newIsError) => {
            toast.innerHTML = newMessage;
            if (newIsError !== undefined) {
                toast.style.color = newIsError ? '#ff4444' : 'var(--accent-green)';
                toast.style.borderColor = newIsError ? 'rgba(255,68,68,0.3)' : 'rgba(0,200,100,0.2)';
            }
        }
    };
}

let savedAccountsList = [];
let currentProvider = localStorage.getItem('simah_ai_provider') || 'gemini';
let isAIActive = localStorage.getItem('simah_ai_pref') === 'true';
let globalVoiceSpeed = localStorage.getItem('simah_voice_speed') || '1';
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

    globalVoiceSpeed = nextSpeed;
    localStorage.setItem('simah_voice_speed', nextSpeed);
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
    showToast(`تم الحفظ — المزود: ${providerName} ✅`);
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
    const dropZone = document.getElementById('dropZone');
    dropZone.classList.add('processing');
    let loadingToast;

    if (isAIActive) {
        if (currentProvider === 'groq') {
            const groqKey = localStorage.getItem('simah_groq_key');
            if (!groqKey) {
                showToast("مفتاح Groq مفقود ❌", true);
                dropZone.classList.remove('processing');
                return;
            }
            loadingToast = showToast("جاري الاستخراج عبر Groq... 🧠", false, 0);
            await extractWithGroq(file, groqKey);
        } else {
            const apiKey = localStorage.getItem('simah_ai_key');
            if (!apiKey) {
                showToast("مفتاح Gemini مفقود ❌", true);
                dropZone.classList.remove('processing');
                return;
            }
            loadingToast = showToast("جاري الاستخراج عبر Gemini... 🧠", false, 0);
            await extractWithAI(file, apiKey);
        }
    } else {
        loadingToast = showToast("جاري استخراج البيانات... ⏳", false, 0);
        await extractWithTesseract(file);
    }
    
    if (loadingToast) loadingToast.remove();
    dropZone.classList.remove('processing');
}

async function extractWithAI(file, apiKey) {
    return new Promise((resolve) => {
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
                if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts[0].text) {
                    extractAccounts(data.candidates[0].content.parts[0].text);
                } else if (data.candidates && data.candidates[0].finishReason) {
                    showToast("تم حظر الرد من قبل AI بسبب: " + data.candidates[0].finishReason, true, 4000);
                    extractAccounts('');
                } else if (data.error) {
                    showToast("خطأ API: " + data.error.message, true, 4000);
                    extractAccounts('');
                } else {
                    extractAccounts('');
                }
            } catch (err) {
                showToast("خطأ AI: " + err.message, true, 4000);
            }
            resolve();
        };
    });
}

async function extractWithGroq(file, groqKey) {
    return new Promise((resolve) => {
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

                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error ? data.error.message : 'Unknown API Error');
                }

                recordUsage('groq');

                if (data.choices && data.choices[0].message && data.choices[0].message.content) {
                    extractAccounts(data.choices[0].message.content);
                } else {
                    extractAccounts('');
                }
            } catch (err) {
                showToast("خطأ Groq: " + err.message, true, 4000);
            }
            resolve();
        };
    });
}

// === معالجة الصورة مسبقاً بـ Canvas لرفع دقة Tesseract (Grayscale + Threshold) ===
async function preprocessImageForSimah(file) {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = Math.min(2, 1400 / Math.max(img.width, img.height));
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                const binary = gray > 140 ? 255 : 0; // أكثر تساهلاً لحروف UUID
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

async function extractWithTesseract(file) {
    try {
        const processedFile = await preprocessImageForSimah(file);
        const worker = await Tesseract.createWorker('eng');
        await worker.setParameters({ tesseract_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-' });
        const { data: { text } } = await worker.recognize(processedFile);
        await worker.terminate();
        extractAccounts(text);
    } catch (err) { showToast("فشل في القراءة ❌", true); }
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

    if (found.length > 0) {
        showToast(`وجد ${found.length} حسابات`, false);
    } else {
        showToast("لم يتم العثور على حسابات ❌", true);
    }
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
            <div id="sp_${cardId}" class="speed-toggle-btn" data-speed="${globalVoiceSpeed}" onclick="toggleSpeed('${cardId}')">×${globalVoiceSpeed}</div>
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
        showToast("تم النسخ! 📋");
        const cardEl = document.getElementById(`fc_${index}`);
        if (cardEl && !cardEl.classList.contains('copied')) {
            cardEl.classList.add('copied');
        }
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
        showToast("فشل النسخ ❌", true);
    }
    document.body.removeChild(textArea);
}

function clearFinalList() {
    savedAccountsList = [];
    renderList();
    window.speechSynthesis.cancel();
    showToast("تم مسح القائمة 🗑️");
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
