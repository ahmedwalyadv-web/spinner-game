const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { resolveSpin } = require('../utils/spin');

const router = express.Router();

// جلب إعدادات كامبين عن طريق الرابط (slug) - بدون تسجيل دخول، ده اللي بتفتحه صفحة اللعبة
router.get('/campaigns/:slug', (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE slug = ?').get(req.params.slug);
  if (!c) return res.status(404).json({ error: 'الرابط غير صحيح' });
  if (!c.is_active) return res.status(403).json({ error: 'هذا الكامبين متوقف حاليًا' });

  const config = JSON.parse(c.config);
  res.json({
    id: c.id,
    slug: c.slug,
    name: c.name,
    config
  });
});

router.post('/campaigns/:slug/spin', (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE slug = ?').get(req.params.slug);
  if (!c) return res.status(404).json({ error: 'الرابط غير صحيح' });
  if (!c.is_active) return res.status(403).json({ error: 'هذا الكامبين متوقف حاليًا' });

  const config = JSON.parse(c.config);
  const fields = config.form.fields;
  const body = req.body || {};

  // تحقق من الحقول المطلوبة حسب إعدادات الكامبين (الاسم والتليفون إجباريين دايمًا)
  const name = (body.name || '').toString().trim();
  const phone = (body.phone || '').toString().trim();
  const position = (body.position || '').toString().trim();
  const email = (body.email || '').toString().trim();
  const interests = Array.isArray(body.interests) ? body.interests : [];

  if (fields.name.enabled && fields.name.required && !name) {
    return res.status(400).json({ error: 'من فضلك أدخل الاسم' });
  }
  if (fields.phone.enabled && fields.phone.required && !phone) {
    return res.status(400).json({ error: 'من فضلك أدخل رقم التليفون' });
  }
  if (fields.email.enabled && fields.email.required && !email) {
    return res.status(400).json({ error: 'من فضلك أدخل البريد الإلكتروني' });
  }
  if (fields.position.enabled && fields.position.required && !position) {
    return res.status(400).json({ error: 'من فضلك أدخل المنصب' });
  }

  const segments = config.wheel.segments || [];
  let result;
  try {
    result = resolveSpin(segments, c.spin_count, JSON.parse(c.segment_stats || '{}'));
  } catch (e) {
    return res.status(500).json({ error: 'حدث خطأ أثناء تحديد نتيجة العجلة' });
  }

  const now = new Date().toISOString();
  const leadId = uuidv4();

  db.prepare(
    `INSERT INTO leads (id, campaign_id, name, phone, position, email, interests, result_segment_id, result_label, result_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    leadId,
    c.id,
    name,
    phone,
    position || null,
    email || null,
    JSON.stringify(interests),
    result.winner.id,
    result.winner.label ? result.winner.label.ar : '',
    result.winner.type,
    now
  );

  db.prepare('UPDATE campaigns SET spin_count = ?, segment_stats = ? WHERE id = ?').run(
    result.newSpinCount,
    JSON.stringify(result.newStats),
    c.id
  );

  res.json({
    ok: true,
    segmentIndex: result.segmentIndex,
    segmentId: result.winner.id,
    winner: result.winner,
    resultPopup: result.winner.type === 'win' ? config.resultPopup.win : config.resultPopup.lose
  });
});

module.exports = router;
