require('dotenv').config(); // تحميل إعدادات ملف .env لو موجود
require('./db'); // يتأكد من إنشاء قاعدة البيانات وحساب الأدمن الافتراضي
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const compression = require('compression');

const authRoutes = require('./routes/auth');
const campaignsRoutes = require('./routes/campaigns');
const leadsRoutes = require('./routes/leads');
const uploadRoutes = require('./routes/upload');
const publicRoutes = require('./routes/public');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// ملفات ثابتة (الصور والفيديوهات المرفوعة + الواجهات)
// لو معرّف متغير بيئة DATA_DIR (مسار قرص دائم على الاستضافة) بنقرأ الصور منه، وإلا من public/uploads المحلي
const uploadsServeDir = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'uploads')
  : path.join(__dirname, '..', 'public', 'uploads');
app.use('/uploads', express.static(uploadsServeDir));
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));
app.use('/play', express.static(path.join(__dirname, '..', 'public', 'play')));

// API
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/campaigns/:campaignId/leads', leadsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/public', publicRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

// أي رابط لعبة زي /play/xxxxxxxx يوجه لصفحة اللعبة (SPA fallback)
app.get(/^\/play(\/.*)?$/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'play', 'index.html'));
});
app.get(/^\/admin(\/.*)?$/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});

app.get('/', (req, res) => {
  res.redirect('/admin');
});

app.listen(PORT, () => {
  console.log(`السيرفر شغال على المنفذ ${PORT}`);
  console.log(`لوحة التحكم: http://localhost:${PORT}/admin`);
});
