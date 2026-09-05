/* التفاعل الصوتي للعبة: رسالة ترحيب دورية تجذب اللاعبين، نداء العميل بالاسم وقت النتيجة،
   وأصوات افتراضية (متولّدة تلقائيًا بدون ملفات خارجية) للفة العجلة والاحتفال بالربح - قابلة للاستبدال من الأدمن */
(function () {
  'use strict';

  let cfg = null;
  let unlocked = false;
  let audioCtx = null;
  let welcomeTimer = null;
  let currentSpinAudioEl = null;
  let activeSpeechAudio = null; // آخر عنصر Audio بيشغّل صوت جوجل الخارجي - محتاجينه عشان نوقفه لو غيّرنا الشاشة فجأة

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

  // "تسخين" قايمة أصوات المتصفح بدري - كروم أحيانًا بيرجّع قايمة فاضية أول ما الصفحة تفتح
  if (window.speechSynthesis) {
    try { window.speechSynthesis.getVoices(); } catch (e) {}
  }

  // بنفضّل صوت "محلي" (مثبت على الجهاز) بنفس اللغة لو موجود، عشان نتجنب أصوات الشبكة اللي ممكن
  // تتعطل لو الجهاز مقفول عليه الاتصال بسيرفرات جوجل الصوتية
  function pickVoice(lang) {
    let voices = [];
    try { voices = window.speechSynthesis.getVoices() || []; } catch (e) {}
    if (!voices.length) return null;
    const prefix = lang.split('-')[0].toLowerCase();
    return (
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(prefix) && v.localService) ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(prefix)) ||
      voices.find((v) => v.localService) ||
      voices[0]
    );
  }

  // بنجرب الأول صوت جوجل الطبيعي (خارجي) لو السيرفر مفعّل عنده مفتاح الخدمة - جودة أعلى بكتير من صوت المتصفح.
  // لو فشل لأي سبب (السيرفر مش مفعّل الخدمة، مفيش نت، أي خطأ) بنرجع فورًا لصوت المتصفح المجاني كخطة بديلة.
  // البروميس بترجع (resolve) بعد ما الصوت يخلص فعليًا (حدث ended) مش بس أول ما يبدأ - عشان لو فيه كلام تاني
  // لازم يتقال بعده (زي تعليمات الفوز) يستنى لحد ما الجملة اللي قبله تخلص فعلًا.
  function speakExternal(text, lang, voice) {
    return new Promise((resolve, reject) => {
      try {
        let url = '/api/tts?lang=' + encodeURIComponent(lang) + '&text=' + encodeURIComponent(text);
        if (voice) url += '&voice=' + encodeURIComponent(voice);
        const audio = new Audio(url);
        activeSpeechAudio = audio;
        let settled = false;
        const cleanup = () => { if (activeSpeechAudio === audio) activeSpeechAudio = null; };
        const fail = () => { if (settled) return; settled = true; cleanup(); reject(new Error('external_tts_failed')); };
        // مهلة قصيرة بس للتأكد إن الطلب نفسه اتحمّل ومشتغل (canplay) - مش هتلمس تشغيل الصوت وهو شغال فعلاً
        const startupTimer = setTimeout(fail, 6000);
        audio.addEventListener('canplay', () => {
          clearTimeout(startupTimer);
          audio.play().catch(fail);
        });
        audio.addEventListener('ended', () => { if (!settled) { settled = true; cleanup(); resolve(); } });
        audio.addEventListener('error', () => { clearTimeout(startupTimer); fail(); });
      } catch (e) {
        reject(e);
      }
    });
  }

  function speakBrowser(text, lang) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) return resolve();
      try {
        const speakLang = lang === 'en' ? 'en-US' : 'ar-SA';
        const speakNow = () => {
          const u = new SpeechSynthesisUtterance(text);
          const voice = pickVoice(speakLang);
          if (voice) { u.voice = voice; u.lang = voice.lang; }
          else u.lang = speakLang;
          u.rate = 1;
          let done = false;
          const finish = () => { if (done) return; done = true; resolve(); };
          u.onend = finish;
          u.onerror = (ev) => { try { console.warn('[GameSound] speech error:', ev && ev.error); } catch (e2) {} finish(); };
          // شبكة أمان لو حدث onend/onerror ماجاش لأي سبب (بعض متصفحات الموبايل بتتصرف بغرابة أحيانًا)
          setTimeout(finish, 20000);
          window.speechSynthesis.speak(u);
        };
        // نداء cancel() ومباشرة speak() في نفس اللحظة ممكن يخلي كروم يتجاهل الجملة الجديدة بصمت
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          window.speechSynthesis.cancel();
          setTimeout(speakNow, 80);
        } else {
          speakNow();
        }
      } catch (e) { resolve(); }
    });
  }

  // بترجع بروميس بيتحل بعد ما الجملة تتقال فعليًا وتخلص (مفيد لما نحتاج نقول جملة بعدها بالظبط، زي تعليمات الفوز)
  function speakAndWait(text, lang) {
    if (!text || !soundOn()) return Promise.resolve();
    const shortLang = lang === 'en' ? 'en' : 'ar';
    const voice = cfg && cfg.sound && cfg.sound.voice && cfg.sound.voice[shortLang];
    return speakExternal(text, shortLang, voice).catch(() => speakBrowser(text, lang));
  }

  function speak(text, lang) {
    speakAndWait(text, lang);
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
    if (activeSpeechAudio) { try { activeSpeechAudio.pause(); } catch (e) {} activeSpeechAudio = null; }
  }

  /* ============ نداء العميل بالاسم وقت ظهور النتيجة (+ تعليمات إضافية اختيارية بعد الفوز) ============ */
  function speakResult(name, prizeText, isWin, lang) {
    const r = cfg && cfg.sound && cfg.sound.resultAnnouncement;
    if (!soundOn() || !r || r.enabled === false) return;
    const tmplObj = isWin ? r.win : r.lose;
    let text = (tmplObj && (tmplObj[lang] || tmplObj.ar)) || '';
    if (!text) return;
    text = text.replace(/\{name\}/g, name || '').replace(/\{prize\}/g, prizeText || '');
    setTimeout(async () => {
      // تأخير بسيط عشان ميتزاحمش مع صوت وقفة اللفة
      await speakAndWait(text, lang);
      if (!isWin) return;
      const instrObj = r.winInstructions;
      const instructions = (instrObj && (instrObj[lang] || instrObj.ar)) || '';
      if (!instructions) return;
      await new Promise((r2) => setTimeout(r2, 400)); // فاصل قصير بين نداء المكسب والتعليمات
      speakAndWait(instructions, lang);
    }, 350);
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
