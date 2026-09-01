// محرك تحديد نتيجة اللفة: نسبة احتمال لكل قسم + إمكانية "ضمان الظهور كل N لفة"
// المنطق بيشتغل في السيرفر عشان النتيجة تكون عادلة ومش قابلة للتلاعب من المتصفح

function resolveSpin(segments, spinCount, segmentStats) {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error('لا يوجد أقسام في العجلة');
  }

  const currentSpinIndex = (spinCount || 0) + 1;
  const stats = { ...(segmentStats || {}) };

  // 1) الأقسام "المضمونة" اللي حان وقت ظهورها
  const due = segments.filter((s) => {
    if (!s.guaranteedEvery || s.guaranteedEvery <= 0) return false;
    const last = stats[s.id] || 0;
    return currentSpinIndex - last >= s.guaranteedEvery;
  });

  let winner;
  if (due.length > 0) {
    // لو أكتر من قسم مستحق في نفس اللحظة، الأولوية للأكثر تأخرًا
    due.sort((a, b) => (stats[a.id] || 0) - (stats[b.id] || 0));
    winner = due[0];
  } else {
    const totalWeight = segments.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
    if (totalWeight <= 0) {
      // لو كل الأوزان صفر، اختيار عشوائي متساوي بين كل الأقسام
      winner = segments[Math.floor(Math.random() * segments.length)];
    } else {
      let r = Math.random() * totalWeight;
      winner = segments[segments.length - 1];
      for (const s of segments) {
        r -= Number(s.weight) || 0;
        if (r <= 0) {
          winner = s;
          break;
        }
      }
    }
  }

  stats[winner.id] = currentSpinIndex;

  const segmentIndex = segments.findIndex((s) => s.id === winner.id);

  return {
    winner,
    segmentIndex,
    newSpinCount: currentSpinIndex,
    newStats: stats
  };
}

module.exports = { resolveSpin };
