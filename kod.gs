/**
 * ARAÇ TAKİP — Google Apps Script Backend
 */

var WHATSAPP_TOKEN    = 'BURAYA_KALICI_TOKEN';
var WHATSAPP_PHONE_ID = 'BURAYA_PHONE_NUMBER_ID';
var WHATSAPP_VERIFY   = 'aractakip2026';

function getSS() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheetKur() {
  var ss = getSS();
  if (!ss.getSheetByName('Araclar')) {
    var s = ss.insertSheet('Araclar');
    s.appendRow(['id','plaka','model','yil','km','tip','kullanici','telefon','not','anaFoto','grup','takip']);
  }
  if (!ss.getSheetByName('Islemler')) {
    var s = ss.insertSheet('Islemler');
    s.appendRow(['id','aracId','tur','tarih','bitis','km','maliyet','sonrakiKm','sonrakiTarih','detay','not','fotolar']);
  }
  if (!ss.getSheetByName('WAState')) {
    var s = ss.insertSheet('WAState');
    s.appendRow(['telefon','aracId','soruTarihi']);
  }
  // Mevcut Araclar sayfasına eksik sütunları ekle (geriye dönük uyum)
  sutunGarantile(ss.getSheetByName('Araclar'), ['grup','takip']);
}

function sutunGarantile(sheet, sutunlar) {
  if (!sheet) return;
  var son = sheet.getLastColumn();
  var header = sheet.getRange(1, 1, 1, son).getValues()[0];
  sutunlar.forEach(function (s) {
    if (header.indexOf(s) === -1) {
      son++;
      sheet.getRange(1, son).setValue(s);
      header.push(s);
    }
  });
}

function doGet(e) {
  if (e.parameter['hub.mode'] === 'subscribe') {
    if (e.parameter['hub.verify_token'] === WHATSAPP_VERIFY) {
      return ContentService.createTextOutput(e.parameter['hub.challenge']);
    }
    return ContentService.createTextOutput('hata');
  }
  sheetKur();
  if (e.parameter.action === 'getAll') {
    return jsonOut({ araclar: tabloOku('Araclar'), islemler: tabloOku('Islemler') });
  }
  return jsonOut({ error: 'bilinmeyen action' });
}

function doPost(e) {
  sheetKur();
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return jsonOut({ error: 'gecersiz json' }); }

  if (body.object) {
    return whatsappGelenMesaj(body);
  }

  var action = body.action;
  if (action === 'saveArac')    { satirKaydet('Araclar', body.data);  return jsonOut({ ok: true }); }
  if (action === 'deleteArac')  { satirSil('Araclar', body.id);       return jsonOut({ ok: true }); }
  if (action === 'saveIslem')   { satirKaydet('Islemler', body.data); return jsonOut({ ok: true }); }
  if (action === 'deleteIslem') { satirSil('Islemler', body.id);      return jsonOut({ ok: true }); }
  if (action === 'uploadPhoto') { return jsonOut(uploadPhoto(body.base64, body.mimeType, body.fileName, body.folder)); }
  if (action === 'deletePhoto') { return jsonOut(deletePhoto(body.url)); }
  return jsonOut({ error: 'bilinmeyen action' });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function tabloOku(sheetName) {
  var s = getSS().getSheetByName(sheetName);
  var values = s.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var v = values[i][j];
      if (headers[j] === 'fotolar') {
        try { obj[headers[j]] = v ? JSON.parse(v) : []; } catch (e2) { obj[headers[j]] = []; }
      } else if (headers[j] === 'takip') {
        try { obj[headers[j]] = v ? JSON.parse(v) : {}; } catch (e3) { obj[headers[j]] = {}; }
      } else {
        obj[headers[j]] = (v === null || v === undefined) ? '' : String(v);
      }
    }
    if (obj.id) out.push(obj);
  }
  return out;
}

function satirKaydet(sheetName, data) {
  var s = getSS().getSheetByName(sheetName);
  var values = s.getDataRange().getValues();
  var headers = values[0];
  var satir = headers.map(function(h) {
    if (h === 'fotolar') return JSON.stringify(data.fotolar || []);
    if (h === 'takip') return JSON.stringify(data.takip || {});
    return data[h] !== undefined && data[h] !== null ? data[h] : '';
  });
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(data.id)) {
      s.getRange(i + 1, 1, 1, headers.length).setValues([satir]);
      return;
    }
  }
  s.appendRow(satir);
}

function satirSil(sheetName, id) {
  var s = getSS().getSheetByName(sheetName);
  var values = s.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]) === String(id)) s.deleteRow(i + 1);
  }
}

function getOrCreateBelgeFolder() {
  var name = 'Araç Takip Belgeler';
  var folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

function getOrCreateSubFolder(subName) {
  var parent = getOrCreateBelgeFolder();
  var folders = parent.getFoldersByName(subName);
  return folders.hasNext() ? folders.next() : parent.createFolder(subName);
}

function deletePhoto(url) {
  try {
    var m = String(url || '').match(/[-\w]{25,}/);
    if (!m) return { error: 'id bulunamadi' };
    DriveApp.getFileById(m[0]).setTrashed(true);
    return { ok: true };
  } catch(e) {
    return { error: e.toString() };
  }
}

function uploadPhoto(base64, mimeType, fileName, folderName) {
  try {
    var clean = base64.replace(/^data:[^;]+;base64,/, '');
    var bytes = Utilities.base64Decode(clean);
    var blob = Utilities.newBlob(bytes, mimeType || 'image/jpeg', fileName || ('belge_' + Date.now()));
    var folder = folderName ? getOrCreateSubFolder(folderName) : getOrCreateBelgeFolder();
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000', id: file.getId() };
  } catch(e) {
    return { error: e.toString() };
  }
}

function haftalikKmSor() {
  sheetKur();
  var araclar = tabloOku('Araclar');
  araclar.forEach(function(a) {
    if (!a.telefon) return;
    var tel = a.telefon.replace(/[^0-9]/g, '');
    if (tel.length < 11) return;
    var mesaj = 'Merhaba\n' + a.plaka + ' (' + a.model + ') aracinin guncel kilometresini yazar misiniz?\nLutfen sadece sayi olarak yaziniz. Ornek: 142000';
    waMesajGonder(tel, mesaj);
    waStateYaz(tel, a.id);
  });
}

function waMesajGonder(tel, metin) {
  var url = 'https://graph.facebook.com/v21.0/' + WHATSAPP_PHONE_ID + '/messages';
  var payload = {
    messaging_product: 'whatsapp',
    to: tel,
    type: 'text',
    text: { body: metin }
  };
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + WHATSAPP_TOKEN },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function waStateYaz(tel, aracId) {
  var s = getSS().getSheetByName('WAState');
  var values = s.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === tel) {
      s.getRange(i + 1, 2, 1, 2).setValues([[aracId, new Date()]]);
      return;
    }
  }
  s.appendRow([tel, aracId, new Date()]);
}

function waStateOku(tel) {
  var s = getSS().getSheetByName('WAState');
  var values = s.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === tel) return values[i][1];
  }
  return null;
}

function whatsappGelenMesaj(body) {
  try {
    var entry = body.entry && body.entry[0];
    var change = entry && entry.changes && entry.changes[0];
    var value = change && change.value;
    var msg = value && value.messages && value.messages[0];
    if (!msg) return jsonOut({ ok: true });

    var tel = msg.from;
    var metin = (msg.text && msg.text.body) ? msg.text.body : '';
    var aracId = waStateOku(tel);

    if (!aracId) {
      waMesajGonder(tel, 'Bu numara icin bekleyen bir km sorusu bulamadim.');
      return jsonOut({ ok: true });
    }

    var sayi = (metin.match(/\d[\d.,]*/) || [''])[0].replace(/[.,]/g, '');
    if (!sayi) {
      waMesajGonder(tel, 'Lutfen km bilgisini sadece sayi olarak yaziniz. Ornek: 142000');
      return jsonOut({ ok: true });
    }

    kmGuncelle(aracId, sayi);
    waMesajGonder(tel, 'Tesekkurler! Km guncellendi: ' + Number(sayi).toLocaleString('tr-TR') + ' km');
  } catch(err) {}
  return jsonOut({ ok: true });
}

function kmGuncelle(aracId, yeniKm) {
  var s = getSS().getSheetByName('Araclar');
  var values = s.getDataRange().getValues();
  var headers = values[0];
  var kmCol = headers.indexOf('km');
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(aracId)) {
      s.getRange(i + 1, kmCol + 1).setValue(yeniKm);
      return;
    }
  }
}

function tetikleyiciKur() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'haftalikKmSor') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('haftalikKmSor')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();
}
