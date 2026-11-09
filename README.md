# TestVaraq

O'quv markazlar uchun test platformasi (PWA). Admin va o'qituvchilar testlarni yaratadi,
javob varaqalarini telefon kamerasi bilan tekshiradi va natijalarni bir zumda oladi.

## Imkoniyatlar

- **Javob varaqasini skanerlash** — kamera (avtomatik suratga oladi) yoki galereyadan rasm.
  QR kod testni, o'quvchini va variantni o'zi aniqlaydi; 4 ta burchak markeri bo'yicha
  perspektiva to'g'rilanadi, 90–120 ta javob bir soniyadan kam vaqtda tanib olinadi.
  Varaq teskari yoki yonboshlab olingan bo'lsa ham ishlaydi. Xato tanilgan javobni qo'lda tuzatish mumkin.
- **DTM formatidagi blok testlar** — 3 majburiy fan (10×1.1) + 2 asosiy fan (30×3.1, 30×2.1) = 90 savol, 189 ball, 1–8 variant.
- **Rasch testlar** — Rasch (1PL, JML) modeli bo'yicha ball (0–75) va daraja (A+, A, B+, B, C+, C), har bir savol qiyinligi va tahlili.
- **Oddiy testlar** — bitta fan, 1–120 savol.
- **Milliy sertifikat** — o'quvchi kartasiga kiritilgan sertifikat blok testda avtomatik hisobga olinadi (daraja bo'yicha foiz sozlanadi).
- **O'quvchilar, guruhlar, o'qituvchilar** — rollar: administrator va o'qituvchi (o'qituvchi faqat o'z guruhlarini ko'radi). Ro'yxatdan ommaviy qo'shish.
- **PDF** — javob kaliti, har bir o'quvchi uchun ismli + QR kodli javob varaqalari, bo'sh varaqlar, natijalar reytingi, savollar tahlili, o'quvchi hisoboti. Telefonning "Ulashish" menyusi orqali Telegramga yuboriladi.
- **Tahlil** — o'rtacha/eng yuqori/eng past ball, fanlar bo'yicha o'rtacha, eng qiyin savollar, daraja taqsimoti.
- **Zaxira** — JSON eksport/import (boshqa qurilmaga ko'chirish).
- **Oflayn** — PWA, telefonga o'rnatiladi, internetsiz ishlaydi.

## Ishga tushirish

Build kerak emas — oddiy statik sayt. Istalgan statik hostingga (Vercel, Netlify, GitHub Pages) joylang.
Kamera uchun HTTPS kerak (Vercel avtomatik beradi).

Lokal: papkani istalgan statik server bilan oching, masalan `npx serve .`

## Ma'lumotlar

Hozircha barcha ma'lumotlar qurilma brauzerida (localStorage) saqlanadi — server va oylik to'lov yo'q.
Bir nechta qurilmada ishlash uchun "Zaxira nusxa" orqali ko'chiring.

## Tuzilishi

```
index.html, css/app.css
js/db.js       ma'lumotlar (localStorage)
js/scoring.js  blok/oddiy ball, milliy sertifikat, Rasch modeli
js/sheet.js    javob varaqasi geometriyasi va chizish
js/omr.js      skaner: QR, markerlar, gomografiya, doirachalarni o'qish
js/pdf.js      PDF hisobotlar
js/views.js    ekranlar, js/scan.js skaner ekrani, js/app.js router
sw.js          oflayn kesh
```
