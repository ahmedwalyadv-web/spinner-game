const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { resolveSpin } = require('../utils/spin');

const router = express.Router();

// تنظيف رقم التليفون لأرقام بس عشان مقارنة دقيقة (بيتجاهل مسافات وشرط ورموز الدولة المختلفة)
function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function findExistingLead(campaignId, phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return db
    .prepare('SELECT id FROM leads WHERE campaign_id = ? AND phone_normalized = ? LIMIT 1')
    .get(campaignId, normalized);
}

// إرسال بيانات اللعب إلى Google Sheet (لو الأدمن ضايف رابط Apps Script) - بدون ما نعطّل استجابة اللاعب لو فشل
function sendToGoogleSheet(webhookUrl, payload) {
  if (!webhookUrl) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
      .catch(() => {})
      .finally(() => clearTimeout(timeout));
  } catch (e) {
    // أي خطأ هنا متأثرش على تجربة اللاعب
  }
}

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

// فحص سريع (قبل ما نوري شاشة العجلة) هل الرقم ده لعب قبل كده في الكامبين ده
router.post('/campaigns/:slug/check-phone', (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE slug = ?').get(req.params.slug);
  if (!c) return res.status(404).json({ error: 'الرابط غير صحيح' });
  if (!c.is_active) return res.status(403).json({ error: 'هذا الكامبين متوقف حاليًا' });

  const phone = (req.body && req.body.phone) || '';
  const existing = findExistingLead(c.id, phone);
  res.json({ alreadyPlayed: !!existing });
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
  const interestIds = Array.isArray(body.interestIds) ? body.interestIds : [];
  const customFieldsInput = body.customFields && typeof body.customFields === 'object' ? body.customFields : {};

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
  if (fields.interests.enabled && fields.interests.required && interestIds.length === 0) {
    return res.status(400).json({ error: 'من فضلك اختر اهتماماتك' });
  }

  // تحقق من الحقول الحرة اللي ضافها الأدمن
  const customFieldsDefs = Array.isArray(config.form.customFields) ? config.form.customFields : [];
  const customFieldsToStore = {};
  for (const def of customFieldsDefs) {
    const val = (customFieldsInput[def.id] || '').toString().trim();
    if (def.required && !val) {
      const label = (def.label && (def.label.ar || def.label.en)) || 'حقل مطلوب';
      return res.status(400).json({ error: `من فضلك أدخل: ${label}` });
    }
    if (val) customFieldsToStore[def.id] = val;
  }

  // منع اللعب أكتر من مرة بنفس رقم التليفون
  if (phone) {
    const existing = findExistingLead(c.id, phone);
    if (existing) {
      const msg =
        (config.form.duplicatePhoneMessage && config.form.duplicatePhoneMessage.ar) ||
        'لقد شاركت من قبل، شكرًا لمشاركتك';
      return res.status(409).json({ error: msg, alreadyPlayed: true });
    }
  }

  const segments = config.wheel.segments || [];

  // لو العميل اختار اهتمام مرتبط بجائزة قيمة، بنحاول نجبر فوزه بيها (لو لسه متاحة كمية)
  let forcedSegmentId = null;
  if (interestIds.length > 0 && Array.isArray(config.form.interestsList)) {
    const matched = config.form.interestsList.find(
      (it) => it.linkedSegmentId && interestIds.includes(it.id)
    );
    if (matched) forcedSegmentId = matched.linkedSegmentId;
  }

  let result;
  try {
    result = resolveSpin(
      segments,
      c.spin_count,
      JSON.parse(c.segment_stats || '{}'),
      JSON.parse(c.stock_used || '{}'),
      forcedSegmentId
    );
  } catch (e) {
    return res.status(500).json({ error: 'حدث خطأ أثناء تحديد نتيجة العجلة' });
  }

  const now = new Date().toISOString();
  const leadId = uuidv4();

  db.prepare(
    `INSERT INTO leads (id, campaign_id, name, phone, phone_normalized, position, email, interests, interest_ids, custom_fields, result_segment_id, result_label, result_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    leadId,
    c.id,
    name,
    phone,
    normalizePhone(phone),
    position || null,
    email || null,
    JSON.stringify(interests),
    JSON.stringify(interestIds),
    JSON.stringify(customFieldsToStore),
    result.winner.id,
    result.winner.label ? result.winner.label.ar : '',
    result.winner.type,
    now
  );

  db.prepare('UPDATE campaigns SET spin_count = ?, segment_stats = ?, stock_used = ? WHERE id = ?').run(
    result.newSpinCount,
    JSON.stringify(result.newStats),
    JSON.stringify(result.newStockUsed),
    c.id
  );

  // مزامنة فورية مع Google Sheet لو مفعّلة (بدون ما نستنى الرد عشان مايبطأش تجربة اللاعب)
  const webhookUrl = config.integrations && config.integrations.googleSheetWebhookUrl;
  if (webhookUrl) {
    const customFieldsText = customFieldsDefs
      .filter((def) => customFieldsToStore[def.id])
      .map((def) => `${(def.label && def.label.ar) || def.id}: ${customFieldsToStore[def.id]}`)
      .join('، ');
    sendToGoogleSheet(webhookUrl, {
      createdAt: new Date(now).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }),
      campaignName: c.name,
      name,
      phone,
      position,
      email,
      interests,
      customFieldsText,
      resultLabel: result.winner.label ? result.winner.label.ar : '',
      resultType: result.winner.type
    });
  }

  res.json({
    ok: true,
    segmentIndex: result.segmentIndex,
    segmentId: result.winner.id,
    winner: result.winner,
    resultPopup: result.winner.type === 'win' ? config.resultPopup.win : config.resultPopup.lose
  });
});

module.exports = router;
