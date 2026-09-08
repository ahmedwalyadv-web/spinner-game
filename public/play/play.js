/* صفحة اللعبة (السبنر) - تُقرأ إعداداتها بالكامل من السيرفر حسب رابط الكامبين */
(function () {
  'use strict';
 
  const slug = location.pathname.replace(/^\/play\/?/, '').split('/')[0];
  let config = null;
  let campaignId = null;
  let playerLang = 'ar';
  let formData = {};
  let pendingResult = null;
  let wheelRotation = 0;
 
  const $ = (id) => document.getElementById(id);
 
  function t(bilingual) {
    if (!bilingual) return '';
    return bilingual[playerLang] || bilingual.ar || bilingual.en || '';
  }
 
  // وضع "يلف الأول وبعدين يسجل بياناته لاستلام الجائزة" - لو مش مفعّل، السلوك زي ما كان (بيانات الأول)
  function isSpinFirst() {
    return !!(config && config.flow && config.flow.order === 'spinFirst');
  }
 
  // تحقق من شكل رقم التليفون حسب إعدادات الكامبين (عدد أرقام إجباري و/أو بادئة إجبارية زي "05").
  // بيرجع { ok:true, value } برقم "نظيف" (أرقام بس) لو الشكل صحيح، أو { ok:false, message } لو غلط.
  function validatePhoneFormat(phone, validation) {
    const digitsOnly = phone.replace(/\D/g, '');
    const requiredDigits = Number(validation && validation.digits) || 0;
    const prefix = (validation && validation.startsWith) || '';
    if (!requiredDigits && !prefix) return { ok: true, value: phone };
    if ((requiredDigits && digitsOnly.length !== requiredDigits) || (prefix && !digitsOnly.startsWith(prefix))) {
      let msgAr, msgEn;
      if (requiredDigits && prefix) {
        msgAr = `رقم التليفون يجب أن يكون ${requiredDigits} أرقام ويبدأ بـ ${prefix}`;
        msgEn = `Phone number must be ${requiredDigits} digits and start with ${prefix}`;
      } else if (requiredDigits) {
        msgAr = `رقم التليفون يجب أن يكون ${requiredDigits} أرقام`;
        msgEn = `Phone number must be ${requiredDigits} digits`;
      } else {
        msgAr = `رقم التليفون يجب أن يبدأ بـ ${prefix}`;
        msgEn = `Phone number must start with ${prefix}`;
      }
      return { ok: false, message: playerLang === 'ar' ? msgAr : msgEn };
    }
    return { ok: true, value: digitsOnly };
  }
 
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach((s) => (s.hidden = true));
    const target = $('screen-' + name);
    if (target) target.hidden = false;
    renderLogos(name);
    if (window.GameSound) {
      // في وضع spinFirst، شاشة العجلة هي شاشة الاستقبال/الانتظار بين العملاء (بدل المقدمة)
      // فلازم نداء الترحيب الصوتي الدوري يبدأ عليها هي كمان
      const isWelcomeScreen = name === 'intro' || (isSpinFirst() && name === 'wheel');
      if (isWelcomeScreen) GameSound.startWelcomeLoop(playerLang);
      else GameSound.stopWelcomeLoop();
    }
  }
 
  /* ============ تحميل الإعدادات ============ */
  async function loadConfig() {
    try {
      const res = await fetch('/api/public/campaigns/' + encodeURIComponent(slug));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      config = data.config;
      campaignId = data.id;
      playerLang = config.meta.defaultLanguage || 'ar';
      if (window.GameSound) GameSound.init(config);
      applyTheme();
      setupLangToggle();
      setupIntro();
      setupForm();
      setupWheelScreen();
      $('screen-loading').hidden = true;
      showScreen('intro');
    } catch (e) {
      $('screen-loading').hidden = true;
      $('screen-error').hidden = false;
      $('error-message').textContent = e.message || 'الرابط غير صحيح أو الكامبين متوقف';
    }
  }
 
  function applyTheme() {
    const root = document.documentElement;
    const th = config.theme;
    root.style.setProperty('--bg', th.backgroundColor);
    root.style.setProperty('--primary', th.primaryColor);
    root.style.setProperty('--secondary', th.secondaryColor);
    root.style.setProperty('--text', th.textColor);
    root.style.setProperty('--btn-text', th.buttonTextColor);
    root.style.setProperty('--card', th.cardColor);
    root.style.setProperty('--font', th.fontFamily);
    document.body.style.fontFamily = th.fontFamily;
    if (th.backgroundImage) {
     const bgCss = `url(${th.backgroundImage})`;
     document.body.style.backgroundImage = bgCss;
     document.body.style.backgroundSize = 'cover';
     document.body.style.backgroundPosition = 'center';
     const gameRoot = document.getElementById('game-root');
     if (gameRoot) {
       gameRoot.style.backgroundImage = bgCss;
       gameRoot.style.backgroundSize = 'cover';
       gameRoot.style.backgroundPosition = 'center';
     }
    }
    applyDir();
  }
 
  function applyDir() {
    const html = $('html-root');
    html.lang = playerLang;
    html.dir = playerLang === 'ar' ? 'rtl' : 'ltr';
  }
 
  function setupLangToggle() {
    const btn = $('lang-toggle-btn');
    if (config.meta.language === 'both') {
      btn.hidden = false;
      btn.textContent = playerLang === 'ar' ? 'EN' : 'AR';
      btn.onclick = () => {
        playerLang = playerLang === 'ar' ? 'en' : 'ar';
        btn.textContent = playerLang === 'ar' ? 'EN' : 'AR';
        applyDir();
        setupIntro();
        setupForm();
        renderWheel();
        if (window.GameSound && (!$('screen-intro').hidden || (isSpinFirst() && !$('screen-wheel').hidden))) {
          GameSound.startWelcomeLoop(playerLang);
        }
      };
    } else {
      playerLang = config.meta.language === 'en' ? 'en' : 'ar';
      btn.hidden = true;
    }
  }
 
  /* ============ الشعارات ============ */
  function renderLogos(screenName) {
    const layer = $('logos-layer');
    layer.innerHTML = '';
    (config.logos || []).forEach((logo) => {
      if (!logo.url) return;
      if (logo.screen && logo.screen !== 'all' && logo.screen !== screenName) return;
      const img = document.createElement('img');
      img.src = logo.url;
      img.className = 'logo-item' + (logo.animation && logo.animation !== 'none' ? ' logo-anim-' + logo.animation : '');
      img.style.left = logo.xPct + '%';
      img.style.top = logo.yPct + '%';
      img.style.width = logo.widthPct + '%';
      if (logo.delayMs) img.style.animationDelay = logo.delayMs + 'ms';
      layer.appendChild(img);
    });
  }
 
  /* ============ شاشة المقدمة ============ */
  function setupIntro() {
    const mediaBg = $('intro-media-bg');
    mediaBg.innerHTML = '';
    if (config.intro.mediaUrl) {
      if (config.intro.mediaType === 'video') {
        const video = document.createElement('video');
        video.src = config.intro.mediaUrl;
        video.autoplay = true; video.muted = true; video.loop = true; video.playsInline = true;
        mediaBg.appendChild(video);
      } else {
        mediaBg.style.backgroundImage = `url(${config.intro.mediaUrl})`;
      }
    }
    $('intro-overlay').style.opacity = config.intro.overlayOpacity ?? 0.35;
    $('intro-title').textContent = t(config.intro.title);
    $('intro-subtitle').textContent = t(config.intro.subtitle);
    $('btn-start').textContent = t(config.intro.startButtonText);
  }
 
  $('btn-start').addEventListener('click', () => {
    tryFullscreen();
    // في وضع spinFirst العميل يلف العجلة الأول من غير بيانات، وبعدين لو فاز يسجل بياناته
    showScreen(isSpinFirst() ? 'wheel' : 'form');
  });
 
  function tryFullscreen() {
    try {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if (req) req.call(el).catch(() => {});
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('portrait').catch(() => {});
      }
    } catch (e) { /* أفضل محاولة فقط - مش لازم تنجح في كل الأجهزة */ }
  }
 
  /* ============ شاشة الفورم ============ */
  let selectedInterests = [];
 
  function setupForm() {
    const fields = config.form.fields;
    // في وضع spinFirst شاشة الفورم دايمًا بتبقى شاشة "سجّل بياناتك لاستلام الجائزة" بعد اللفة
    if (isSpinFirst()) {
      $('form-title').textContent = t(config.flow.registerTitle) || t(config.form.title);
      $('form-subtitle').textContent = t(config.flow.registerSubtitle) || t(config.form.subtitle);
    } else {
      $('form-title').textContent = t(config.form.title);
      $('form-subtitle').textContent = t(config.form.subtitle);
    }
    $('btn-submit').textContent = t(config.form.submitButtonText);
 
    setField('name', fields.name);
    setField('phone', fields.phone);
    setField('position', fields.position);
    setField('email', fields.email);
 
    const interestsField = document.querySelector('.form-field[data-field="interests"]');
    if (!fields.interests.enabled) {
      interestsField.style.display = 'none';
    } else {
      interestsField.style.display = '';
      $('label-interests').textContent = t(fields.interests.label) + (fields.interests.required ? ' *' : '');
      buildInterestsPanel();
    }
 
    buildCustomFields();
  }
 
  /* ============ الحقول الحرة اللي ضافها الأدمن ============ */
  let customFieldValues = {};
  function buildCustomFields() {
    const container = $('custom-fields-container');
    container.innerHTML = '';
    customFieldValues = {};
    const defs = config.form.customFields || [];
    defs.forEach((def) => {
      const wrap = document.createElement('div');
      wrap.className = 'form-field';
      const label = document.createElement('label');
      label.textContent = t(def.label) + (def.required ? ' *' : '');
      wrap.appendChild(label);
 
      if (def.type === 'select') {
        const select = document.createElement('select');
        select.id = 'custom-field-' + def.id;
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = playerLang === 'ar' ? 'اختر...' : 'Select...';
        select.appendChild(emptyOpt);
        (def.options || []).forEach((opt) => {
          const o = document.createElement('option');
          o.value = opt.id;
          o.textContent = t(opt);
          select.appendChild(o);
        });
        select.addEventListener('change', () => {
          // بنخزّن نص الإجابة (زي "نعم"/"لا") مش الـ id الداخلي بتاع الاختيار، عشان يظهر واضح في لوحة التحكم وفي جوجل شيت
          const chosen = (def.options || []).find((o) => o.id === select.value);
          customFieldValues[def.id] = chosen ? (chosen.ar || chosen.en || select.value) : select.value;
        });
        wrap.appendChild(select);
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'custom-field-' + def.id;
        input.addEventListener('input', () => { customFieldValues[def.id] = input.value; });
        wrap.appendChild(input);
      }
      container.appendChild(wrap);
    });
  }
 
  function setField(key, fieldCfg) {
    const wrap = document.querySelector(`.form-field[data-field="${key}"]`);
    if (!fieldCfg.enabled) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    $('label-' + key).textContent = t(fieldCfg.label) + (fieldCfg.required ? ' *' : '');
  }
 
  function buildInterestsPanel() {
    const panel = $('interests-panel');
    const btn = $('interests-btn');
    panel.innerHTML = '';
    (config.form.interestsList || []).forEach((it) => {
      const id = 'interest-' + it.id;
      const row = document.createElement('label');
      row.className = 'multiselect-option';
      row.innerHTML = `<input type="checkbox" id="${id}" value="${it.id}"> <span>${t(it)}</span>`;
      panel.appendChild(row);
    });
    updateInterestsButtonLabel();
 
    panel.addEventListener('change', (e) => {
      if (e.target.type !== 'checkbox') return;
      const id = e.target.value;
      if (e.target.checked) { if (!selectedInterests.includes(id)) selectedInterests.push(id); }
      else selectedInterests = selectedInterests.filter((x) => x !== id);
      updateInterestsButtonLabel();
    });
 
    btn.onclick = () => { panel.hidden = !panel.hidden; };
    document.addEventListener('click', (e) => {
      if (!document.getElementById('interests-select').contains(e.target)) panel.hidden = true;
    });
  }
 
  function updateInterestsButtonLabel() {
    const btn = $('interests-btn');
    if (selectedInterests.length === 0) {
      btn.textContent = playerLang === 'ar' ? 'اختر اهتماماتك...' : 'Select your interests...';
    } else {
      const names = (config.form.interestsList || [])
        .filter((it) => selectedInterests.includes(it.id))
        .map((it) => t(it));
      btn.textContent = names.join('، ');
    }
  }
 
  $('lead-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fields = config.form.fields;
    const errBox = $('form-error');
    errBox.textContent = '';
 
    const name = $('input-name').value.trim();
    let phone = $('input-phone').value.trim();
    const position = $('input-position').value.trim();
    const email = $('input-email').value.trim();
 
    if (fields.name.enabled && fields.name.required && !name) {
      errBox.textContent = playerLang === 'ar' ? 'من فضلك أدخل الاسم' : 'Please enter your name';
      return;
    }
    if (fields.phone.enabled && fields.phone.required && !phone) {
      errBox.textContent = playerLang === 'ar' ? 'من فضلك أدخل رقم التليفون' : 'Please enter your phone number';
      return;
    }
    if (fields.phone.enabled && phone) {
      const phoneCheck = validatePhoneFormat(phone, fields.phone.validation);
      if (!phoneCheck.ok) {
        errBox.textContent = phoneCheck.message;
        return;
      }
      phone = phoneCheck.value;
    }
    if (fields.email.enabled && fields.email.required && !email) {
      errBox.textContent = playerLang === 'ar' ? 'من فضلك أدخل البريد الإلكتروني' : 'Please enter your email';
      return;
    }
    if (fields.position.enabled && fields.position.required && !position) {
      errBox.textContent = playerLang === 'ar' ? 'من فضلك أدخل المنصب' : 'Please enter your job title';
      return;
    }
    if (fields.interests.enabled && fields.interests.required && selectedInterests.length === 0) {
      errBox.textContent = playerLang === 'ar' ? 'من فضلك اختر اهتماماتك' : 'Please select your interests';
      return;
    }
    for (const def of (config.form.customFields || [])) {
      if (def.required && !(customFieldValues[def.id] || '').trim()) {
        errBox.textContent = (playerLang === 'ar' ? 'من فضلك أدخل: ' : 'Please enter: ') + t(def.label);
        return;
      }
    }
 
    const submitBtn = $('btn-submit');
    submitBtn.disabled = true;
    try {
      const interestLabels = (config.form.interestsList || [])
        .filter((it) => selectedInterests.includes(it.id))
        .map((it) => it.ar || it.en);
 
      formData = {
        name, phone, position, email,
        interests: interestLabels,
        interestIds: selectedInterests.slice(),
        customFields: { ...customFieldValues }
      };
 
      if (isSpinFirst()) {
        // العميل لف العجلة وفاز قبل كده (pendingResult) - دلوقتي نسجل بياناته عشان يستلم جائزته
        const res = await fetch('/api/public/campaigns/' + encodeURIComponent(slug) + '/register-winner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, segmentId: pendingResult && pendingResult.segmentId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || (playerLang === 'ar' ? 'حدث خطأ' : 'Something went wrong'));
        showResult(data);
        return;
      }
 
      if (fields.phone.enabled && phone) {
        const checkRes = await fetch('/api/public/campaigns/' + encodeURIComponent(slug) + '/check-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone })
        });
        const checkData = await checkRes.json();
        if (checkData.alreadyPlayed) {
          errBox.textContent = t(config.form.duplicatePhoneMessage) || (playerLang === 'ar' ? 'لقد شاركت من قبل' : "You've already participated");
          return;
        }
      }
 
      showScreen('wheel');
    } catch (err) {
      errBox.textContent = err.message || (playerLang === 'ar' ? 'حدث خطأ، حاول تاني' : 'Something went wrong, please try again');
    } finally {
      submitBtn.disabled = false;
    }
  });
 
  /* ============ شاشة العجلة ============ */
  let wheelCtx = null;
 
  function setupWheelScreen() {
    $('btn-spin').textContent = t(config.wheel.spinButtonText) || (playerLang === 'ar' ? 'دور العجلة 🎯' : 'Spin the Wheel 🎯');
 
    const titleText = t(config.wheel.title);
    $('wheel-title').textContent = titleText;
    $('wheel-title').hidden = !titleText;
    const subtitleText = t(config.wheel.subtitle);
    $('wheel-subtitle').textContent = subtitleText;
    $('wheel-subtitle').hidden = !subtitleText;
 
    const wheelMediaBg = $('wheel-media-bg');
    wheelMediaBg.style.backgroundImage = config.wheel.mediaUrl ? `url(${config.wheel.mediaUrl})` : '';
 
    if (config.wheel.centerImage) {
      $('wheel-center-img').hidden = false;
      $('wheel-center-img').style.backgroundImage = `url(${config.wheel.centerImage})`;
    }
 
    const screenWheel = $('screen-wheel');
    const glowOn = !!(config.wheel.glow && config.wheel.glow.enabled);
    screenWheel.classList.toggle('glow-on', glowOn);
    screenWheel.style.setProperty('--wheel-glow-color', (config.wheel.glow && config.wheel.glow.color) || '#00d4ff');
    $('wheel-holder').classList.toggle('style-photogrid', config.wheel.style === 'photoGrid');
 
    wheelCtx = $('game-wheel-canvas').getContext('2d');
    renderWheel();
    $('wheel-pointer').style.color = config.wheel.pointerColor || '#ffb703';
  }
 
  // بيختار الرسّام المناسب حسب ستايل العجلة المحفوظ في الكامبين (classic = كانفاس، photoGrid = صور كاملة لكل قسم)
  function renderWheel() {
    if (config.wheel.style === 'photoGrid') {
      $('game-wheel-canvas').hidden = true;
      $('wheel-photogrid').hidden = false;
      buildPhotoGridWheel();
    } else {
      $('wheel-photogrid').hidden = true;
      $('game-wheel-canvas').hidden = false;
      drawWheelCanvas();
    }
  }
 
  // زاوية (بالدرجات، بدايةً من الأعلى مع دوران مع اتجاه الساعة) + نسبة من نص القطر (0-50) -> نقطة {x,y} كنسبة % داخل صندوق العجلة
  function pt(deg, rPct) {
    const rad = (deg * Math.PI) / 180;
    return { x: 50 + rPct * Math.sin(rad), y: 50 - rPct * Math.cos(rad) };
  }
 
  // عجلة "الصور الكاملة" (photoGrid) - كل قسم صورة تغطي القطاع بالكامل، القص الدائري النهائي
  // بيحصل عبر border-radius:50% + overflow:hidden على الحاوية نفسها (#wheel-photogrid في play.css)
  function buildPhotoGridWheel() {
    const wrap = $('wheel-photogrid');
    wrap.innerHTML = '';
    const segments = config.wheel.segments || [];
    if (segments.length === 0) return;
    const anglePer = 360 / segments.length;
    // بنمد نقط المضلع لمسافة أكبر من نص القطر (75 > 50) عشان نضمن تغطية كاملة للقطاع
    // مهما كان عدد الأقسام - القص الدائري الفعلي مسؤول عنه العنصر الأب لوحده
    const farR = 75;
 
    segments.forEach((seg, i) => {
      const startDeg = i * anglePer;
      const endDeg = startDeg + anglePer;
 
      // أصغر صندوق مربع بيحتوي القطاع بالكامل (المركز + بداية ونهاية القوس + أي اتجاه
      // أساسي فوق/يمين/تحت/شمال يقع داخل مدى القطاع) - بنعرض صورة المنتج "cover" جوه
      // الصندوق ده بالذات (مش جوه العجلة كلها) عشان تتمركز صحيح كأنها ملء الربع/القطاع
      // فعليًا زي التصميم الأصلي، ولو كان عدد الأقسام 4 الصندوق ده بيطابق تمامًا ربع العجلة
      const cardinals = [0, 90, 180, 270, 360].filter((d) => d >= startDeg && d <= endDeg);
      const boundaryAngles = [startDeg, endDeg, ...cardinals];
      const boundaryPts = boundaryAngles.map((d) => pt(d, 50));
      const xs = [50, ...boundaryPts.map((p) => p.x)];
      const ys = [50, ...boundaryPts.map((p) => p.y)];
      const boxLeft = Math.min(...xs);
      const boxTop = Math.min(...ys);
      const boxW = Math.max(...xs) - boxLeft;
      const boxH = Math.max(...ys) - boxTop;
 
      // تحويل نقطة بنسبة % من العجلة الكاملة (0-100) لنسبة % محليّة جوه صندوق القطاع نفسه
      const toLocal = (p) => ({
        x: boxW ? ((p.x - boxLeft) / boxW) * 100 : 0,
        y: boxH ? ((p.y - boxTop) / boxH) * 100 : 0
      });
      const centerLocal = toLocal({ x: 50, y: 50 });
      const p1Local = toLocal(pt(startDeg, farR));
      const p2Local = toLocal(pt(endDeg, farR));
 
      const slice = document.createElement('div');
      slice.className = 'pg-slice';
      slice.style.left = boxLeft + '%';
      slice.style.top = boxTop + '%';
      slice.style.width = boxW + '%';
      slice.style.height = boxH + '%';
      slice.style.clipPath = `polygon(${centerLocal.x}% ${centerLocal.y}%, ${p1Local.x}% ${p1Local.y}%, ${p2Local.x}% ${p2Local.y}%)`;
      if (seg.image && seg.image.url) {
        slice.style.backgroundImage = `url(${seg.image.url})`;
      } else {
        slice.style.background = seg.color || '#666';
      }
      wrap.appendChild(slice);
 
      if (seg.text && seg.text.showLabel !== false && t(seg.label)) {
        const midDeg = (startDeg + endDeg) / 2;
        const distFrac = (seg.text.distancePct ?? 68) / 100;
        const p = pt(midDeg, distFrac * 50);
        const label = document.createElement('div');
        label.className = 'pg-slice-label';
        label.textContent = t(seg.label);
        label.style.left = p.x + '%';
        label.style.top = p.y + '%';
        label.style.color = seg.text.color || seg.textColor || '#fff';
        label.style.fontSize = (seg.text.fontSize || 14) + 'px';
        wrap.appendChild(label);
      }
    });
  }
 
  function drawWheelCanvas() {
    const canvas = $('game-wheel-canvas');
    const ctx = wheelCtx;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const bw = Number(config.wheel.borderWidth) || 0;
    const radius = W / 2 - bw - 4;
    ctx.clearRect(0, 0, W, H);
    const segments = config.wheel.segments || [];
    if (segments.length === 0) return;
    const anglePer = (Math.PI * 2) / segments.length;
    let start = -Math.PI / 2;
 
    segments.forEach((seg) => {
      const end = start + anglePer;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = seg.color || '#666';
      ctx.fill();
      // نحصر أي صورة/رمز/نص جوه حدود القسم نفسه (مش هيبقى ينفع يخرج برة القسم أو برة حدود العجلة)
      // حتى لو الأدمن رفع صورة كبيرة أو زوّد نسبة الحجم/المسافة من غير قصد
      ctx.clip();
 
      const mid = (start + end) / 2;
      ctx.translate(cx, cy);
      ctx.rotate(mid);
 
      if (seg.image && seg.image.url && segImageCache[seg.id]) {
        const dist = ((seg.image.distancePct ?? 40) / 100) * radius;
        let halfW = (((seg.image.widthPct ?? 22) / 100) * radius * 2) / 2;
        // نحسب أقصى نصف-حجم آمن عند المسافة دي عشان الصورة (مربّعة الشكل) ما تتقصش
        // بشكل غير متماثل من حواف القسم المائلة (خصوصًا القريبة من المركز، لأن القسم
        // بيتضيّق كل ما اتقربنا من المنتصف) - ده اللي كان بيخلي الصورة تبان "مش في المنتصف"
        // حتى بعد ما اتحصرت جوه حدود القسم. الحساب ده بيشتغل صح مهما كان عدد الأقسام.
        const tanHalfAngle = Math.tan(anglePer / 2);
        const maxHalfByAngle = (dist * tanHalfAngle) / (1 + tanHalfAngle);
        const maxHalfByOuterEdge = radius - dist;
        halfW = Math.max(4, Math.min(halfW, maxHalfByAngle, maxHalfByOuterEdge));
        const w = halfW * 2;
 
        const img = segImageCache[seg.id];
        const naturalW = img.naturalWidth || img.width || 1;
        const naturalH = img.naturalHeight || img.height || 1;
        const ratio = naturalW / naturalH;
        // نحافظ على نسبة أبعاد الصورة الأصلية (بدون تمديد) - تتوسط جوه المساحة المتاحة
        let dw = w, dh = w;
        if (ratio > 1) dh = w / ratio;
        else if (ratio < 1) dw = w * ratio;
 
        ctx.save();
        ctx.translate(dist, 0);
        ctx.rotate(Math.PI / 2);
        try { ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh); } catch (e) {}
        ctx.restore();
      }
 
      if (seg.icon && seg.icon.value) {
        const dist = ((seg.icon.distancePct ?? 25) / 100) * radius;
        const size = ((seg.icon.sizePct ?? 16) / 100) * radius;
        ctx.save();
        ctx.translate(dist, 0);
        ctx.rotate(Math.PI / 2);
        ctx.font = `${size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(seg.icon.value, 0, 0);
        ctx.restore();
      }
 
      if (seg.text && seg.text.showLabel !== false) {
        const dist = ((seg.text.distancePct ?? 68) / 100) * radius;
        ctx.fillStyle = seg.text.color || seg.textColor || '#fff';
        ctx.font = `700 ${scaleFont(seg.text.fontSize)}px Cairo, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.save();
        ctx.translate(dist, 0);
        ctx.rotate(Math.PI / 2);
        wrapCanvasText(ctx, t(seg.label), 0, 0, radius * 0.55, scaleFont(seg.text.fontSize) + 4);
        ctx.restore();
      }
 
      ctx.restore();
      start = end;
    });
 
    if (bw > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius + bw / 2, 0, Math.PI * 2);
      ctx.lineWidth = bw;
      ctx.strokeStyle = config.wheel.borderColor || '#fff';
      ctx.stroke();
    }
  }
 
  // العجلة على الشاشة مرسومة بدقة 800px بينما الكانفاس بيتعرض بحجم أصغر - نكبر حجم الخط نسبيًا
  function scaleFont(size) { return (size || 14) * 2; }
 
  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
    if (!text) return;
    const words = text.split(' ');
    let line = '';
    const lines = [];
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    const offset = ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((l, i) => ctx.fillText(l, x, y - offset + i * lineHeight));
  }
 
  const segImageCache = {};
  function preloadSegmentImages() {
    (config.wheel.segments || []).forEach((seg) => {
      if (seg.image && seg.image.url) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { segImageCache[seg.id] = img; if (config.wheel.style !== 'photoGrid') drawWheelCanvas(); };
        img.src = seg.image.url;
      }
    });
  }
 
  $('btn-spin').addEventListener('click', async () => {
    const btn = $('btn-spin');
    btn.disabled = true;
    try {
      const spinFirst = isSpinFirst();
      const endpoint = spinFirst ? '/spin-only' : '/spin';
      const res = await fetch('/api/public/campaigns/' + encodeURIComponent(slug) + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spinFirst ? {} : formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      pendingResult = data;
      if (window.GameSound) GameSound.startSpinSound(Number(config.wheel.spinDurationMs) || 4500);
      spinToSegment(data.segmentIndex, () => {
        if (window.GameSound) GameSound.stopSpinSound();
        if (spinFirst) {
          // العميل فاز - نوديه لشاشة التسجيل عشان ياخد بياناته ويستلم جائزته
          showScreen('form');
        } else {
          showResult(data);
        }
      });
    } catch (e) {
      btn.disabled = false;
      alert(e.message);
    }
  });
 
  function spinToSegment(index, onDone) {
    const rotor = $('wheel-rotor');
    const segments = config.wheel.segments || [];
    const anglePerDeg = 360 / segments.length;
    const targetSegmentCenterDeg = (index + 0.5) * anglePerDeg; // بالنسبة لبداية القطاع الأول عند الأعلى
    const extraTurns = (Number(config.wheel.spinExtraTurns) || 6) * 360;
 
    // الزاوية المطلوب يستقر عليها الكانفاس (مقاس 0-360) عشان القسم المطلوب يوصل تحت المؤشر الثابت أعلى العجلة
    const desiredRestingMod = (360 - (targetSegmentCenterDeg % 360)) % 360;
    const currentRestingMod = ((wheelRotation % 360) + 360) % 360;
    let delta = desiredRestingMod - currentRestingMod;
    if (delta <= 0) delta += 360; // نضمن إن العجلة دايمًا تلف لقدام مش ترجع لورا
    const targetRotation = wheelRotation + extraTurns + delta;
    const durationMs = Number(config.wheel.spinDurationMs) || 4500;
 
    rotor.style.transition = `transform ${durationMs}ms cubic-bezier(.17,.67,.2,1)`;
    rotor.style.transform = `rotate(${targetRotation}deg)`;
    wheelRotation = targetRotation;
 
    setTimeout(onDone, durationMs + 150);
  }
 
  /* ============ بوب أب النتيجة ============ */
  function showResult(data) {
    const popupCfg = data.resultPopup;
    $('result-title').textContent = t(popupCfg.title);
    $('result-name').textContent = formData.name ? (playerLang === 'ar' ? 'مبروك يا ' : 'Congrats ') + formData.name + '!' : '';
    $('result-subtitle').textContent = t(popupCfg.subtitle);
    $('result-prize').textContent = t(data.winner.label);
    $('btn-result-close').textContent = t(popupCfg.buttonText);
 
    // بنفضّل صورة الجائزة نفسها من العجلة، ولو مش موجودة نستخدم صورة البوب أب العامة
    const img = $('result-image');
    const segImageUrl = data.winner.image && data.winner.image.url;
    const imageToShow = segImageUrl || popupCfg.imageUrl;
    if (imageToShow) { img.src = imageToShow; img.hidden = false; } else img.hidden = true;
 
    // كود الفاوتشر/استلام الجائزة (لو مفعّل في الكامبين) - بييجي من السيرفر مع نتيجة اللفة/التسجيل
    const voucherBox = $('result-voucher');
    if (data.voucherCode) {
      $('result-voucher-label').textContent = t(config.voucher.label) || (playerLang === 'ar' ? 'كود استلام الجائزة' : 'Prize pickup code');
      $('result-voucher-code').textContent = data.voucherCode;
      voucherBox.hidden = false;
    } else {
      voucherBox.hidden = true;
    }
 
    $('result-overlay').hidden = false;
 
    if (popupCfg.showConfetti) fireConfetti();
 
    if (window.GameSound) {
      const isWin = data.winner.type === 'win';
      if (isWin) GameSound.playWinSound();
      GameSound.speakResult(formData.name, t(data.winner.label), isWin, playerLang);
    }
  }
 
  $('btn-result-close').addEventListener('click', () => {
    $('result-overlay').hidden = true;
    clearConfetti();
    // إعادة تعيين العجلة والفورم لتجهيز اللعبة للعميل التالي
    resetForNextPlayer();
  });
 
  function resetForNextPlayer() {
    const rotor = $('wheel-rotor');
    rotor.style.transition = 'none';
    rotor.style.transform = 'rotate(0deg)';
    wheelRotation = 0;
    selectedInterests = [];
    customFieldValues = {};
    formData = {};
    pendingResult = null;
    document.getElementById('lead-form').reset();
    updateInterestsButtonLabel();
    $('btn-spin').disabled = false;
    // في وضع spinFirst شاشة العجلة نفسها هي شاشة الاستقبال بين عميل وعميل (مش المقدمة)
    showScreen(isSpinFirst() ? 'wheel' : 'intro');
  }
 
  /* ============ الاحتفال (كونفيتي) - تنفيذ خفيف بدون مكتبات خارجية ============ */
  let confettiParticles = [];
  let confettiAnimId = null;
 
  function fireConfetti() {
    const canvas = $('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const colors = [config.theme.primaryColor, config.theme.secondaryColor, '#ffffff', '#06d6a0', '#118ab2'];
    confettiParticles = [];
    for (let i = 0; i < 160; i++) {
      confettiParticles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 120,
        y: canvas.height * 0.35 + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 14,
        vy: -Math.random() * 14 - 4,
        size: Math.random() * 7 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 12,
        shape: Math.random() > 0.5 ? 'rect' : 'circle'
      });
    }
    const gravity = 0.35;
    const start = performance.now();
    function frame(now) {
      const elapsed = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      confettiParticles.forEach((p) => {
        p.vy += gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        if (p.y < canvas.height + 20) alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        if (p.shape === 'rect') ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        else { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      });
      if (alive && elapsed < 6000) confettiAnimId = requestAnimationFrame(frame);
    }
    confettiAnimId = requestAnimationFrame(frame);
  }
 
  function clearConfetti() {
    if (confettiAnimId) cancelAnimationFrame(confettiAnimId);
    const canvas = $('confetti-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    confettiParticles = [];
  }
 
  window.addEventListener('resize', () => {
    const canvas = $('confetti-canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
 
  /* ============ التشغيل ============ */
  loadConfig().then(() => { if (config) preloadSegmentImages(); });
})();
