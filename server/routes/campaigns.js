const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { defaultCampaignConfig, mergeConfigDefaults } = require('../utils/defaultConfig');

const router = express.Router();
router.use(requireAuth);

function randomSlug() {
  return uuidv4().split('-')[0]; // 8 حروف/أرقام قصيرة وفريدة
}

function slugExists(slug) {
  return !!db.prepare('SELECT 1 FROM campaigns WHERE slug = ?').get(slug);
}

function sanitizeSlug(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// قائمة كل الكامبينات + عدد العملاء لكل واحد
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.slug, c.name, c.is_active, c.spin_count, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id) AS leads_count
       FROM campaigns c ORDER BY c.created_at DESC`
    )
    .all();
  res.json({ campaigns: rows });
});

// إنشاء كامبين جديد
router.post('/', (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'اسم الكامبين مطلوب' });

  let slug = randomSlug();
  while (slugExists(slug)) slug = randomSlug();

  const now = new Date().toISOString();
  const config = defaultCampaignConfig(name.trim());
  const id = uuidv4();

  db.prepare(
    `INSERT INTO campaigns (id, slug, name, is_active, config, spin_count, segment_stats, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, 0, '{}', ?, ?)`
  ).run(id, slug, name.trim(), JSON.stringify(config), now, now);

  res.json({ ok: true, id, slug });
});

// تفاصيل كامبين واحد (مع الإعدادات كاملة)
router.get('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'الكامبين غير موجود' });
  res.json({
    id: c.id,
    slug: c.slug,
    name: c.name,
    isActive: !!c.is_active,
    config: mergeConfigDefaults(JSON.parse(c.config)),
    spinCount: c.spin_count,
    stockUsed: JSON.parse(c.stock_used || '{}'),
    createdAt: c.created_at,
    updatedAt: c.updated_at
  });
});

// تحديث إعدادات الكامبين (بيانات + config كامل)
router.put('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'الكامبين غير موجود' });

  const { name, isActive, config, slug } = req.body || {};

  let newSlug = c.slug;
  if (slug && sanitizeSlug(slug) && sanitizeSlug(slug) !== c.slug) {
    const clean = sanitizeSlug(slug);
    if (slugExists(clean)) return res.status(400).json({ error: 'الرابط المخصص ده مستخدم بالفعل' });
    newSlug = clean;
  }

  db.prepare(
    `UPDATE campaigns SET name = ?, is_active = ?, config = ?, slug = ?, updated_at = ? WHERE id = ?`
  ).run(
    name && name.trim() ? name.trim() : c.name,
    typeof isActive === 'boolean' ? (isActive ? 1 : 0) : c.is_active,
    config ? JSON.stringify(config) : c.config,
    newSlug,
    new Date().toISOString(),
    c.id
  );

  res.json({ ok: true, slug: newSlug });
});

// حذف كامبين (وكل العملاء المرتبطين بيه)
router.delete('/:id', (req, res) => {
  const c = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'الكامبين غير موجود' });
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(c.id);
  res.json({ ok: true });
});

// نسخ كامبين موجود عشان تستخدمه لعميل جديد بسرعة (بنفس التصميم والهوية)
router.post('/:id/duplicate', (req, res) => {
  const c = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'الكامبين غير موجود' });

  let slug = randomSlug();
  while (slugExists(slug)) slug = randomSlug();

  const now = new Date().toISOString();
  const id = uuidv4();
  const newName = `${c.name} (نسخة)`;

  db.prepare(
    `INSERT INTO campaigns (id, slug, name, is_active, config, spin_count, segment_stats, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, 0, '{}', ?, ?)`
  ).run(id, slug, newName, c.config, now, now);

  res.json({ ok: true, id, slug });
});

// تصفير عداد اللفات وإحصاء الضمانات (مفيد لو عايز تبدأ الكامبين من جديد لعميل جديد بنفس الإعدادات)
router.post('/:id/reset-stats', (req, res) => {
  const c = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'الكامبين غير موجود' });
  db.prepare(`UPDATE campaigns SET spin_count = 0, segment_stats = '{}', stock_used = '{}', updated_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    c.id
  );
  res.json({ ok: true });
});

module.exports = router;
