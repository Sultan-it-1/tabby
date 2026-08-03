/**
 * ==============================================================================
 * Fast Toolkit — Google Apps Script (Code.gs)
 * ==============================================================================
 * هذا الملف مخصص للرفع على خادم Google Apps Script (https://script.google.com)
 * للعمل كخلفية برمجية (Backend Web App) لحفظ ومزامنة جميع بيانات وملاحظات Fast Toolkit.
 * 
 * 📌 خطوات النشر والتشغيل:
 * 1. افتح https://script.google.com وأنشئ مشروعاً جديداً.
 * 2. انسخ الكود الموجود في هذا الملف ولصقه في المحرر البرمجي Code.gs.
 * 3. اضغط على نشر (Deploy) -> نشر جديد (New deployment).
 * 4. اختر نوع النشر: تطبيق ويب (Web app).
 * 5. اضبط التقييد إلى:
 *    - تنفيذ بصفتي: أنا (Me)
 *    - من يملك حرية الوصول: أي شخص (Anyone)
 * 6. احفظ رابط الـ Web App URL للاستخدام في تطبيق Fast Toolkit.
 * ==============================================================================
 */

// === 1. التعامل مع طلبات GET (القراءة والفحص) ===
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'read';
    const store = PropertiesService.getScriptProperties();

    if (action === 'ping') {
      return jsonResponse({ status: 'success', message: 'Fast Toolkit Backend API is Online 🚀' });
    }

    if (action === 'read' || action === 'get_all') {
      const allData = store.getProperties();
      const parsedData = {};
      
      for (const key in allData) {
        try {
          parsedData[key] = JSON.parse(allData[key]);
        } catch (err) {
          parsedData[key] = allData[key];
        }
      }

      return jsonResponse({
        status: 'success',
        timestamp: new Date().toISOString(),
        data: parsedData
      });
    }

    return jsonResponse({ status: 'error', message: 'إجراء غير معروف' });
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

// === 2. التعامل مع طلبات POST (الحفظ والمزامنة) ===
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
    const store = PropertiesService.getScriptProperties();

    if (action === 'sync' || action === 'save') {
      const dataToSave = payload.data || payload;
      
      // حفظ كل مفتاح مستلم من التطبيق
      for (const key in dataToSave) {
        if (key !== 'action') {
          const val = typeof dataToSave[key] === 'object' ? JSON.stringify(dataToSave[key]) : dataToSave[key];
          store.setProperty(key, val);
        }
      }

      return jsonResponse({
        status: 'success',
        message: 'تم حفظ البيانات بنجاح في Google Apps Script! ☁️',
        updatedKeys: Object.keys(dataToSave).filter(k => k !== 'action'),
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'clear_all') {
      store.deleteAllProperties();
      return jsonResponse({ status: 'success', message: 'تم مسح جميع البيانات بنجاح.' });
    }

    return jsonResponse({ status: 'error', message: 'إجراء غامض أو غير مدعوم' });
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

// === 3. دالة مساعدة لتشكيل استجابة JSON يدعم CORS ===
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
