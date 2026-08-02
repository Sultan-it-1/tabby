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
    renderFilterBar();
    renderCardsView();
}

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
            const cRow = document.createElement('div');
            cRow.className = 'cia-row';
            cRow.innerHTML = `<span class="cia-badge c">C</span><span class="cia-text" dir="auto" style="font-weight:bold;color:var(--text);">${card.c || '-'}</span>`;

            // I Section
            const iRow = document.createElement('div');
            iRow.className = 'cia-row';
            iRow.innerHTML = `<span class="cia-badge i">I</span><span class="cia-text" dir="auto">${card.i || '-'}</span>`;

            // A Section
            const aRow = document.createElement('div');
            aRow.className = 'cia-row';
            aRow.innerHTML = `<span class="cia-badge a">A</span><span class="cia-text" dir="auto">${card.a || '-'}</span>`;

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
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(ciaCards, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `CIA_Full_Cards_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('تم تصدير نسخة JSON 💾');
}

function importCIAData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (Array.isArray(imported)) {
                ciaCards = imported;
                saveCIAData();
                showToast('تم استيراد بطاقات CIA بنجاح 📂✅');
            } else {
                showToast('ملف غير صالح ❌', true);
            }
        } catch (err) {
            showToast('خطأ في قراءة الملف ❌', true);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
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

function triggerCloudAction(action) {
    showToast(action === 'backup' ? 'جاري النسخ للسحابة... ☁️' : 'جاري الاستعادة من السحابة... ☁️');
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
