# ทริปพูลวิลล่า บ้านรมณ์ดี

เว็บจัดการทริปเชียงใหม่ 1–2 พฤศจิกายน 2026 ใช้ Next.js, Google OpenID Connect และ Neon Postgres พร้อม deploy บน Vercel

## เริ่มใช้งานในเครื่อง

ต้องใช้ Node.js 22 ขึ้นไป

```bash
npm install
cp .env.example .env.local
npm run dev
```

กำหนด `SESSION_SECRET`, `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` และ `GOOGLE_REDIRECT_URI` ใน `.env.local` ก่อนลอง Google Login

## เตรียมบริการ

1. สร้าง Neon Postgres ผ่าน Vercel Marketplace แล้วตั้งค่า `DATABASE_URL` ใน Project Environment Variables ของ Vercel
2. ตั้ง `SESSION_SECRET` เป็นค่าสุ่มยาวและไม่ซ้ำกัน
3. ใส่ `SESSION_SECRET` ใน `.env.local` แล้วรัน `npm run trip-code:hash` จากนั้นพิมพ์รหัสทริปเดิม คัดลอกค่า `TRIP_CODE_HASH` ที่แสดงไปตั้งใน Vercel
4. สร้าง OAuth Client ชนิด **Web application** ใน Google Cloud Console แล้วเพิ่ม Authorized redirect URI เป็น `https://<โดเมน-production>/api/auth/google/callback`
5. ตั้ง `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` และ `GOOGLE_REDIRECT_URI` ใน Vercel โดย redirect URI ต้องตรงกับค่าที่ลงทะเบียนใน Google Cloud ทุกตัวอักษร

Google Login ขอเฉพาะ scope `openid email profile` และตรวจ ID token ที่เซิร์ฟเวอร์ก่อนสร้าง session ส่วน `SESSION_SECRET`, `TRIP_CODE_HASH` และ `GOOGLE_CLIENT_SECRET` ต้องอยู่ใน environment variables ฝั่งเซิร์ฟเวอร์เท่านั้น

## Deploy บน Vercel

เชื่อม repository ของคุณกับ Vercel หรือรัน `npx vercel --prod` จากโฟลเดอร์โปรเจกต์ Vercel ตรวจพบ Next.js ให้อัตโนมัติ ใช้คำสั่ง build `npm run build` และไม่ต้องกำหนด output directory เอง

หลัง deploy ครั้งแรก การเปิดบัญชีทริปจะสร้างตาราง `trip_state` ใน Neon และใส่ข้อมูลเริ่มต้นให้อัตโนมัติ ข้อมูลที่บันทึกอยู่ใน Cloudflare D1 ของเว็บเดิมไม่ย้ายตามมาเอง

## Environment variables

ดูชื่อค่าที่ต้องตั้งใน [`.env.example`](.env.example) ห้าม commit `.env.local` หรือ secret ลง repository
