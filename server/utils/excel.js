// تصدير بيانات العملاء (Leads) إلى ملف إكسل منظم وجاهز للفتح في Excel
const ExcelJS = require('exceljs');

async function buildLeadsWorkbook(leads, campaignName) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Spinner Game';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('العملاء', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }]
  });

  sheet.columns = [
    { header: 'الاسم', key: 'name', width: 24 },
    { header: 'رقم التليفون', key: 'phone', width: 18 },
    { header: 'المنصب', key: 'position', width: 20 },
    { header: 'البريد الإلكتروني', key: 'email', width: 28 },
    { header: 'الاهتمامات', key: 'interests', width: 30 },
    { header: 'النتيجة', key: 'result_label', width: 26 },
    { header: 'نوع النتيجة', key: 'result_type', width: 14 },
    { header: 'تاريخ ووقت اللعب', key: 'created_at', width: 22 }
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C1F3A' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
  });

  for (const lead of leads) {
    let interests = [];
    try {
      interests = JSON.parse(lead.interests || '[]');
    } catch (e) {
      interests = [];
    }
    const row = sheet.addRow({
      name: lead.name,
      phone: lead.phone,
      position: lead.position || '',
      email: lead.email || '',
      interests: Array.isArray(interests) ? interests.join('، ') : '',
      result_label: lead.result_label || '',
      result_type: lead.result_type === 'win' ? 'ربح' : lead.result_type === 'lose' ? 'حظ أوفر' : '',
      created_at: new Date(lead.created_at).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })
    });
    row.alignment = { vertical: 'middle', horizontal: 'right' };
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length }
  };

  // ورقة ملخص سريعة
  const summary = workbook.addWorksheet('ملخص', { views: [{ rightToLeft: true }] });
  summary.columns = [
    { header: 'البند', key: 'k', width: 30 },
    { header: 'القيمة', key: 'v', width: 30 }
  ];
  summary.getRow(1).font = { bold: true };
  const totalLeads = leads.length;
  const totalWins = leads.filter((l) => l.result_type === 'win').length;
  summary.addRow({ k: 'اسم الكامبين', v: campaignName || '' });
  summary.addRow({ k: 'إجمالي عدد المشاركين', v: totalLeads });
  summary.addRow({ k: 'عدد الفائزين', v: totalWins });
  summary.addRow({ k: 'تاريخ التصدير', v: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });

  return workbook;
}

module.exports = { buildLeadsWorkbook };
