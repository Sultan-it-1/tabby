const appContainer = document.getElementById('appContainer');
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

let savedProductsList = [];
let currentProvider = localStorage.getItem('simah_ai_provider') || 'gemini';
let isAIActive = localStorage.getItem('simah_pdf_ai_pref') !== 'false'; // Default true for this tool
if (isAIActive && aiBtn) aiBtn.className = 'ai-btn active';

function toggleAI() {
    isAIActive = !isAIActive;
    aiBtn.className = isAIActive ? 'ai-btn active' : 'ai-btn';
    localStorage.setItem('simah_pdf_ai_pref', isAIActive);
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

    if (p._hourKey !== hourKey) { p.hour = 0; p._hourKey = hourKey; }
    p.hour = (p.hour || 0) + 1;

    if (p._dayKey !== dayKey) { p.day = 0; p._dayKey = dayKey; }
    p.day = (p.day || 0) + 1;

    if (p._monthKey !== monthKey) { p.month = 0; p._monthKey = monthKey; }
    p.month = (p.month || 0) + 1;

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

// Drag and drop / Paste logic
document.addEventListener('paste', e => {
    const item = e.clipboardData.items[0];
    if (item && item.type === 'application/pdf') {
        processPdf(item.getAsFile());
    } else if (item && item.type.indexOf('image') !== -1) {
        showToast("الرجاء إرفاق ملف PDF بدلاً من صورة ❌", true);
    }
});

function handleFileUpload(e) {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            processPdf(file);
        } else {
            showToast("الرجاء اختيار ملف PDF ❌", true);
        }
        e.target.value = '';
    }
}

const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('processing');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('processing'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('processing');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            processPdf(file);
        } else {
            showToast("الرجاء اختيار ملف PDF ❌", true);
        }
    }
});


async function extractTextFromPdf(file) {
    return new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.onload = async function() {
            try {
                const typedarray = new Uint8Array(this.result);
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                let fullText = "";
                
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(" ");
                    fullText += pageText + "\n";
                }
                resolve(fullText);
            } catch (err) {
                reject(err);
            }
        };
        fileReader.readAsArrayBuffer(file);
    });
}

async function processPdf(file) {
    dropZone.classList.add('processing');
    let loadingToast;

    if (!isAIActive) {
        showToast("يجب تفعيل AI لاستخراج منتجات تابي بشكل دقيق ❌", true);
        dropZone.classList.remove('processing');
        return;
    }

    try {
        if (currentProvider === 'groq') {
            const groqKey = localStorage.getItem('simah_groq_key');
            if (!groqKey) {
                showToast("مفتاح Groq مفقود ❌", true);
                dropZone.classList.remove('processing');
                return;
            }
            loadingToast = showToast("جاري الاستخراج عبر Groq... 🧠", false, 0);
            const pdfText = await extractTextFromPdf(file);
            if (pdfText.trim().length < 20) {
                if (loadingToast) loadingToast.remove();
                showToast("الملف عبارة عن صور. نرجو التبديل إلى Gemini لدعم الصور ⚠️", true, 5000);
                dropZone.classList.remove('processing');
                return;
            }
            await extractWithGroq(pdfText, groqKey);
        } else {
            const apiKey = localStorage.getItem('simah_ai_key');
            if (!apiKey) {
                showToast("مفتاح Gemini مفقود ❌", true);
                dropZone.classList.remove('processing');
                return;
            }
            loadingToast = showToast("جاري القراءة والتحليل عبر Gemini... 🧠", false, 0);
            await extractWithGemini(file, apiKey);
        }
    } catch (error) {
        console.error(error);
        showToast("فشل في قراءة ملف PDF ❌", true);
    }
    
    if (loadingToast) loadingToast.remove();
    dropZone.classList.remove('processing');
}

const EXTRACT_PROMPT = `
You are a highly capable AI assistant that extracts 'Tabby' (تابي) products and the Customer ID from Simah credit reports.
Analyze the provided text from a Simah credit report.
1. Find the customer's National ID or Iqama number (usually 10 digits starting with 1 or 2, near "رقم الهوية" or "ID Number").
2. Find all mentions of Tabby products (e.g. "Tabby", "Tabby FZ LLC", "تابي").
3. Extract the product and its exact status (e.g. Active, Closed, Default, نشط, مغلق, متعثر).

Return your response in this EXACT format:
ID: [The 10-digit ID or UNKNOWN]
PRODUCTS:
[Product Name] - [Status]
[Product Name] - [Status]

If no Tabby products are found, return:
ID: [The 10-digit ID or UNKNOWN]
PRODUCTS:
NO_TABBY_PRODUCTS

Do not include any extra text, markdown, greetings, or numbering.
`;

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

async function extractWithGemini(file, apiKey) {
    try {
        const base64String = await fileToBase64(file);
        const payload = {
            contents: [{
                parts: [
                    { text: EXTRACT_PROMPT },
                    { inlineData: { mimeType: "application/pdf", data: base64String } }
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
            parseProducts(data.candidates[0].content.parts[0].text);
        } else if (data.candidates && data.candidates[0].finishReason) {
            showToast("تم حظر الرد من قبل AI بسبب: " + data.candidates[0].finishReason, true, 4000);
        } else if (data.error) {
            showToast("خطأ API: " + data.error.message, true, 4000);
        }
    } catch (err) {
        showToast("خطأ Gemini: " + err.message, true, 4000);
    }
}

async function extractWithGroq(text, groqKey) {
    try {
        const payload = {
            model: 'llama3-8b-8192', // Usually llama3-8b-8192 or llama-3.1-8b-instant works nicely for text
            messages: [{
                role: 'user',
                content: EXTRACT_PROMPT + "\n\nReport Text:\n" + text.substring(0, 15000)
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
            parseProducts(data.choices[0].message.content);
        }
    } catch (err) {
        showToast("خطأ Groq: " + err.message, true, 4000);
    }
}

let customerId = '';

function parseProducts(rawText) {
    savedProductsList = [];
    customerId = '';
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let parsingProducts = false;
    
    lines.forEach(line => {
        let cleanLine = line.replace(/\*/g, '');
        
        if (cleanLine.toUpperCase().startsWith('ID:')) {
            let extractedId = cleanLine.substring(3).trim().replace(/\D/g, '');
            if (extractedId.length >= 8) {
                customerId = extractedId;
            }
        } else if (cleanLine.toUpperCase().startsWith('PRODUCTS:')) {
            parsingProducts = true;
        } else if (parsingProducts) {
            if (cleanLine.toUpperCase() === 'NO_TABBY_PRODUCTS') {
                // Do nothing
            } else if (cleanLine.toLowerCase().includes('tabby') || cleanLine.includes('تابي')) {
                savedProductsList.push(cleanLine);
            }
        } else if (!parsingProducts && (cleanLine.toLowerCase().includes('tabby') || cleanLine.includes('تابي'))) {
            // Fallback just in case AI ignores formatting
            savedProductsList.push(cleanLine);
        }
    });

    if (savedProductsList.length > 0) {
        showToast(`وجد ${savedProductsList.length} منتجات تابي`, false);
    } else {
        showToast("لم يتم العثور على منتجات تابي ❌", true);
    }

    renderList();
}

let currentFilter = 'active_default';

function setFilter(filterType) {
    currentFilter = filterType;
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.getAttribute('data-filter') === filterType) {
            tab.classList.add('active');
        }
    });
    renderList();
}

function renderList() {
    let filteredList = savedProductsList.filter(prod => {
        const text = prod.toLowerCase();
        const isClosed = text.includes('مغلق') || text.includes('closed') || text.includes('settled') || text.includes('مسدد');
        const isDefault = text.includes('متعثر') || text.includes('default') || text.includes('late') || text.includes('متأخر') || text.includes('مشطوب');
        const isActive = text.includes('نشط') || text.includes('active') || text.includes('قائم') || text.includes('open') || text.includes('مفتوح');
        
        if (currentFilter === 'all') return true;
        if (currentFilter === 'active_default') return !isClosed;
        if (currentFilter === 'active') return isActive && !isDefault;
        if (currentFilter === 'default') return isDefault;
        if (currentFilter === 'closed') return isClosed;
        
        return true;
    });

    listCounter.innerText = `(${filteredList.length})`;
    
    let html = '';
    
    if (customerId) {
        html += `
        <div class="final-card" id="fc_id" onclick="copy('${customerId}', 'id')" style="border-right-color: #00d4ff; margin-bottom: 8px;">
            <div class="final-value" style="color: #00d4ff;">
                <span>رقم الهوية: <span style="font-family: 'Courier New', monospace; font-size: 13px;">${customerId}</span></span>
                <span class="check-mark">✔</span>
            </div>
        </div>
        `;
    }

    if (filteredList.length === 0) {
        if (savedProductsList.length > 0) {
            html += '<div style="color: #444; text-align: center; margin-top: 15px; font-size: 10px;">لا يوجد منتجات تطابق الفلتر الحالي.</div>';
        } else if (customerId) {
            html += '<div style="color: #444; text-align: center; margin-top: 15px; font-size: 10px;">لا توجد منتجات تابي مسجلة.</div>';
        } else {
            html += '<div style="color: #444; text-align: center; margin-top: 15px; font-size: 10px;">بانتظار الملف...</div>';
        }
        finalListArea.innerHTML = html;
        return;
    }

    html += filteredList.map((prod, index) => `
    <div class="final-card" id="fc_${index}" onclick="copy('${prod.replace(/'/g, "\\'")}', ${index})">
        <div class="final-value">
            <span>${prod}</span>
            <span class="check-mark">✔</span>
        </div>
    </div>
`).join('');

    finalListArea.innerHTML = html;
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
    savedProductsList = [];
    customerId = '';
    renderList();
    showToast("تم مسح القائمة 🗑️");
}

// Global window bindings
window.toggleAI = toggleAI;
window.switchProvider = switchProvider;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveApiKey = saveApiKey;
window.toggleUsageModal = toggleUsageModal;
window.handleFileUpload = handleFileUpload;
window.copy = copy;
window.clearFinalList = clearFinalList;
window.setFilter = setFilter;

// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    const shortcuts = window.getFastToolkitShortcuts ? window.getFastToolkitShortcuts() : { enabled: true, ai: 'a', settings: 's', usage: 'u', clear: 'c' };
    if (!shortcuts.enabled) return;

    const activeEl = document.activeElement;
    const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);

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
