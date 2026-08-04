// ==========================================
// Multi-Sticky Notes System - FastToolkit
// يدعم حتى 10 ملاحظات مع تبويبات
// ==========================================

const noteArea = document.getElementById('stickyNote');
const footerElement = document.getElementById('dynamicFooter');
const tabsBar = document.getElementById('tabsBar');

const STORAGE_KEY = 'stickyNotesData';
const MAX_NOTES = 10;

// قائمة العبارات التحفيزية
const phrases = [
    "Keep it up 👏", "Great job 🔥", "Excellent work 🚀",
    "You're doing great 💯", "Well done 👌", "Nice progress 📈",
    "Outstanding 👏", "Impressive work ⭐", "Keep pushing 💪",
    "You nailed it ✅", "Smooth work 😎", "Solid effort 👌",
    "Keep grinding 🚀", "Big respect 👏", "That's clean ✨",
    "Smart move 🧠", "Strong performance 💯", "Keep shining ⭐",
    "Leveling up 🚀"
];

// ====== تحميل وحفظ البيانات ======
function loadAllNotes() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            // دعم الإصدار القديم (ملاحظة واحدة)
            if (Array.isArray(parsed)) return parsed;
        }
    } catch { }

    // إصدار قديم - ملاحظة واحدة
    const legacy = localStorage.getItem('quick_sticky_note');
    if (legacy) {
        return [{ id: 1, label: 'ملاحظة 1', text: legacy }];
    }

    return [{ id: 1, label: 'ملاحظة 1', text: '' }];
}

function saveAllNotes(notes) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

// ====== الحالة الداخلية ======
let notes = loadAllNotes();
let activeId = notes[0]?.id ?? 1;

function getActiveNote() {
    return notes.find(n => n.id === activeId);
}

// ====== رسم التبويبات ======
function renderTabs() {
    tabsBar.innerHTML = '';

    notes.forEach(note => {
        const pill = document.createElement('div');
        pill.className = 'tab-pill' + (note.id === activeId ? ' active' : '');
        pill.title = note.label;

        // عنوان التبويب (أول 8 أحرف من النص أو الاسم)
        const preview = note.text.trim().slice(0, 8) || note.label;
        const labelEl = document.createElement('span');
        labelEl.textContent = preview;
        labelEl.style.maxWidth = '48px';
        labelEl.style.overflow = 'hidden';
        labelEl.style.textOverflow = 'ellipsis';
        labelEl.style.whiteSpace = 'nowrap';
        pill.appendChild(labelEl);

        // زر الحذف (يظهر فقط إن وُجد أكثر من ملاحظة)
        if (notes.length > 1) {
            const delBtn = document.createElement('span');
            delBtn.className = 'tab-del';
            delBtn.textContent = '×';
            delBtn.title = 'حذف الملاحظة';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteNote(note.id);
            });
            pill.appendChild(delBtn);
        }

        pill.addEventListener('click', () => switchNote(note.id));
        tabsBar.appendChild(pill);
    });

    // زر إضافة ملاحظة جديدة
    if (notes.length < MAX_NOTES) {
        const addBtn = document.createElement('div');
        addBtn.className = 'tab-add-btn';
        addBtn.title = 'إضافة ملاحظة جديدة';
        addBtn.textContent = '+';
        addBtn.addEventListener('click', addNewNote);
        tabsBar.appendChild(addBtn);
    }
}

// ====== التنقل بين الملاحظات ======
function switchNote(id) {
    // حفظ الملاحظة الحالية قبل التبديل
    const current = getActiveNote();
    if (current) current.text = noteArea.value;

    activeId = id;
    const note = getActiveNote();
    noteArea.value = note ? note.text : '';
    saveAllNotes(notes);
    renderTabs();
    noteArea.focus();
}

// ====== إضافة ملاحظة جديدة ======
function addNewNote() {
    if (notes.length >= MAX_NOTES) return;

    // حفظ الملاحظة الحالية
    const current = getActiveNote();
    if (current) current.text = noteArea.value;

    const maxId = notes.reduce((m, n) => Math.max(m, n.id), 0);
    const newNote = { id: maxId + 1, label: `ملاحظة ${maxId + 1}`, text: '' };
    notes.push(newNote);
    activeId = newNote.id;
    noteArea.value = '';
    saveAllNotes(notes);
    renderTabs();
    noteArea.focus();
}

// ====== حذف ملاحظة ======
function deleteNote(id) {
    if (notes.length <= 1) return;
    notes = notes.filter(n => n.id !== id);
    if (activeId === id) {
        activeId = notes[0].id;
    }
    const note = getActiveNote();
    noteArea.value = note ? note.text : '';
    saveAllNotes(notes);
    renderTabs();
}

// ====== حفظ تلقائي عند الكتابة ======
noteArea.addEventListener('input', function () {
    const note = getActiveNote();
    if (note) {
        note.text = noteArea.value;
        saveAllNotes(notes);
        // تحديث معاينة التبويب الحالي بدون إعادة رسم كاملة
        const activePill = tabsBar.querySelector('.tab-pill.active span:first-child');
        if (activePill) {
            const preview = noteArea.value.trim().slice(0, 8) || note.label;
            activePill.textContent = preview;
        }
    }
});

// ====== وظيفة زر المسح (يمسح الملاحظة الحالية) ======
function clearNote() {
    if (noteArea.value.trim() !== '') {
        noteArea.value = '';
        const note = getActiveNote();
        if (note) {
            note.text = '';
            saveAllNotes(notes);
        }
        renderTabs();
        noteArea.focus();
    }
}

// ====== وظيفة زر النسخ ======
function copyNote() {
    if (noteArea.value.trim() !== '') {
        navigator.clipboard.writeText(noteArea.value);

        const copyBtn = document.querySelector('.btn-copy');
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '✅ تم النسخ';
        setTimeout(() => {
            copyBtn.innerHTML = originalText;
        }, 1000);
    }
}

// ====== تهيئة عند تحميل الصفحة ======
window.onload = function () {
    notes = loadAllNotes();
    activeId = notes[0]?.id ?? 1;
    const note = getActiveNote();
    noteArea.value = note ? note.text : '';

    const randomIndex = Math.floor(Math.random() * phrases.length);
    footerElement.innerText = phrases[randomIndex];

    renderTabs();
};

// Bind UI actions to window context
window.clearNote = clearNote;
window.copyNote = copyNote;
window.addNewNote = addNewNote;
window.switchNote = switchNote;
window.deleteNote = deleteNote;

// Keyboard Shortcuts for Sticky Notes
document.addEventListener('keydown', (e) => {
    const shortcuts = window.getFastToolkitShortcuts ? window.getFastToolkitShortcuts() : { enabled: true };
    if (!shortcuts.enabled) return;

    // Ctrl + Enter to copy, Ctrl + Backspace to clear note content
    if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        copyNote();
    } else if (e.ctrlKey && e.key === 'Backspace') {
        e.preventDefault();
        clearNote();
    } else if (e.ctrlKey && e.key === 'Tab') {
        // Ctrl + Tab للتنقل بين الملاحظات
        e.preventDefault();
        const currentIndex = notes.findIndex(n => n.id === activeId);
        const nextIndex = (currentIndex + 1) % notes.length;
        switchNote(notes[nextIndex].id);
    } else if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        // Ctrl + Shift + N لإضافة ملاحظة جديدة
        e.preventDefault();
        addNewNote();
    }
});
