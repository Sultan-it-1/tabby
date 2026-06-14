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
if (isAIActive && aiBtn) aiBtn.className = 'ai-btn active';

document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('cardScannerData');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            updateUI(data.fullText, data.card, data.amount, data.time, data.date);
            if (data.cleanText) detectCardMeta(data.cleanText);
        } catch (e) { }
    }
});

outputEdit.addEventListener('input', () => {
    const parts = outputEdit.value.split('//').map(p => p.trim());
    document.getElementById('chip-card').innerText = parts[0] !== undefined ? parts[0] : "";
    document.getElementById('chip-amount').innerText = parts[1] !== undefined ? parts[1] : "";
    document.getElementById('chip-time').innerText = parts[2] !== undefined ? parts[2] : "";
    document.getElementById('chip-date').innerText = parts[3] !== undefined ? parts[3] : "";
});

function syncFromChips() {
    if (!isEditMode) return;
    const c = document.getElementById('chip-card').innerText.trim();
    const a = document.getElementById('chip-amount').innerText.trim();
    const t = document.getElementById('chip-time').innerText.trim();
    const d = document.getElementById('chip-date').innerText.trim();
    outputEdit.value = `${c} // ${a} // ${t} // ${d}`;
}

document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('input', syncFromChips);
    chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            chip.blur();
        }
    });
});

async function secureCopy(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);
        return success;
    }
}

function formatAmount(amount) {
    const amountNum = parseFloat(amount);
    return isNaN(amountNum) ? "0" : (amountNum % 1 === 0 ? amountNum.toString() : amountNum.toFixed(2));
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

async function processImage(file) {
    dropZone.classList.add('active', 'processing');
    let loadingToast;
    if (isAIActive) {
        if (currentProvider === 'groq') {
            loadingToast = showToast("جاري الاستخراج عبر Groq... 🧠", false, 0);
            const groqKey = localStorage.getItem('simah_groq_key');
            if (!groqKey) {
                loadingToast.remove();
                showToast("مفتاح Groq مفقود ❌", true);
                dropZone.classList.remove('active', 'processing');
                return;
            }
            await extractCardWithGroq(file, groqKey, loadingToast);
        } else {
            loadingToast = showToast("جاري الاستخراج عبر Gemini... 🧠", false, 0);
            const apiKey = localStorage.getItem('simah_ai_key');
            if (!apiKey) {
                loadingToast.remove();
                showToast("مفتاح Gemini مفقود ❌", true);
                dropZone.classList.remove('active', 'processing');
                return;
            }
            await extractCardWithAI(file, apiKey, loadingToast);
        }
    } else {
        loadingToast = showToast("جاري معالجة الصورة... 🔧", false, 0);
        try {
            const processedFile = await preprocessImage(file);
            loadingToast.update("جاري القراءة... ⏳");
            const { data: { text } } = await Tesseract.recognize(processedFile, 'eng+ara');
            loadingToast.remove();
            parseData(text);
        } catch (err) {
            loadingToast.remove();
            showToast("خطأ في القراءة ❌", true);
        }
    }
    dropZone.classList.remove('active', 'processing');
}

function detectCardMeta(text) {
    const lowerText = text.toLowerCase();
    const badge = document.getElementById('declineBadge');
    const networkBadge = document.getElementById('networkBadge');
    if (
        lowerText.includes('decline') || 
        lowerText.includes('declined') || 
        lowerText.includes('failed') || 
        lowerText.includes('مرفوض') || 
        lowerText.includes('مرفوضة') || 
        lowerText.includes('مرفوضه') || 
        lowerText.includes('فشل') || 
        lowerText.includes('فشلت') || 
        lowerText.includes('غير كافي') || 
        lowerText.includes('غير كاف')
    ) {
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }

    networkBadge.style.display = 'none';
    // Apple Pay Priority (أولوية لـ Apple Pay في حال وجود شعارين معاً)
    if (
        lowerText.includes('apple') ||
        lowerText.includes('applepay') ||
        lowerText.includes('apple pay') ||
        lowerText.includes('ابل') ||
        lowerText.includes('أبل') ||
        lowerText.includes('ابل باي') ||
        lowerText.includes('أبل باي') ||
        lowerText.includes('ابل باى') ||
        lowerText.includes('أبل باى')
    ) {
        networkBadge.style.background = '#fff';
        networkBadge.style.color = '#000';
        networkBadge.style.border = '1px solid #ccc';
        networkBadge.innerHTML = `<img src="Apple.png?v=${typeof APP_VERSION !== 'undefined' ? APP_VERSION : '1.0.0'}" height="12" style="display: block;">`;
        networkBadge.style.display = 'inline-flex';
        networkBadge.style.fontStyle = 'normal';
        networkBadge.setAttribute('dir', 'ltr');
    } else if (lowerText.includes('mada') || lowerText.includes('مدى')) {
        networkBadge.style.background = '#00c853';
        networkBadge.style.color = '#fff';
        networkBadge.style.border = 'none';
        networkBadge.innerHTML = 'mada';
        networkBadge.style.display = 'inline-flex';
        networkBadge.style.fontStyle = 'normal';
        networkBadge.setAttribute('dir', 'ltr');
    } else if (lowerText.includes('visa') || lowerText.includes('فيزا')) {
        networkBadge.style.background = '#1a1f71';
        networkBadge.style.color = '#fff';
        networkBadge.style.border = 'none';
        networkBadge.innerHTML = 'VISA';
        networkBadge.style.display = 'inline-flex';
        networkBadge.style.fontStyle = 'italic';
        networkBadge.setAttribute('dir', 'ltr');
    } else if (lowerText.includes('mastercard') || lowerText.includes('ماستركارد')) {
        networkBadge.style.background = '#ff5f00';
        networkBadge.style.color = '#fff';
        networkBadge.style.border = 'none';
        networkBadge.innerHTML = 'MasterCard';
        networkBadge.style.display = 'inline-flex';
        networkBadge.style.fontStyle = 'normal';
        networkBadge.setAttribute('dir', 'ltr');
    }
}

function parseData(rawText) {
    const lines = rawText.split('\n');
    const cleanText = rawText.replace(/\s+/g, ' ');
    const amountMatch = cleanText.match(/\d{1,7}\.\d{2}/);
    const amount = amountMatch ? amountMatch[0] : "0.00";
    const timeMatch = cleanText.match(/\d{2}:\d{2}/);
    const time = timeMatch ? timeMatch[0] : "00:00";
    const currentYearStr = String(new Date().getFullYear()); // "2026"
    const currentYearShort = currentYearStr.slice(-2); // "26"

    let date = "00-00";
    let foundYear = "";

    // Matches patterns like YYYY-MM-DD or DD-MM-YYYY or YY-MM-DD or DD-MM-YY
    const dateMatch = cleanText.match(/(\d{2,4})[-\/](\d{1,2})[-\/](\d{2,4})/);
    if (dateMatch) {
        const part1 = dateMatch[1];
        const part2 = dateMatch[2];
        const part3 = dateMatch[3];

        let day = "";
        let year = "";

        if (part1.length === 4) {
            year = part1;
            day = part3;
        } else if (part3.length === 4) {
            year = part3;
            day = part1;
        } else {
            // Smart Heuristic: Determine YY-MM-DD vs DD-MM-YY by matching the current year ("26")
            if (part1 === currentYearShort) {
                year = part1;
                day = part3;
            } else if (part3 === currentYearShort) {
                year = part3;
                day = part1;
            } else {
                // Default assumption: DD-MM-YY
                year = part3;
                day = part1;
            }
        }

        foundYear = year;
        date = `${parseInt(day)}-${parseInt(part2)}`;
    }

    // BUG FIX 1: أي رقم سنة مختصر يساوي "26" (السنة الحالية) = نفس العام، لا يُضاف للتاريخ
    // إذا كانت السنة المكتشفة هي السنة الحالية (كاملة أو مختصرة)، لا تُضف السنة
    const isCurrentYear = (foundYear === currentYearStr) || (foundYear === currentYearShort);
    if (foundYear && !isCurrentYear) {
        date = `${date}-${foundYear}`;
    }

    // ====== قواعد استخراج رقم البطاقة ======
    // 1. "عبر" دائماً = بطاقة
    // 2. "عبر" + "من" معاً: بعد "عبر" = بطاقة، بعد "من" = حساب يُتجاهل
    // 3. "من" وحدها (بدون "عبر" وبدون "حساب") = بطاقة
    // 4. "من" + "حساب" = حساب يُتجاهل
    let card = "0000";
    const accountDigits = new Set();

    for (let line of lines) {
        const hasEbr = line.includes('عبر');
        const hasMen = line.includes('من');
        const hasHesab = line.includes('حساب');

        if (hasEbr && hasMen) {
            // قاعدة 2: "عبر" + "من": الرقم بعد "عبر" = بطاقة
            const afterEbr = line.split('عبر')[1] || '';
            const ebrMatch = afterEbr.match(/\d{4}/);
            if (ebrMatch && card === "0000") card = ebrMatch[0];
            // الأرقام بعد "من" = حساب، تُتجاهل
            const afterMen = line.split('من').pop() || '';
            const menDigits = afterMen.match(/\d+/g) || [];
            menDigits.forEach(d => accountDigits.add(d));

        } else if (hasEbr && !hasMen) {
            // قاعدة 1: "عبر" وحدها = بطاقة
            const afterEbr = line.split('عبر')[1] || '';
            const ebrMatch = afterEbr.match(/\d{4}/);
            if (ebrMatch && card === "0000") card = ebrMatch[0];

        } else if (!hasEbr && hasMen && !hasHesab) {
            // قاعدة 3: "من" وحدها بدون "عبر" وبدون "حساب" = بطاقة
            const afterMen = line.split('من').pop() || '';
            const menMatch = afterMen.match(/\d{4}/);
            if (menMatch && card === "0000") card = menMatch[0];

        } else if (!hasEbr && hasMen && hasHesab) {
            // قاعدة 4: "من" + "حساب" = أرقام حساب، تُتجاهل
            const digits = line.match(/\d+/g) || [];
            digits.forEach(d => accountDigits.add(d));
        }
    }

    const cardKeywords = ["بطاقة", "card", "mada", "مدى"];
    if (card === "0000") {
        for (let line of lines) {
            if (cardKeywords.some(key => line.toLowerCase().includes(key))) {
                const match = line.match(/\d{4}/);
                if (match) { card = match[0]; break; }
            }
        }
    }
    if (card === "0000") {
        const allFourDigits = cleanText.match(/\d{4}/g) || [];
        card = allFourDigits.find(d =>
            d !== foundYear &&
            !amount.includes(d) &&
            d !== "2026" && d !== "2025" &&
            !accountDigits.has(d)
        ) || "0000";
    }

    const formattedAmount = formatAmount(amount);
    const finalResult = `${card} // ${formattedAmount} // ${time} // ${date}`;
    updateUI(finalResult, card, formattedAmount, time, date);
    detectCardMeta(cleanText);

    const savedData = {
        fullText: finalResult,
        card: card,
        amount: formattedAmount,
        time: time,
        date: date,
        cleanText: cleanText
    };
    localStorage.setItem('cardScannerData', JSON.stringify(savedData));
    saveScanToHistory(savedData);

    showToast("تم النسخ والتحليل! ✅");
    secureCopy(finalResult);
}

function updateUI(fullText, card, amount, time, date) {
    outputDiv.innerText = fullText;
    document.getElementById('chip-card').innerText = card;
    document.getElementById('chip-amount').innerText = amount;
    document.getElementById('chip-time').innerText = time;
    document.getElementById('chip-date').innerText = date;
}

function toggleEditMode() {
    if (!isEditMode) {
        isEditMode = true;
        document.querySelectorAll('.chip').forEach(chip => chip.contentEditable = "true");

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
        isEditMode = false;
        document.querySelectorAll('.chip').forEach(chip => chip.contentEditable = "false");
        const updatedText = outputEdit.value.trim();
        outputDiv.style.display = 'block';
        outputEdit.style.display = 'none';
        editBtn.innerText = '✏️';

        if (updatedText) {
            const parts = updatedText.split('//').map(p => p.trim());
            const card = parts[0] || "0000";
            const amount = parts[1] || "0.00";
            const time = parts[2] || "00:00";
            const date = parts[3] || "00-00";

            const formattedAmount = formatAmount(amount);
            const syncedText = `${card} // ${formattedAmount} // ${time} // ${date}`;
            updateUI(syncedText, card, formattedAmount, time, date);
            detectCardMeta(syncedText);

            const savedData = {
                fullText: syncedText,
                card: card,
                amount: formattedAmount,
                time: time,
                date: date,
                cleanText: syncedText
            };
            localStorage.setItem('cardScannerData', JSON.stringify(savedData));

            secureCopy(updatedText);
            showToast("تم تحديث البيانات ونسخها! 💾");
        } else {
            // في حال مسح النص بالكامل، أعد الحالة الافتراضية
            clearData();
        }
    }
}

function clearData() {
    localStorage.removeItem('cardScannerData');
    updateUI("البيانات ستظهر هنا", "-", "-", "-", "-");
    document.getElementById('declineBadge').style.display = 'none';
    document.getElementById('networkBadge').style.display = 'none';

    if (isEditMode) {
        isEditMode = false;
        document.querySelectorAll('.chip').forEach(chip => chip.contentEditable = "false");
        outputDiv.style.display = 'block';
        outputEdit.style.display = 'none';
        editBtn.innerText = '✏️';
    }

    showToast("تم مسح البيانات 🗑️");
}

function openGateway(url, name) {
    const card = document.getElementById('chip-card').innerText.trim();
    const amount = document.getElementById('chip-amount').innerText.trim();
    const time = document.getElementById('chip-time').innerText.trim();
    const date = document.getElementById('chip-date').innerText.trim();
    
    let c = (card && card !== "-" && card !== "0000") ? card : "";
    let a = (amount && amount !== "-" && amount !== "0.00") ? amount : "";
    let ti = (time && time !== "-" && time !== "00:00") ? time : "";
    let d = (date && date !== "-" && date !== "00-00") ? date : "";
    
    let searchQuery = "";
    if (c || a || d || ti) {
        // Ensure consistent 4-part format: card // amount // time // date
        searchQuery = `${c} // ${a} // ${ti} // ${d}`;
    }

    if (linkToggle.checked) {
        window.open(url, '_blank');
    }
    
    if (searchQuery) {
        secureCopy(searchQuery).then(() => {
            showToast(`تم نسخ البيانات للبحث 🔍`);
        });
    } else {
        const msg = `Checking ${name} gateway`;
        secureCopy(msg).then(() => {
            showToast("نسخ: " + name);
        });
    }
}

function copyMe(element) {
    if (isEditMode) return;
    if (element.innerText === "-") return;
    secureCopy(element.innerText).then(() => {
        showToast(`نسخ: ${element.innerText}`);
    });
}

function copyFull() {
    if (isEditMode) return;
    const text = outputDiv.innerText;
    if (text.includes("البيانات")) return;
    secureCopy(text).then(() => {
        showToast("تم نسخ السطر كاملاً");
    });
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

    secureCopy(summary).then(() => {
        showToast("تم نسخ التقرير الملخص 📋");
    });
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

async function extractCardWithAI(file, apiKey, loadingToast) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            try {
                const base64String = reader.result.split(',')[1];
                const payload = {
                    contents: [{
                        parts: [
                            { text: "Extract the payment/transaction details from this image. You MUST find: 1. Last 4 digits of the card number (e.g. 1234 or 9876). CARD NUMBER RULES: Rule A: The word 'عبر' or 'by' ALWAYS indicates the card — the digits immediately after 'عبر' or 'by' are the card digits. Rule B: If 'عبر' (or 'by') and 'من' (or 'from') appear on the same line, the digits after 'عبر' (or 'by') are the card, and the digits after 'من' (or 'from') are an account number — ignore those. Rule C: If 'من' (or 'from') appears WITHOUT 'عبر' (or 'by') AND without the word 'حساب' (account), then the digits after 'من' (or 'from') ARE the card number. Rule D: If 'من' (or 'from') appears with 'حساب' (account), those digits are an account number — ignore them. If no card number found by any rule, return 0000. 2. The amount of the transaction (e.g. 100.00 or 49.50). 3. The time of the transaction in HH:MM format. 4. The date of the transaction. CRITICAL YEAR/DATE RULE: The current year is 2026. In Saudi/Arabian alerts, the date is often in YY-MM-DD format where 'YY' is the year (e.g. '26' for 2026) and 'DD' is the day (e.g. '22'). Example: '26-08-22' means August 22, 2026. A 2-digit year of '26' is ALWAYS the current year. If the transaction year is the current year (2026 or '26'), return strictly in DD-MM format (Day-Month, e.g. 22-08). If the transaction year is NOT the current year, return in DD-MM-YYYY format. 5. The card network (e.g. mada, visa, mastercard, apple pay, or unknown). CRITICAL NETWORK RULE: If both Apple Pay (or apple pay, apple, ابل باي, أبل باي, ابل, أبل) and another network (like visa, mada, mastercard) are mentioned or present, the network MUST be 'apple pay'. 6. The status of the transaction (e.g. declined or success). CRITICAL STATUS RULE: If the text mentions 'مرفوض', 'مرفوضة', 'مرفوضه', 'الرصيد غير كافي', 'insufficient', 'failed', 'فشل', 'فشلت', or any declination/failure term, the status MUST be 'declined'. Return ONLY in this exact format: CARD // AMOUNT // TIME // DATE // NETWORK // STATUS. Do not write any markdown code blocks, explanation, or notes. Example output: 4321 // 125.00 // 18:34 // 18-05 // mada // success" },
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
                if (loadingToast) loadingToast.remove();
                if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts[0].text) {
                    parseAIResult(data.candidates[0].content.parts[0].text.trim());
                } else if (data.candidates && data.candidates[0].finishReason) {
                    showToast("حظر AI: " + data.candidates[0].finishReason, true, 4000);
                    parseAIResult('0000 // 0.00 // 00:00 // 00-00 // unknown // declined');
                } else if (data.error) {
                    showToast("خطأ API: " + data.error.message, true, 4000);
                    parseAIResult('0000 // 0.00 // 00:00 // 00-00 // unknown // declined');
                } else {
                    parseAIResult('0000 // 0.00 // 00:00 // 00-00 // unknown // declined');
                }
                resolve();
            } catch (err) {
                if (loadingToast) loadingToast.remove();
                showToast("خطأ AI: " + err.message, true, 4000);
                resolve();
            }
        };
        reader.onerror = () => {
            if (loadingToast) loadingToast.remove();
            showToast("فشل قراءة الملف ❌", true);
            resolve();
        };
    });
}

async function extractCardWithGroq(file, groqKey, loadingToast) {
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
                            { type: 'text', text: "Extract the payment/transaction details from this image. You MUST find: 1. Last 4 digits of the card number (e.g. 1234 or 9876). CARD NUMBER RULES: Rule A: The word 'عبر' or 'by' ALWAYS indicates the card — the digits immediately after 'عبر' or 'by' are the card digits. Rule B: If 'عبر' (or 'by') and 'من' (or 'from') appear on the same line, the digits after 'عبر' (or 'by') are the card, and the digits after 'من' (or 'from') are an account number — ignore those. Rule C: If 'من' (or 'from') appears WITHOUT 'عبر' (or 'by') AND without the word 'حساب' (account), then the digits after 'من' (or 'from') ARE the card number. Rule D: If 'من' (or 'from') appears with 'حساب' (account), those digits are an account number — ignore them. If no card number found by any rule, return 0000. 2. The amount of the transaction (e.g. 100.00 or 49.50). 3. The time of the transaction in HH:MM format. 4. The date of the transaction. CRITICAL YEAR/DATE RULE: The current year is 2026. In Saudi/Arabian alerts, the date is often in YY-MM-DD format where 'YY' is the year (e.g. '26' for 2026) and 'DD' is the day (e.g. '22'). Example: '26-08-22' means August 22, 2026. A 2-digit year of '26' is ALWAYS the current year. If the transaction year is the current year (2026 or '26'), return strictly in DD-MM format (Day-Month, e.g. 22-08). If the transaction year is NOT the current year, return in DD-MM-YYYY format. 5. The card network (e.g. mada, visa, mastercard, apple pay, or unknown). CRITICAL NETWORK RULE: If both Apple Pay (or apple pay, apple, ابل باي, أبل باي, ابل, أبل) and another network (like visa, mada, mastercard) are mentioned or present, the network MUST be 'apple pay'. 6. The status of the transaction (e.g. declined or success). CRITICAL STATUS RULE: If the text mentions 'مرفوض', 'مرفوضة', 'مرفوضه', 'الرصيد غير كافي', 'insufficient', 'failed', 'فشل', 'فشلت', or any declination/failure term, the status MUST be 'declined'. Return ONLY in this exact format: CARD // AMOUNT // TIME // DATE // NETWORK // STATUS. Do not write any markdown code blocks, explanation, or notes. Example output: 4321 // 125.00 // 18:34 // 18-05 // mada // success" },
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

                if (loadingToast) loadingToast.remove();
                if (data.choices && data.choices[0].message && data.choices[0].message.content) {
                    parseAIResult(data.choices[0].message.content.trim());
                } else {
                    parseAIResult('0000 // 0.00 // 00:00 // 00-00 // unknown // success // yes');
                }
                resolve();
            } catch (err) {
                if (loadingToast) loadingToast.remove();
                showToast("خطأ Groq: " + err.message, true, 5000);
                resolve();
            }
        };
        reader.onerror = () => {
            if (loadingToast) loadingToast.remove();
            showToast("فشل قراءة الملف ❌", true);
            resolve();
        };
    });
}

function parseAIResult(aiText) {
    const cleaned = aiText.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();
    const parts = cleaned.split('//').map(p => p.trim());
    const card = parts[0] || "0000";
    const amount = parts[1] || "0.00";
    const time = parts[2] || "00:00";
    let date = parts[3] || "00-00";

    // Fix for flipped MM-DD dates returned by AI or padding
    if (date && date !== "00-00" && date !== "-") {
        const dParts = date.split('-');
        if (dParts.length >= 2) {
            const p1 = parseInt(dParts[0]) || 0;
            const p2 = parseInt(dParts[1]) || 0;
            // If p1 is a valid month and p2 is clearly a day (>12), the AI flipped it to MM-DD
            if (p1 <= 12 && p2 > 12 && p2 <= 31) {
                dParts[0] = String(p2).padStart(2, '0');
                dParts[1] = String(p1).padStart(2, '0');
                date = dParts.join('-');
            } else {
                // Ensure double digit padding for DD-MM
                dParts[0] = String(p1).padStart(2, '0');
                dParts[1] = String(p2).padStart(2, '0');
                date = dParts.join('-');
            }
        }
    }
    const network = parts[4] || "unknown";
    const status = parts[5] || "success";

    const formattedAmount = formatAmount(amount);
    const finalResult = `${card} // ${formattedAmount} // ${time} // ${date}`;
    updateUI(finalResult, card, formattedAmount, time, date);

    const badge = document.getElementById('declineBadge');
    if (
        status.toLowerCase().includes('decline') ||
        status.toLowerCase().includes('declined') ||
        status.toLowerCase().includes('failed') ||
        status.toLowerCase().includes('مرفوض') ||
        status.toLowerCase().includes('مرفوضة') ||
        status.toLowerCase().includes('مرفوضه') ||
        status.toLowerCase().includes('فشل') ||
        status.toLowerCase().includes('فشلت') ||
        status.toLowerCase().includes('غير كافي') ||
        status.toLowerCase().includes('غير كاف')
    ) {
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }

    const networkBadge = document.getElementById('networkBadge');
    networkBadge.style.display = 'none';
    const lowerNetwork = network.toLowerCase();
    if (
        lowerNetwork.includes('apple') ||
        lowerNetwork.includes('applepay') ||
        lowerNetwork.includes('apple pay') ||
        lowerNetwork.includes('ابل') ||
        lowerNetwork.includes('أبل') ||
        lowerNetwork.includes('ابل باي') ||
        lowerNetwork.includes('أبل باي') ||
        lowerNetwork.includes('ابل باى') ||
        lowerNetwork.includes('أبل باى')
    ) {
        networkBadge.style.background = '#fff';
        networkBadge.style.color = '#000';
        networkBadge.style.border = '1px solid #ccc';
        networkBadge.innerHTML = `<img src="Apple.png?v=${typeof APP_VERSION !== 'undefined' ? APP_VERSION : '1.0.0'}" height="12" style="display: block;">`;
        networkBadge.style.display = 'inline-flex';
        networkBadge.style.fontStyle = 'normal';
        networkBadge.setAttribute('dir', 'ltr');
    } else if (lowerNetwork.includes('mada') || lowerNetwork.includes('مدى')) {
        networkBadge.style.background = '#00c853';
        networkBadge.style.color = '#fff';
        networkBadge.style.border = 'none';
        networkBadge.innerHTML = 'mada';
        networkBadge.style.display = 'inline-flex';
        networkBadge.style.fontStyle = 'normal';
        networkBadge.setAttribute('dir', 'ltr');
    } else if (lowerNetwork.includes('visa') || lowerNetwork.includes('فيزا')) {
        networkBadge.style.background = '#1a1f71';
        networkBadge.style.color = '#fff';
        networkBadge.style.border = 'none';
        networkBadge.innerHTML = 'VISA';
        networkBadge.style.display = 'inline-flex';
        networkBadge.style.fontStyle = 'italic';
        networkBadge.setAttribute('dir', 'ltr');
    } else if (lowerNetwork.includes('master')) {
        networkBadge.style.background = '#ff5f00';
        networkBadge.style.color = '#fff';
        networkBadge.style.border = 'none';
        networkBadge.innerHTML = 'MasterCard';
        networkBadge.style.display = 'inline-flex';
        networkBadge.style.fontStyle = 'normal';
        networkBadge.setAttribute('dir', 'ltr');
    }

    const savedData = {
        fullText: finalResult,
        card: card,
        amount: formattedAmount,
        time: time,
        date: date,
        cleanText: cleaned
    };
    localStorage.setItem('cardScannerData', JSON.stringify(savedData));
    saveScanToHistory(savedData);

    showToast("تم النسخ والتحليل بالـ AI! ✅");
    secureCopy(finalResult);
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
                <div style="font-family:monospace;font-size:11px;font-weight:bold;color:#eee;">${h.fullText}</div>
                <div style="font-size:8px;color:#777;margin-top:4px;display:flex;justify-content:space-between;"><span>${dateStr}</span><span>${timeStr}</span></div>
            </div>`;
        }).join('')}
        <button onclick="document.getElementById('historyModal').style.display='none'" style="width:100%;padding:5px;background:rgba(255,255,255,0.05);color:#888;border:1px solid rgba(255,255,255,0.1);border-radius:6px;font-size:10px;font-weight:bold;cursor:pointer;margin-top:6px;transition:0.2s;" onmouseover="this.style.color='#fff';this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.color='#888';this.style.background='rgba(255,255,255,0.05)'">إغلاق</button>
    `;
}

function restoreFromHistory(index) {
    const history = getScanHistory();
    const h = history[index];
    if (!h) return;
    updateUI(h.fullText, h.card, h.amount, h.time, h.date);
    if (h.cleanText) detectCardMeta(h.cleanText);
    const savedData = { fullText: h.fullText, card: h.card, amount: h.amount, time: h.time, date: h.date, cleanText: h.cleanText || h.fullText };
    localStorage.setItem('cardScannerData', JSON.stringify(savedData));
    secureCopy(h.fullText);
    showToast("تم استعادة البيانات! ✅");
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
    const input = document.getElementById('tabbyInput').value.trim();
    const idChip = document.getElementById('chip-tabby-id');
    const linkChip = document.getElementById('chip-tabby-link');

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
        if(!id) id = input.trim();
        id = id.split('?')[0].split('/')[0].trim();
    }

    if (id) {
        idChip.innerText = id;
        linkChip.innerText = "نسخ الرابط";
        linkChip.dataset.link = `https://backoffice.tabby.sa/customers/${id}`;
    } else {
        idChip.innerText = "غير صالح";
        linkChip.innerText = "الرابط";
        linkChip.dataset.link = "";
    }
}

window.copyTabbyId = function() {
    const id = document.getElementById('chip-tabby-id').innerText;
    if (id === "ID" || id === "غير صالح") {
        showToast("لا يوجد ID لنسخه ❌", true);
        return;
    }
    secureCopy(id).then(() => showToast("تم نسخ الـ ID 📋"));
}

window.copyTabbyLink = function() {
    const link = document.getElementById('chip-tabby-link').dataset.link;
    if (link) {
        secureCopy(link).then(() => showToast("تم نسخ الرابط 🔗"));
    } else {
        showToast("لا يوجد رابط لنسخه ❌", true);
    }
}

window.copyTabbyDetails = function() {
    const id = document.getElementById('chip-tabby-id').innerText;
    const link = document.getElementById('chip-tabby-link').dataset.link;

    if (id === "ID" || id === "غير صالح" || !link) {
        showToast("لا توجد بيانات لنسخها ❌", true);
        return;
    }

    const details = `user id :  \n${id}\n\n${link}`;
    secureCopy(details).then(() => showToast("تم نسخ التفاصيل 📋"));
}

window.clearTabbyInput = function() {
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
