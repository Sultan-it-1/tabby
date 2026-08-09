// CIA Maker - C + I + A Card Architecture

const defaultCiaCards = [];

let ciaCards = [];
let searchQuery = "";
let selectedCategoryFilter = "ALL";
let editingCardId = null;

function showToast(message, isError = false, duration = 2200) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : ''}`;
    toast.innerText = message;
    container.appendChild(toast);
    
    requestAnimationFrame(() => toast.classList.add('show'));

    if (duration > 0) {
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}

async function secureCopy(text) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
        throw new Error("Clipboard API unavailable");
    } catch (err) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        let success = false;
        try {
            success = document.execCommand('copy');
        } catch (e) {
            console.error("execCommand copy failed", e);
        }
        document.body.removeChild(textArea);
        return success;
    }
}

let pendingDeleteCardId = null;

document.addEventListener('DOMContentLoaded', () => {
    loadCIAData();
    const yesBtn = document.getElementById('confirmYesBtn');
    if (yesBtn) {
        yesBtn.onclick = () => {
            if (pendingDeleteCardId) {
                ciaCards = ciaCards.filter(c => c.id !== pendingDeleteCardId);
                saveCIAData();
                showToast('تم حذف البطاقة 🗑️');
            }
            closeConfirmBox();
        };
    }
});

function loadCIAData() {
    const stored = localStorage.getItem('fastToolkitCIA_v4');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                // Filter out any initial sample demo cards
                ciaCards = parsed.filter(c => !["card_1", "card_2", "card_3", "card_4"].includes(c.id));
            }
        } catch (e) {
            console.error("Error loading CIA v4 cards", e);
        }
    } else {
        ciaCards = [];
        saveCIAData();
    }
    renderFilterBar();
    renderCardsView();
}

function saveCIAData() {
    localStorage.setItem('fastToolkitCIA_v4', JSON.stringify(ciaCards));
    if (window.FastToolkitFirebase && typeof window.FastToolkitFirebase.saveCloudData === 'function') {
        window.FastToolkitFirebase.saveCloudData('fastToolkitCIA_v4', ciaCards);
    }
    renderFilterBar();
    renderCardsView();
}

window.syncFromCloudStorage = function() {
    loadCIAData();
};

function filterCards() {
    const input = document.getElementById('searchInput');
    searchQuery = input ? input.value.trim().toLowerCase() : "";
    renderCardsView();
}

function renderFilterBar() {
    const filterBar = document.getElementById('filterBar');
    if (!filterBar) return;
    filterBar.innerHTML = "";

    const categories = ["ALL", ...new Set(ciaCards.map(card => card.c).filter(Boolean))];

    categories.forEach(cat => {
        const chip = document.createElement('div');
        chip.className = `filter-chip ${selectedCategoryFilter === cat ? 'active' : ''}`;
        chip.innerText = cat === "ALL" ? "الكل ✨" : cat;
        
        chip.onclick = () => {
            selectedCategoryFilter = cat;
            renderFilterBar();
            renderCardsView();
        };

        filterBar.appendChild(chip);
    });
}

function renderCardsView() {
    const container = document.getElementById('contentScroll');
    if (!container) return;
    container.innerHTML = "";

    const grid = document.createElement('div');
    grid.className = 'cards-grid';

    // Add New CIA Card Button
    const addCardBtn = document.createElement('div');
    addCardBtn.className = 'add-card-btn';
    addCardBtn.innerHTML = '<span>➕</span><span>إنشاء بطاقة CIA جديدة (C+I+A)</span>';
    addCardBtn.onclick = () => openAddCiaModal();
    grid.appendChild(addCardBtn);

    // Filter cards by category & search
    const filtered = ciaCards.filter(card => {
        const matchesCategory = (selectedCategoryFilter === "ALL") || (card.c === selectedCategoryFilter);
        const matchesSearch = !searchQuery || 
            (card.c && card.c.toLowerCase().includes(searchQuery)) ||
            (card.i && card.i.toLowerCase().includes(searchQuery)) ||
            (card.a && card.a.toLowerCase().includes(searchQuery));

        return matchesCategory && matchesSearch;
    });

    if (filtered.length === 0) {
        const noData = document.createElement('div');
        noData.style.cssText = 'text-align:center;padding:20px;font-size:11px;color:#666;';
        noData.innerText = 'لا توجد بطاقات CIA مطابقة 🔍';
        grid.appendChild(noData);
    } else {
        filtered.forEach(card => {
            const cardEl = document.createElement('div');
            cardEl.className = 'cia-full-card';

            // C Section
            const cRow = createCiaRow('C', 'c', card.c || '-', true);

            // I Section
            const iRow = createCiaRow('I', 'i', card.i || '-');

            // A Section
            const aRow = createCiaRow('A', 'a', card.a || '-');

            // Footer with Copy hint & Edit/Delete actions
            const footer = document.createElement('div');
            footer.className = 'card-footer';

            const hint = document.createElement('span');
            hint.className = 'copy-hint';
            hint.innerText = 'اضغط لنسخ الـ CIA كاملاً 📋';

            const actions = document.createElement('div');
            actions.className = 'card-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'card-act-btn';
            editBtn.innerHTML = '✏️';
            editBtn.title = 'تعديل البطاقة';
            editBtn.onclick = (e) => {
                e.stopPropagation();
                openEditCiaModal(card.id);
            };

            const delBtn = document.createElement('button');
            delBtn.className = 'card-act-btn del';
            delBtn.innerHTML = '🗑️';
            delBtn.title = 'حذف البطاقة';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                deleteCiaCard(card.id);
            };

            actions.appendChild(editBtn);
            actions.appendChild(delBtn);

            footer.appendChild(hint);
            footer.appendChild(actions);

            cardEl.appendChild(cRow);
            cardEl.appendChild(iRow);
            cardEl.appendChild(aRow);
            cardEl.appendChild(footer);

            // Copy full formatted CIA on click
            cardEl.onclick = () => {
                const fullText = `C: ${card.c}\n\nI: ${card.i}\n\nA: ${card.a}\n\n#CIA`;
                secureCopy(fullText).then(() => {
                    showToast('تم نسخ تقرير الـ CIA بنجاح! 📋✅');
                });
            };

            grid.appendChild(cardEl);
        });
    }

    container.appendChild(grid);
}

function createCiaRow(label, badgeClass, value, isStrong = false) {
    const row = document.createElement('div');
    row.className = 'cia-row';

    const badge = document.createElement('span');
    badge.className = `cia-badge ${badgeClass}`;
    badge.innerText = label;
    badge.title = `انقر لنسخ حقل (${label})`;
    badge.style.cursor = 'pointer';
    badge.onclick = (e) => {
        e.stopPropagation();
        secureCopy(value || '').then(() => {
            showToast(`تم نسخ حقل (${label}) 📋✅`);
        });
    };

    const text = document.createElement('span');
    text.className = 'cia-text';
    text.dir = 'auto';
    text.innerText = value;
    if (isStrong) {
        text.style.fontWeight = 'bold';
        text.style.color = 'var(--text)';
    }

    row.appendChild(badge);
    row.appendChild(text);
    return row;
}

// Modal Operations
function openAddCiaModal() {
    editingCardId = null;
    document.getElementById('modalTitle').innerText = 'إضافة بطاقة CIA جديدة (C+I+A)';

    const defaultC = (selectedCategoryFilter && selectedCategoryFilter !== "ALL") ? selectedCategoryFilter : "";
    const inputC = document.getElementById('inputC');
    inputC.value = defaultC;

    if (defaultC) {
        inputC.readOnly = true;
        inputC.style.background = 'rgba(0, 230, 118, 0.08)';
        inputC.style.borderColor = 'rgba(0, 230, 118, 0.4)';
        inputC.title = 'مقفل على الفئة الحالية. اختر "الكل" لإنشاء C جديدة.';
        inputC.onclick = () => {
            showToast('💡 تنبيه: لتغيير المشكلة الرئيسية C، اختر "الكل ✨" من الفرز أولاً', false, 3200);
        };
    } else {
        inputC.readOnly = false;
        inputC.style.background = '#111';
        inputC.style.borderColor = '#333';
        inputC.title = '';
        inputC.onclick = null;
    }

    document.getElementById('inputI').value = '';
    document.getElementById('inputA').value = '';
    document.getElementById('ciaCardModal').classList.add('open');

    setTimeout(() => {
        if (defaultC) {
            document.getElementById('inputI').focus();
        } else {
            inputC.focus();
        }
    }, 50);
}

function openEditCiaModal(cardId) {
    const card = ciaCards.find(c => c.id === cardId);
    if (!card) return;
    editingCardId = cardId;
    document.getElementById('modalTitle').innerText = 'تعديل بطاقة CIA';
    
    const inputC = document.getElementById('inputC');
    inputC.value = card.c || '';
    inputC.readOnly = false;
    inputC.style.background = '#111';
    inputC.style.borderColor = '#333';
    inputC.onclick = null;

    document.getElementById('inputI').value = card.i || '';
    document.getElementById('inputA').value = card.a || '';
    document.getElementById('ciaCardModal').classList.add('open');
    setTimeout(() => inputC.focus(), 50);
}

function closeCiaModal() {
    document.getElementById('ciaCardModal').classList.remove('open');
    document.getElementById('deleteAllModal').classList.remove('open');
    editingCardId = null;
}

function saveCiaCardModal() {
    const cVal = document.getElementById('inputC').value.trim();
    const iVal = document.getElementById('inputI').value.trim();
    const aVal = document.getElementById('inputA').value.trim();

    if (!cVal) {
        showToast('يرجى كتابة عنوان المشكلة (C) ⚠️', true);
        return;
    }

    if (editingCardId) {
        const card = ciaCards.find(c => c.id === editingCardId);
        if (card) {
            card.c = cVal;
            card.i = iVal || '-';
            card.a = aVal || '-';
            saveCIAData();
            showToast('تم تعديل البطاقة ✏️');
        }
    } else {
        const newCard = {
            id: "card_" + Date.now(),
            c: cVal,
            i: iVal || '-',
            a: aVal || '-'
        };
        ciaCards.unshift(newCard);
        saveCIAData();
        showToast('تمت إضافة بطاقة CIA جديدة 📋');
    }

    closeCiaModal();
}

function deleteCiaCard(cardId) {
    pendingDeleteCardId = cardId;
    const confirmBox = document.getElementById('confirmBox');
    if (confirmBox) {
        document.getElementById('confirmTxt').innerText = 'هل أنت متأكد من حذف بطاقة الـ CIA هذه؟';
        confirmBox.style.display = 'flex';
    }
}

function closeConfirmBox() {
    const confirmBox = document.getElementById('confirmBox');
    if (confirmBox) confirmBox.style.display = 'none';
    pendingDeleteCardId = null;
}

// Backup & Cloud Operations
function exportCIAData() {
    try {
        const jsonStr = JSON.stringify(ciaCards, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        a.download = `CIA_Full_Cards_Backup_${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            a.remove();
            URL.revokeObjectURL(url);
        }, 100);
        showToast('تم تصدير نسخة JSON 💾');
    } catch (e) {
        console.error("Export error", e);
        showToast('خطأ في تصدير البيانات ❌', true);
    }
}

let ciaConflictQueue = [];
let ciaConflictApplyAllAction = null;

function importCIAData(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            let imported = JSON.parse(e.target.result);
            // Support both CIA cards array and unified settings backup format
            if (imported && typeof imported === 'object' && !Array.isArray(imported)) {
                if (imported.fastToolkitCIA_v4) {
                    imported = typeof imported.fastToolkitCIA_v4 === 'string' 
                        ? JSON.parse(imported.fastToolkitCIA_v4) 
                        : imported.fastToolkitCIA_v4;
                }
            }
            if (Array.isArray(imported)) {
                await processCiaImportWithConflicts(imported);
                saveCIAData();
                showToast('تم استيراد بطاقات CIA بنجاح 📂✅');
            } else {
                showToast('ملف غير صالح ❌', true);
            }
        } catch (err) {
            console.error("CIA import error", err);
            showToast('خطأ في قراءة الملف ❌', true);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

async function processCiaImportWithConflicts(imported) {
    ciaConflictQueue = [];
    ciaConflictApplyAllAction = null;

    imported.forEach(newCard => {
        const cardTitle = newCard.c || 'بطاقة CIA';
        const existingIndex = ciaCards.findIndex(c => c.c === newCard.c);

        if (existingIndex !== -1) {
            ciaConflictQueue.push({
                existingIndex,
                title: cardTitle,
                newCard
            });
        } else {
            ciaCards.push({
                id: "card_" + Date.now() + Math.random(),
                c: newCard.c || '-',
                i: newCard.i || '-',
                a: newCard.a || '-'
            });
        }
    });

    for (let i = 0; i < ciaConflictQueue.length; i++) {
        const item = ciaConflictQueue[i];
        let action = ciaConflictApplyAllAction;

        if (!action) {
            action = await promptCiaConflictModal(item.title);
        }

        if (action === 'replace') {
            ciaCards[item.existingIndex] = {
                id: ciaCards[item.existingIndex].id,
                c: item.newCard.c || '-',
                i: item.newCard.i || '-',
                a: item.newCard.a || '-'
            };
        } else if (action === 'keep_both') {
            ciaCards.push({
                id: "card_" + Date.now() + Math.random(),
                c: `${item.newCard.c || 'بطاقة'} (نسخة)`,
                i: item.newCard.i || '-',
                a: item.newCard.a || '-'
            });
        }
    }
}

function promptCiaConflictModal(cardName) {
    return new Promise((resolve) => {
        const modal = document.getElementById('conflictModal');
        const nameEl = document.getElementById('conflictItemName');
        const applyCb = document.getElementById('conflictApplyAllCb');

        if (nameEl) nameEl.innerText = `البطاقة: "${cardName}"`;
        if (applyCb) applyCb.checked = false;

        if (modal) modal.classList.add('open');

        window.resolveCiaConflict = (choice) => {
            if (applyCb && applyCb.checked) {
                ciaConflictApplyAllAction = choice;
            }
            if (modal) modal.classList.remove('open');
            resolve(choice);
        };
    });
}

function triggerDeleteAll() {
    document.getElementById('deleteAllConfirmInput').value = '';
    document.getElementById('deleteAllModal').classList.add('open');
}

function confirmDeleteAll() {
    const val = document.getElementById('deleteAllConfirmInput').value.trim();
    if (val === 'delete all') {
        ciaCards = [];
        saveCIAData();
        closeCiaModal();
        showToast('تم مسح جميع بطاقات الـ CIA 🗑️');
    } else {
        showToast('التأكيد غير صحيح ❌', true);
    }
}

let gDriveAccessToken = sessionStorage.getItem('gDriveAccessToken') || null;

function checkResponseStatus(res) {
    if (res.status === 401) {
        gDriveAccessToken = null;
        sessionStorage.removeItem('gDriveAccessToken');
        showToast("انتهت جلسة Drive، يرجى تسجيل الدخول ⚠️", true);
        throw new Error("Unauthorized");
    }
    return res;
}

function triggerCloudAction(action) {
    const clientId = window.GOOGLE_CLIENT_ID;
    if (!clientId) {
        showToast("يرجى إعداد Google Client ID في settings.js أولاً! ⚠️", true);
        alert("تنبيه: لتفعيل المزامنة السحابية، يرجى إدخال معرف Google Client ID الخاص بك أولاً في ملف settings.js");
        return;
    }
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        showToast("خطأ في تحميل مكتبة Google! ❌", true);
        return;
    }

    showToast("جاري الاتصال بحساب Google... ☁️");
    try {
        const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'https://www.googleapis.com/auth/drive.file',
            callback: (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    gDriveAccessToken = tokenResponse.access_token;
                    sessionStorage.setItem('gDriveAccessToken', gDriveAccessToken);
                    executeDriveAction(gDriveAccessToken, action);
                } else {
                    showToast("فشل تسجيل الدخول! ❌", true);
                }
            },
        });
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
        console.error("GIS initialization failed:", err);
        showToast("خطأ في الاتصال بـ Google! ❌", true);
    }
}

function executeDriveAction(token, action) {
    showToast("جاري الاتصال بـ Google Drive... ☁️");
    const filename = "fast_toolkit_cia_backup.json";

    fetch(`https://www.googleapis.com/drive/v3/files?q=name='${filename}'+and+trashed=false`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(checkResponseStatus)
    .then(res => res.json())
    .then(data => {
        const files = data.files || [];
        const fileId = files.length > 0 ? files[0].id : null;

        if (action === 'backup') {
            if (fileId) {
                updateDriveFile(token, fileId, ciaCards);
            } else {
                createDriveFile(token, filename, ciaCards);
            }
        } else if (action === 'restore') {
            if (fileId) {
                restoreDriveFile(token, fileId);
            } else {
                showToast("لا توجد نسخة سحابية محفوظة لبطاقات CIA! ❌", true);
            }
        }
    })
    .catch(err => {
        console.error("Drive search failed:", err);
        if (err.message !== "Unauthorized") {
            showToast("فشل الاتصال بـ Google Drive! ❌", true);
        }
    });
}

function updateDriveFile(token, fileId, content) {
    showToast("جاري رفع بيانات CIA للسحابة... ☁️");
    fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(content)
    })
    .then(checkResponseStatus)
    .then(res => {
        if (res.ok) {
            showToast("تم النسخ السحابي لـ CIA بنجاح! ☁️✅");
        } else {
            showToast("فشل تحديث النسخة السحابية! ❌", true);
        }
    })
    .catch(err => {
        console.error("Drive update failed:", err);
        if (err.message !== "Unauthorized") showToast("فشل رفع البيانات! ❌", true);
    });
}

function createDriveFile(token, filename, content) {
    showToast("جاري إنشاء ملف النسخ السحابي... ☁️");
    fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: filename, mimeType: 'application/json' })
    })
    .then(checkResponseStatus)
    .then(res => res.json())
    .then(meta => {
        if (meta.id) {
            updateDriveFile(token, meta.id, content);
        } else {
            showToast("فشل إنشاء الملف السحابي! ❌", true);
        }
    })
    .catch(err => {
        console.error("Drive creation failed:", err);
        if (err.message !== "Unauthorized") showToast("فشل إنشاء الملف السحابي! ❌", true);
    });
}

function restoreDriveFile(token, fileId) {
    showToast("جاري تنزيل النسخة السحابية... ☁️");
    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(checkResponseStatus)
    .then(res => res.json())
    .then(async (data) => {
        let imported = data;
        if (data && typeof data === 'object' && !Array.isArray(data) && data.fastToolkitCIA_v4) {
            try {
                imported = typeof data.fastToolkitCIA_v4 === 'string' ? JSON.parse(data.fastToolkitCIA_v4) : data.fastToolkitCIA_v4;
            } catch (e) {
                imported = data.fastToolkitCIA_v4;
            }
        }
        if (Array.isArray(imported)) {
            await processCiaImportWithConflicts(imported);
            saveCIAData();
            showToast("تمت استعادة بطاقات CIA بنجاح! ☁️✅");
        } else {
            showToast("الملف السحابي تالف أو غير صالح! ❌", true);
        }
    })
    .catch(err => {
        console.error("Drive restore failed:", err);
        if (err.message !== "Unauthorized") showToast("فشل استعادة الملف السحابي! ❌", true);
    });
}

window.exportCIAData = exportCIAData;
window.importCIAData = importCIAData;
window.triggerDeleteAll = triggerDeleteAll;
window.confirmDeleteAll = confirmDeleteAll;
window.triggerCloudAction = triggerCloudAction;
window.saveCiaCardModal = saveCiaCardModal;
window.closeCiaModal = closeCiaModal;
window.closeConfirmBox = closeConfirmBox;
window.filterCards = filterCards;
