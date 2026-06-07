const noteArea = document.getElementById('stickyNote');
const footerElement = document.getElementById('dynamicFooter');

// قائمة العبارات التحفيزية
const phrases = [
    "Keep it up 👏", "Great job 🔥", "Excellent work 🚀",
    "You’re doing great 💯", "Well done 👌", "Nice progress 📈",
    "Outstanding 👏", "Impressive work ⭐", "Keep pushing 💪",
    "You nailed it ✅", "Smooth work 😎", "Solid effort 👌",
    "Keep grinding 🚀", "Big respect 👏", "That’s clean ✨",
    "Smart move 🧠", "Strong performance 💯", "Keep shining ⭐",
    "Leveling up 🚀"
];

// عند تحميل الصفحة
window.onload = function () {
    const savedNote = localStorage.getItem('quick_sticky_note');
    if (savedNote) {
        noteArea.value = savedNote;
    }

    const randomIndex = Math.floor(Math.random() * phrases.length);
    footerElement.innerText = phrases[randomIndex];
};

// حفظ الملاحظة تلقائياً
noteArea.addEventListener('input', function () {
    localStorage.setItem('quick_sticky_note', noteArea.value);
});

// وظيفة زر المسح
function clearNote() {
    if (noteArea.value.trim() !== "") {
        noteArea.value = "";
        localStorage.removeItem('quick_sticky_note');
        noteArea.focus();
    }
}

// وظيفة زر النسخ
function copyNote() {
    if (noteArea.value.trim() !== "") {
        navigator.clipboard.writeText(noteArea.value);

        const copyBtn = document.querySelector('.btn-copy');
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = "✅ تم النسخ";
        setTimeout(() => {
            copyBtn.innerHTML = originalText;
        }, 1000);
    }
}

// Bind UI actions to window context
window.clearNote = clearNote;
window.copyNote = copyNote;

// Keyboard Shortcuts for Sticky Notes
document.addEventListener('keydown', (e) => {
    const shortcuts = window.getFastToolkitShortcuts ? window.getFastToolkitShortcuts() : { enabled: true };
    if (!shortcuts.enabled) return;

    // Ctrl + Enter to copy, Ctrl + Backspace to clear note content (even when typing in the text area)
    if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        copyNote();
    } else if (e.ctrlKey && e.key === 'Backspace') {
        e.preventDefault();
        clearNote();
    }
});
