const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { resolveSpin } = require('../utils/spin');
const { mergeConfigDefaults } = require('../utils/defaultConfig');

const router = express.Router();

// تنظيف رقم التليفون لأرقام بس عشان مقارنة دقيقة (بيتجاهل مسافات وشرط ورموز الدولة المختلفة)
function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

// تحقق من شكل رقم التليفون حسب إعدادات الكامبين (عدد أرقام إجباري و/أو بادئة إجبارية) - بيرجع الرقم "نظيف" (أرقام بس)
// لو الشكل صحيح، أو null لو غير صحيح. لو الكامبين مفيهوش أي قيد (digits=0 و startsWith فاضي) بيرجع الرقم الأصلي كما هو.
function validatePhoneFormat(phone, validation) {
  const digitsOnly = String(phone || '').replace(/\D/g, '');
  const requiredDigits = Number(validation && validation.digits) || 0;
  const prefix = (validation && validation.startsWith) || '';
  if (!requiredDigits && !prefix) return phone;
  if (requiredDigits && digitsOnly.length !== requiredDigits) return null;
  if (prefix && !digitsOnly.startsWith(prefix)) return null;
  return digitsOnly;
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

// كود فاوتشر عشوائي (بدون حروف/أرقام ممكن تتلبس بصريًا زي 0/O أو 1/I) - يستخدمه العميل لاستلام جائزته
function generateVoucherCode(voucherCfg) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const len = Math.max(4, Math.min(12, Number(voucherCfg && voucherCfg.codeLength) || 6));
  let code = '';
  for (let i = 0; i < len; i++) code += chars[Math.floor(Math.random() * chars.length)];
  const prefix = (voucherCfg && voucherCfg.prefix) || '';
  return (prefix ? prefix + '-' : '') + code;
}

// بنولّد كود ونتأكد إنه غير مستخدم قبل كده في نفس الكامبين (بيحاول لحد 20 مرة، وإلا بيضيف طابع وقت عشان يفضل فريد)
function uniqueVoucherCode(campaignId, voucherCfg) {
  for (let i = 0; i < 20; i++) {
    const code = generateVoucherCode(voucherCfg);
    const exists = db.prepare('SELECT id FROM leads WHERE campaign_id = ? AND voucher_code = ? LIMIT 1').get(campaignId, code);
    if (!exists) return code;
  }
  return generateVoucherCode(voucherCfg) + '-' + Date.now().toString(36).toUpperCase();
}

// تحقق من الحقول المطلوبة + شكل رقم التليفون + التكرار - مستخدمة في مسار "البيانات الأول" و"التسجيل بعد اللفة" الاتنين
// بترجع { ok:true, data:{...} } أو { ok:false, status, error, alreadyPlayed? }
function validateAndExtractLeadFields(config, campaignId, body) {
  const fields = config.form.fields;
  const name = (body.name || '').toString().trim();
  let phone = (body.phone || '').toString().trim();
  const position = (body.position || '').toString().trim();
  const email = (body.email || '').toString().trim();
  const interests = Array.isArray(body.interests) ? body.interests : [];
  const interestIds = Array.isArray(body.interestIds) ? body.interestIds : [];
  const customFieldsInput = body.customFields && typeof body.customFields === 'object' ? body.customFields : {};

  if (fields.name.enabled && fields.name.required && !name) {
    return { ok: false, status: 400, error: 'من فضلك أدخل الاسم' };
  }
  if (fields.phone.enabled && fields.phone.required && !phone) {
    return { ok: false, status: 400, error: 'من فضلك أدخل رقم التليفون' };
  }
  if (fields.phone.enabled && phone) {
    const cleaned = validatePhoneFormat(phone, fields.phone.validation);
    if (cleaned === null) return { ok: false, status: 400, error: 'رقم التليفون غير صحيح' };
    phone = cleaned;
  }
  if (fields.email.enabled && fields.email.required && !email) {
    return { ok: false, status: 400, error: 'من فضلك أدخل البريد الإلكتروني' };
  }
  if (fields.position.enabled && fields.position.required && !position) {
    return { ok: false, status: 400, error: 'من فضلك أدخل المنصب' };
  }
  if (fields.interests.enabled && fields.interests.required && interestIds.length === 0) {
    return { ok: false, status: 400, error: 'من فضلك اختر اهتماماتك' };
  }

  const customFieldsDefs = Array.isArray(config.form.customFields) ? config.form.customFields : [];
  const customFieldsToStore = {};
  for (const def of customFieldsDefs) {
    const val = (customFieldsInput[def.id] || '').toString().trim();
    if (def.required && !val) {
      const label = (def.label && (def.label.ar || def.label.en)) || 'حقل مطلوب';
      return { ok: false, status: 400, error: `من فضلك أدخل: ${label}` };
    }
    if (val) customFieldsToStore[def.id] = val;
  }

  if (phone) {
    const existing = findExistingLead(campaignId, phone);
    if (existing) {
      const msg =
        (config.form.duplicatePhoneMessage && config.form.duplicatePhoneMessage.ar) ||
        'لقد شاركت من قبل، شكرًا لمشاركتك';
      return { ok: false, status: 409, error: msg, alreadyPlayed: true };
    }
  }

  return { ok: true, data: { name, phone, position, email, interests, interestIds, customFieldsToStore, customFieldsDefs } };
}

// إدراج العميل في قاعدة البيانات + مزامنة جوجل شيت (لو مربوط) - مستخدمة في الاتنين مسارات
function insertLeadAndSync(c, config, data, winnerSegment, now, voucherCode) {
  const leadId = uuidv4();
  db.prepare(
    `INSERT INTO leads (id, campaign_id, name, phone, phone_normalized, position, email, interests, interest_ids, custom_fields, result_segment_id, result_label, result_type, created_at, voucher_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    leadId,
    c.id,
    data.name,
    data.phone,
    normalizePhone(data.phone),
    data.position || null,
    data.email || null,
    JSON.stringify(data.interests),
    JSON.stringify(data.interestIds),
    JSON.stringify(data.customFieldsToStore),
    winnerSegment.id,
    winnerSegment.label ? winnerSegment.label.ar : '',
    winnerSegment.type,
    now,
    voucherCode || null
  );

  const webhookUrl = config.integrations && config.integrations.googleSheetWebhookUrl;
  if (webhookUrl) {
    const customFieldsText = (data.customFieldsDefs || [])
      .filter((def) => data.customFieldsToStore[def.id])
      .map((def) => `${(def.label && def.label.ar) || def.id}: ${data.customFieldsToStore[def.id]}`)
      .join('، ');
    sendToGoogleSheet(webhookUrl, {
      createdAt: new Date(now).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }),
      campaignName: c.name,
      name: data.name,
      phone: data.phone,
      position: data.position,
      email: data.email,
      interests: data.interests,
      customFieldsText,
      resultLabel: winnerSegment.label ? winnerSegment.label.ar : '',
      resultType: winnerSegment.type,
      voucherCode: voucherCode || ''
    });
  }

  return leadId;
}

// جلب إعدادات كامبين عن طريق الرابط (slug) - بدون تسجيل دخول، ده اللي بتفتحه صفحة اللعبة
router.get('/campaigns/:slug', (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE slug = ?').get(req.params.slug);
  if (!c) return res.status(404).json({ error: 'الرابط غير صحيح' });
  if (!c.is_active) return res.status(403).json({ error: 'هذا الكامبين متوقف حاليًا' });

  const config = mergeConfigDefaults(JSON.parse(c.config));
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

// المسار الكلاسيكي (flow.order = 'dataFirst'): بيانات العميل الأول، وبعدين بتلف العجلة وتتسجل النتيجة في نفس الخطوة
router.post('/campaigns/:slug/spin', (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE slug = ?').get(req.params.slug);
  if (!c) return res.status(404).json({ error: 'الرابط غير صحيح' });
  if (!c.is_active) return res.status(403).json({ error: 'هذا الكامبين متوقف حاليًا' });

  const config = mergeConfigDefaults(JSON.parse(c.config));
  const body = req.body || {};

  const validated = validateAndExtractLeadFields(config, c.id, body);
  if (!validated.ok) {
    return res.status(validated.status).json({ error: validated.error, alreadyPlayed: validated.alreadyPlayed });
  }
  const data = validated.data;

  const segments = config.wheel.segments || [];

  // لو العميل اختار اهتمام مرتبط بجائزة قيمة، بنحاول نجبر فوزه بيها (لو لسه متاحة كمية)
  let forcedSegmentId = null;
  if (data.interestIds.length > 0 && Array.isArray(config.form.interestsList)) {
    const matched = config.form.interestsList.find(
      (it) => it.linkedSegmentId && data.interestIds.includes(it.id)
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
  // الكود بيتولّد بس لو العميل فاز فعلاً (استلام الجائزة) - مش منطقي كود "استلام جائزة" لعميل خسر
  const voucherCode =
    config.voucher && config.voucher.enabled && result.winner.type === 'win'
      ? uniqueVoucherCode(c.id, config.voucher)
      : null;

  insertLeadAndSync(c, config, data, result.winner, now, voucherCode);

  db.prepare('UPDATE campaigns SET spin_count = ?, segment_stats = ?, stock_used = ? WHERE id = ?').run(
    result.newSpinCount,
    JSON.stringify(result.newStats),
    JSON.stringify(result.newStockUsed),
    c.id
  );

  res.json({
    ok: true,
    segmentIndex: result.segmentIndex,
    segmentId: result.winner.id,
    winner: result.winner,
    voucherCode,
    resultPopup: result.winner.type === 'win' ? config.resultPopup.win : config.resultPopup.lose
  });
});

// المسار الجديد (flow.order = 'spinFirst') - الخطوة الأولى: يلف العجلة على طول من غير أي بيانات
// النتيجة والمخزون بيتحدثوا فورًا هنا (زي المسار الكلاسيكي)، وبعدين خطوة التسجيل بتاعة بياناته منفصلة تحت
router.post('/campaigns/:slug/spin-only', (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE slug = ?').get(req.params.slug);
  if (!c) return res.status(404).json({ error: 'الرابط غير صحيح' });
  if (!c.is_active) return res.status(403).json({ error: 'هذا الكامبين متوقف حاليًا' });

  const config = mergeConfigDefaults(JSON.parse(c.config));
  const segments = config.wheel.segments || [];

  let result;
  try {
    result = resolveSpin(
      segments,
      c.spin_count,
      JSON.parse(c.segment_stats || '{}'),
      JSON.parse(c.stock_used || '{}'),
      null
    );
  } catch (e) {
    return res.status(500).json({ error: 'حدث خطأ أثناء تحديد نتيجة العجلة' });
  }

  db.prepare('UPDATE campaigns SET spin_count = ?, segment_stats = ?, stock_used = ? WHERE id = ?').run(
    result.newSpinCount,
    JSON.stringify(result.newStats),
    JSON.stringify(result.newStockUsed),
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

// المسار الجديد - الخطوة الثانية: بعد ما لف وشاف إنه فاز، بيسجل بياناته هنا عشان يستلم جائزته
// النتيجة (segmentId) جاية من رد /spin-only - مش بتتحسب تاني هنا، بس بتتأكد إنها موجودة فعلاً في العجلة
router.post('/campaigns/:slug/register-winner', (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE slug = ?').get(req.params.slug);
  if (!c) return res.status(404).json({ error: 'الرابط غير صحيح' });
  if (!c.is_active) return res.status(403).json({ error: 'هذا الكامبين متوقف حاليًا' });

  const config = mergeConfigDefaults(JSON.parse(c.config));
  const body = req.body || {};

  const segmentId = (body.segmentId || '').toString();
  const segment = (config.wheel.segments || []).find((s) => s.id === segmentId);
  if (!segment) {
    return res.status(400).json({ error: 'نتيجة اللفة غير صحيحة، من فضلك لف العجلة تاني' });
  }

  const validated = validateAndExtractLeadFields(config, c.id, body);
  if (!validated.ok) {
    return res.status(validated.status).json({ error: validated.error, alreadyPlayed: validated.alreadyPlayed });
  }
  const data = validated.data;

  const now = new Date().toISOString();
  // الكود بيتولّد بس لو العميل فاز فعلاً (استلام الجائزة) - مش منطقي كود "استلام جائزة" لعميل خسر
  const voucherCode =
    config.voucher && config.voucher.enabled && segment.type === 'win'
      ? uniqueVoucherCode(c.id, config.voucher)
      : null;

  insertLeadAndSync(c, config, data, segment, now, voucherCode);

  res.json({
    ok: true,
    winner: segment,
    voucherCode,
    resultPopup: segment.type === 'win' ? config.resultPopup.win : config.resultPopup.lose
  });
});

module.exports = router;
