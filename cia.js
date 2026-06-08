let ciaData = {
    problems: []
};

let currentAddingType = ''; // 'C', 'I', or 'A'
let currentEditIndex = null;
let unbackedUpCount = 0;

// Load data on start
function loadCIAData() {
    const stored = localStorage.getItem('fastToolkitCIA_v2');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (parsed.problems && Array.isArray(parsed.problems)) {
                ciaData = parsed;
            }
        } catch (e) {
            console.error("Error loading CIA data", e);
        }
    } else {
        // Clear any old v1 data
        localStorage.removeItem('fastToolkitCIA');
    }
    renderSelects();
}

// Save data to localStorage
function saveCIAData() {
    localStorage.setItem('fastToolkitCIA_v2', JSON.stringify(ciaData));
    unbackedUpCount++;
    checkBackupStatus();
    renderSelects();
}

function checkBackupStatus() {
    const dotEl = document.getElementById('backupDot');
    if (!dotEl) return;
    if (unbackedUpCount > 0) {
        dotEl.style.display = 'block';
        dotEl.setAttribute('data-tooltip', `يوجد ${unbackedUpCount} تغيير غير محفوظ`);
    } else {
        dotEl.style.display = 'none';
    }
}

// Render the <option> elements
function renderSelects() {
    const selectC = document.getElementById('select-C');
    const selectI = document.getElementById('select-I');
    const selectA = document.getElementById('select-A');

    // Save current selected C index to preserve it after re-render
    const selectedCIndex = selectC.value;

    // Clear C options
    const firstOptionC = selectC.options[0];
    selectC.innerHTML = '';
    selectC.appendChild(firstOptionC);

    // Populate C options
    ciaData.problems.forEach((prob, index) => {
        const opt = document.createElement('option');
        opt.value = index;
        opt.textContent = prob.name;
        selectC.appendChild(opt);
    });

    // Restore selected C
    if (selectedCIndex !== "" && selectedCIndex < ciaData.problems.length) {
        selectC.value = selectedCIndex;
    }

    // Render I and A based on selected C
    renderSubSelects();
}

function handleProblemChange() {
    renderSubSelects();
    checkAutoCopy();
}

function handleSubSelectChange() {
    checkAutoCopy();
}

function checkAutoCopy() {
    const cb = document.getElementById('autoCopyCb');
    if (cb && cb.checked) {
        const cVal = document.getElementById('select-C').value;
        const iVal = document.getElementById('select-I').value;
        const aVal = document.getElementById('select-A').value;
        if (cVal !== "" && iVal !== "" && aVal !== "") {
            generateCIA();
        }
    }
}

function clearSelections() {
    document.getElementById('select-C').value = "";
    renderSubSelects();
}

function renderSubSelects() {
    const selectC = document.getElementById('select-C');
    const selectI = document.getElementById('select-I');
    const selectA = document.getElementById('select-A');

    const selectedCIndex = selectC.value;

    // Clear I options
    const firstOptionI = selectI.options[0];
    selectI.innerHTML = '';
    selectI.appendChild(firstOptionI);

    // Clear A options
    const firstOptionA = selectA.options[0];
    selectA.innerHTML = '';
    selectA.appendChild(firstOptionA);

    const sectionI = document.getElementById('section-I');
    const sectionA = document.getElementById('section-A');

    if (selectedCIndex !== "") {
        if(sectionI) { sectionI.style.opacity = "1"; sectionI.style.pointerEvents = "auto"; }
        if(sectionA) { sectionA.style.opacity = "1"; sectionA.style.pointerEvents = "auto"; }

        const problem = ciaData.problems[selectedCIndex];
        
        problem.I.forEach((item, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            opt.textContent = item;
            selectI.appendChild(opt);
        });

        problem.A.forEach((item, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            opt.textContent = item;
            selectA.appendChild(opt);
        });
    } else {
        if(sectionI) { sectionI.style.opacity = "0.4"; sectionI.style.pointerEvents = "none"; }
        if(sectionA) { sectionA.style.opacity = "0.4"; sectionA.style.pointerEvents = "none"; }
    }
}

// Open modal to add new item
function openAddModal(type) {
    if ((type === 'I' || type === 'A') && document.getElementById('select-C').value === "") {
        showToast('اختر المشكلة أولاً ⚠️', 'error');
        return;
    }

    currentAddingType = type;
    currentEditIndex = null;
    const titles = { 'C': 'Customer Problem', 'I': 'Investigation', 'A': 'Action' };
    document.getElementById('modalTitle').innerText = `إضافة لـ ${titles[type]}`;
    document.getElementById('newItemInput').value = '';
    document.getElementById('addModal').classList.add('open');
    setTimeout(() => document.getElementById('newItemInput').focus(), 50);
}

// Open modal to edit item
function openEditModal(type) {
    const select = document.getElementById(`select-${type}`);
    const selectedIndex = select.value;
    const selectCIndex = document.getElementById('select-C').value;

    if (type === 'C' && selectedIndex === "") {
        showToast('اختر المشكلة للتعديل ⚠️', 'error');
        return;
    }
    if ((type === 'I' || type === 'A') && (selectCIndex === "" || selectedIndex === "")) {
        showToast('اختر عنصراً للتعديل ⚠️', 'error');
        return;
    }

    currentAddingType = type;
    currentEditIndex = selectedIndex;
    const titles = { 'C': 'Customer Problem', 'I': 'Investigation', 'A': 'Action' };
    document.getElementById('modalTitle').innerText = `تعديل ${titles[type]}`;
    
    let currentText = "";
    if (type === 'C') currentText = ciaData.problems[selectedIndex].name;
    else currentText = ciaData.problems[selectCIndex][type][selectedIndex];

    document.getElementById('newItemInput').value = currentText;
    document.getElementById('addModal').classList.add('open');
    setTimeout(() => document.getElementById('newItemInput').focus(), 50);
}

// Move item up/down
function moveSelected(type, direction) {
    const select = document.getElementById(`select-${type}`);
    const selectedIndex = select.value;
    const selectCIndex = document.getElementById('select-C').value;

    if (selectedIndex === "") return;

    const idx = parseInt(selectedIndex);
    const newIdx = idx + direction;

    if (type === 'C') {
        if (newIdx < 0 || newIdx >= ciaData.problems.length) return;
        const temp = ciaData.problems[idx];
        ciaData.problems[idx] = ciaData.problems[newIdx];
        ciaData.problems[newIdx] = temp;
        saveCIAData();
        document.getElementById('select-C').value = newIdx;
    } else {
        const arr = ciaData.problems[selectCIndex][type];
        if (newIdx < 0 || newIdx >= arr.length) return;
        const temp = arr[idx];
        arr[idx] = arr[newIdx];
        arr[newIdx] = temp;
        saveCIAData();
        document.getElementById(`select-${type}`).value = newIdx;
    }
}

// Close modal
function closeModal() {
    document.getElementById('addModal').classList.remove('open');
    const delModal = document.getElementById('deleteAllModal');
    if (delModal) delModal.classList.remove('open');
    currentAddingType = '';
    currentEditIndex = null;
}

function saveNewItem() {
    const val = document.getElementById('newItemInput').value.trim();
    if (!val || !currentAddingType) return;

    if (currentEditIndex !== null) {
        // Edit existing
        if (currentAddingType === 'C') {
            ciaData.problems[currentEditIndex].name = val;
        } else {
            const selectedCIndex = document.getElementById('select-C').value;
            ciaData.problems[selectedCIndex][currentAddingType][currentEditIndex] = val;
        }
        saveCIAData();
        // Maintain selection for sub items if C is updated, or I/A
        if (currentAddingType === 'C') renderSubSelects();
        else document.getElementById(`select-${currentAddingType}`).value = currentEditIndex;
        
        showToast('تم التعديل بنجاح ✏️');
    } else {
        // Add new
        if (currentAddingType === 'C') {
            ciaData.problems.push({ name: val, I: [], A: [] });
            saveCIAData();
            document.getElementById('select-C').value = ciaData.problems.length - 1;
            renderSubSelects();
        } else {
            const selectedCIndex = document.getElementById('select-C').value;
            if (selectedCIndex !== "") {
                ciaData.problems[selectedCIndex][currentAddingType].push(val);
                saveCIAData();
                document.getElementById(`select-${currentAddingType}`).value = ciaData.problems[selectedCIndex][currentAddingType].length - 1;
            }
        }
        showToast('تمت الإضافة بنجاح ✅');
    }
    closeModal();
}

// Handle Enter key in modal
document.getElementById('newItemInput').addEventListener('keydown', (e) => {
    // Let Enter insert a newline in textarea, but allow Ctrl+Enter to save
    if (e.key === 'Enter' && e.ctrlKey) {
        saveNewItem();
    }
    if (e.key === 'Escape') closeModal();
});

function showConfirmBox(msg, onConfirm) {
    document.getElementById('confirmTxt').innerText = msg;
    const box = document.getElementById('confirmBox');
    box.style.display = 'flex';
    const yesBtn = document.getElementById('confirmYesBtn');
    yesBtn.onclick = () => {
        closeConfirmBox();
        onConfirm();
    };
}

function closeConfirmBox() {
    document.getElementById('confirmBox').style.display = 'none';
}

// Delete selected item from a dropdown
function deleteSelected(type) {
    const selectC = document.getElementById('select-C');
    const selectedCIndex = selectC.value;
    const targetSelect = document.getElementById(`select-${type}`);
    const selectedItemIndex = targetSelect.value;
    
    if (type === 'C') {
        if (selectedCIndex === "") {
            showStatus('اختر المشكلة للحذف ⚠️');
            return;
        }
        showConfirmBox('حذف المشكلة وجميع الإجراءات التابعة؟', () => {
            ciaData.problems.splice(parseInt(selectedCIndex), 1);
            saveCIAData();
            showStatus('تم الحذف 🗑️');
        });
    } else {
        if (selectedCIndex === "") return;
        if (selectedItemIndex === "") {
            showStatus('اختر عنصراً للحذف أولاً ⚠️');
            return;
        }
        showConfirmBox('هل أنت متأكد من الحذف؟', () => {
            ciaData.problems[selectedCIndex][type].splice(parseInt(selectedItemIndex), 1);
            saveCIAData();
            showStatus('تم الحذف 🗑️');
        });
    }
}

// Generate the text and copy to clipboard
function generateCIA() {
    const cIndex = document.getElementById('select-C').value;
    const iIndex = document.getElementById('select-I').value;
    const aIndex = document.getElementById('select-A').value;

    let cText = "";
    let iText = "";
    let aText = "";

    if (cIndex !== "") {
        const prob = ciaData.problems[cIndex];
        cText = prob.name;
        if (iIndex !== "") iText = prob.I[iIndex];
        if (aIndex !== "") aText = prob.A[aIndex];
    }

    const outputText = `C : [ ${cText} ]\nI : [ ${iText} ]\nA : [ ${aText} ]\n#CIA`;

    navigator.clipboard.writeText(outputText).then(() => {
        showStatus('تم النسخ بنجاح! 📋✅');
    }).catch(err => {
        console.error('Failed to copy: ', err);
        showStatus('فشل النسخ ❌');
    });
}

function showToast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'error' : ''}`;
    toast.innerText = msg;
    
    container.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    
    // Remove after 2.5s
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 2500);
}

// Keep showStatus for compatibility with existing code
function showStatus(msg) {
    showToast(msg);
}

// Export CIA Data
function exportCIAData() {
    const dataStr = JSON.stringify(ciaData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cia_maker_v2_backup.json";
    a.click();
    showStatus('تم تصدير البيانات 💾');
}

// Import CIA Data
function importCIAData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (x) => {
        try {
            const imported = JSON.parse(x.target.result);
            if (imported.problems && Array.isArray(imported.problems)) {
                ciaData = imported;
                saveCIAData();
                showStatus("تم استيراد البيانات! 📂");
            } else {
                throw new Error("Invalid format");
            }
        } catch (err) {
            showStatus("ملف غير صالح! ❌");
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// Delete All Data Modal Logic
function triggerDeleteAll() {
    document.getElementById('deleteAllConfirmInput').value = '';
    document.getElementById('deleteAllModal').classList.add('open');
    setTimeout(() => document.getElementById('deleteAllConfirmInput').focus(), 50);
}

function confirmDeleteAll() {
    const input = document.getElementById('deleteAllConfirmInput').value.trim().toLowerCase();
    if (input === 'delete all') {
        ciaData = { problems: [] };
        saveCIAData();
        closeModal();
        showStatus("تم المسح بالكامل 🗑️");
    } else {
        showStatus("اكتب delete all للتأكيد ⚠️");
    }
}

// ====== Drive Backup Logic ======
let gDriveAccessToken = sessionStorage.getItem('gDriveAccessToken') || null;

function checkResponseStatus(res) {
    if (res.status === 401) {
        gDriveAccessToken = null;
        sessionStorage.removeItem('gDriveAccessToken');
        showStatus("انتهت جلسة Drive، يرجى تسجيل الدخول ⚠️");
        throw new Error("Unauthorized");
    }
    return res;
}

function triggerCloudAction(action) {
    const clientId = window.GOOGLE_CLIENT_ID;
    if (!clientId) {
        showStatus("إعدادات Drive غير متوفرة ⚠️");
        return;
    }
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        showStatus("خطأ في مكتبة Google ❌");
        return;
    }

    showStatus("جاري الاتصال بـ Google... ☁️");
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
                    showStatus("فشل تسجيل الدخول ❌");
                }
            },
        });
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
        console.error("GIS initialization failed:", err);
        showStatus("خطأ في الاتصال ❌");
    }
}

function executeDriveAction(token, action) {
    showStatus("جاري الاتصال بـ Drive... ☁️");
    const filename = "cia_maker_v2_backup_cloud.json";

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
                updateDriveFile(token, fileId, ciaData);
            } else {
                createDriveFile(token, filename, ciaData);
            }
        } else if (action === 'restore') {
            if (fileId) {
                restoreDriveFile(token, fileId);
            } else {
                showStatus("لا توجد نسخة محفوظة ❌");
            }
        }
    })
    .catch(err => {
        console.error("Drive search failed:", err);
        if (err.message !== "Unauthorized") showStatus("فشل الاتصال بـ Drive ❌");
    });
}

function updateDriveFile(token, fileId, content) {
    showStatus("جاري رفع البيانات... ☁️");
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
            checkBackupStatus();
            showStatus("تم النسخ السحابي! ☁️✅");
        } else showStatus("فشل تحديث النسخة ❌");
    })
    .catch(err => {
        if (err.message !== "Unauthorized") showStatus("فشل رفع البيانات ❌");
    });
}

function createDriveFile(token, filename, content) {
    showStatus("إنشاء ملف النسخ... ☁️");
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
        if (meta && meta.id) {
            updateDriveFile(token, meta.id, content);
            unbackedUpCount = 0;
            checkBackupStatus();
            showStatus("تم إنشاء ملف سحابي ☁️");
        }
        else showStatus("فشل إنشاء الملف ❌");
    })
    .catch(err => {
        if (err.message !== "Unauthorized") showStatus("فشل إنشاء الملف ❌");
    });
}

function restoreDriveFile(token, fileId) {
    showStatus("جاري الاستعادة... ☁️");
    fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(checkResponseStatus)
    .then(res => {
        if (!res.ok) throw new Error();
        return res.json();
    })
    .then(imported => {
        if (imported && imported.problems && Array.isArray(imported.problems)) {
            ciaData = imported;
            unbackedUpCount = 0;
            saveCIAData();
            unbackedUpCount = 0; // Because saveCIAData increments it
            checkBackupStatus();
            showStatus("تم الاستعادة ☁️");
        } else {
            showStatus("ملف غير صالح ❌");
        }
    })
    .catch(err => {
        if (err.message !== "Unauthorized") showStatus("فشل تحميل البيانات ❌");
    });
}

// Initialize on load
loadCIAData();

// Restore autoCopy checkbox state from localStorage
(function restoreAutoCopy() {
    const cb = document.getElementById('autoCopyCb');
    if (cb) {
        cb.checked = localStorage.getItem('ciaAutoCopy') === 'true';
        cb.addEventListener('change', () => {
            localStorage.setItem('ciaAutoCopy', cb.checked);
        });
    }
})();

// Drag and Drop JSON
document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
    document.body.classList.add('drag-over');
});
document.body.addEventListener('dragleave', (e) => {
    e.preventDefault();
    document.body.classList.remove('drag-over');
});
document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type === "application/json" || file.name.endsWith('.json')) {
            const reader = new FileReader();
            reader.onload = (x) => {
                try {
                    const imported = JSON.parse(x.target.result);
                    if (imported.problems && Array.isArray(imported.problems)) {
                        ciaData = imported;
                        saveCIAData();
                        showToast("تم استيراد البيانات! 📂");
                    } else {
                        showToast("ملف غير صالح! ❌", "error");
                    }
                } catch (err) {
                    showToast("ملف غير صالح! ❌", "error");
                }
            };
            reader.readAsText(file);
        } else {
            showToast("يرجى إفلات ملف JSON فقط ⚠️", "error");
        }
    }
});

// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl + C to copy CIA if we are not typing in an input
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        const tag = e.target.tagName.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
            const cIndex = document.getElementById('select-C').value;
            if (cIndex !== "") {
                e.preventDefault(); // Prevent default copy
                generateCIA();
            }
        }
    }
});
