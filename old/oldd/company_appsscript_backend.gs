/**
 * Fast Toolkit - Google Apps Script Backend Engine
 * 
 * طريقة الاستخدام:
 * 1. افتح https://script.google.com وقم بإنشاء مشروع جديد باسم "Fast Toolkit Engine".
 * 2. انسخ هذا الكود بالكامل واستبدل الكود الموجود في الملف Code.gs.
 * 3. انقر على Deploy -> New Deployment.
 * 4. اختر النوع: Web App.
 * 5. اضبط المالك: Execute as: Me.
 * 6. اضبط الوصول: Who has access: Anyone.
 * 7. انقر Deploy وانسخ رابط الـ Web App وضعه في ملف config.js بالإضافة.
 */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "getConfig";

  if (action === "getConfig") {
    return handleGetConfig();
  } else if (action === "getNotes") {
    return handleGetNotes();
  }

  return createJsonResponse({ status: "error", message: "Action not recognized" });
}

function doPost(e) {
  try {
    var contents = e.postData ? e.postData.contents : "{}";
    var payload = JSON.parse(contents);
    var action = payload.action || "saveData";

    if (action === "saveData" || action === "logEvent") {
      return handleSaveData(payload);
    } else if (action === "saveNote") {
      return handleSaveNote(payload);
    }

    return createJsonResponse({ status: "error", message: "Post action not recognized" });
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

/**
 * 1. إرجاع الإعدادات والقواعد الديناميكية للإضافة
 */
function handleGetConfig() {
  var config = {
    status: "success",
    version: "1.2.0",
    announcement: {
      active: true,
      text: "مرحباً بكم في Fast Toolkit - النسخة المحلية المعتمدة",
      type: "info"
    },
    features: {
      cardScanEnabled: true,
      simahEnabled: true,
      noteEnabled: true,
      ciaEnabled: true,
      dateEnabled: true,
      stickyEnabled: true
    },
    rules: {
      vatRate: 0.15,
      simahMaxRecords: 100
    }
  };

  return createJsonResponse(config);
}

/**
 * 2. حفظ البيانات أو السجلات في شيت جوجل
 */
function handleSaveData(payload) {
  var ss = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName("Logs") || ss.insertSheet("Logs");

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Timestamp", "User", "Action", "Details"]);
  }

  sheet.appendRow([
    new Date(),
    payload.user || "Anonymous",
    payload.action || "general",
    JSON.stringify(payload.data || {})
  ]);

  return createJsonResponse({ status: "success", message: "Data logged successfully" });
}

/**
 * 3. حفظ الملاحظات السريعة
 */
function handleSaveNote(payload) {
  var ss = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName("Notes") || ss.insertSheet("Notes");

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Timestamp", "Title", "Content"]);
  }

  sheet.appendRow([
    new Date(),
    payload.title || "بدون عنوان",
    payload.content || ""
  ]);

  return createJsonResponse({ status: "success", message: "Note saved successfully" });
}

function handleGetNotes() {
  var ss = getOrCreateSpreadsheet();
  var sheet = ss.getSheetByName("Notes");
  if (!sheet) return createJsonResponse({ status: "success", notes: [] });

  var rows = sheet.getDataRange().getValues();
  var notes = [];
  for (var i = 1; i < rows.length; i++) {
    notes.push({
      timestamp: rows[i][0],
      title: rows[i][1],
      content: rows[i][2]
    });
  }

  return createJsonResponse({ status: "success", notes: notes });
}

/**
 * Helper: الحصول على شيت الحفظ أو إنشائه تلقائياً
 */
function getOrCreateSpreadsheet() {
  var files = DriveApp.getFilesByName("Fast_Toolkit_Database");
  if (files.hasNext()) {
    var file = files.next();
    return SpreadsheetApp.open(file);
  } else {
    var ss = SpreadsheetApp.create("Fast_Toolkit_Database");
    return ss;
  }
}

/**
 * Helper: تنسيق الاستجابة كـ JSON متوافق مع CORS
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
