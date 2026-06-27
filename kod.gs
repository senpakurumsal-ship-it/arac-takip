/**
 * ARAÇ TAKİP — Google Apps Script Backend (Telegram)
 * ---------------------------------------------------
 * Telegram bot token ve yönetici ID'si Script Properties'te saklanır:
 *   TELEGRAM_TOKEN, TELEGRAM_ADMIN
 * Uygulamada Ayarlar > Telegram > Kaydet ile de yazılabilir (telegramAyar action).
 *
 * KURULUM (bir kez):
 *  1) Ayarlar > Telegram'a token + yönetici ID gir, Kaydet.
 *  2) Apps Script editöründe telegramWebhookKur() fonksiyonunu bir kez çalıştır.
 *  3) Apps Script editöründe tetikleyiciKur() fonksiyonunu bir kez çalıştır.
 */

function getSS() { return SpreadsheetApp.getActiveSpreadsheet(); }

// Gün sonu web formunun adresi (GitHub Pages)
var FORM_URL = 'https://senpakurumsal-ship-it.github.io/arac-takip/form.html';

// --- Telegram ayarları (Script Properties) ---
function tgProp(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function TG_TOKEN() { return tgProp('TELEGRAM_TOKEN'); }
function TG_ADMIN() { return tgProp('TELEGRAM_ADMIN'); }
function telegramAyarKaydet(token, admin) {
  var p = PropertiesService.getScriptProperties();
  if (token) p.setProperty('TELEGRAM_TOKEN', String(token).trim());
  if (admin) p.setProperty('TELEGRAM_ADMIN', String(admin).trim());
  return { ok: true, tokenVar: !!TG_TOKEN(), admin: TG_ADMIN() };
}

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
  if (!ss.getSheetByName('Kullanicilar')) {
    var s = ss.insertSheet('Kullanicilar');
    s.appendRow(['id','ad','soyad','telefon','unvan','telegramId']);
  }
  if (!ss.getSheetByName('TgState')) {
    var s = ss.insertSheet('TgState');
    s.appendRow(['chatId','durum','aracId','ad','guncelleme']);
  }
  if (!ss.getSheetByName('Kullanim')) {
    var s = ss.insertSheet('Kullanim');
    s.appendRow(['id','tarih','aracId','kullaniciAd','telegramId','km']);
  }
  sutunGarantile(ss.getSheetByName('Araclar'), ['grup','takip']);
  sutunGarantile(ss.getSheetByName('Kullanicilar'), ['telegramId']);
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
  sheetKur();
  if (e.parameter.action === 'getAll') {
    return jsonOut({ araclar: tabloOku('Araclar'), islemler: tabloOku('Islemler'), kullanicilar: tabloOku('Kullanicilar'), kullanim: tabloOku('Kullanim') });
  }
  if (e.parameter.action === 'formAraclar') {
    var ar = tabloOku('Araclar').map(function(a){ return { id: a.id, plaka: a.plaka, model: a.model }; });
    return jsonOut({ araclar: ar });
  }
  if (e.parameter.action === 'formKullanicilar') {
    var ks = tabloOku('Kullanicilar').map(function(k){ return { id: k.id, ad: k.ad, soyad: k.soyad, telegramId: k.telegramId }; });
    return jsonOut({ kullanicilar: ks });
  }
  return jsonOut({ error: 'bilinmeyen action' });
}

function doPost(e) {
  sheetKur();
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return jsonOut({ error: 'gecersiz json' }); }

  // Telegram webhook (gelen güncellemeler)
  if (body.update_id !== undefined) { return telegramWebhook(body); }

  var action = body.action;
  if (action === 'saveArac')        { satirKaydet('Araclar', body.data);      return jsonOut({ ok: true }); }
  if (action === 'deleteArac')      { satirSil('Araclar', body.id);           return jsonOut({ ok: true }); }
  if (action === 'saveIslem')       { satirKaydet('Islemler', body.data);     return jsonOut({ ok: true }); }
  if (action === 'deleteIslem')     { satirSil('Islemler', body.id);          return jsonOut({ ok: true }); }
  if (action === 'saveKullanici')   { satirKaydet('Kullanicilar', body.data); return jsonOut({ ok: true }); }
  if (action === 'deleteKullanici') { satirSil('Kullanicilar', body.id);      return jsonOut({ ok: true }); }
  if (action === 'uploadPhoto')      { return jsonOut(uploadPhoto(body.base64, body.mimeType, body.fileName, body.folder)); }
  if (action === 'deletePhoto')      { return jsonOut(deletePhoto(body.url)); }
  if (action === 'moveToTrash')      { return jsonOut(moveToTrashFolder(body.url)); }
  if (action === 'telegramAyar')    { return jsonOut(telegramAyarKaydet(body.token, body.admin)); }
  if (action === 'telegramTest')    { return jsonOut(telegramTest()); }
  if (action === 'topluMesaj')      { return jsonOut(topluMesajGonder(body.idler, body.mesaj)); }
  if (action === 'gunSonuKaydet')   { return jsonOut(gunSonuKaydet(body)); }
  if (action === 'gunSonuGonder')   { return jsonOut(gunSonuFormGonder(body.idler)); }
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

// ================= DRIVE =================
function getOrCreateBelgeFolder() {
  var name = 'Şenpa Panel';
  var folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}
function getOrCreateSubFolder(subName) {
  var parent = getOrCreateBelgeFolder();
  var folders = parent.getFoldersByName(subName);
  return folders.hasNext() ? folders.next() : parent.createFolder(subName);
}

// Fotoğrafı "Şenpa Panel/Çöp Kutusu" klasörüne taşır (silinebilir ama kurtarılabilir)
function moveToTrashFolder(url) {
  try {
    var m = String(url || '').match(/[-\w]{25,}/);
    if (!m) return { error: 'id bulunamadi' };
    var file = DriveApp.getFileById(m[0]);
    var copKlasor = getOrCreateSubFolder('Çöp Kutusu');
    // Eski klasörlerden çıkar, çöpe taşı
    var parents = file.getParents();
    while (parents.hasNext()) {
      var p = parents.next();
      if (p.getId() !== copKlasor.getId()) {
        try { p.removeFile(file); } catch(e) {}
      }
    }
    copKlasor.addFile(file);
    return { ok: true };
  } catch(e) { return { error: e.toString() }; }
}

// Drive'dan kalıcı olarak sil (Drive çöpüne gider, 30 günde otomatik temizlenir)
function deletePhoto(url) {
  try {
    var m = String(url || '').match(/[-\w]{25,}/);
    if (!m) return { error: 'id bulunamadi' };
    DriveApp.getFileById(m[0]).setTrashed(true);
    return { ok: true };
  } catch(e) { return { error: e.toString() }; }
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
  } catch(e) { return { error: e.toString() }; }
}

// ================= TELEGRAM =================
function tgApi(method, payload) {
  return UrlFetchApp.fetch('https://api.telegram.org/bot' + TG_TOKEN() + '/' + method, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
}
function tgGonder(chatId, metin, inlineKeyboard) {
  var payload = { chat_id: chatId, text: metin, parse_mode: 'HTML' };
  if (inlineKeyboard) payload.reply_markup = { inline_keyboard: inlineKeyboard };
  return tgApi('sendMessage', payload);
}
function tgCallbackCevap(callbackId) {
  try { tgApi('answerCallbackQuery', { callback_query_id: callbackId }); } catch(e){}
}

// Webhook'u Apps Script web app URL'ine bağlar (bir kez çalıştır)
function telegramWebhookKur() {
  var url = ScriptApp.getService().getUrl();
  var r = UrlFetchApp.fetch('https://api.telegram.org/bot' + TG_TOKEN() + '/setWebhook?url=' + encodeURIComponent(url), { muteHttpExceptions: true });
  Logger.log(r.getContentText());
  return r.getContentText();
}

function telegramTest() {
  if (!TG_TOKEN()) return { error: 'Bot token tanımlı değil. Önce Ayarlar > Telegram > Kaydet.' };
  if (!TG_ADMIN()) return { error: 'Yönetici ID tanımlı değil.' };
  var r = tgGonder(TG_ADMIN(), '✅ Senpa Araç Takip botu aktif!');
  try { var j = JSON.parse(r.getContentText()); return j.ok ? { ok: true } : { error: r.getContentText() }; }
  catch(e) { return { error: r.getContentText() }; }
}

function topluMesajGonder(idler, mesaj) {
  if (!TG_TOKEN()) return { error: 'Bot token tanımlı değil.' };
  if (!mesaj) return { error: 'Mesaj boş.' };
  var basarili = 0, basarisiz = 0;
  (idler || []).forEach(function(id) {
    if (!id) { basarisiz++; return; }
    try {
      var r = tgGonder(id, mesaj);
      var j = JSON.parse(r.getContentText());
      if (j.ok) basarili++; else basarisiz++;
    } catch(e) { basarisiz++; }
  });
  return { ok: true, basarili: basarili, basarisiz: basarisiz, toplam: (idler||[]).length };
}

// Gün sonu formu — tetikleyici çağırır (link gönderir; in-chat değil, güvenilir)
function gunSonuMesajGonder() {
  sheetKur();
  gunSonuFormGonder(null);
}

// Telegram ID'si olan kullanıcılara gün sonu form linkini gönderir.
// idler verilirse sadece onlara; null ise herkese.
function gunSonuFormGonder(idler) {
  if (!TG_TOKEN()) return { error: 'Bot token tanımlı değil.' };
  var kullanicilar = tabloOku('Kullanicilar');
  var n = 0, hedef = 0;
  kullanicilar.forEach(function(k) {
    if (!k.telegramId) return;
    if (idler && idler.length && idler.indexOf(String(k.telegramId)) < 0) return;
    hedef++;
    var link = FORM_URL + '?u=' + encodeURIComponent(k.telegramId);
    var r = tgGonder(k.telegramId,
      '🚗 <b>Gün Sonu Raporu</b>\nMerhaba ' + (k.ad || '') + '! Bugünün raporunu doldurmak için tıkla:',
      [[ { text: '📝 Formu Doldur', url: link } ]]);
    try { if (JSON.parse(r.getContentText()).ok) n++; } catch(e){}
  });
  return { ok: true, gonderilen: n, hedef: hedef };
}

// Web formundan gelen gün sonu verisini işler
function gunSonuKaydet(d) {
  try {
    if (d.kullandi === false) return { ok: true };
    // Gerçek sürücü: formda seçilen "kullanan"; yoksa link sahibi
    var surucuId = d.kullananTgId || d.telegramId || '';
    var ad = d.kullananAd || '';
    if (!ad && surucuId) { var k = tgKullaniciByTgId(surucuId); if (k) ad = (k.ad + ' ' + (k.soyad || '')).trim(); }
    var bugun = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Europe/Istanbul', 'yyyy-MM-dd');
    var temizKm = String(d.km || '').replace(/[^0-9]/g, '');
    if (temizKm && d.aracId) kmGuncelle(d.aracId, temizKm);
    // Kullanım kaydı (kim, hangi araç, hangi gün)
    if (d.aracId) {
      satirKaydet('Kullanim', { id: 'kl_' + Date.now(), tarih: bugun, aracId: d.aracId, kullaniciAd: ad, telegramId: surucuId, km: temizKm });
    }
    if (d.arizaVar && d.arizaDetay) {
      satirKaydet('Islemler', { id: 'frm_' + Date.now(), aracId: d.aracId, tur: 'Arıza Bildirimi', tarih: bugun, detay: d.arizaDetay, not: 'Form · Bildiren: ' + ad });
      var a = aracBul(d.aracId);
      if (TG_ADMIN()) tgGonder(TG_ADMIN(), '⚠️ <b>' + (ad || 'Bir şoför') + '</b> arıza bildirdi\n🚗 ' + (a ? (a.plaka + ' ' + (a.model || '')) : d.aracId) + '\n📝 ' + d.arizaDetay);
    }
    return { ok: true };
  } catch(e) { return { error: e.toString() }; }
}

// --- TgState (sohbet adım takibi) ---
function tgStateOku(chatId) {
  var s = getSS().getSheetByName('TgState');
  var v = s.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === String(chatId)) return { row: i + 1, durum: v[i][1], aracId: v[i][2], ad: v[i][3] };
  }
  return null;
}
function tgStateYaz(chatId, durum, aracId, ad) {
  var s = getSS().getSheetByName('TgState');
  var v = s.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]) === String(chatId)) { s.getRange(i + 1, 1, 1, 5).setValues([[chatId, durum, aracId || '', ad || '', new Date()]]); return; }
  }
  s.appendRow([chatId, durum, aracId || '', ad || '', new Date()]);
}
function tgStateTemizle(chatId) {
  var st = tgStateOku(chatId);
  if (st) getSS().getSheetByName('TgState').getRange(st.row, 2, 1, 3).setValues([['', '', '']]);
}

function tgKullaniciByTgId(tgId) {
  var ks = tabloOku('Kullanicilar');
  for (var i = 0; i < ks.length; i++) { if (String(ks[i].telegramId) === String(tgId)) return ks[i]; }
  return null;
}
function aracBul(aracId) {
  var araclar = tabloOku('Araclar');
  for (var i = 0; i < araclar.length; i++) { if (String(araclar[i].id) === String(aracId)) return araclar[i]; }
  return null;
}

function telegramWebhook(update) {
  try {
    // Tekilleştirme: Apps Script POST'a 302 döndürdüğü için Telegram aynı
    // güncellemeyi tekrar gönderebilir. İşlenmiş update_id'yi atla (mükerrer mesaj olmasın).
    var props = PropertiesService.getScriptProperties();
    var son = Number(props.getProperty('TG_LAST_UPDATE') || '0');
    if (update.update_id) {
      if (update.update_id <= son) return jsonOut({ ok: true, skip: true });
      props.setProperty('TG_LAST_UPDATE', String(update.update_id));
    }
    if (update.callback_query) {
      var cq = update.callback_query;
      tgCallbackCevap(cq.id);
      tgCallbackIsle(cq.message.chat.id, cq.data || '', cq.from);
    } else if (update.message) {
      tgMesajIsle(update.message.chat.id, update.message.text || '', update.message.from);
    }
  } catch(err) {}
  return jsonOut({ ok: true });
}

function tgCallbackIsle(chatId, data, from) {
  var k = tgKullaniciByTgId(chatId);
  var ad = k ? (k.ad + ' ' + (k.soyad || '')).trim() : (from && from.first_name || '');

  if (data === 'gun:hayir') {
    tgStateTemizle(chatId);
    tgGonder(chatId, 'Tamam, iyi günler! 👋');
    return;
  }
  if (data === 'gun:evet') {
    var araclar = tabloOku('Araclar');
    if (!araclar.length) { tgGonder(chatId, 'Kayıtlı araç bulunamadı.'); return; }
    var klavye = araclar.map(function(a) { return [{ text: a.plaka + ' · ' + (a.model || ''), callback_data: 'arac:' + a.id }]; });
    tgStateYaz(chatId, 'arac_bekleniyor', '', ad);
    tgGonder(chatId, 'Hangi aracı kullandınız?', klavye);
    return;
  }
  if (data.indexOf('arac:') === 0) {
    var aracId = data.slice(5);
    tgStateYaz(chatId, 'km_bekleniyor', aracId, ad);
    var a = aracBul(aracId);
    tgGonder(chatId, (a ? a.plaka : 'Araç') + ' seçildi.\n📏 Güncel KM kaç? (sadece sayı yazın)');
    return;
  }
  if (data === 'ariza:yok') {
    tgStateTemizle(chatId);
    tgGonder(chatId, 'Teşekkürler, kaydedildi. İyi günler! 👋');
    return;
  }
  if (data === 'ariza:var') {
    var st = tgStateOku(chatId);
    tgStateYaz(chatId, 'ariza_detay', st ? st.aracId : '', ad);
    tgGonder(chatId, '⚠️ Arızayı / durumu kısaca yazın:');
    return;
  }
}

function tgMesajIsle(chatId, metin, from) {
  var st = tgStateOku(chatId);
  if ((metin || '').trim().toLowerCase() === '/start' || (!st || !st.durum)) {
    if ((metin || '').trim().toLowerCase() === '/start') {
      var k = tgKullaniciByTgId(chatId);
      var msg = '👋 Merhaba!\n\n<b>Telegram ID:</b> <code>' + chatId + '</code>\n\n';
      msg += k ? '✅ Kaydiniz mevcut. Gun sonu formunu otomatik alacaksiniz.' : 'Bu ID-yi yoneticinize iletin; sisteme eklendikten sonra gun sonu formunu alirsiniz.';
      tgGonder(chatId, msg);
      return;
    }
    tgGonder(chatId, 'Merhaba! Gün sonu raporu için akşam göndereceğim mesajı bekleyin. 🚗');
    return;
  }
  if (st.durum === 'km_bekleniyor') {
    var sayi = (String(metin).match(/\d[\d.,]*/) || [''])[0].replace(/[.,]/g, '');
    if (!sayi) { tgGonder(chatId, 'Lütfen sadece sayı yazın. Örn: 142000'); return; }
    kmGuncelle(st.aracId, sayi);
    tgStateYaz(chatId, 'ariza_secimi', st.aracId, st.ad);
    tgGonder(chatId, '✅ Kaydedildi: ' + sayi + ' km\n\nArıza / durum var mı?',
      [[ { text: 'Sorun Yok ✅', callback_data: 'ariza:yok' }, { text: 'Arıza Var ⚠️', callback_data: 'ariza:var' } ]]);
    return;
  }
  if (st.durum === 'ariza_detay') {
    var a = aracBul(st.aracId);
    var bugun = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Europe/Istanbul', 'yyyy-MM-dd');
    satirKaydet('Islemler', {
      id: 'tg_' + Date.now(),
      aracId: st.aracId,
      tur: 'Arıza Bildirimi',
      tarih: bugun,
      detay: metin,
      not: 'Telegram · Bildiren: ' + (st.ad || '')
    });
    tgStateTemizle(chatId);
    tgGonder(chatId, '✅ Arıza bildiriminiz iletildi. Teşekkürler!');
    if (TG_ADMIN()) {
      tgGonder(TG_ADMIN(), '⚠️ <b>' + (st.ad || 'Bir şoför') + '</b> arıza bildirdi\n🚗 ' + (a ? (a.plaka + ' ' + (a.model || '')) : st.aracId) + '\n📝 ' + metin);
    }
    return;
  }
  if (st.durum === 'ariza_secimi' || st.durum === 'arac_bekleniyor') {
    tgGonder(chatId, 'Lütfen yukarıdaki butonlardan seçim yapın.');
    return;
  }
}

function kmGuncelle(aracId, yeniKm) {
  var s = getSS().getSheetByName('Araclar');
  var values = s.getDataRange().getValues();
  var headers = values[0];
  var kmCol = headers.indexOf('km');
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(aracId)) { s.getRange(i + 1, kmCol + 1).setValue(yeniKm); return; }
  }
}

function tetikleyiciKur() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var f = t.getHandlerFunction();
    if (f === 'gunSonuMesajGonder' || f === 'haftalikKmSor') ScriptApp.deleteTrigger(t);
  });
  // Pazar hariç her gün 17:00
  var gunler = [
    ScriptApp.WeekDay.MONDAY, ScriptApp.WeekDay.TUESDAY, ScriptApp.WeekDay.WEDNESDAY,
    ScriptApp.WeekDay.THURSDAY, ScriptApp.WeekDay.FRIDAY, ScriptApp.WeekDay.SATURDAY
  ];
  gunler.forEach(function(g) {
    ScriptApp.newTrigger('gunSonuMesajGonder').timeBased().onWeekDay(g).atHour(17).create();
  });
}

// NOT: Eski otomatik km-sorma entegrasyonu kaldırıldı; artık Telegram kullanılıyor.
// Gerekirse git geçmişindeki önceki kod.gs sürümünden geri alınabilir.
