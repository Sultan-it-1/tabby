/**
 * ==============================================================================
 * Fast Toolkit — Company Multi-User Backend with Google Sheets (Code.gs)
 * ==============================================================================
 * خادم مركزي مخصص لحسابات الشركة (Google Workspace).
 * يتعرف تلقائياً على إيميل الموظف في قوقل (Session.getActiveUser().getEmail())
 * لتوحيد ملاحظات الموظف على جميع أجهزته (الكمبيوتر، الجوال، التابلت) برمز إيميله الرسمي.
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
      // إنشاء العناوين في الصف الأول لتكون واضحة برقم إيميل الموظف
      sheet.appendRow(["بريد الموظف / المعرّف (User Email)", "آخر تحديث", "البيانات والملاحظات المخزنة"]);
      sheet.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#00e676").setColor("#000000");
      sheet.setColumnWidth(1, 230);
      sheet.setColumnWidth(2, 180);
      sheet.setColumnWidth(3, 500);
    }
    return sheet;
  } catch (err) {
    Logger.log("getSheet Error: " + err);
    return null;
  }
}

// === 2. دالة جلب بريد الموظف التلقائي من حساب قوقل ===
function getEmployeeUserEmail(requestedUserId) {
  try {
    const activeEmail = Session.getActiveUser().getEmail();
    if (activeEmail && activeEmail.trim() && activeEmail.includes('@')) {
      return activeEmail.trim().toLowerCase();
    }
    const effectiveEmail = Session.getEffectiveUser().getEmail();
    if (effectiveEmail && effectiveEmail.trim() && effectiveEmail.includes('@')) {
      return effectiveEmail.trim().toLowerCase();
    }
  } catch (e) {
    Logger.log("Session getEmail error: " + e);
  }
  return requestedUserId || 'default_user';
}

// === 3. دالة حفظ/تحديث صف الموظف في الشيت ===
function saveUserToSheet(userId, dataObj) {
  try {
    const sheet = getSheet();
    if (!sheet) return;

    const dataJsonStr = typeof dataObj === 'string' ? dataObj : JSON.stringify(dataObj);
    const data = sheet.getDataRange().getValues();
    let userRowIndex = -1;

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === String(userId).trim().toLowerCase()) {
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

// === 4. دالة قراءة صف الموظف من الشيت ===
function readUserFromSheet(userId) {
  try {
    const sheet = getSheet();
    if (!sheet) return null;

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === String(userId).trim().toLowerCase()) {
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

// === 5. دالة ترحيل جميع المستخدمين القدامى لجدول الشيت ===
function migrateAllUsersToSheet() {
  const store = PropertiesService.getScriptProperties();
  const allProps = store.getProperties();
  let count = 0;
  
  for (const key in allProps) {
    if (key.startsWith('user_data_')) {
      const userId = key.replace('user_data_', '');
      try {
        const dataObj = JSON.parse(allProps[key]);
        saveUserToSheet(userId, dataObj);
      } catch(e) {
        saveUserToSheet(userId, allProps[key]);
      }
      count++;
    }
  }
  Logger.log("تم ترحيل " + count + " مستخدمين إلى جدول قوقل شيت بنجاح! 📊🎉");
}

// === 6. التعامل مع طلبات GET (القراءة والجلب تلقائياً ببريد الموظف) ===
function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const action = params.action || 'read';
    const rawUserId = params.userId || '';
    const userId = getEmployeeUserEmail(rawUserId);
    const callback = params.callback || null;
    const store = PropertiesService.getScriptProperties();

    if (action === 'ping') {
      return responseOutput({ status: 'success', message: 'Company Fast Toolkit Multi-User Server is Online 🚀' }, callback);
    }

    if (action === 'read' || action === 'get_all') {
      let parsedData = readUserFromSheet(userId);

      if (!parsedData) {
        const userRawData = store.getProperty('user_data_' + userId);
        if (userRawData) {
          try { parsedData = JSON.parse(userRawData); } catch (err) {}
        }
      }

      return responseOutput({
        status: 'success',
        userId: userId,
        timestamp: new Date().toISOString(),
        data: parsedData || {}
      }, callback);
    }

    return responseOutput({ status: 'error', message: 'إجراء غير معروف' }, callback);
  } catch (error) {
    return responseOutput({ status: 'error', message: error.toString() });
  }
}

// === 7. التعامل مع طلبات POST (الحفظ والمزامنة تلقائياً ببريد الموظف) ===
function doPost(e) {
  try {
    let payload = {};
    
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        payload = e.parameter || {};
      }
    } else if (e && e.parameter && e.parameter.payload) {
      try {
        payload = JSON.parse(e.parameter.payload);
      } catch (parseErr2) {
        payload = e.parameter;
      }
    } else {
      payload = (e && e.parameter) ? e.parameter : {};
    }

    const action = payload.action || 'sync';
    const rawUserId = payload.userId || '';
    const userId = getEmployeeUserEmail(rawUserId);
    const store = PropertiesService.getScriptProperties();

    if (action === 'sync' || action === 'save') {
      const dataToSave = payload.data || {};
      
      // جلب بيانات الموظف السابقة للدمج
      let existingData = readUserFromSheet(userId);
      if (!existingData) {
        const existingRaw = store.getProperty('user_data_' + userId);
        if (existingRaw) {
          try { existingData = JSON.parse(existingRaw); } catch (err) {}
        }
      }

      // دمج البيانات الجديدة مع سابقتها
      const mergedData = { ...(existingData || {}), ...dataToSave };
      
      // الحفظ في الشيت باسم بريد الموظف الرسمي
      store.setProperty('user_data_' + userId, JSON.stringify(mergedData));
      saveUserToSheet(userId, mergedData);

      return responseOutput({
        status: 'success',
        message: 'تم حفظ البيانات بنجاح باسم بريد الموظف: ' + userId,
        userId: userId,
        timestamp: new Date().toISOString()
      }, payload.callback || null);
    }

    if (action === 'clear_user_data') {
      store.deleteProperty('user_data_' + userId);
      return responseOutput({ status: 'success', message: 'تم مسح بيانات الموظف بنجاح.' }, payload.callback || null);
    }

    return responseOutput({ status: 'error', message: 'إجراء غير معروف' }, payload.callback || null);
  } catch (error) {
    return responseOutput({ status: 'error', message: error.toString() }, payload.callback || null);
  }
}

// === 8. دالة إدارية لرؤية جميع الموظفين وبياناتهم ===
function viewAllUsersData() {
  const store = PropertiesService.getScriptProperties();
  const allProperties = store.getProperties();
  
  Logger.log("=== 👥 قائمة جميع الموظفين المخزنين في الخادم ===");
  let count = 0;
  
  for (const key in allProperties) {
    if (key.startsWith('user_data_')) {
      count++;
      const userId = key.replace('user_data_', '');
      Logger.log("\n----------------------------------");
      Logger.log("👤 [موظف " + count + "] - البريد/المعرّف: " + userId);
      Logger.log("📦 البيانات المخزنة: " + allProperties[key]);
    }
  }
  
  if (count === 0) {
    Logger.log("لا يوجد موظفون مخزنون حتى الآن.");
  }
}

// === 9. دالة مساعدة لتشكيل استجابة JSON أو JSONP ===
function responseOutput(obj, callback) {
  const jsonStr = JSON.stringify(obj);
  if (callback && String(callback).trim()) {
    return ContentService.createTextOutput(String(callback).trim() + '(' + jsonStr + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(jsonStr)
    .setMimeType(ContentService.MimeType.JSON);
}
