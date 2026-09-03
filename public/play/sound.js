/* التفاعل الصوتي للعبة: رسالة ترحيب دورية تجذب اللاعبين، نداء العميل بالاسم وقت النتيجة،
   وأصوات افتراضية (متولّدة تلقائيًا بدون ملفات خارجية) للفة العجلة والاحتفال بالربح - قابلة للاستبدال من الأدمن */
(function () {
  'use strict';

  let cfg = null;
  let unlocked = false;
  let audioCtx = null;
  let welcomeTimer = null;
  let currentSpinAudioEl = null;

  function ensureAudioCtx() {
    if (!audioCtx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
      } catch (e) { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  // المتصفحات بتمنع تشغيل الصوت تلقائيًا قبل أول تفاعل من المستخدم - أول لمسة/كليك على الشاشة "بتفتح" الصوت بعد كده طول الوقت
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    ensureAudioCtx();
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  ['click', 'touchstart', 'keydown'].forEach((ev) => {
    document.addEventListener(ev, unlock, { once: true, passive: true });
  });

  function soundOn() {
    return !!(cfg && cfg.sound && cfg.sound.enabled !== false);
  }

  function speak(text, lang) {
    if (!text || !soundOn()) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'en' ? 'en-US' : 'ar-SA';
      u.rate = 1;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* ============ رسالة الترحيب الدورية (شاشة المقدمة) ============ */
  function startWelcomeLoop(lang) {
    stopWelcomeLoop();
    const w = cfg && cfg.sound && cfg.sound.welcome;
    if (!soundOn() || !w || w.enabled === false) return;
    const text = (w.message && (w.message[lang] || w.message.ar)) || '';
    if (!text) return;
    const intervalMs = Math.max(5, Number(w.intervalSec) || 20) * 1000;
    const say = () => speak(text, lang);
    say();
    welcomeTimer = setInterval(say, intervalMs);
  }
  function stopWelcomeLoop() {
    if (welcomeTimer) { clearInterval(welcomeTimer); welcomeTimer = null; }
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }

  /* ============ نداء العميل بالاسم وقت ظهور النتيجة ============ */
  function speakResult(name, prizeText, isWin, lang) {
    const r = cfg && cfg.sound && cfg.sound.resultAnnouncement;
    if (!soundOn() || !r || r.enabled === false) return;
    const tmplObj = isWin ? r.win : r.lose;
    let text = (tmplObj && (tmplObj[lang] || tmplObj.ar)) || '';
    if (!text) return;
    text = text.replace(/\{name\}/g, name || '').replace(/\{prize\}/g, prizeText || '');
    setTimeout(() => speak(text, lang), 350); // تأخير بسيط عشان ميتزاحمش مع صوت وقفة اللفة
  }

  /* ============ صوت لفة العجلة - افتراضي: تكات متسارعة بتبطئ تدريجيًا (زي عجلة حظ حقيقية) ============ */
  function playDefaultSpinTicks(durationMs) {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    const total = Math.max(0.5, (durationMs || 4500) / 1000);
    const startT = ctx.currentTime + 0.02;
    let elapsed = 0;
    let guard = 0;
    while (elapsed < total && guard < 500) {
      const progress = elapsed / total;
      const gapSec = 0.045 + Math.pow(progress, 2.2) * 0.28; // منحنى تباطؤ
      const t = startT + elapsed;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 850;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.04);
      elapsed += gapSec;
      guard++;
    }
  }

  function startSpinSound(durationMs) {
    const s = cfg && cfg.sound && cfg.sound.spinSound;
    if (!soundOn() || !s || s.enabled === false) return;
    stopSpinSound();
    if (s.url) {
      try {
        currentSpinAudioEl = new Audio(s.url);
        currentSpinAudioEl.loop = true;
        currentSpinAudioEl.volume = 0.7;
        currentSpinAudioEl.play().catch(() => {});
      } catch (e) {}
    } else {
      playDefaultSpinTicks(durationMs);
    }
  }
  function stopSpinSound() {
    if (currentSpinAudioEl) {
      try { currentSpinAudioEl.pause(); } catch (e) {}
      currentSpinAudioEl = null;
    }
  }

  /* ============ صوت الاحتفال بالربح - افتراضي: أربيجيو صاعد (تا-دااا) ============ */
  function playDefaultWinFanfare() {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    const t0 = ctx.currentTime + 0.02;
    notes.forEach((freq, i) => {
      const t = t0 + i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
  }

  function playWinSound() {
    const s = cfg && cfg.sound && cfg.sound.winSound;
    if (!soundOn() || !s || s.enabled === false) return;
    if (s.url) {
      try { new Audio(s.url).play().catch(() => {}); } catch (e) {}
    } else {
      playDefaultWinFanfare();
    }
  }

  window.GameSound = {
    init(config) { cfg = config; },
    unlock,
    startWelcomeLoop,
    stopWelcomeLoop,
    speakResult,
    startSpinSound,
    stopSpinSound,
    playWinSound
  };
})();
