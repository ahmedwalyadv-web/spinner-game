// محرك تحديد نتيجة اللفة: نسبة احتمال لكل قسم + إمكانية "ضمان الظهور كل N لفة" + كمية مخزون محدودة لكل جائزة
// + إمكانية إجبار قسم معين (لو العميل اختار اهتمام مرتبط بجائزة قيمة) طالما لسه متاح منها كمية
// المنطق بيشتغل في السيرفر عشان النتيجة تكون عادلة ومش قابلة للتلاعب من المتصفح

function remainingStock(seg, stockUsed) {
  if (seg.stock === null || seg.stock === undefined || seg.stock === '') return Infinity;
  const used = Number(stockUsed[seg.id]) || 0;
  return Number(seg.stock) - used;
}

function resolveSpin(segments, spinCount, segmentStats, stockUsed, forcedSegmentId) {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error('لا يوجد أقسام في العجلة');
  }

  const currentSpinIndex = (spinCount || 0) + 1;
  const stats = { ...(segmentStats || {}) };
  const usedStock = { ...(stockUsed || {}) };

  // نستبعد الأقسام اللي خلصت كميتها من الاختيار العادي (لو كل الأقسام خلصت، نرجع نعتبرهم كلهم متاحين عشان اللعبة متقفش)
  let inStock = segments.filter((s) => remainingStock(s, usedStock) > 0);
  if (inStock.length === 0) inStock = segments.slice();

  let winner = null;

  // 1) أولوية قصوى: اهتمام العميل مرتبط بجائزة قيمة - طالما لسه متاحة
  if (forcedSegmentId) {
    winner = inStock.find((s) => s.id === forcedSegmentId) || null;
  }

  if (!winner) {
    // 2) الأقسام "المضمونة" اللي حان وقت ظهورها (من ضمن المتاح فقط)
    const due = inStock.filter((s) => {
      if (!s.guaranteedEvery || s.guaranteedEvery <= 0) return false;
      const last = stats[s.id] || 0;
      return currentSpinIndex - last >= s.guaranteedEvery;
    });

    if (due.length > 0) {
      // لو أكتر من قسم مستحق في نفس اللحظة، الأولوية للأكثر تأخرًا
      due.sort((a, b) => (stats[a.id] || 0) - (stats[b.id] || 0));
      winner = due[0];
    } else {
      const totalWeight = inStock.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
      if (totalWeight <= 0) {
        // لو كل الأوزان صفر، اختيار عشوائي متساوي بين كل الأقسام المتاحة
        winner = inStock[Math.floor(Math.random() * inStock.length)];
      } else {
        let r = Math.random() * totalWeight;
        winner = inStock[inStock.length - 1];
        for (const s of inStock) {
          r -= Number(s.weight) || 0;
          if (r <= 0) {
            winner = s;
            break;
          }
        }
      }
    }
  }

  stats[winner.id] = currentSpinIndex;
  usedStock[winner.id] = (Number(usedStock[winner.id]) || 0) + 1;

  const segmentIndex = segments.findIndex((s) => s.id === winner.id);

  return {
    winner,
    segmentIndex,
    newSpinCount: currentSpinIndex,
    newStats: stats,
    newStockUsed: usedStock
  };
}

module.exports = { resolveSpin, remainingStock };
