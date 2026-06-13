function updateClock() {
    const now = new Date();
    const timeElem = document.getElementById('currentTime');
    const dateElem = document.getElementById('currentDate');
    
    if (timeElem) {
        timeElem.innerText = now.toLocaleTimeString('en-US', { hour12: false });
    }
    
    if (dateElem) {
        try {
            const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {day: 'numeric', month: 'long', year: 'numeric'}).format(now);
            const greg = now.toLocaleDateString('en-GB'); 
            dateElem.innerText = `${hijri} | ${greg}`;
        } catch (e) {
            dateElem.innerText = now.toLocaleDateString('en-GB');
        }
    }
}

function setToday() {
    const today = new Date();
    // Adjust for local timezone offset before splitting to ensure correct date
    const offset = today.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(today - offset)).toISOString().split('T')[0];
    
    document.getElementById('startDate').value = localISOTime;
    document.getElementById('endDate').value = localISOTime;
    calculateBusinessDays();
}

function isSaudiBankHoliday(date) {
    const gMonth = date.getMonth() + 1;
    const gDay = date.getDate();
    const dWeek = date.getDay();
    const y = date.getFullYear();

    if (gMonth === 2) {
        if (gDay === 22) return "يوم التأسيس";
        if (gDay === 21 && dWeek === 4) return "يوم التأسيس (تعويض)";
        if (gDay === 23 && dWeek === 0) return "يوم التأسيس (تعويض)";
    }

    if (gMonth === 9) {
        if (gDay === 23) return "اليوم الوطني";
        if (gDay === 22 && dWeek === 4) return "اليوم الوطني (تعويض)";
        if (gDay === 24 && dWeek === 0) return "اليوم الوطني (تعويض)";
    }

    // الجداول الرسمية للبنك المركزي السعودي 2026-2029
    const samaHolidays = [
        { name: "عيد الفطر", start: "2026-03-17", end: "2026-03-23" },
        { name: "عيد الأضحى", start: "2026-05-24", end: "2026-05-28" },
        { name: "عيد الفطر", start: "2027-03-07", end: "2027-03-11" },
        { name: "عيد الأضحى", start: "2027-05-16", end: "2027-05-20" },
        { name: "عيد الفطر", start: "2028-02-27", end: "2028-03-02" },
        { name: "عيد الأضحى", start: "2028-05-03", end: "2028-05-09" },
        { name: "عيد الفطر", start: "2029-02-12", end: "2029-02-18" },
        { name: "عيد الأضحى", start: "2029-04-22", end: "2029-04-26" }
    ];

    const mStr = String(gMonth).padStart(2, '0');
    const dStr = String(gDay).padStart(2, '0');
    const currentDateStr = `${y}-${mStr}-${dStr}`;

    for (const hol of samaHolidays) {
        if (currentDateStr >= hol.start && currentDateStr <= hol.end) {
            return hol.name;
        }
    }

    // تقريب هجري للسنوات غير المجدولة في جدول ساما المباشر
    if (y < 2026 || y > 2029) {
        try {
            const formatter = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', {
                day: 'numeric', month: 'numeric'
            });
            const parts = formatter.formatToParts(date);
            let hMonth = 0; let hDay = 0;
            for (const p of parts) {
                if (p.type === 'month') hMonth = parseInt(p.value, 10);
                if (p.type === 'day') hDay = parseInt(p.value, 10);
            }
            if (hMonth === 9 && hDay >= 29) return "عيد الفطر";
            if (hMonth === 10 && hDay <= 5) return "عيد الفطر";
            if (hMonth === 12 && hDay >= 5 && hDay <= 15) return "عيد الأضحى";
        } catch (e) { }
    }

    return false;
}

function calculateBusinessDays() {
    const startVal = document.getElementById('startDate').value;
    const endVal = document.getElementById('endDate').value;
    const resultBox = document.getElementById('calcResult');

    if (!startVal || !endVal) {
        resultBox.className = 'result-box empty';
        resultBox.innerText = 'الرجاء إدخال التاريخين';
        return;
    }

    const start = new Date(startVal);
    const end = new Date(endVal);

    if (end < start) {
        resultBox.className = 'result-box empty';
        resultBox.innerText = 'تاريخ النهاية قبل البداية!';
        return;
    }

    const diffTime = Math.abs(end - start);
    const totalDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    let workDays = 0;
    let holidaysCount = 0;
    let holidayRanges = {};
    let current = new Date(start);

    for (let i = 0; i < totalDays; i++) {
        current.setDate(current.getDate() + 1);
        const dayOfWeek = current.getDay();
        const isWeekend = (dayOfWeek === 5 || dayOfWeek === 6);
        const holidayName = isSaudiBankHoliday(current);

        if (!isWeekend && !holidayName) {
            workDays++;
        } else if (holidayName && !isWeekend) {
            holidaysCount++;
            const gDateStr = current.toLocaleDateString('en-GB');
            if (!holidayRanges[holidayName]) {
                holidayRanges[holidayName] = { start: gDateStr, end: gDateStr };
            } else {
                holidayRanges[holidayName].end = gDateStr;
            }
        }
    }

    const inclusiveWorkDays = workDays + 1;

    resultBox.className = 'result-box';
    if (totalDays === 0 && inclusiveWorkDays === 1 && workDays === 0) {
        resultBox.innerHTML = `<div style="display:flex; justify-content:space-around; align-items:center;">
            <div style="text-align: center;">أيام العمل<br><span style="font-size: 16px; color: var(--accent-green);">0</span></div>
            <div style="width:1px; background:var(--border); height:30px;"></div>
            <div style="text-align: center; color:#aaa;">الأيام العادية<br><span style="font-size: 14px;">0</span></div>
        </div>
        <div style="margin-top: 8px; padding: 6px; background: var(--bg); border-top: 1px dashed var(--border); font-size: 10px; color: #ccc;">
            نحن الآن في: <strong style="color: var(--accent-green); font-size: 12px;">اليوم الـ 1</strong> من العمل
        </div>`;
    } else {
        const baseWorkDays = workDays + holidaysCount;
        let holidayHtml = '';
        if (holidaysCount > 0) {
            let holsArr = [];
            for (let hName in holidayRanges) {
                const r = holidayRanges[hName];
                if (r.start === r.end) {
                    holsArr.push(`${hName} (${r.start})`);
                } else {
                    holsArr.push(`${hName} من ${r.start} إلى ${r.end}`);
                }
            }
            const hols = holsArr.join(' + ');
            holidayHtml = `<div style="font-size: 8.5px; color: #ff5e57; margin-top: 5px; font-weight: bold; line-height: 1.4;">تقلصت من ${baseWorkDays} إلى ${workDays}<br>بسبب: ${hols}<br><a href="https://www.sama.gov.sa/ar-sa/Supervision/Pages/holidayschedules.aspx" target="_blank" style="color: #ff5e57; text-decoration: underline; font-weight: normal; font-size: 8px;">(المصدر: البنك المركزي السعودي)</a></div>`;
        }
        
        resultBox.innerHTML = `<div style="display:flex; justify-content:space-around; align-items:center;">
            <div style="text-align: center;">أيام العمل<br><span style="font-size: 16px; color: var(--accent-green);">${workDays}</span>${holidayHtml}</div>
            <div style="width:1px; background:var(--border); height:30px;"></div>
            <div style="text-align: center; color:#aaa;">الأيام العادية<br><span style="font-size: 14px;">${totalDays}</span></div>
        </div>
        <div style="margin-top: 8px; padding: 6px; background: var(--bg); border-top: 1px dashed var(--border); font-size: 10px; color: #ccc;">
            نحن الآن في: <strong style="color: var(--accent-green); font-size: 12px;">اليوم الـ ${inclusiveWorkDays}</strong> من العمل
        </div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    flatpickr("#startDate", {
        dateFormat: "Y-m-d",
        locale: "en",
        disableMobile: "true",
        onChange: calculateBusinessDays
    });
    flatpickr("#endDate", {
        dateFormat: "Y-m-d",
        locale: "en",
        disableMobile: "true",
        onChange: calculateBusinessDays
    });

    updateClock();
    setInterval(updateClock, 1000);
    setToday();
});
