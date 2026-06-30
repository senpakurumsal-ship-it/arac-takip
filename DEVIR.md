# Şenpa Panel — Devir & İşletme Rehberi

Araç takip uygulaması. Bu belge; uygulamanın nasıl çalıştığını, nasıl güncelleneceğini,
nerede ne olduğunu ve devirde nelerin teslim edileceğini açıklar.

> ⚠️ **Gizli bilgiler bu dosyada YOK** (bu repo herkese açık). Telegram bot token'ı,
> uygulama şifresi gibi sırlar Google tarafında (Script Properties) saklanır — yerleri aşağıda.

---

## 1. Adresler

| Ne | Adres |
|---|---|
| Uygulama (canlı) | https://senpakurumsal-ship-it.github.io/arac-takip/ |
| Gün sonu / form sayfası | https://senpakurumsal-ship-it.github.io/arac-takip/form.html |
| Kaynak kod (GitHub) | https://github.com/senpakurumsal-ship-it/arac-takip |
| Backend API (Apps Script /exec) | `https://script.google.com/macros/s/AKfycbzJCYFTYDLr4t06ZewVj5j0dbim4LShcd7zMPVorboEPxq9XUeQboeFvgc71tC8Pu32/exec` |

---

## 2. Mimari

- **Frontend:** `index.html` — tek dosyalık uygulama (HTML+CSS+JS, PWA). GitHub Pages'te yayınlanır.
- **Backend:** `kod.gs` — Google Apps Script. Google Sheets'e veri okur/yazar, Drive'a foto yükler, Telegram bot, şifre/ayar saklar.
- **Form:** `form.html` — şoförlerin doldurduğu gün sonu raporu + Mesajlar'dan oluşturulan özel formlar.
- **PWA:** `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`.
- **Veri deposu:** Apps Script'e bağlı bir **Google E-Tablo** (Sheets). Sayfalar: `Araclar`, `Islemler`,
  `Kullanicilar`, `Kullanim`, `TgState`, `Formlar`, `FormCevaplari`.
- **Foto deposu:** Google Drive → "Şenpa Panel" klasörü (işlem tipine göre alt klasörler + "Çöp Kutusu").

Veri her cihazda **ortaktır** (buluttadır); localStorage sadece hız için önbellektir.

---

## 3. Güncelleme nasıl yapılır?

### a) Arayüz değişikliği (`index.html` / `form.html`)
```
git add .
git commit -m "açıklama"
git push
```
GitHub Pages **otomatik** yayınlar (~1-2 dk). Ayrı işlem gerekmez.

### b) Backend değişikliği (`kod.gs`)  ⚠️ ÖNEMLİ TUZAK
`git push` backend'i CANLIYA ALMAZ. Apps Script'e ayrıca deploy gerekir:
```
clasp push -f
clasp deploy -i AKfycbzJCYFTYDLr4t06ZewVj5j0dbim4LShcd7zMPVorboEPxq9XUeQboeFvgc71tC8Pu32 --description "vXX: ..."
```
> `clasp deploy` (parametresiz) YENİ bir URL oluşturur ve uygulama eski URL'de kalır.
> **Mutlaka `-i <deploymentId>` ile MEVCUT deployment'ı güncelle** ki `/exec` adresi sabit kalsın.
> `.clasp.json` içindeki `scriptId` ile clasp script'e bağlıdır. Şu an canlı sürüm: **@23**.

---

## 4. Google tarafı (Apps Script ayarları)

Apps Script editöründe **Project Settings → Script Properties** altında saklanır:

| Anahtar | Ne |
|---|---|
| `TELEGRAM_TOKEN` | Telegram bot token'ı (gizli) |
| `TELEGRAM_ADMIN` | Yönetici Telegram ID'si (`8553590297`) — arıza bildirimleri buraya gider |
| `APP_SIFRE_HASH` | Uygulama giriş şifresinin SHA-256 hash'i (düz şifre saklanmaz) |
| `TG_LAST_UPDATE` | Telegram mükerrer mesaj engelleme (otomatik) |

**Tetikleyiciler (Triggers):** `gunSonuMesajGonder` → Pazar hariç her gün **17:00** otomatik form gönderir.
İlk kurulumda Apps Script'te `tetikleyiciKur()` bir kez çalıştırılır. Webhook için `telegramWebhookKur()`.

---

## 5. Şifre

- Uygulama şifresi **buluta hash'lenerek** kaydedilir → tüm cihazlarda ortak.
- Değiştirmek için: **Ayarlar → Şifre Değiştir** (bir cihazda yapınca hepsine yansır).
- Henüz bulutta şifre yoksa varsayılan: `senpa2026`.

---

## 6. Telegram bot

- Şoför bota **`/start`** yazınca kendi Telegram ID'sini öğrenir → bu ID **Kullanıcılar**'a girilir.
- Her akşam 17:00'de (Pazar hariç) kayıtlı şoförlere gün sonu form linki gider.
- Arıza bildirimleri yöneticiye (ADMIN) anlık düşer.
- Token/admin **Ayarlar → Telegram** bölümünden de güncellenebilir.

---

## 7. AI Asistan (Gemini)

- Fatura/makbuz okuma + araç verisi soru-cevap için Google **Gemini** kullanılır (`gemini-2.5-flash`).
- API anahtarı uygulamada **Ayarlar → Bağlantı Ayarları → Gemini API Anahtarı**'nda tutulur.
- **ÜCRETSİZ kullanım için:** anahtar, **faturalandırması OLMAYAN** bir Google projesinden üretilmeli
  (https://aistudio.google.com/apikey → "Create API key in new project"). Faturalı projede üretilen
  anahtar "prepayment credits depleted" hatası verir.

---

## 8. Yedekleme

- **Ayarlar → 📦 ZIP İndir:** tüm veriler (Excel — çok sayfalı) + fotoğraflar + `ayarlar-anahtarlar.txt`.
- **Ayarlar → Dışa Aktar (Yedek):** veriyi JSON metin olarak.
- Asıl veri zaten Google Sheets'te güvende; bunlar ek yedektir.

---

## 9. Devirde teslim edilecek erişimler

1. **GitHub** hesabı/erişimi: `senpakurumsal-ship-it` (repo + GitHub Pages sahibi)
2. **Google hesabı**: Apps Script + bağlı Google Sheets + Drive klasörünün sahibi
   (Script Properties'teki token/şifre bu hesaptan görülür/değiştirilir)
3. **Telegram bot**: BotFather'daki bot sahipliği (token sıfırlama için)
4. **Gemini API**: Google AI Studio anahtarı (faturasız proje önerilir)
5. Yerelde geliştirme için: `clasp` kurulu + Google hesabıyla `clasp login` yapılmış makine

---

## 10. Bilinen / opsiyonel işler

- Sigorta/kasko prim tutarları (maliyet) çoğu kayıtta boş — belgelerde prim yok, sadece muayene ücretleri var.
- 72AP914'te eski poliçe etiketleri (manuel temizlenebilir, kritik değil).
- Detaylar repo geçmişinde ve commit mesajlarında.

---

*Son güncelleme: 2026-06-30. Canlı backend sürümü @23.*
