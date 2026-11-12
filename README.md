# TestVaraq 2.0 — o'quv markaz test platformasi

Qog'oz javob varaqalarini telefon kamerasi bilan tekshirish, blok (DTM), oddiy va Rasch testlar, Excel jadvallarni hisoblash, Telegram bot va bulutda saqlash. Kreditsiz, bepul serverlarda ishlaydi (Vercel Hobby + Upstash Redis Free).

## Yangi imkoniyatlar (2.0)

- **Moslashuvchan bo'limlar (mavzular):** har bir bo'limga alohida savol soni, 2–6 variant (A–B … A–F), True/False yoki yozma javob, har savol uchun ball. Masalan: 30 ta savol 4 variantli + 6 ta savol 6 variantli + 10 ta True/False. Varaq, skaner, kalit, bot va PDF shunga moslashadi.
- **Yozma javoblar:** varaqda yozish maydoni bor. O'qituvchi ✓ yoki ✗ doirachasini bo'yaydi va skaner uni ham o'qiydi. Botda o'quvchi yozma javobini matn qilib yuboradi.
- **Excel hisoblash:** EvalBee hisoboti yoki "Ism | 1 | 2 | 3 …" jadvali (birinchi qatorda "Kalit") yuklanadi. Natijada:
  - reyting, ball, foiz, 5 ballik baho;
  - Rasch ball va daraja;
  - mavzular bo'yicha ball;
  - savollar tahlili (qiyinlik, ajratish, javoblar taqsimoti, KR-20);
  - Excel/PDF eksport va testni ilovaga import qilish.
- **Bulut sinxronlash:** bir nechta telefon, o'qituvchilar o'z raqami bilan kiradi, telefon yo'qolsa ham ma'lumot saqlanib qoladi.
- **Telegram bot (to'liq):**
  - o'quvchi telefon raqami orqali avtomatik bog'lanadi;
  - test kodini kiritadi, javob beradi va natijani darhol oladi;
  - natijalar ilovaga avtomatik tushadi;
  - botda profil bor: daraja, aniqlik, top-3, o'sish;
  - murojaat (apellyatsiya) yuborish va o'qituvchi javobi;
  - rasmli e'lonlar, skanerlangan natijani avtomatik yuborish.
- **Milliy sertifikat to'g'ri hisoblanadi:**
  - majburiy fanda istalgan daraja maksimal ball beradi;
  - asosiy fanda A+ va A maksimal ball beradi;
  - asosiy fanda B+ … C bo'lsa, ball = maksimal ball × sertifikat foizi.
- **Rasch ball guruhga bog'lanmagan:** 50 + 10·θ formulasi bilan hisoblanadi, shuning uchun kuchli guruh past baho olib qolmaydi.
- **Skaner xira va ikki marta belgilangan javoblarni sariq bilan ko'rsatadi.** QR o'qilmasa ham varaqning yo'nalishini aniqlaydi.
- **PDF'larda kirill va o'zbek harflari to'g'ri chiqadi** (DejaVu Sans shrifti).
- **Testlar va natijalarni Excel'ga eksport qilish mumkin.**

## Rasch hisoblash (2.2 — asosiy)

- Savol qiyinligi — **CML** (shartli eng katta ehtimollik, Rasch modelining aniq usuli); o'quvchi qobiliyati θ — MLE (0 va to'liq natijada WLE).
- Standart usul — **Milliy sertifikat (BMBA)**: Z = (θ − μ)/σ, ball = 50 + 10·Z. **Yuqori chegara yo'q** ("maksimal ball shartli"): kuchli o'quvchi 75 dan ham yuqori oladi.
- OTM foizi: 65+ → 100%, 46–65 → ball/65, 46 dan past → 0. Darajalar: A+ ≥ 70, A ≥ 65, B+ ≥ 60, B ≥ 55, C+ ≥ 50, C ≥ 46, aks holda NC.
- Qo'shimcha usullar: σ siz (50 + 10·(θ − μ)) va "savol qiyinligi bo'yicha ball".

## Rasch hisoblash (2.1)

- Yangi test standart holatda **Rasch**: savol balli o'quvchilarning javoblari bo'yicha aniqlanadi — kam topilgan (qiyin) savolga ko'p ball, ko'p topilganiga kam ball; barcha savollar yig'indisi = maksimal ball (standart 75). Qiyinlik — Rasch modeli (JML), hamma topgan / hech kim topmagan savollar kalibrovkadan chiqariladi.
- Ikkinchi usul — **Milliy sertifikat (BMBA)**: θ (WLE) → Z = (θ − μ)/σ → T = 50 + 10·Z, 0…maksimal. Darajalar: A+ ≥ 70, A ≥ 65, B+ ≥ 60, B ≥ 55, C+ ≥ 50, C ≥ 46.
- Excel hisoblash, skaner, qo'lda kiritish va bot natijalari — hammasi shu usulda.
- **Savol varag'idan test**: savol varag'i suratga olinadi (OCR) → savollar soni, variantlar (A–F, True/False, yozma) va "Javoblar: 1-A 2-C…" yoki * belgisi bo'lsa kalit avtomatik.
- **Kalitni titul varaqdan**: o'qituvchi to'ldirgan javob varaqasini skanerlab kalitni kiritish.

## Deploy (GitHub orqali)

1. GitHub'da repozitoriyani oching. **Eski fayllarning hammasini o'chiring** (ayniqsa eski `api/` papkasi va `package.json`), keyin shu zip ichidagi barcha fayl va papkalarni yuklang (**Add file → Upload files** → papkalarni sudrab tashlang → Commit).
2. Vercel o'zi qayta deploy qiladi (Framework: *Other*, Build command bo'sh).
3. **Bulut va bot uchun (bir marta):** Vercel → loyiha → **Storage** → **Create Database** → **Upstash for Redis** → *Free* → loyihaga **Connect**. Keyin **Deployments → Redeploy**.
   Kerakli muhit o'zgaruvchilari avtomatik qo'shiladi: `KV_REST_API_URL`, `KV_REST_API_TOKEN` (yoki `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`).
4. Ilovada: **Yana → Bulut sinxronlash → Bulutga ulash**, keyin **Yana → Telegram bot**: BotFather tokenini kiriting.
   Eski bot ulangan bo'lsa, tokenni qayta kiriting.

Redis ulanmasa ham ilova to'liq ishlaydi: qog'oz testlar, skaner, PDF va Excel. Faqat ma'lumotlar bitta qurilmada saqlanadi.

## Fayllar

```
index.html, css/, fonts/, icon.svg, manifest.webmanifest, sw.js   – PWA
js/core.js      – ball hisoblash yadrosi (brauzer + server)
js/sheet.js     – varaq geometriyasi va chizish
js/omr.js       – skaner (marker, gomografiya, doirachalar)
js/views.js     – ekranlar
js/xlscalc.js   – Excel tahlil, js/xlsview.js – Excel ekrani
js/cloud.js     – bulut sinxron, js/bot.js – bot boshqaruvi, murojaatlar
api/sync.js     – bulut API, api/bot.js – bot boshqaruvi, api/tg.js – Telegram webhook
tests/run.js    – tez tekshiruv: node tests/run.js
```
