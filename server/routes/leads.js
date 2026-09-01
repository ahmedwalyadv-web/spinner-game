const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { buildLeadsWorkbook } = require('../utils/excel');

// mergeParams عشان نقدر نوصل لـ campaignId لو الراوتر ده متركب تحت /api/campaigns/:campaignId/leads
const router = express.Router({ mergeParams: true });
router.use(requireAuth);

router.get('/', (req, res) => {
  const { campaignId } = req.params;
  const leads = db
    .prepare('SELECT * FROM leads WHERE campaign_id = ? ORDER BY created_at DESC')
    .all(campaignId);
  res.json({ leads });
});

router.get('/export', async (req, res) => {
  const { campaignId } = req.params;
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) return res.status(404).json({ error: 'الكامبين غير موجود' });

  const leads = db
    .prepare('SELECT * FROM leads WHERE campaign_id = ? ORDER BY created_at DESC')
    .all(campaignId);

  const workbook = await buildLeadsWorkbook(leads, campaign.name);
  const fileName = `${campaign.name.replace(/[^\w؀-ۿ\-]+/g, '_')}_leads.xlsx`;

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
  await workbook.xlsx.write(res);
  res.end();
});

router.delete('/:leadId', (req, res) => {
  const { campaignId, leadId } = req.params;
  db.prepare('DELETE FROM leads WHERE id = ? AND campaign_id = ?').run(leadId, campaignId);
  res.json({ ok: true });
});

module.exports = router;
