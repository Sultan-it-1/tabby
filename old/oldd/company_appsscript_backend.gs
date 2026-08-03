/**
 * ==============================================================================
 * Fast Toolkit — Centralized Multi-User Backend with Google Sheets (Code.gs)
 * ==============================================================================
 * خادم مركزي معزول لحفظ ومزامنة بيانات وملاحظات جميع المستخدمين والموظفين
 * في جدول بيانات جوجل شيت (Google Sheet) محمي ومنظم تلقائياً.
 * 
 * 📌 خطوات التوصيل بجداول قوقل (Google Sheets):
 * 1. افتح جدول اكسل سحابي جديد في (https://sheets.new).
 * 2. انسخ معرف الجدول من الرابط (الموجود بين /d/ و /edit في شريط العنوان).
 * 3. يلصق المعرف في المتغير SPREADSHEET_ID أدناه.
 * 4. انشر السكريبت من جديد (Deploy -> New deployment).
 * ==============================================================================
 */

// 📌 اكتب معرف جدول Google Sheet الخاص بك هنا (اتركه فارغاً إذا أنشأت السكريبت من داخل الشيت)
const SPREADSHEET_ID = ""; // مثال: "1BxiMVs0XRrf59W-YRpHMGQmYB4485..."

// === 1. الحصول على جدول البيانات وتجهيز الهيكل ===
function getSheet() {
  try {
    let ss;
    if (SPREADSHEET_ID && SPREADSHEET_ID.trim()) {
      ss = SpreadsheetApp.openById(SPREADSHEET_ID.trim());
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }

    if (!ss) return null;

    let sheet = ss.getSheetByName("بيانات المستخدمين");
    if (!sheet) {
      sheet = ss.insertSheet("بيانات المستخدمين");
      // إنشاء العناوين في الصف الأول لتكون واضحة
      sheet.appendRow(["معرّف المستخدم (UserId)", "آخر تحديث", "البيانات والملاحظات المخزنة"]);
      sheet.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#00e676").setColor("#000000");
      sheet.setColumnWidth(1, 200);
      sheet.setColumnWidth(2, 180);
      sheet.setColumnWidth(3, 500);
    }
    return sheet;
  } catch (err) {
    return null;
  }
}

// === 2. دالة حفظ/تحديث صف المستخدم في الشيت ===
function saveUserToSheet(userId, dataObj) {
  try {
    const sheet = getSheet();
    if (!sheet) return;

    const dataJsonStr = JSON.stringify(dataObj);
    const data = sheet.getDataRange().getValues();
    let userRowIndex = -1;

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(userId)) {
        userRowIndex = i + 1; // 1-based index
        break;
      }
    }

    const timestamp = new Date().toLocaleString("ar-SA");

    if (userRowIndex > 0) {
      sheet.getRange(userRowIndex, 2).setValue(timestamp);
      sheet.getRange(userRowIndex, 3).setValue(dataJsonStr);
    } else {
      sheet.appendRow([userId, timestamp, dataJsonStr]);
    }
  } catch (err) {
    Logger.log("Sheet save error: " + err);
  }
}

// === 3. دالة قراءة صف المستخدم من الشيت ===
function readUserFromSheet(userId) {
  try {
    const sheet = getSheet();
    if (!sheet) return null;

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(userId)) {
        const rawJson = data[i][2];
        try {
          return JSON.parse(rawJson);
        } catch (e) {
          return rawJson;
        }
      }
    }
  } catch (err) {
    Logger.log("Sheet read error: " + err);
  }
  return null;
}

// === 4. التعامل مع طلبات GET (القراءة والجلب لكل مستخدم) ===
function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const action = params.action || 'read';
    const userId = params.userId || 'default_user';
    const store = PropertiesService.getScriptProperties();

    if (action === 'ping') {
      return jsonResponse({ status: 'success', message: 'Central Fast Toolkit Multi-User Server with Sheets is Online 🚀' });
    }

    if (action === 'read' || action === 'get_all') {
      // المحاولة أولاً من الشيت ثم من ScriptProperties
      let parsedData = readUserFromSheet(userId);

      if (!parsedData) {
        const userRawData = store.getProperty('user_data_' + userId);
        if (userRawData) {
          try { parsedData = JSON.parse(userRawData); } catch (err) {}
        }
      }

      return jsonResponse({
        status: 'success',
        userId: userId,
        timestamp: new Date().toISOString(),
        data: parsedData || {}
      });
    }

    return jsonResponse({ status: 'error', message: 'إجراء غير معروف' });
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

// === 5. التعامل مع طلبات POST (الحفظ والمزامنة لكل مستخدم) ===
function doPost(e) {
  try {
    let payload = {};
    
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        payload = e.parameter || {};
      }
    } else {
      payload = (e && e.parameter) ? e.parameter : {};
    }

    const action = payload.action || 'sync';
    const userId = payload.userId || 'default_user';
    const store = PropertiesService.getScriptProperties();

    if (action === 'sync' || action === 'save') {
      const dataToSave = payload.data || {};
      
      // جلب بيانات المستخدم السابقة للدمج
      let existingData = readUserFromSheet(userId);
      if (!existingData) {
        const existingRaw = store.getProperty('user_data_' + userId);
        if (existingRaw) {
          try { existingData = JSON.parse(existingRaw); } catch (err) {}
        }
      }

      // دمج البيانات الجديدة مع سابقتها
      const mergedData = { ...(existingData || {}), ...dataToSave };
      
      // الحفظ في كلاً من الشيت و ScriptProperties للأمان المضاعف
      store.setProperty('user_data_' + userId, JSON.stringify(mergedData));
      saveUserToSheet(userId, mergedData);

      return jsonResponse({
        status: 'success',
        message: 'تم حفظ بياناتك بنجاح في جدول جوجل شيت المركزي! 📊☁️',
        userId: userId,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'clear_user_data') {
      store.deleteProperty('user_data_' + userId);
      return jsonResponse({ status: 'success', message: 'تم مسح بيانات المستخدم بنجاح.' });
    }

    return jsonResponse({ status: 'error', message: 'إجراء غير معروف' });
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

// === 6. دالة إدارية لرؤية جميع المستخدمين وبياناتهم ===
function viewAllUsersData() {
  const store = PropertiesService.getScriptProperties();
  const allProperties = store.getProperties();
  
  Logger.log("=== 👥 قائمة جميع المستخدمين المخزنين في الخادم ===");
  let count = 0;
  
  for (const key in allProperties) {
    if (key.startsWith('user_data_')) {
      count++;
      const userId = key.replace('user_data_', '');
      Logger.log("\n----------------------------------");
      Logger.log("👤 [مستخدم " + count + "] - المعرّف: " + userId);
      Logger.log("📦 البيانات المخزنة: " + allProperties[key]);
    }
  }
  
  if (count === 0) {
    Logger.log("لا يوجد مستخدمون مخزنون حتى الآن.");
  }
}

// === 7. دالة مساعدة لتشكيل استجابة JSON مدعومة بـ CORS ===
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
