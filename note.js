function escapeJS(str) { return str ? str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;') : ''; }
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
}

let currentContainer = 'c1';
let activeId = null, activeCat = null, modalTargetContainer = 'c1';
let isSortMode = false;
let draggedItem = null, dragTimeout = null;
let confirmCallback = null, searchQuery = '';

// أسماء التبويبات المخصصة - مخزنة في localStorage
const DEFAULT_TAB_LABELS = { c1: 'Tab 1', c2: 'Tab 2', c3: 'Tab 3' };
let tabLabels = (() => {
    try { return { ...DEFAULT_TAB_LABELS, ...JSON.parse(localStorage.getItem('noteTabLabels') || '{}') }; }
    catch { return { ...DEFAULT_TAB_LABELS }; }
})();

function saveTabLabels() { localStorage.setItem('noteTabLabels', JSON.stringify(tabLabels)); }

const defaultData = {
    c1: {},
    c2: {},
    c3: {}
};

let storageData = JSON.parse(localStorage.getItem('copyGridDataV6')) || defaultData;
let unbackedUpCount = parseInt(localStorage.getItem('unbackedUpCountV6'), 10) || 0;

function ensureContainerSafety(containerId) {
    if (!storageData) storageData = {};
    if (!storageData[containerId]) storageData[containerId] = {};
}

function render() {
    const container = document.getElementById('main-content');
    container.innerHTML = '';
    document.documentElement.dir = 'rtl';

    document.getElementById('containerBtn').innerText = tabLabels[currentContainer];
    document.getElementById('containerBtn').title = 'اضغط مطولاً لإعادة تسمية التب';

    const isSearching = searchQuery.length > 0;
    const sortBtn = document.getElementById('sortModeBtn');

    if (isSortMode && !isSearching) {
        sortBtn.classList.add('active-mode');
        container.classList.add('sort-order-active');
    } else {
        sortBtn.classList.remove('active-mode');
        container.classList.remove('sort-order-active');
    }

    const containersToRender = isSearching ? ['c1', 'c2', 'c3'] : [currentContainer];

    let totalNotesInTab = 0;
    let hasSections = false;

    containersToRender.forEach(cId => {
        ensureContainerSafety(cId);
        const sections = storageData[cId];

        for (let cat in sections) {
            if (!isSearching && cId === currentContainer) {
                hasSections = true;
                totalNotesInTab += sections[cat].length;
            }

            const filteredItems = sections[cat].filter(item => {
                const labelSafe = item.l ? item.l.toLowerCase() : '';
                const textSafe = item.t ? item.t.toLowerCase() : '';
                return labelSafe.includes(searchQuery) || textSafe.includes(searchQuery);
            });

            if (isSearching && filteredItems.length === 0) continue;

            const safeCatJS = escapeJS(cat);
            const safeCatHTML = escapeHTML(cat);

            const displayCatName = isSearching ? `${safeCatHTML} <span style="font-size:9px;color:var(--accent-green);margin-right:4px;">(${tabLabels[cId]})</span>` : safeCatHTML;

            const secHeader = document.createElement('div');
            secHeader.className = 'section-header';

            secHeader.innerHTML = `
            <div>
                ${!isSearching ? `<span class="del-section" onclick="triggerDeleteSection('${safeCatJS}')">×</span>` : ''}
                <span class="section-label">${displayCatName}</span>
            </div>
            ${!isSearching ? `
            <span class="section-sort-controls">
                <span class="sort-btn" onclick="moveSection('${safeCatJS}', -1)">▲</span>
                <span class="sort-btn" onclick="moveSection('${safeCatJS}', 1)">▼</span>
                ${currentContainer !== 'c1' ? `<span class="move-tab-btn" onclick="moveSectionToTab('${safeCatJS}', 'c1')">→T1</span>` : ''}
                ${currentContainer !== 'c2' ? `<span class="move-tab-btn" onclick="moveSectionToTab('${safeCatJS}', 'c2')">→T2</span>` : ''}
                ${currentContainer !== 'c3' ? `<span class="move-tab-btn" onclick="moveSectionToTab('${safeCatJS}', 'c3')">→T3</span>` : ''}
            </span>
            <span class="add-item-trigger" style="color:var(--accent-green);cursor:pointer;font-weight:bold;font-size:14px" onclick="openItemModal('${cId}', '${safeCatJS}')">+</span>
            ` : ''}
        `;
            container.appendChild(secHeader);

            if (!isSearching) {
                const labelEl = secHeader.querySelector('.section-label');
                labelEl.addEventListener('contextmenu', (e) => { e.preventDefault(); openEditSectionModal(cat); });
                labelEl.addEventListener('touchstart', (e) => { if (e.touches.length === 2) { e.preventDefault(); openEditSectionModal(cat); } });

                // === Drag & Drop للأقسام — معطّل في Sort Mode ===
                if (!isSortMode) {
                secHeader.setAttribute('draggable', 'true');
                secHeader.dataset.sectionCat = cat;
                secHeader.dataset.sectionCid = cId;
                secHeader.style.cursor = 'grab';

                secHeader.addEventListener('dragstart', (ev) => {
                    ev.dataTransfer.setData('text/section', JSON.stringify({ cat, cId }));
                    secHeader.style.opacity = '0.5';
                });
                secHeader.addEventListener('dragend', () => {
                    secHeader.style.opacity = '1';
                    document.querySelectorAll('.section-header').forEach(h => h.classList.remove('drag-over-section'));
                });
                secHeader.addEventListener('dragover', (ev) => {
                    ev.preventDefault();
                    secHeader.classList.add('drag-over-section');
                });
                secHeader.addEventListener('dragleave', () => secHeader.classList.remove('drag-over-section'));
                secHeader.addEventListener('drop', (ev) => {
                    ev.preventDefault();
                    secHeader.classList.remove('drag-over-section');
                    let srcInfo;
                    try { srcInfo = JSON.parse(ev.dataTransfer.getData('text/section')); } catch { return; }
                    if (!srcInfo || srcInfo.cat === cat) return;
                    // إعادة ترتيب مفاتيح الـ storageData
                    const obj = storageData[cId];
                    const keys = Object.keys(obj);
                    const fromIdx = keys.indexOf(srcInfo.cat);
                    const toIdx = keys.indexOf(cat);
                    if (fromIdx === -1 || toIdx === -1) return;
                    keys.splice(fromIdx, 1);
                    keys.splice(toIdx, 0, srcInfo.cat);
                    const newObj = {};
                    keys.forEach(k => { newObj[k] = obj[k]; });
                    storageData[cId] = newObj;
                    saveAndRefresh();
                });
                } // end if (!isSortMode)
            }

            const grid = document.createElement('div');
            grid.className = 'grid-container';
            grid.dataset.category = cat;
            grid.dataset.container = cId;

            // allow drop on empty grid area for cross-section move
            grid.addEventListener('dragover', (e) => { e.preventDefault(); });
            grid.addEventListener('drop', (e) => {
                e.preventDefault();
                if (!draggedItem) return;
                const srcInfo = JSON.parse(e.dataTransfer.getData('application/json') || 'null');
                if (!srcInfo) return;
                const targetCat = grid.dataset.category;
                const targetCId = grid.dataset.container;
                if (srcInfo.cat === targetCat && srcInfo.cId === targetCId) return;
                ensureContainerSafety(targetCId);
                if (!storageData[targetCId][targetCat]) storageData[targetCId][targetCat] = [];
                const srcList = storageData[srcInfo.cId][srcInfo.cat];
                const [movedItem] = srcList.splice(srcInfo.index, 1);
                storageData[targetCId][targetCat].push(movedItem);
                saveAndRefresh();
            });

            filteredItems.forEach((item) => {
                const realIdx = sections[cat].findIndex(x => x.id === item.id);

                const chip = document.createElement('div');
                chip.className = 'chip';
                chip.innerText = item.l || 'بدون اسم';
                chip.dataset.id = item.id;
                chip.dataset.index = realIdx;

                chip.onclick = () => {
                    // استبدال xxxx و yyyy ببيانات البطاقة النشطة (مؤقت، لا يحفظ)
                    const cardData = getActiveCardData();
                    let textToCopy = item.t || '';
                    if (cardData) {
                        textToCopy = textToCopy
                            .replace(/xxxx/gi, cardData.card)
                            .replace(/yyyy/gi, cardData.amount);
                    }
                    
                    try {
                        const htmlText = textToCopy.replace(/\n/g, '<br>');
                        const clipboardItem = new ClipboardItem({
                            "text/plain": new Blob([textToCopy], { type: "text/plain" }),
                            "text/html": new Blob([htmlText], { type: "text/html" })
                        });
                        navigator.clipboard.write([clipboardItem]).then(() => {
                            showStatus("تم النسخ! ✅");
                        }).catch(() => {
                            navigator.clipboard.writeText(textToCopy);
                            showStatus("تم النسخ! ✅");
                        });
                    } catch (err) {
                        navigator.clipboard.writeText(textToCopy);
                        showStatus("تم النسخ! ✅");
                    }
                };

                chip.oncontextmenu = (e) => { e.preventDefault(); openItemModal(cId, cat, item); };

                if (!isSearching) {
                    chip.setAttribute('draggable', 'true');

                    chip.addEventListener('dragstart', (e) => {
                        draggedItem = chip;
                        chip.classList.add('dragging');
                        e.dataTransfer.setData('text/plain', realIdx);
                        e.dataTransfer.setData('application/json', JSON.stringify({ index: realIdx, cat, cId }));
                    });

                    chip.addEventListener('dragend', () => {
                        chip.classList.remove('dragging');
                        document.querySelectorAll('.chip').forEach(c => c.classList.remove('drag-over'));
                        draggedItem = null;
                    });

                    chip.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        if (draggedItem && draggedItem !== chip) {
                            chip.classList.add('drag-over');
                        }
                    });

                    chip.addEventListener('dragleave', () => chip.classList.remove('drag-over'));

                    chip.addEventListener('drop', (e) => {
                        e.preventDefault();
                        chip.classList.remove('drag-over');
                        const srcInfo = JSON.parse(e.dataTransfer.getData('application/json') || 'null');
                        if (!srcInfo) return;
                        const toIndex = parseInt(chip.dataset.index, 10);
                        const targetCat = grid.dataset.category;
                        const targetCId = grid.dataset.container;

                        ensureContainerSafety(targetCId);
                        if (!storageData[targetCId][targetCat]) storageData[targetCId][targetCat] = [];

                        if (srcInfo.cat === targetCat && srcInfo.cId === targetCId) {
                            // same section reorder
                            if (!isNaN(srcInfo.index) && srcInfo.index !== toIndex) {
                                const list = storageData[targetCId][targetCat];
                                const [movedItem] = list.splice(srcInfo.index, 1);
                                list.splice(toIndex, 0, movedItem);
                                saveAndRefresh();
                            }
                        } else {
                            // cross-section move
                            const srcList = storageData[srcInfo.cId][srcInfo.cat];
                            const [movedItem] = srcList.splice(srcInfo.index, 1);
                            storageData[targetCId][targetCat].splice(toIndex, 0, movedItem);
                            saveAndRefresh();
                        }
                    });

                    chip.addEventListener('touchstart', (e) => {
                        if (e.touches.length === 1) {
                            dragTimeout = setTimeout(() => {
                                draggedItem = chip;
                                chip.classList.add('dragging');
                            }, 500);
                        }
                    });

                    chip.addEventListener('touchend', (e) => {
                        clearTimeout(dragTimeout);
                        document.querySelectorAll('.chip').forEach(c => c.classList.remove('drag-over'));
                        if (draggedItem) {
                            chip.classList.remove('dragging');
                            const touch = e.changedTouches[0];
                            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
                            const closestChip = targetEl ? targetEl.closest('.chip') : null;

                            if (closestChip && closestChip !== chip) {
                                const fromIndex = parseInt(chip.dataset.index, 10);
                                const toIndex = parseInt(closestChip.dataset.index, 10);
                                const srcCat = grid.dataset.category;
                                const srcCId = grid.dataset.container;
                                const targetGrid = closestChip.parentNode;
                                const targetCat = targetGrid.dataset.category;
                                const targetCId = targetGrid.dataset.container;

                                ensureContainerSafety(targetCId);
                                if (!storageData[targetCId][targetCat]) storageData[targetCId][targetCat] = [];

                                if (!isNaN(fromIndex) && !isNaN(toIndex)) {
                                    const srcList = storageData[srcCId][srcCat];
                                    const [movedItem] = srcList.splice(fromIndex, 1);
                                    storageData[targetCId][targetCat].splice(toIndex, 0, movedItem);
                                    saveAndRefresh();
                                }
                            }
                            draggedItem = null;
                        }
                    });

                    chip.addEventListener('touchmove', (e) => {
                        if (draggedItem) {
                            e.preventDefault();
                            const touch = e.touches[0];
                            const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
                            const closestChip = targetEl ? targetEl.closest('.chip') : null;
                            document.querySelectorAll('.chip').forEach(c => c.classList.remove('drag-over'));
                            if (closestChip && closestChip !== chip) {
                                closestChip.classList.add('drag-over');
                            }
                        } else {
                            clearTimeout(dragTimeout);
                        }
                    });
                }

                grid.appendChild(chip);
            });
            container.appendChild(grid);
        }
    });

    // === Empty State ===
    if (container.children.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = `
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; height: 100%; gap: 8px;
            color: #333; user-select: none; padding: 10px;
        `;
        if (isSearching) {
            empty.innerHTML = `
                <div style="font-size:32px;opacity:0.3;">🔍</div>
                <div style="font-size:10px;color:#444;text-align:center;line-height:1.6;">
                    لا توجد نتائج مطابقة لبحثك
                </div>
            `;
        } else {
            empty.innerHTML = `
                <div style="font-size:32px;opacity:0.3;">📋</div>
                <div style="font-size:10px;color:#444;text-align:center;line-height:1.6;">
                    لا توجد أقسام بعد<br>
                    <span style="color:var(--accent-green);opacity:0.7;">اضغط "+ قسم" للبدء</span>
                </div>
            `;
        }
        container.appendChild(empty);
    } else if (!isSearching && hasSections && totalNotesInTab === 0) {
        // Sections exist but no notes in the entire current tab
        const emptyNotes = document.createElement('div');
        emptyNotes.style.cssText = `
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; padding: 20px 10px; opacity: 0.6;
            user-select: none; margin-top: 20px;
        `;
        emptyNotes.innerHTML = `
            <div style="font-size:24px; margin-bottom:4px;">📭</div>
            <div style="font-size:10px; color:#666; text-align:center; line-height:1.6;">
                لا توجد اختصارات في هذا التبويب<br>
                <span style="color:var(--accent-green);opacity:0.8;">اضغط على (+) بجوار القسم للإضافة</span>
            </div>
        `;
        container.appendChild(emptyNotes);
    }

    checkBackupStatus();
}

function switchContainer() {
    if (currentContainer === 'c1') currentContainer = 'c2';
    else if (currentContainer === 'c2') currentContainer = 'c3';
    else currentContainer = 'c1';
    closeSearch();
    render();
}

function renameCurrentTab() {
    const currentLabel = tabLabels[currentContainer];
    const newName = window.prompt(`اسم جديد لـ ${currentLabel}:`, currentLabel);
    if (newName !== null && newName.trim() !== '') {
        tabLabels[currentContainer] = newName.trim().slice(0, 12);
        saveTabLabels();
        render();
        showStatus(`تم تسمية التب: ${tabLabels[currentContainer]} ✅`);
    }
}
window.renameCurrentTab = renameCurrentTab;

// longpress على زر Tab لإعادة التسمية
(function setupTabLongPress() {
    let tabLongTimer = null;
    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('containerBtn');
        if (!btn) return;
        btn.addEventListener('mousedown', () => {
            tabLongTimer = setTimeout(() => { tabLongTimer = null; renameCurrentTab(); }, 600);
        });
        btn.addEventListener('mouseup', () => clearTimeout(tabLongTimer));
        btn.addEventListener('mouseleave', () => clearTimeout(tabLongTimer));
        btn.addEventListener('touchstart', (e) => {
            tabLongTimer = setTimeout(() => { tabLongTimer = null; e.preventDefault(); renameCurrentTab(); }, 600);
        }, { passive: false });
        btn.addEventListener('touchend', () => clearTimeout(tabLongTimer));
    });
    // fallback: if DOMContentLoaded already fired
    if (document.readyState !== 'loading') {
        const btn = document.getElementById('containerBtn');
        if (btn) {
            btn.addEventListener('mousedown', () => {
                tabLongTimer = setTimeout(() => { tabLongTimer = null; renameCurrentTab(); }, 600);
            });
            btn.addEventListener('mouseup', () => clearTimeout(tabLongTimer));
            btn.addEventListener('mouseleave', () => clearTimeout(tabLongTimer));
        }
    }
})();

function openSearch() {
    document.getElementById('searchBar').style.display = 'flex';
    const input = document.getElementById('searchInput');
    input.focus();
}

function closeSearch() {
    document.getElementById('searchBar').style.display = 'none';
    document.getElementById('searchInput').value = '';
    searchQuery = '';
    render();
}

function handleSearch() {
    searchQuery = document.getElementById('searchInput').value.toLowerCase().trim();
    render();
}

window.addEventListener('keydown', (e) => {
    const shortcuts = window.getFastToolkitShortcuts ? window.getFastToolkitShortcuts() : { enabled: true, search: '/', sort: 's', tab: 't' };
    if (!shortcuts.enabled) return;

    const activeEl = document.activeElement;
    const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);

    if (e.key === 'Escape') {
        closeSearch();
        closeModal();
        closeConfirmBox();
        return;
    }

    const pressedKey = e.key.toLowerCase();

    // '/' or 'Ctrl + F' to search
    if (!isInput && (pressedKey === shortcuts.search.toLowerCase() || (e.ctrlKey && pressedKey === 'f'))) {
        e.preventDefault();
        openSearch();
        return;
    }

    if (isInput) return;
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

    if (pressedKey === shortcuts.sort.toLowerCase()) {
        toggleSortMode();
    } else if (pressedKey === shortcuts.tab.toLowerCase()) {
        switchContainer();
    }
});

function toggleSortMode() { isSortMode = !isSortMode; render(); }

function moveSection(cat, direction) {
    ensureContainerSafety(currentContainer);
    const obj = storageData[currentContainer];
    const keys = Object.keys(obj);
    const index = keys.indexOf(cat);
    if (index === -1) return;

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= keys.length) return;

    const temp = keys[index];
    keys[index] = keys[newIndex];
    keys[newIndex] = temp;

    const newObj = {};
    keys.forEach(k => { newObj[k] = obj[k]; });
    storageData[currentContainer] = newObj;
    saveAndRefresh();
}

function moveSectionToTab(cat, targetCId) {
    if (targetCId === currentContainer) return;
    ensureContainerSafety(targetCId);
    const items = storageData[currentContainer][cat];
    // if name conflicts in target, rename
    let finalName = cat;
    let c = 1;
    while (storageData[targetCId][finalName] !== undefined) {
        finalName = `${cat} (${c++})`;
    }
    storageData[targetCId][finalName] = items;
    delete storageData[currentContainer][cat];
    saveAndRefresh();
    showStatus(`✅ نُقل "${cat}" إلى Tab ${targetCId.replace('c','')}`);
}

function openEditSectionModal(cat) {
    activeCat = cat;
    document.getElementById('editSectionName').value = cat;
    document.getElementById('editSectionModal').classList.add('open');
}

// Global scope bindings for inline calls
window.triggerDeleteSection = triggerDeleteSection;
window.moveSection = moveSection;
window.moveSectionToTab = moveSectionToTab;
window.openItemModal = openItemModal;
window.openEditSectionModal = openEditSectionModal;

function saveSectionName() {
    const newName = document.getElementById('editSectionName').value.trim();
    if (newName && newName !== activeCat) {
        ensureContainerSafety(currentContainer);
        if (!storageData[currentContainer][newName]) {
            const obj = storageData[currentContainer];
            const newObj = {};
            Object.keys(obj).forEach(k => {
                if (k === activeCat) newObj[newName] = obj[activeCat];
                else newObj[k] = obj[k];
            });
            storageData[currentContainer] = newObj;
            saveAndRefresh();
        }
    }
    closeModal();
}
window.saveSectionName = saveSectionName;

function checkBackupStatus() {
    const dotEl = document.getElementById('backupDot');
    if (unbackedUpCount > 0) {
        dotEl.style.display = 'block';
        dotEl.setAttribute('data-tooltip', `تحتاج نسخة لـ ${unbackedUpCount} نوتات`);
    } else {
        dotEl.style.display = 'none';
    }
}

function showCustomConfirm(message, callback) {
    const box = document.getElementById('confirmBox');
    document.getElementById('confirmTxt').innerText = message;
    box.style.display = 'flex';
    confirmCallback = callback;
}

function closeConfirmBox() {
    document.getElementById('confirmBox').style.display = 'none';
    confirmCallback = null;
}
window.closeConfirmBox = closeConfirmBox;

document.getElementById('confirmYesBtn').onclick = function () {
    if (confirmCallback) confirmCallback();
    closeConfirmBox();
};

function triggerDeleteSection(cat) {
    const safeDisplay = escapeHTML(cat);
    showCustomConfirm(`حذف قسم "${safeDisplay}"؟`, () => {
        ensureContainerSafety(currentContainer);
        delete storageData[currentContainer][cat];
        saveAndRefresh();
    });
}

function triggerDeleteItem() {
    const catToDelete = activeCat;
    const idToDelete = activeId;
    const targetCId = modalTargetContainer;
    closeModal();
    showCustomConfirm('حذف هذا الاختصار؟', () => {
        ensureContainerSafety(targetCId);
        storageData[targetCId][catToDelete] = storageData[targetCId][catToDelete].filter(x => x.id !== idToDelete);
        saveAndRefresh();
    });
}
window.triggerDeleteItem = triggerDeleteItem;

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (x) => {
        try {
            const imported = JSON.parse(x.target.result);
            if (!imported || typeof imported !== 'object') throw new Error();
            ['c1', 'c2', 'c3'].forEach(cId => {
                if (imported[cId]) {
                    ensureContainerSafety(cId);
                    for (let cat in imported[cId]) {
                        if (!storageData[cId][cat]) storageData[cId][cat] = [];
                        let existing = storageData[cId][cat].map(i => i.l);
                        imported[cId][cat].forEach(newItem => {
                            let finalLabel = newItem.l || 'بدون اسم';
                            let finalText = newItem.t || '';
                            let c = 1;
                            while (existing.includes(finalLabel)) {
                                finalLabel = `${newItem.l || 'بدون اسم'} (نسخة ${c})`;
                                c++;
                            }
                            storageData[cId][cat].push({ id: Date.now() + Math.random(), l: finalLabel, t: finalText });
                            existing.push(finalLabel);
                        });
                    }
                }
            });
            saveAndRefresh();
            showStatus("تم الدمج! 📂");
        } catch (err) { showStatus("خطأ بالملف! ❌"); }
    };
    reader.readAsText(file);
    e.target.value = '';
}
window.importData = importData;

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

function showStatus(msg) {
    showToast(msg, msg.includes('❌') || msg.includes('⚠️'));
}

function openSectionModal() {
    document.getElementById('sectionName').value = '';
    document.getElementById('sectionModal').classList.add('open');
}
window.openSectionModal = openSectionModal;

function addSection() {
    const name = document.getElementById('sectionName').value.trim();
    if (name) {
        ensureContainerSafety(currentContainer);
        if (!storageData[currentContainer][name]) {
            storageData[currentContainer][name] = [];
            saveAndRefresh();
        }
        closeModal();
    }
}
window.addSection = addSection;

function openItemModal(cId, cat, item = null) {
    modalTargetContainer = cId || currentContainer;
    activeCat = cat;
    activeId = item ? item.id : null;
    document.getElementById('itemName').value = item ? (item.l || '') : '';
    document.getElementById('itemText').value = item ? (item.t || '') : '';
    document.getElementById('delItemBtn').style.display = item ? 'block' : 'none';
    document.getElementById('editModal').classList.add('open');
}

function saveItem() {
    const l = document.getElementById('itemName').value.trim(), t = document.getElementById('itemText').value.trim();
    if (!l || !t) return;

    const targetCId = modalTargetContainer;
    ensureContainerSafety(targetCId);

    if (activeId) {
        let i = storageData[targetCId][activeCat].find(x => x.id === activeId);
        if (i) {
            if (i.l !== l || i.t !== t) {
                i.l = l;
                i.t = t;
                unbackedUpCount++;
                localStorage.setItem('unbackedUpCountV6', unbackedUpCount);
            }
        }
    } else {
        storageData[targetCId][activeCat].push({ id: Date.now() + Math.random(), l, t });
        unbackedUpCount++;
        localStorage.setItem('unbackedUpCountV6', unbackedUpCount);
    }
    saveAndRefresh(); closeModal();
}
window.saveItem = saveItem;

function closeModal() {
    document.querySelectorAll('.modal').forEach(m => {
        m.classList.remove('open');
        m.style.display = ''; // تفريغ الـ inline style إذا كان موجوداً
    });
    activeCat = null;
    activeId = null;
}
window.closeModal = closeModal;

function triggerDeleteAll() {
    const input = document.getElementById('deleteAllConfirmInput');
    if (input) {
        input.value = '';
    }
    const modal = document.getElementById('deleteAllModal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => input && input.focus(), 50);
    }
}
window.triggerDeleteAll = triggerDeleteAll;

function confirmDeleteAll() {
    const input = document.getElementById('deleteAllConfirmInput');
    const val = input ? input.value.trim().toLowerCase() : '';
    if (val === 'delete all') {
        storageData = {
            c1: {},
            c2: {},
            c3: {}
        };
        unbackedUpCount = 0;
        localStorage.setItem('unbackedUpCountV6', '0');
        saveAndRefresh();
        closeModal();
        showStatus("تم مسح كافة البيانات 🗑️");
    } else {
        showStatus("تأكيد خاطئ! ❌");
        if (input) {
            input.focus();
        }
    }
}
window.confirmDeleteAll = confirmDeleteAll;

function saveAndRefresh() {
    localStorage.setItem('copyGridDataV6', JSON.stringify(storageData));
    render();
}

function exportData() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    const filename = `backup_${year}-${month}-${day}_${hours}-${minutes}-${seconds}.json`;

    const blob = new Blob([JSON.stringify(storageData, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();

    unbackedUpCount = 0;
    localStorage.setItem('unbackedUpCountV6', unbackedUpCount);
    render();
}
window.exportData = exportData;

// ====== خاصية Sync البطاقة ======
function getActiveCardData() {
    try {
        const raw = localStorage.getItem('cardScannerData');
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (!d || !d.card || d.card === '-' || d.card === '0000') return null;
        return d;
    } catch { return null; }
}

function updateCardSyncBadge() {
    const badge = document.getElementById('cardSyncBadge');
    if (!badge) return;
    const d = getActiveCardData();
    if (d) {
        badge.style.display = 'inline-block';
        badge.textContent = `• ${d.card} | ${d.amount}`;
    } else {
        badge.style.display = 'none';
    }
}

// استمع لتغييرات localStorage من تاب آخر (صفحة البطاقة)
window.addEventListener('storage', (e) => {
    if (e.key === 'cardScannerData') {
        updateCardSyncBadge();
    }
});

let gDriveAccessToken = sessionStorage.getItem('gDriveAccessToken') || null;

function checkResponseStatus(res) {
    if (res.status === 401) {
        gDriveAccessToken = null;
        sessionStorage.removeItem('gDriveAccessToken');
        showStatus("انتهت جلسة Drive، يرجى إعادة تسجيل الدخول! ⚠️");
        throw new Error("Unauthorized");
    }
    return res;
}

function triggerBackgroundCloudSync() {
    if (!gDriveAccessToken) {
        showStatus("☁️ مزامنة معلقة (سجل دخول أولاً)");
        return;
    }
    executeDriveAction(gDriveAccessToken, 'backup', true);
}

function triggerCloudAction(action) {
    const clientId = window.GOOGLE_CLIENT_ID;
    if (!clientId) {
        showStatus("يرجى إعداد Google Client ID في settings.js أولاً! ⚠️");
        alert("تنبيه: لتفعيل المزامنة السحابية، يرجى إدخال معرف Google Client ID الخاص بك أولاً في أول سطر من ملف settings.js");
        return;
    }
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        showStatus("خطأ في تحميل مكتبة Google! ❌");
        return;
    }

    showStatus("جاري الاتصال بحساب Google... ☁️");
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
                    showStatus("فشل تسجيل الدخول! ❌");
                }
            },
        });
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
        console.error("GIS initialization failed:", err);
        showStatus("خطأ في الاتصال! ❌");
    }
}
window.triggerCloudAction = triggerCloudAction;

function executeDriveAction(token, action, isBackground = false) {
    showStatus(isBackground ? "جاري الحفظ تلقائياً... ☁️" : "جاري الاتصال بـ Google Drive... ☁️");
    const filename = "fast_copy_backup.json";

    fetch(`https://www.googleapis.com/drive/v3/files?q=name='${filename}'+and+trashed=false`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(checkResponseStatus)
    .then(res => res.json())
    .then(data => {
        const files = data.files || [];
        const fileId = files.length > 0 ? files[0].id : null;

        if (action === 'backup') {
            if (fileId) {
                updateDriveFile(token, fileId, storageData, isBackground);
            } else {
                createDriveFile(token, filename, storageData, isBackground);
            }
        } else if (action === 'restore') {
            if (fileId) {
                restoreDriveFile(token, fileId);
            } else {
                showStatus("لا توجد نسخة سحابية محفوظة! ❌");
            }
        }
    })
    .catch(err => {
        console.error("Drive search failed:", err);
        if (err.message !== "Unauthorized") {
            showStatus("فشل الاتصال بـ Google Drive! ❌");
        }
    });
}

function updateDriveFile(token, fileId, content, isBackground = false) {
    if (!isBackground) showStatus("جاري رفع البيانات... ☁️");
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
            unbackedUpCount = 0;
            localStorage.setItem('unbackedUpCountV6', '0');
            render();
            showStatus(isBackground ? "تمت المزامنة التلقائية! ☁️ ✅" : "تم النسخ السحابي بنجاح! ☁️ ✅");
        } else {
            showStatus("فشل تحديث النسخة! ❌");
        }
    })
    .catch(err => {
        console.error("Drive update failed:", err);
        if (err.message !== "Unauthorized") {
            showStatus("فشل رفع البيانات! ❌");
        }
    });
}

function createDriveFile(token, filename, content, isBackground = false) {
    showStatus("جاري إنشاء ملف النسخ... ☁️");
    fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: filename,
            mimeType: 'application/json'
        })
    })
    .then(checkResponseStatus)
    .then(res => res.json())
    .then(meta => {
        if (meta && meta.id) {
            updateDriveFile(token, meta.id, content, isBackground);
        } else {
            showStatus("فشل إنشاء ملف النسخة! ❌");
        }
    })
    .catch(err => {
        console.error("Drive creation failed:", err);
        if (err.message !== "Unauthorized") {
            showStatus("فشل إنشاء الملف! ❌");
        }
    });
}

function restoreDriveFile(token, fileId) {
    showStatus("جاري تحميل البيانات... ☁️");
    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(checkResponseStatus)
    .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
    })
    .then(imported => {
        if (imported && typeof imported === 'object') {
            storageData = imported;
            saveAndRefresh();
            unbackedUpCount = 0;
            localStorage.setItem('unbackedUpCountV6', '0');
            render();
            showStatus("تمت الاستعادة السحابية بنجاح! ☁️ ✅");
        } else {
            showStatus("ملف المزامنة غير صالح! ❌");
        }
    })
    .catch(err => {
        console.error("Drive restore failed:", err);
        if (err.message !== "Unauthorized") {
            showStatus("فشل تحميل البيانات! ❌");
        }
    });
}

// Bind UI actions to window context
window.switchContainer = switchContainer;
window.openSearch = openSearch;
window.closeSearch = closeSearch;
window.handleSearch = handleSearch;
window.toggleSortMode = toggleSortMode;

updateCardSyncBadge();
render();

