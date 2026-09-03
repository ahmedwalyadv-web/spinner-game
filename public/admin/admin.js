/* لوحة تحكم لعبة السبنر - كل المنطق في ملف واحد لسهولة الصيانة بدون أدوات بناء */
(function () {
  'use strict';

  /* ============ أدوات عامة ============ */
  async function api(path, opts) {
    opts = opts || {};
    const res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'include'
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const msg = (data && data.error) || 'حدث خطأ غير متوقع';
      throw new Error(msg);
    }
    return data;
  }

  async function uploadFile(file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'فشل رفع الملف');
    return data.url;
  }

  // نطق النطق الصوتي فيه علة معروفة في كروم: نداء cancel() ومباشرة speak() في نفس اللحظة ممكن يخلي
  // الجملة الجديدة تتجاهل بصمت من غير أي صوت - فبنستنى شوية لما يكون فيه كلام بيتقال قبل كده،
  // وبنعمل "تسخين" لقايمة الأصوات بدري عشان كروم يحمّلها (أول نداء أحيانًا بيرجع قايمة فاضية).
  if (window.speechSynthesis) {
    try { window.speechSynthesis.getVoices(); } catch (e) {}
  }
  // بنفضّل صوت "محلي" (مثبت على الجهاز) بنفس لغة النص لو موجود، عشان نتجنب الأصوات "عبر الشبكة"
  // اللي ممكن تتعطل لو الإنترنت/الشبكة عندك بتمنع الاتصال بسيرفرات جوجل الصوتية
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
  function previewSpeak(text, lang) {
    if (!text) return;
    if (!('speechSynthesis' in window)) {
      toast(uiLang === 'ar' ? 'المتصفح ده مش بيدعم النطق الصوتي (Text-to-Speech)' : 'This browser does not support text-to-speech', 'error');
      return;
    }
    try {
      const speakLang = lang === 'en' ? 'en-US' : 'ar-SA';
      const speakNow = () => {
        let voices = [];
        try { voices = window.speechSynthesis.getVoices() || []; } catch (e) {}
        if (voices.length === 0) {
          toast(uiLang === 'ar'
            ? 'الجهاز/المتصفح ده مفيهوش أي أصوات نطق (Text-to-Speech) متاحة خالص - جرب متصفح أو جهاز تاني'
            : 'This device/browser has no text-to-speech voices available at all - try a different browser or device', 'error');
          return;
        }
        const u = new SpeechSynthesisUtterance(text);
        const voice = pickVoice(speakLang);
        if (voice) { u.voice = voice; u.lang = voice.lang; }
        else u.lang = speakLang;
        u.onerror = (ev) => {
          const code = (ev && ev.error) || '?';
          toast((uiLang === 'ar' ? 'تعذّر تشغيل الصوت (كود الخطأ: ' : 'Could not play the voice (error code: ') + code + ')', 'error');
        };
        window.speechSynthesis.speak(u);
      };
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
        setTimeout(speakNow, 80);
      } else {
        speakNow();
      }
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function toast(msg, type) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast' + (type ? ' ' + type : '');
    t.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach((k) => {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach((c) => {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function getPath(obj, path) {
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur === undefined || cur === null) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  function setPath(obj, path, value) {
    const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (cur[p] === undefined || cur[p] === null) cur[p] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9);
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /* ============ الترجمة (واجهة الأدمن فقط) ============ */
  const I18N = {
    ar: {
      'login.title': 'تسجيل الدخول للوحة التحكم', 'login.subtitle': 'لعبة السبنر - إدارة الكامبينات',
      'login.username': 'اسم المستخدم', 'login.password': 'كلمة المرور', 'login.submit': 'دخول',
      'app.title': 'لوحة تحكم السبنر', 'nav.dashboard': 'الكامبينات', 'nav.password': 'كلمة المرور', 'nav.logout': 'خروج',
      'dash.title': 'الكامبينات', 'dash.new': '+ كامبين جديد',
      'editor.back': 'رجوع للكامبينات', 'editor.preview': '👁 معاينة اللعبة', 'editor.save': '💾 حفظ',
      'editor.link': 'رابط اللعبة الخاص بالعميل:', 'editor.copy': 'نسخ', 'editor.active': 'مفعّل',
      'tab.theme': 'الهوية والألوان', 'tab.logos': 'الشعارات', 'tab.intro': 'شاشة المقدمة',
      'tab.form': 'بيانات العميل', 'tab.wheel': 'عجلة الحظ', 'tab.popups': 'نتيجة اللفة',
      'tab.sound': 'الصوت والتفاعل', 'tab.integrations': 'ربط جوجل شيت', 'tab.leads': 'بيانات العملاء'
    },
    en: {
      'login.title': 'Admin Dashboard Login', 'login.subtitle': 'Spinner Game - Campaign Management',
      'login.username': 'Username', 'login.password': 'Password', 'login.submit': 'Log in',
      'app.title': 'Spinner Admin', 'nav.dashboard': 'Campaigns', 'nav.password': 'Password', 'nav.logout': 'Logout',
      'dash.title': 'Campaigns', 'dash.new': '+ New Campaign',
      'editor.back': 'Back to campaigns', 'editor.preview': '👁 Preview Game', 'editor.save': '💾 Save',
      'editor.link': "Client's game link:", 'editor.copy': 'Copy', 'editor.active': 'Active',
      'tab.theme': 'Branding & Colors', 'tab.logos': 'Logos', 'tab.intro': 'Intro Screen',
      'tab.form': 'Customer Info', 'tab.wheel': 'Lucky Wheel', 'tab.popups': 'Spin Result',
      'tab.sound': 'Sound & Voice', 'tab.integrations': 'Google Sheet Sync', 'tab.leads': 'Customer Data'
    }
  };
  let uiLang = localStorage.getItem('admin_ui_lang') || 'ar';

  function applyI18n() {
    document.documentElement.lang = uiLang;
    document.documentElement.dir = uiLang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach((node) => {
      const key = node.getAttribute('data-i18n');
      if (I18N[uiLang][key]) node.textContent = I18N[uiLang][key];
    });
    document.getElementById('lang-toggle').textContent = uiLang === 'ar' ? 'EN' : 'AR';
  }

  document.getElementById('lang-toggle').addEventListener('click', () => {
    uiLang = uiLang === 'ar' ? 'en' : 'ar';
    localStorage.setItem('admin_ui_lang', uiLang);
    applyI18n();
  });

  /* ============ الحالة العامة ============ */
  const state = {
    admin: null,
    campaigns: [],
    campaign: null, // { id, slug, name, isActive }
    cfg: null // نسخة قابلة للتعديل من config
  };

  const views = {
    login: document.getElementById('view-login'),
    app: document.getElementById('view-app'),
    dashboard: document.getElementById('view-dashboard'),
    editor: document.getElementById('view-editor')
  };

  function showAuthed(authed) {
    views.login.hidden = authed;
    views.app.hidden = !authed;
  }

  function showDashboardPanel(showDash) {
    views.dashboard.hidden = !showDash;
    views.editor.hidden = showDash;
  }

  /* ============ تسجيل الدخول ============ */
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errBox = document.getElementById('login-error');
    errBox.textContent = '';
    try {
      const data = await api('/auth/login', { method: 'POST', body: { username, password } });
      state.admin = data;
      showAuthed(true);
      await loadDashboard();
    } catch (e) {
      errBox.textContent = e.message;
    }
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' });
    location.reload();
  });

  document.getElementById('nav-dashboard').addEventListener('click', () => {
    showDashboardPanel(true);
    loadDashboard();
  });

  document.getElementById('btn-change-password').addEventListener('click', () => {
    openModal({
      title: uiLang === 'ar' ? 'تغيير كلمة المرور' : 'Change Password',
      fields: [
        { key: 'currentPassword', label: uiLang === 'ar' ? 'كلمة المرور الحالية' : 'Current password', type: 'password' },
        { key: 'newPassword', label: uiLang === 'ar' ? 'كلمة المرور الجديدة' : 'New password', type: 'password' }
      ],
      confirmText: uiLang === 'ar' ? 'حفظ' : 'Save',
      onConfirm: async (values) => {
        await api('/auth/change-password', { method: 'POST', body: values });
        toast(uiLang === 'ar' ? 'تم تغيير كلمة المرور' : 'Password changed', 'success');
      }
    });
  });

  /* ============ مودال عام بسيط ============ */
  function openModal({ title, fields, confirmText, onConfirm, danger }) {
    const root = document.getElementById('modal-root');
    const values = {};
    const inputs = fields.map((f) => {
      const input = el('input', { type: f.type || 'text', placeholder: f.label });
      values[f.key] = '';
      input.addEventListener('input', () => (values[f.key] = input.value));
      return el('div', { class: 'field' }, [el('label', {}, [f.label]), input]);
    });
    const errBox = el('div', { class: 'error-text' });
    function close() { root.innerHTML = ''; }
    const box = el('div', { class: 'modal-box' }, [
      el('h3', {}, [title]),
      ...inputs,
      errBox,
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn btn-ghost', onclick: close }, [uiLang === 'ar' ? 'إلغاء' : 'Cancel']),
        el('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), onclick: async () => {
          try {
            await onConfirm(values);
            close();
          } catch (e) {
            errBox.textContent = e.message;
          }
        } }, [confirmText])
      ])
    ]);
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === e.currentTarget) close(); } }, [box]));
  }

  function confirmModal(message, onConfirm) {
    const root = document.getElementById('modal-root');
    function close() { root.innerHTML = ''; }
    const box = el('div', { class: 'modal-box' }, [
      el('h3', {}, [uiLang === 'ar' ? 'تأكيد' : 'Confirm']),
      el('p', {}, [message]),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn btn-ghost', onclick: close }, [uiLang === 'ar' ? 'إلغاء' : 'Cancel']),
        el('button', { class: 'btn btn-danger', onclick: async () => { await onConfirm(); close(); } }, [uiLang === 'ar' ? 'تأكيد' : 'Confirm'])
      ])
    ]);
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === e.currentTarget) close(); } }, [box]));
  }

  /* ============ لوحة الكامبينات ============ */
  async function loadDashboard() {
    showDashboardPanel(true);
    const data = await api('/campaigns');
    state.campaigns = data.campaigns;
    renderDashboard();
  }

  function renderDashboard() {
    const grid = document.getElementById('campaigns-list');
    grid.innerHTML = '';
    if (state.campaigns.length === 0) {
      grid.appendChild(el('p', { class: 'muted' }, [uiLang === 'ar' ? 'لا يوجد كامبينات لسه. ابدأ بإنشاء كامبين جديد.' : 'No campaigns yet. Create your first one.']));
      return;
    }
    state.campaigns.forEach((c) => {
      const link = location.origin + '/play/' + c.slug;
      const card = el('div', { class: 'campaign-card' }, [
        el('h3', {}, [c.name]),
        el('div', { class: 'meta' }, [
          el('span', { class: 'badge ' + (c.is_active ? 'on' : 'off') }, [c.is_active ? (uiLang === 'ar' ? 'مفعّل' : 'Active') : (uiLang === 'ar' ? 'متوقف' : 'Inactive')]),
          el('span', {}, [(uiLang === 'ar' ? 'عملاء: ' : 'Leads: ') + c.leads_count]),
          el('span', {}, [(uiLang === 'ar' ? 'لفّات: ' : 'Spins: ') + c.spin_count])
        ]),
        el('div', { class: 'muted-sm', style: 'word-break:break-all' }, [link]),
        el('div', { class: 'row-actions' }, [
          el('button', { class: 'btn btn-sm btn-primary', onclick: () => openEditor(c.id) }, [uiLang === 'ar' ? 'تعديل' : 'Edit']),
          el('button', { class: 'btn btn-sm btn-ghost', onclick: () => { navigator.clipboard.writeText(link); toast(uiLang === 'ar' ? 'تم نسخ الرابط' : 'Link copied', 'success'); } }, [uiLang === 'ar' ? 'نسخ الرابط' : 'Copy link']),
          el('button', { class: 'btn btn-sm btn-ghost', onclick: () => window.open(link, '_blank') }, [uiLang === 'ar' ? 'فتح' : 'Open']),
          el('button', { class: 'btn btn-sm btn-ghost', onclick: async () => { await api('/campaigns/' + c.id + '/duplicate', { method: 'POST' }); toast(uiLang === 'ar' ? 'تم النسخ' : 'Duplicated', 'success'); loadDashboard(); } }, [uiLang === 'ar' ? 'نسخ لعميل جديد' : 'Duplicate']),
          el('button', { class: 'btn btn-sm btn-danger', onclick: () => confirmModal(uiLang === 'ar' ? 'هل تريد حذف الكامبين نهائيًا؟' : 'Delete this campaign permanently?', async () => { await api('/campaigns/' + c.id, { method: 'DELETE' }); loadDashboard(); }) }, [uiLang === 'ar' ? 'حذف' : 'Delete'])
        ])
      ]);
      grid.appendChild(card);
    });
  }

  document.getElementById('btn-new-campaign').addEventListener('click', () => {
    openModal({
      title: uiLang === 'ar' ? 'كامبين جديد' : 'New Campaign',
      fields: [{ key: 'name', label: uiLang === 'ar' ? 'اسم العميل / الكامبين' : 'Client / Campaign name' }],
      confirmText: uiLang === 'ar' ? 'إنشاء' : 'Create',
      onConfirm: async (values) => {
        const data = await api('/campaigns', { method: 'POST', body: { name: values.name } });
        toast(uiLang === 'ar' ? 'تم الإنشاء' : 'Created', 'success');
        await loadDashboard();
        openEditor(data.id);
      }
    });
  });

  document.getElementById('btn-back-dashboard').addEventListener('click', () => { showDashboardPanel(true); loadDashboard(); });

  /* ============ محرر الكامبين ============ */
  async function openEditor(id) {
    const data = await api('/campaigns/' + id);
    state.campaign = { id: data.id, slug: data.slug, name: data.name, isActive: data.isActive, stockUsed: data.stockUsed || {} };
    state.cfg = data.config;
    showDashboardPanel(false);
    document.getElementById('campaign-name-input').value = data.name;
    document.getElementById('toggle-active').checked = data.isActive;
    document.getElementById('campaign-status-pill').textContent = (uiLang === 'ar' ? 'آخر تعديل: ' : 'Updated: ') + new Date(data.updatedAt).toLocaleString(uiLang === 'ar' ? 'ar-EG' : 'en-US');
    document.getElementById('slug-edit-input').value = data.slug;
    updateLinkDisplay();
    switchTab('theme');
  }

  function updateLinkDisplay() {
    document.getElementById('campaign-link-display').textContent = location.origin + '/play/' + state.campaign.slug;
  }

  document.getElementById('btn-copy-link').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('campaign-link-display').textContent);
    toast(uiLang === 'ar' ? 'تم نسخ الرابط' : 'Link copied', 'success');
  });

  document.getElementById('btn-preview').addEventListener('click', () => {
    window.open('/play/' + state.campaign.slug, '_blank');
  });

  document.getElementById('btn-save').addEventListener('click', async () => {
    try {
      state.campaign.name = document.getElementById('campaign-name-input').value.trim() || state.campaign.name;
      state.campaign.isActive = document.getElementById('toggle-active').checked;
      const slugVal = document.getElementById('slug-edit-input').value.trim();
      const res = await api('/campaigns/' + state.campaign.id, {
        method: 'PUT',
        body: { name: state.campaign.name, isActive: state.campaign.isActive, slug: slugVal, config: state.cfg }
      });
      state.campaign.slug = res.slug;
      updateLinkDisplay();
      toast(uiLang === 'ar' ? 'تم الحفظ بنجاح ✓' : 'Saved ✓', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  /* تبويبات */
  const TAB_RENDERERS = {}; // يتم ملؤها لاحقًا بكل تبويب
  document.getElementById('editor-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    switchTab(btn.getAttribute('data-tab'));
  });
  function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.getAttribute('data-tab') === tab));
    document.querySelectorAll('.tab-content').forEach((c) => (c.hidden = c.id !== 'tab-' + tab));
    if (TAB_RENDERERS[tab]) TAB_RENDERERS[tab]();
  }

  /* ============ أدوات بناء حقول متكررة ============ */
  function fieldText(label, path, opts) {
    opts = opts || {};
    const input = el('input', { type: opts.type || 'text', 'data-path': path, value: getPath(state.cfg, path) || '' });
    return el('div', { class: 'field' }, [el('label', {}, [label]), input]);
  }
  function fieldNumber(label, path, opts) {
    opts = opts || {};
    const attrs = { type: 'number', 'data-path': path, value: getPath(state.cfg, path) ?? (opts.def ?? 0) };
    if (opts.min !== undefined) attrs.min = opts.min;
    if (opts.max !== undefined) attrs.max = opts.max;
    if (opts.step !== undefined) attrs.step = opts.step;
    return el('div', { class: 'field' }, [el('label', {}, [label]), el('input', attrs)]);
  }
  function fieldColor(label, path) {
    const val = getPath(state.cfg, path) || '#ffffff';
    return el('div', { class: 'field' }, [
      el('label', {}, [label]),
      el('div', { class: 'color-field' }, [
        el('input', { type: 'color', 'data-path': path, value: val }),
        el('input', { type: 'text', 'data-path': path, value: val, style: 'flex:1' })
      ])
    ]);
  }
  function fieldTextarea(label, path) {
    return el('div', { class: 'field' }, [el('label', {}, [label]), el('textarea', { 'data-path': path }, [getPath(state.cfg, path) || ''])]);
  }
  function fieldSelect(label, path, options) {
    const val = getPath(state.cfg, path);
    const select = el('select', { 'data-path': path }, options.map((o) => el('option', { value: o.value, selected: o.value === val ? 'selected' : undefined }, [o.label])));
    return el('div', { class: 'field' }, [el('label', {}, [label]), select]);
  }
  function fieldToggle(label, path) {
    const checked = !!getPath(state.cfg, path);
    return el('div', { class: 'field-inline' }, [
      el('label', { class: 'switch' }, [
        el('input', { type: 'checkbox', 'data-path': path, 'data-bool': 'true', checked: checked ? 'checked' : undefined }),
        el('span', { class: 'slider' })
      ]),
      el('span', {}, [label])
    ]);
  }
  function fieldBilingual(labelBase, pathBase) {
    return el('div', { class: 'field-row' }, [
      fieldText(labelBase + ' (عربي)', pathBase + '.ar'),
      fieldText(labelBase + ' (English)', pathBase + '.en')
    ]);
  }
  function fieldUpload(label, path, opts) {
    opts = opts || {};
    const current = getPath(state.cfg, path) || '';
    const isVideo = /\.(mp4|webm)$/i.test(current);
    const wrap = el('div', { class: 'field' });
    wrap.appendChild(el('label', {}, [label]));
    const box = el('div', { class: 'upload-box' }, [uiLang === 'ar' ? '📤 اضغط لرفع صورة' + (opts.allowVideo ? ' أو فيديو' : '') : '📤 Click to upload' + (opts.allowVideo ? ' image/video' : ' image')]);
    const fileInput = el('input', { type: 'file', accept: opts.allowVideo ? 'image/*,video/*' : 'image/*', style: 'display:none' });
    box.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      if (!fileInput.files[0]) return;
      box.textContent = uiLang === 'ar' ? 'جاري الرفع...' : 'Uploading...';
      try {
        const url = await uploadFile(fileInput.files[0]);
        setPath(state.cfg, path, url);
        if (opts.onUploaded) opts.onUploaded(url);
        else if (TAB_RENDERERS[opts.rerenderTab]) TAB_RENDERERS[opts.rerenderTab]();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
    wrap.appendChild(box);
    wrap.appendChild(fileInput);
    if (current) {
      if (isVideo) wrap.appendChild(el('video', { src: current, class: 'upload-preview', controls: 'controls' }));
      else wrap.appendChild(el('img', { src: current, class: 'upload-preview' }));
      wrap.appendChild(el('button', { class: 'icon-btn', style: 'margin-top:6px', onclick: () => { setPath(state.cfg, path, ''); if (TAB_RENDERERS[opts.rerenderTab]) TAB_RENDERERS[opts.rerenderTab](); } }, [uiLang === 'ar' ? 'إزالة' : 'Remove']));
    }
    return wrap;
  }

  function fieldAudioUpload(label, path, opts) {
    opts = opts || {};
    const current = getPath(state.cfg, path) || '';
    const wrap = el('div', { class: 'field' });
    wrap.appendChild(el('label', {}, [label]));
    const box = el('div', { class: 'upload-box' }, [uiLang === 'ar' ? '📤 اضغط لرفع ملف صوت' : '📤 Click to upload an audio file']);
    const fileInput = el('input', { type: 'file', accept: 'audio/*', style: 'display:none' });
    box.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      if (!fileInput.files[0]) return;
      box.textContent = uiLang === 'ar' ? 'جاري الرفع...' : 'Uploading...';
      try {
        const url = await uploadFile(fileInput.files[0]);
        setPath(state.cfg, path, url);
        if (TAB_RENDERERS[opts.rerenderTab]) TAB_RENDERERS[opts.rerenderTab]();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
    wrap.appendChild(box);
    wrap.appendChild(fileInput);
    if (current) {
      wrap.appendChild(el('audio', { src: current, controls: 'controls', style: 'display:block;margin-top:8px;width:100%;max-width:320px' }));
      wrap.appendChild(el('button', { class: 'icon-btn', style: 'margin-top:6px', onclick: () => { setPath(state.cfg, path, ''); if (TAB_RENDERERS[opts.rerenderTab]) TAB_RENDERERS[opts.rerenderTab](); } }, [uiLang === 'ar' ? 'إزالة (رجوع للصوت الافتراضي)' : 'Remove (use default)']));
    }
    return wrap;
  }

  // استماع عام لكل تغييرات الإدخال داخل المحرر وتحديث state.cfg تلقائيًا (بدون إعادة رسم عشان مايحصلش فقد تركيز)
  document.getElementById('view-editor').addEventListener('input', (e) => {
    const t = e.target;
    const path = t.getAttribute('data-path');
    if (!path) return;
    let value;
    if (t.type === 'checkbox') value = t.checked;
    else if (t.type === 'number') value = t.value === '' ? 0 : Number(t.value);
    else value = t.value;
    setPath(state.cfg, path, value);
    // مزامنة color-picker مع حقل النص جنبه
    if (t.type === 'color' || (t.type === 'text' && t.previousElementSibling && t.previousElementSibling.type === 'color')) {
      const wrap = t.closest('.color-field');
      if (wrap) {
        const colorInput = wrap.querySelector('input[type=color]');
        const textInput = wrap.querySelector('input[type=text]');
        if (t.type === 'color') textInput.value = t.value;
        else if (/^#[0-9a-fA-F]{6}$/.test(t.value)) colorInput.value = t.value;
      }
    }
    if (t.closest('#tab-wheel')) debounceWheelRedraw();
  });

  const debounceWheelRedraw = debounce(() => { if (wheelCanvasCtx) drawWheelPreview(); }, 150);

  /* ============ تبويب: الهوية والألوان ============ */
  TAB_RENDERERS.theme = function () {
    const c = document.getElementById('tab-theme');
    c.innerHTML = '';
    c.appendChild(el('div', { class: 'section-title' }, [uiLang === 'ar' ? 'الألوان الأساسية' : 'Core Colors']));
    c.appendChild(el('div', { class: 'field-row' }, [
      fieldColor(uiLang === 'ar' ? 'لون الخلفية' : 'Background', 'theme.backgroundColor'),
      fieldColor(uiLang === 'ar' ? 'اللون الأساسي' : 'Primary', 'theme.primaryColor'),
      fieldColor(uiLang === 'ar' ? 'اللون الثانوي' : 'Secondary', 'theme.secondaryColor'),
      fieldColor(uiLang === 'ar' ? 'لون النصوص' : 'Text', 'theme.textColor'),
      fieldColor(uiLang === 'ar' ? 'لون نص الأزرار' : 'Button text', 'theme.buttonTextColor'),
      fieldColor(uiLang === 'ar' ? 'لون البطاقات' : 'Cards', 'theme.cardColor')
    ]));
    c.appendChild(el('div', { class: 'section-title' }, [uiLang === 'ar' ? 'الخط' : 'Font']));
    c.appendChild(el('div', { class: 'field-row' }, [
      fieldSelect(uiLang === 'ar' ? 'نوع الخط' : 'Font family', 'theme.fontFamily', [
        { value: 'Cairo, Tajawal, sans-serif', label: 'Cairo' },
        { value: 'Tajawal, Cairo, sans-serif', label: 'Tajawal' },
        { value: "'Noto Kufi Arabic', sans-serif", label: 'Noto Kufi Arabic' },
        { value: "Poppins, 'Cairo', sans-serif", label: 'Poppins' },
        { value: "Inter, 'Cairo', sans-serif", label: 'Inter' }
      ])
    ]));
    c.appendChild(el('div', { class: 'section-title' }, [uiLang === 'ar' ? 'خلفية عامة (اختياري)' : 'Background image (optional)']));
    c.appendChild(fieldUpload(uiLang === 'ar' ? 'صورة خلفية للعبة كلها' : 'Background image for the whole game', 'theme.backgroundImage', { rerenderTab: 'theme' }));
  };

  /* ============ تبويب: الشعارات ============ */
  TAB_RENDERERS.logos = function () {
    const c = document.getElementById('tab-logos');
    c.innerHTML = '';
    c.appendChild(el('p', { class: 'hint' }, [uiLang === 'ar' ? 'اسحب أي شعار داخل معاينة الشاشة لتحديد مكانه. تقدر تضيف أكتر من شعار وتتحكم في حجمه وحركته وفي أي شاشة يظهر.' : 'Drag any logo inside the preview to position it. Add multiple logos and control size, animation, and which screen it appears on.']));

    const layout = el('div', { class: 'wheel-preview-wrap' });
    const phone = el('div', { class: 'phone-preview', id: 'logos-phone-preview' });
    layout.appendChild(phone);

    const list = el('div', { class: 'card-list', style: 'flex:1;min-width:260px' });
    (state.cfg.logos || []).forEach((logo, idx) => {
      list.appendChild(renderLogoCard(logo, idx));
      renderLogoDragItem(phone, logo, idx);
    });
    layout.appendChild(list);
    c.appendChild(layout);
    c.appendChild(el('button', { class: 'add-btn', onclick: () => {
      state.cfg.logos = state.cfg.logos || [];
      state.cfg.logos.push({ id: uid('logo'), url: '', xPct: 40, yPct: 5, widthPct: 20, animation: 'none', delayMs: 0, screen: 'all' });
      TAB_RENDERERS.logos();
    } }, ['+ ' + (uiLang === 'ar' ? 'إضافة شعار' : 'Add logo')]));
  };

  function renderLogoDragItem(phone, logo, idx) {
    if (!logo.url) return;
    const item = el('div', {
      class: 'drag-item',
      style: `left:${logo.xPct}%;top:${logo.yPct}%;width:${logo.widthPct}%;height:${logo.widthPct}%;`
    }, [el('img', { src: logo.url })]);
    let dragging = false, startX, startY, startLeft, startTop;
    item.addEventListener('pointerdown', (e) => {
      dragging = true;
      item.classList.add('dragging');
      item.setPointerCapture(e.pointerId);
      startX = e.clientX; startY = e.clientY;
      startLeft = logo.xPct; startTop = logo.yPct;
    });
    item.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = phone.getBoundingClientRect();
      const dxPct = ((e.clientX - startX) / rect.width) * 100;
      const dyPct = ((e.clientY - startY) / rect.height) * 100;
      logo.xPct = Math.max(0, Math.min(100 - logo.widthPct, startLeft + dxPct));
      logo.yPct = Math.max(0, Math.min(100 - logo.widthPct, startTop + dyPct));
      item.style.left = logo.xPct + '%';
      item.style.top = logo.yPct + '%';
      const xInput = document.querySelector(`[data-path="logos[${idx}].xPct"]`);
      const yInput = document.querySelector(`[data-path="logos[${idx}].yPct"]`);
      if (xInput) xInput.value = Math.round(logo.xPct);
      if (yInput) yInput.value = Math.round(logo.yPct);
    });
    item.addEventListener('pointerup', () => { dragging = false; item.classList.remove('dragging'); });
    phone.appendChild(item);
  }

  function renderLogoCard(logo, idx) {
    const base = `logos[${idx}]`;
    const card = el('div', { class: 'item-card' }, [
      el('div', { class: 'item-head' }, [
        el('span', { class: 'item-title' }, [(uiLang === 'ar' ? 'شعار ' : 'Logo ') + (idx + 1)]),
        el('button', { class: 'icon-btn', onclick: () => { state.cfg.logos.splice(idx, 1); TAB_RENDERERS.logos(); } }, [uiLang === 'ar' ? 'حذف' : 'Delete'])
      ]),
      fieldUpload(uiLang === 'ar' ? 'صورة الشعار' : 'Logo image', base + '.url', { rerenderTab: 'logos' }),
      el('div', { class: 'field-row' }, [
        fieldNumber(uiLang === 'ar' ? 'الموضع أفقي %' : 'X position %', base + '.xPct', { min: 0, max: 100 }),
        fieldNumber(uiLang === 'ar' ? 'الموضع رأسي %' : 'Y position %', base + '.yPct', { min: 0, max: 100 }),
        fieldNumber(uiLang === 'ar' ? 'الحجم %' : 'Width %', base + '.widthPct', { min: 5, max: 100 })
      ]),
      el('div', { class: 'field-row' }, [
        fieldSelect(uiLang === 'ar' ? 'الحركة' : 'Animation', base + '.animation', [
          { value: 'none', label: uiLang === 'ar' ? 'بدون' : 'None' },
          { value: 'fade', label: uiLang === 'ar' ? 'ظهور تدريجي' : 'Fade in' },
          { value: 'bounce', label: uiLang === 'ar' ? 'قفز' : 'Bounce' },
          { value: 'float', label: uiLang === 'ar' ? 'تعويم' : 'Float' },
          { value: 'pulse', label: uiLang === 'ar' ? 'نبض' : 'Pulse' },
          { value: 'spin', label: uiLang === 'ar' ? 'دوران' : 'Spin' }
        ]),
        fieldNumber(uiLang === 'ar' ? 'تأخير الظهور (مللي ثانية)' : 'Delay (ms)', base + '.delayMs', { min: 0, step: 100 }),
        fieldSelect(uiLang === 'ar' ? 'يظهر في شاشة' : 'Visible on screen', base + '.screen', [
          { value: 'all', label: uiLang === 'ar' ? 'كل الشاشات' : 'All screens' },
          { value: 'intro', label: uiLang === 'ar' ? 'المقدمة فقط' : 'Intro only' },
          { value: 'form', label: uiLang === 'ar' ? 'الفورم فقط' : 'Form only' },
          { value: 'wheel', label: uiLang === 'ar' ? 'العجلة فقط' : 'Wheel only' },
          { value: 'result', label: uiLang === 'ar' ? 'النتيجة فقط' : 'Result only' }
        ])
      ])
    ]);
    return card;
  }

  /* ============ تبويب: شاشة المقدمة ============ */
  TAB_RENDERERS.intro = function () {
    const c = document.getElementById('tab-intro');
    c.innerHTML = '';
    c.appendChild(el('div', { class: 'section-title' }, [uiLang === 'ar' ? 'الوسائط' : 'Media']));
    c.appendChild(fieldSelect(uiLang === 'ar' ? 'نوع الوسائط' : 'Media type', 'intro.mediaType', [
      { value: 'image', label: uiLang === 'ar' ? 'صورة' : 'Image' },
      { value: 'video', label: uiLang === 'ar' ? 'فيديو' : 'Video' }
    ]));
    c.appendChild(fieldUpload(uiLang === 'ar' ? 'ارفع صورة أو فيديو المقدمة' : 'Upload intro image/video', 'intro.mediaUrl', { allowVideo: true, rerenderTab: 'intro' }));
    c.appendChild(fieldNumber(uiLang === 'ar' ? 'شفافية التظليل فوق الوسائط (0-1)' : 'Overlay opacity (0-1)', 'intro.overlayOpacity', { min: 0, max: 1, step: 0.05 }));
    c.appendChild(el('div', { class: 'section-title' }, [uiLang === 'ar' ? 'النصوص' : 'Texts']));
    c.appendChild(fieldBilingual(uiLang === 'ar' ? 'العنوان' : 'Title', 'intro.title'));
    c.appendChild(fieldBilingual(uiLang === 'ar' ? 'العنوان الفرعي' : 'Subtitle', 'intro.subtitle'));
    c.appendChild(fieldBilingual(uiLang === 'ar' ? 'نص زرار البداية' : 'Start button text', 'intro.startButtonText'));
  };

  /* ============ تبويب: بيانات العميل (الفورم) ============ */
  TAB_RENDERERS.form = function () {
    const c = document.getElementById('tab-form');
    c.innerHTML = '';
    c.appendChild(fieldBilingual(uiLang === 'ar' ? 'عنوان الفورم' : 'Form title', 'form.title'));
    c.appendChild(fieldBilingual(uiLang === 'ar' ? 'العنوان الفرعي' : 'Subtitle', 'form.subtitle'));
    c.appendChild(fieldBilingual(uiLang === 'ar' ? 'نص زرار الإرسال' : 'Submit button', 'form.submitButtonText'));

    c.appendChild(el('div', { class: 'section-title' }, [uiLang === 'ar' ? 'الحقول' : 'Fields']));
    c.appendChild(el('p', { class: 'hint' }, [uiLang === 'ar' ? 'الاسم ورقم التليفون إجباريين دايمًا. باقي الحقول تقدر تفعّلها أو تلغيها وتحددها إجبارية أو اختيارية.' : 'Name and phone are always required. Other fields can be enabled/disabled and marked required or optional.']));

    const nameRow = el('div', { class: 'item-card' }, [
      el('div', { class: 'item-title' }, [uiLang === 'ar' ? 'الاسم (إجباري دايمًا)' : 'Name (always required)']),
      fieldBilingual(uiLang === 'ar' ? 'مسمى الحقل' : 'Field label', 'form.fields.name.label')
    ]);
    const phoneRow = el('div', { class: 'item-card' }, [
      el('div', { class: 'item-title' }, [uiLang === 'ar' ? 'رقم التليفون (إجباري دايمًا)' : 'Phone (always required)']),
      fieldBilingual(uiLang === 'ar' ? 'مسمى الحقل' : 'Field label', 'form.fields.phone.label')
    ]);
    c.appendChild(nameRow);
    c.appendChild(phoneRow);

    ['position', 'email', 'interests'].forEach((key) => {
      const names = { position: uiLang === 'ar' ? 'المنصب' : 'Job title', email: uiLang === 'ar' ? 'البريد الإلكتروني' : 'Email', interests: uiLang === 'ar' ? 'الاهتمامات' : 'Interests' };
      const box = el('div', { class: 'item-card' }, [
        el('div', { class: 'item-title' }, [names[key]]),
        el('div', { class: 'field-row' }, [
          fieldToggle(uiLang === 'ar' ? 'مفعّل' : 'Enabled', `form.fields.${key}.enabled`),
          fieldToggle(uiLang === 'ar' ? 'إجباري' : 'Required', `form.fields.${key}.required`)
        ]),
        fieldBilingual(uiLang === 'ar' ? 'مسمى الحقل' : 'Field label', `form.fields.${key}.label`)
      ]);
      c.appendChild(box);
    });

    c.appendChild(el('div', { class: 'section-title' }, [uiLang === 'ar' ? 'قائمة الاهتمامات (تظهر كقائمة اختيار)' : 'Interests list (shown as a picker)']));
    c.appendChild(el('p', { class: 'hint' }, [uiLang === 'ar'
      ? 'لو ربطت اهتمام بجائزة معينة، أي عميل يختار الاهتمام ده هياخد الجائزة دي أكيد (طالما لسه متاح منها كمية في تبويب عجلة الحظ).'
      : "If you link an interest to a specific prize, anyone who picks it is guaranteed that prize (as long as its stock isn't out, set in the Wheel tab)."]));
    const segmentOptions = [{ value: '', label: uiLang === 'ar' ? 'بدون (عادي)' : 'None (normal)' }]
      .concat((state.cfg.wheel.segments || []).map((s) => ({ value: s.id, label: currentLangText(s.label) || s.id })));
    const list = el('div', { class: 'card-list' });
    (state.cfg.form.interestsList || []).forEach((it, idx) => {
      list.appendChild(el('div', { class: 'item-card' }, [
        el('div', { class: 'item-head' }, [
          el('span', { class: 'item-title' }, [uiLang === 'ar' ? 'اهتمام ' + (idx + 1) : 'Interest ' + (idx + 1)]),
          el('button', { class: 'icon-btn', onclick: () => { state.cfg.form.interestsList.splice(idx, 1); TAB_RENDERERS.form(); } }, [uiLang === 'ar' ? 'حذف' : 'Delete'])
        ]),
        el('div', { class: 'field-row' }, [
          fieldText(uiLang === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)', `form.interestsList[${idx}].ar`),
          fieldText(uiLang === 'ar' ? 'الاسم (English)' : 'Name (English)', `form.interestsList[${idx}].en`)
        ]),
        fieldSelect(uiLang === 'ar' ? '🎁 يجيب جائزة قيمة أكيدة' : '🎁 Guarantees a specific prize', `form.interestsList[${idx}].linkedSegmentId`, segmentOptions)
      ]));
    });
    c.appendChild(list);
    c.appendChild(el('button', { class: 'add-btn', onclick: () => {
      state.cfg.form.interestsList.push({ id: uid('int'), ar: '', en: '', linkedSegmentId: null });
      TAB_RENDERERS.form();
    } }, ['+ ' + (uiLang === 'ar' ? 'إضافة اهتمام' : 'Add interest')]));

    c.appendChild(el('div', { class: 'section-title' }, [uiLang === 'ar' ? 'حقول تسجيل إضافية (حرة)' : 'Extra registration fields (custom)']));
    c.appendChild(el('p', { class: 'hint' }, [uiLang === 'ar'
      ? 'ضيف أي حقل تاني عايزه في فورم بيانات العميل - نص حر أو قائمة اختيار.'
      : 'Add any other field you want in the customer form - free text or a picker list.']));
    const cfList = el('div', { class: 'card-list' });
    (state.cfg.form.customFields || []).forEach((cf, idx) => {
      const base = `form.customFields[${idx}]`;
      const rows = [
        el('div', { class: 'item-head' }, [
          el('span', { class: 'item-title' }, [uiLang === 'ar' ? 'حقل ' + (idx + 1) : 'Field ' + (idx + 1)]),
          el('button', { class: 'icon-btn', onclick: () => { state.cfg.form.customFields.splice(idx, 1); TAB_RENDERERS.form(); } }, [uiLang === 'ar' ? 'حذف' : 'Delete'])
        ]),
        el('div', { class: 'field-row' }, [
          fieldText(uiLang === 'ar' ? 'اسم الحقل (عربي)' : 'Field label (Arabic)', base + '.label.ar'),
          fieldText(uiLang === 'ar' ? 'اسم الحقل (English)' : 'Field label (English)', base + '.label.en')
        ]),
        el('div', { class: 'field-row' }, [
          fieldSelect(uiLang === 'ar' ? 'نوع الحقل' : 'Field type', base + '.type', [
            { value: 'text', label: uiLang === 'ar' ? 'نص حر' : 'Free text' },
            { value: 'select', label: uiLang === 'ar' ? 'قائمة اختيار' : 'Picker list' }
          ]),
          fieldToggle(uiLang === 'ar' ? 'إجباري' : 'Required', base + '.required')
        ])
      ];
      if (cf.type === 'select') {
        const optWrap = el('div', { class: 'card-list', style: 'margin-top:8px' });
        (cf.options || []).forEach((opt, oIdx) => {
          optWrap.appendChild(el('div', { class: 'field-row' }, [
            fieldText(uiLang === 'ar' ? 'خيار (عربي)' : 'Option (Arabic)', `${base}.options[${oIdx}].ar`),
            fieldText(uiLang === 'ar' ? 'خيار (English)' : 'Option (English)', `${base}.options[${oIdx}].en`),
            el('button', { class: 'icon-btn', onclick: () => { cf.options.splice(oIdx, 1); TAB_RENDERERS.form(); } }, [uiLang === 'ar' ? 'حذف' : 'Delete'])
          ]));
        });
        rows.push(optWrap);
        rows.push(el('button', { class: 'add-btn', onclick: () => {
          if (!cf.options) cf.options = [];
          cf.options.push({ id: uid('opt'), ar: '', en: '' });
          TAB_RENDERERS.form();
        } }, ['+ ' + (uiLang === 'ar' ? 'إضافة خيار' : 'Add option')]));
      }
      cfList.appendChild(el('div', { class: 'item-card' }, rows));
    });
    c.appendChild(cfList);
    c.appendChild(el('button', { class: 'add-btn', onclick: () => {
      if (!state.cfg.form.customFields) state.cfg.form.customFields = [];
      state.cfg.form.customFields.push({ id: uid('cf'), type: 'text', label: { ar: '', en: '' }, required: false, options: [] });
      TAB_RENDERERS.form();
    } }, ['+ ' + (uiLang === 'ar' ? 'إضافة حقل جديد' : 'Add new field')]));
  };

  /* ============ تبويب: عجلة الحظ ============ */
  let wheelCanvasCtx = null;
  TAB_RENDERERS.wheel = function () {
    const c = document.getElementById('tab-wheel');
    c.innerHTML = '';
    c.appendChild(el('div', { class: 'field-row' }, [
      fieldNumber(uiLang === 'ar' ? 'مدة الدوران (مللي ثانية)' : 'Spin duration (ms)', 'wheel.spinDurationMs', { min: 1000, step: 100 }),
      fieldNumber(uiLang === 'ar' ? 'عدد اللفات الإضافية قبل التوقف' : 'Extra full turns', 'wheel.spinExtraTurns', { min: 2, max: 20 }),
      fieldColor(uiLang === 'ar' ? 'لون إطار العجلة' : 'Wheel border color', 'wheel.borderColor'),
      fieldNumber(uiLang === 'ar' ? 'سُمك الإطار' : 'Border width', 'wheel.borderWidth', { min: 0, max: 30 }),
      fieldColor(uiLang === 'ar' ? 'لون المؤشر' : 'Pointer color', 'wheel.pointerColor')
    ]));
    c.appendChild(fieldUpload(uiLang === 'ar' ? 'صورة في مركز العجلة (اختياري)' : 'Center image (optional)', 'wheel.centerImage', { rerenderTab: 'wheel' }));

    const wrap = el('div', { class: 'wheel-preview-wrap' });
    const holder = el('div', { class: 'wheel-canvas-holder' }, [
      el('span', { class: 'wheel-pointer' }, ['📍']),
      el('canvas', { width: 560, height: 560, id: 'wheel-canvas' })
    ]);
    wrap.appendChild(holder);

    const list = el('div', { class: 'card-list', style: 'flex:1;min-width:300px' });
    const totalWeight = (state.cfg.wheel.segments || []).reduce((s, x) => s + (Number(x.weight) || 0), 0) || 1;
    (state.cfg.wheel.segments || []).forEach((seg, idx) => {
      list.appendChild(renderSegmentCard(seg, idx, totalWeight));
    });
    wrap.appendChild(list);
    c.appendChild(wrap);
    c.appendChild(el('button', { class: 'add-btn', onclick: () => {
      state.cfg.wheel.segments.push({
        id: uid('seg'), label: { ar: 'قسم جديد', en: 'New segment' }, color: '#666666', textColor: '#ffffff',
        type: 'win', weight: 10, guaranteedEvery: null, stock: null, image: null, icon: null,
        text: { distancePct: 68, fontSize: 14, color: '#ffffff', showLabel: true }
      });
      TAB_RENDERERS.wheel();
    } }, ['+ ' + (uiLang === 'ar' ? 'إضافة قسم' : 'Add segment')]));

    wheelCanvasCtx = document.getElementById('wheel-canvas').getContext('2d');
    drawWheelPreview();
  };

  function renderSegmentCard(seg, idx, totalWeight) {
    const base = `wheel.segments[${idx}]`;
    const pct = Math.round(((Number(seg.weight) || 0) / totalWeight) * 100);
    const card = el('div', { class: 'item-card' }, [
      el('div', { class: 'item-head' }, [
        el('span', { class: 'item-title' }, [(uiLang === 'ar' ? 'قسم ' : 'Segment ') + (idx + 1) + ' — ' + pct + '%']),
        el('div', {}, [
          el('button', { class: 'icon-btn', onclick: () => { state.cfg.wheel.segments.splice(idx, 1); TAB_RENDERERS.wheel(); } }, [uiLang === 'ar' ? 'حذف' : 'Delete'])
        ])
      ]),
      fieldBilingual(uiLang === 'ar' ? 'النص الظاهر' : 'Label', base + '.label'),
      el('div', { class: 'field-row' }, [
        fieldColor(uiLang === 'ar' ? 'لون القسم' : 'Segment color', base + '.color'),
        fieldColor(uiLang === 'ar' ? 'لون النص' : 'Text color', base + '.textColor'),
        fieldSelect(uiLang === 'ar' ? 'نوع النتيجة' : 'Result type', base + '.type', [
          { value: 'win', label: uiLang === 'ar' ? 'ربح 🎁' : 'Win 🎁' },
          { value: 'lose', label: uiLang === 'ar' ? 'حظ أوفر' : 'Better luck' }
        ])
      ]),
      el('div', { class: 'field-row' }, [
        fieldNumber(uiLang === 'ar' ? 'نسبة الظهور (وزن)' : 'Appearance weight', base + '.weight', { min: 0, step: 1 }),
        fieldNumber(uiLang === 'ar' ? 'ضمان الظهور كل كام لفة (اتركه فاضي = بدون ضمان)' : 'Guaranteed every N spins (blank = none)', base + '.guaranteedEvery', { min: 0, step: 1 })
      ]),
      el('div', { class: 'field-row' }, [
        fieldNumber(uiLang === 'ar' ? 'الكمية المتاحة من الجائزة دي (اتركها فاضية = غير محدودة)' : 'Available quantity (blank = unlimited)', base + '.stock', { min: 0, step: 1 }),
        el('div', { class: 'field' }, [
          el('label', {}, [uiLang === 'ar' ? 'المتبقي حاليًا' : 'Remaining now']),
          el('div', { class: 'muted-sm' }, [stockRemainingText(seg)])
        ])
      ]),
      el('div', { class: 'section-title', style: 'margin-top:14px' }, [uiLang === 'ar' ? 'محتوى القسم داخل العجلة' : 'Segment content on the wheel']),
      fieldUpload(uiLang === 'ar' ? 'صورة داخل القسم (اختياري)' : 'Image inside segment (optional)', base + '.image.url', { rerenderTab: 'wheel', onUploaded: (url) => { if (!getPath(state.cfg, base + '.image')) setPath(state.cfg, base + '.image', { url, distancePct: 40, widthPct: 22 }); else setPath(state.cfg, base + '.image.url', url); TAB_RENDERERS.wheel(); } }),
      el('div', { class: 'field-row' }, [
        fieldText(uiLang === 'ar' ? 'رمز/إيموجي داخل القسم' : 'Icon/emoji inside segment', base + '.icon.value'),
        fieldNumber(uiLang === 'ar' ? 'حجم النص' : 'Text font size', base + '.text.fontSize', { min: 8, max: 40 }),
        fieldNumber(uiLang === 'ar' ? 'مسافة النص من المركز %' : 'Text distance from center %', base + '.text.distancePct', { min: 0, max: 95 })
      ]),
      fieldToggle(uiLang === 'ar' ? 'إظهار نص القسم' : 'Show segment label', base + '.text.showLabel')
    ]);
    return card;
  }

  function stockRemainingText(seg) {
    if (seg.stock === null || seg.stock === undefined || seg.stock === '') {
      return uiLang === 'ar' ? 'غير محدودة' : 'Unlimited';
    }
    const used = (state.campaign && state.campaign.stockUsed && state.campaign.stockUsed[seg.id]) || 0;
    const remaining = Math.max(0, Number(seg.stock) - used);
    return uiLang === 'ar' ? `${remaining} من ${seg.stock}` : `${remaining} of ${seg.stock}`;
  }

  function currentLangText(bilingual) {
    if (!bilingual) return '';
    return bilingual[uiLang] || bilingual.ar || bilingual.en || '';
  }

  function drawWheelPreview() {
    const canvas = document.getElementById('wheel-canvas');
    if (!canvas) return;
    const ctx = wheelCanvasCtx;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2, radius = W / 2 - (Number(state.cfg.wheel.borderWidth) || 0) - 4;
    ctx.clearRect(0, 0, W, H);
    const segments = state.cfg.wheel.segments || [];
    if (segments.length === 0) return;
    const anglePer = (Math.PI * 2) / segments.length;
    let start = -Math.PI / 2;

    segments.forEach((seg) => {
      const end = start + anglePer;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = seg.color || '#666';
      ctx.fill();

      const mid = (start + end) / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(mid);
      if (seg.text && seg.text.showLabel !== false) {
        const dist = ((seg.text.distancePct ?? 68) / 100) * radius;
        ctx.fillStyle = seg.text.color || seg.textColor || '#fff';
        ctx.font = `700 ${seg.text.fontSize || 14}px Cairo, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.translate(dist, 0);
        ctx.rotate(Math.PI / 2);
        const label = currentLangText(seg.label);
        wrapCanvasText(ctx, label, 0, 0, radius * 0.55, (seg.text.fontSize || 14) + 2);
      }
      ctx.restore();

      start = end;
    });

    // إطار العجلة
    const bw = Number(state.cfg.wheel.borderWidth) || 0;
    if (bw > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius + bw / 2, 0, Math.PI * 2);
      ctx.lineWidth = bw;
      ctx.strokeStyle = state.cfg.wheel.borderColor || '#fff';
      ctx.stroke();
    }
  }

  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
    if (!text) return;
    const words = text.split(' ');
    let line = '';
    const lines = [];
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    const offset = ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((l, i) => ctx.fillText(l, x, y - offset + i * lineHeight));
  }

  /* ============ تبويب: نتيجة اللفة (البوب أب) ============ */
  TAB_RENDERERS.popups = function () {
    const c = document.getElementById('tab-popups');
    c.innerHTML = '';
    c.appendChild(el('div', { class: 'section-title' }, [uiLang === 'ar' ? '🎉 بوب أب الربح' : '🎉 Win popup']));
    c.appendChild(el('div', { class: 'item-card' }, [
      fieldBilingual(uiLang === 'ar' ? 'العنوان' : 'Title', 'resultPopup.win.title'),
      fieldBilingual(uiLang === 'ar' ? 'العنوان الفرعي' : 'Subtitle', 'resultPopup.win.subtitle'),
      fieldBilingual(uiLang === 'ar' ? 'نص الزرار' : 'Button text', 'resultPopup.win.buttonText'),
      fieldToggle(uiLang === 'ar' ? 'إظهار احتفال (كونفيتي)' : 'Show confetti celebration', 'resultPopup.win.showConfetti'),
      fieldUpload(uiLang === 'ar' ? 'صورة/هدية داخل البوب أب (اختياري)' : 'Image inside popup (optional)', 'resultPopup.win.imageUrl', { rerenderTab: 'popups' })
    ]));
    c.appendChild(el('div', { class: 'section-title' }, [uiLang === 'ar' ? '🙁 بوب أب حظ أوفر المرة الجاية' : '🙁 Better luck next time popup']));
    c.appendChild(el('div', { class: 'item-card' }, [
      fieldBilingual(uiLang === 'ar' ? 'العنوان' : 'Title', 'resultPopup.lose.title'),
      fieldBilingual(uiLang === 'ar' ? 'العنوان الفرعي' : 'Subtitle', 'resultPopup.lose.subtitle'),
      fieldBilingual(uiLang === 'ar' ? 'نص الزرار' : 'Button text', 'resultPopup.lose.buttonText'),
      fieldToggle(uiLang === 'ar' ? 'إظهار احتفال (كونفيتي)' : 'Show confetti celebration', 'resultPopup.lose.showConfetti'),
      fieldUpload(uiLang === 'ar' ? 'صورة داخل البوب أب (اختياري)' : 'Image inside popup (optional)', 'resultPopup.lose.imageUrl', { rerenderTab: 'popups' })
    ]));
  };

  /* ============ تبويب: الصوت والتفاعل الصوتي ============ */
  TAB_RENDERERS.sound = function () {
    const c = document.getElementById('tab-sound');
    c.innerHTML = '';

    c.appendChild(el('div', { class: 'item-card' }, [
      fieldToggle(uiLang === 'ar' ? 'تفعيل كل الأصوات والتفاعل الصوتي في الكامبين ده' : 'Enable all sound & voice for this campaign', 'sound.enabled')
    ]));

    c.appendChild(el('div', { class: 'section-title' }, [uiLang === 'ar' ? '📢 رسالة الترحيب (تجذب الناس تيجي تلعب)' : '📢 Welcome message (attracts people to play)']));
    c.appendChild(el('p', { class: 'hint' }, [uiLang === 'ar'
      ? 'هتتقال بصوت (Text-to-Speech) بشكل دوري على شاشة المقدمة قبل ما حد يبدأ يلعب، عشان تلفت انتباه أي حد ماشي يقف يلعب. ملحوظة: المتصفح محتاج لمسة واحدة على الشاشة الأول عشان يسمح بتشغيل الصوت (قيد أمان من المتصفح نفسه)، وبعدها هيشتغل عادي طول الوقت.'
      : "Spoken (Text-to-Speech) periodically on the intro screen before anyone starts playing, to grab the attention of passersby. Note: the browser needs one tap on the screen first to allow audio (a browser security rule) — after that it keeps working normally."]));
    c.appendChild(el('div', { class: 'item-card' }, [
      fieldToggle(uiLang === 'ar' ? 'مفعّلة' : 'Enabled', 'sound.welcome.enabled'),
      fieldBilingual(uiLang === 'ar' ? 'نص الرسالة' : 'Message text', 'sound.welcome.message'),
      fieldNumber(uiLang === 'ar' ? 'تتكرر كل كام ثانية' : 'Repeat every (seconds)', 'sound.welcome.intervalSec', { min: 5, max: 300 }),
      el('button', { class: 'btn btn-sm btn-ghost', style: 'margin-top:8px', onclick: () => previewSpeak(getPath(state.cfg, 'sound.welcome.message.' + uiLang), uiLang) }, [uiLang === 'ar' ? '🔊 جرب الصوت' : '🔊 Preview'])
    ]));

    c.appendChild(el('div', { class: 'section-title' }, [uiLang === 'ar' ? '🗣️ نداء العميل بالاسم وقت النتيجة' : '🗣️ Announcing the customer by name at result time']));
    c.appendChild(el('p', { class: 'hint' }, [uiLang === 'ar'
      ? 'استخدم {name} مكان اسم العميل و{prize} مكان اسم الجائزة داخل النص.'
      : 'Use {name} for the customer name and {prize} for the prize name inside the text.']));
    c.appendChild(el('div', { class: 'item-card' }, [
      fieldToggle(uiLang === 'ar' ? 'مفعّلة' : 'Enabled', 'sound.resultAnnouncement.enabled'),
      el('div', { class: 'muted-sm', style: 'margin:10px 0 4px' }, [uiLang === 'ar' ? 'عند الربح:' : 'On winning:']),
      el('div', { class: 'field-row' }, [
        fieldText(uiLang === 'ar' ? 'النص (عربي)' : 'Text (Arabic)', 'sound.resultAnnouncement.win.ar'),
        fieldText(uiLang === 'ar' ? 'النص (English)' : 'Text (English)', 'sound.resultAnnouncement.win.en')
      ]),
      el('button', { class: 'btn btn-sm btn-ghost', onclick: () => previewSpeak((getPath(state.cfg, 'sound.resultAnnouncement.win.' + uiLang) || '').replace('{name}', uiLang === 'ar' ? 'أحمد' : 'Ahmed').replace('{prize}', uiLang === 'ar' ? 'خصم 10%' : '10% discount'), uiLang) }, [uiLang === 'ar' ? '🔊 جرب الصوت' : '🔊 Preview']),
      el('div', { class: 'muted-sm', style: 'margin:14px 0 4px' }, [uiLang === 'ar' ? 'عند حظ أوفر:' : 'On lose:']),
      el('div', { class: 'field-row' }, [
        fieldText(uiLang === 'ar' ? 'النص (عربي)' : 'Text (Arabic)', 'sound.resultAnnouncement.lose.ar'),
        fieldText(uiLang === 'ar' ? 'النص (English)' : 'Text (English)', 'sound.resultAnnouncement.lose.en')
      ]),
      el('button', { class: 'btn btn-sm btn-ghost', onclick: () => previewSpeak((getPath(state.cfg, 'sound.resultAnnouncement.lose.' + uiLang) || '').replace('{name}', uiLang === 'ar' ? 'أحمد' : 'Ahmed'), uiLang) }, [uiLang === 'ar' ? '🔊 جرب الصوت' : '🔊 Preview'])
    ]));

    c.appendChild(el('div', { class: 'section-title' }, [uiLang === 'ar' ? '🎵 صوت لفة العجلة' : '🎵 Wheel spin sound']));
    c.appendChild(el('p', { class: 'hint' }, [uiLang === 'ar'
      ? 'فيه صوت افتراضي جاهز (تكة عجلة الحظ) بيشتغل تلقائي أثناء اللفة من غير ما تعمل حاجة. تقدر ترفع صوت تاني بدلًا منه لو حابب.'
      : "There's a default wheel-tick sound that plays automatically during the spin. You can upload a different sound instead if you like."]));
    c.appendChild(el('div', { class: 'item-card' }, [
      fieldToggle(uiLang === 'ar' ? 'مفعّل' : 'Enabled', 'sound.spinSound.enabled'),
      fieldAudioUpload(uiLang === 'ar' ? 'صوت مخصص (اختياري)' : 'Custom sound (optional)', 'sound.spinSound.url', { rerenderTab: 'sound' })
    ]));

    c.appendChild(el('div', { class: 'section-title' }, [uiLang === 'ar' ? '🎉 صوت الاحتفال بالربح' : '🎉 Win celebration sound']));
    c.appendChild(el('p', { class: 'hint' }, [uiLang === 'ar'
      ? 'فيه صوت احتفال افتراضي بيشتغل تلقائي وقت ما العميل يكسب جائزة. تقدر ترفع صوت تاني بدلًا منه.'
      : "There's a default celebration sound that plays automatically when the customer wins a prize. You can upload a different sound instead."]));
    c.appendChild(el('div', { class: 'item-card' }, [
      fieldToggle(uiLang === 'ar' ? 'مفعّل' : 'Enabled', 'sound.winSound.enabled'),
      fieldAudioUpload(uiLang === 'ar' ? 'صوت مخصص (اختياري)' : 'Custom sound (optional)', 'sound.winSound.url', { rerenderTab: 'sound' })
    ]));
  };

  /* ============ تبويب: ربط جوجل شيت ============ */
  const APPS_SCRIPT_CODE = `function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['التاريخ والوقت','اسم الكامبين','الاسم','رقم التليفون','المنصب','الإيميل','الاهتمامات','بيانات إضافية','النتيجة','نوع النتيجة']);
  }
  sheet.appendRow([
    data.createdAt || new Date(),
    data.campaignName || '',
    data.name || '',
    data.phone || '',
    data.position || '',
    data.email || '',
    (data.interests || []).join('، '),
    data.customFieldsText || '',
    data.resultLabel || '',
    data.resultType === 'win' ? 'ربح' : 'حظ أوفر'
  ]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}`;

  TAB_RENDERERS.integrations = function () {
    const c = document.getElementById('tab-integrations');
    c.innerHTML = '';
    c.appendChild(el('div', { class: 'section-title' }, [uiLang === 'ar' ? '📊 مزامنة فورية مع Google Sheet' : '📊 Real-time Google Sheet sync']));
    c.appendChild(el('p', { class: 'hint' }, [uiLang === 'ar'
      ? 'كل مرة عميل يلعب وياخد نتيجة، بياناته هتتسجل فورًا في الشيت اللي تحدده هنا - مفيد عشان فريق استلام الهدايا يتأكد من بيانات العميل لحظيًا.'
      : "Every time a customer plays and gets a result, their data is instantly logged to the sheet you set here - useful for the prize desk to verify a customer's details in real time."]));

    c.appendChild(el('div', { class: 'item-card' }, [
      el('div', { class: 'item-title' }, [uiLang === 'ar' ? 'خطوات الإعداد (مرة واحدة فقط)' : 'Setup steps (one-time only)']),
      el('ol', { style: 'margin:8px 0 0;padding-inline-start:20px;line-height:1.9;font-size:13.5px;opacity:.9' }, [
        el('li', {}, [uiLang === 'ar' ? 'افتح Google Sheets واعمل شيت جديد.' : 'Open Google Sheets and create a new sheet.']),
        el('li', {}, [uiLang === 'ar' ? 'من قايمة Extensions اختار Apps Script.' : 'From the Extensions menu choose Apps Script.']),
        el('li', {}, [uiLang === 'ar' ? 'امسح الكود الموجود وحط الكود ده بدل منه:' : 'Delete the existing code and paste this code instead:']),
        el('li', {}, [uiLang === 'ar' ? 'من زرار Deploy الأزرق ← New deployment ← اختار النوع Web app.' : "Click the blue Deploy button → New deployment → select type Web app."]),
        el('li', {}, [uiLang === 'ar' ? 'في "Who has access" اختار Anyone، وبعدين اضغط Deploy ووافق على الصلاحيات.' : 'Set "Who has access" to Anyone, then click Deploy and authorize it.']),
        el('li', {}, [uiLang === 'ar' ? 'انسخ الرابط (Web app URL) اللي هيظهرلك، وحطه في الخانة تحت وسيب اللعبة تعمل الباقي.' : 'Copy the Web app URL it gives you and paste it in the field below - the game handles the rest.'])
      ]),
      el('pre', { style: 'background:#0b0d1a;border:1px solid var(--border);border-radius:10px;padding:12px;font-size:12px;overflow-x:auto;direction:ltr;text-align:left;margin-top:12px' }, [APPS_SCRIPT_CODE]),
      el('button', { class: 'btn btn-sm btn-ghost', style: 'margin-top:8px', onclick: () => { navigator.clipboard.writeText(APPS_SCRIPT_CODE); toast(uiLang === 'ar' ? 'تم نسخ الكود' : 'Code copied', 'success'); } }, [uiLang === 'ar' ? '📋 نسخ الكود' : '📋 Copy code'])
    ]));

    c.appendChild(el('div', { class: 'item-card' }, [
      fieldText(uiLang === 'ar' ? 'رابط Web App' : 'Web App URL', 'integrations.googleSheetWebhookUrl', { type: 'url' }),
      el('p', { class: 'hint' }, [uiLang === 'ar' ? 'سيبه فاضي لو مش عايز المزامنة دي دلوقتي.' : "Leave it empty if you don't want this sync right now."])
    ]));
  };

  /* ============ تبويب: بيانات العملاء ============ */
  TAB_RENDERERS.leads = function () {
    const c = document.getElementById('tab-leads');
    c.innerHTML = '';
    const header = el('div', { class: 'panel-header', style: 'margin-bottom:14px' }, [
      el('div', { class: 'muted-sm' }, [uiLang === 'ar' ? 'كل العملاء اللي لعبوا الكامبين ده' : 'All customers who played this campaign']),
      el('div', {}, [
        el('button', { class: 'btn btn-sm btn-ghost', onclick: () => { state.cfg.__resetRequested = true; confirmModal(uiLang === 'ar' ? 'هل تريد تصفير عداد اللفات وضمانات الجوائز وكميات المخزون لهذا الكامبين؟' : 'Reset spin counter, guaranteed-prize progress and stock quantities for this campaign?', async () => { await api('/campaigns/' + state.campaign.id + '/reset-stats', { method: 'POST' }); state.campaign.stockUsed = {}; toast(uiLang === 'ar' ? 'تم التصفير' : 'Reset done', 'success'); }); } }, [uiLang === 'ar' ? '↺ تصفير عداد اللفات' : '↺ Reset spin counter']),
        el('button', { class: 'btn btn-sm btn-primary', onclick: () => { window.location.href = '/api/campaigns/' + state.campaign.id + '/leads/export'; } }, [uiLang === 'ar' ? '⬇ تصدير إكسل' : '⬇ Export Excel'])
      ])
    ]);
    c.appendChild(header);
    const tableWrap = el('div', { style: 'overflow-x:auto' });
    tableWrap.appendChild(el('p', { class: 'muted' }, [uiLang === 'ar' ? 'جاري التحميل...' : 'Loading...']));
    c.appendChild(tableWrap);

    api('/campaigns/' + state.campaign.id + '/leads').then((data) => {
      tableWrap.innerHTML = '';
      if (data.leads.length === 0) {
        tableWrap.appendChild(el('p', { class: 'muted' }, [uiLang === 'ar' ? 'لا يوجد عملاء بعد.' : 'No customers yet.']));
        return;
      }
      const table = el('table', { class: 'data-table' });
      const thead = el('thead', {}, [el('tr', {}, [
        el('th', {}, [uiLang === 'ar' ? 'الاسم' : 'Name']),
        el('th', {}, [uiLang === 'ar' ? 'التليفون' : 'Phone']),
        el('th', {}, [uiLang === 'ar' ? 'المنصب' : 'Position']),
        el('th', {}, [uiLang === 'ar' ? 'الإيميل' : 'Email']),
        el('th', {}, [uiLang === 'ar' ? 'الاهتمامات' : 'Interests']),
        el('th', {}, [uiLang === 'ar' ? 'بيانات إضافية' : 'Extra info']),
        el('th', {}, [uiLang === 'ar' ? 'النتيجة' : 'Result']),
        el('th', {}, [uiLang === 'ar' ? 'التاريخ' : 'Date']),
        el('th', {}, [''])
      ])]);
      const tbody = el('tbody');
      const customFieldsDefs = state.cfg.form.customFields || [];
      data.leads.forEach((l) => {
        let interests = [];
        try { interests = JSON.parse(l.interests || '[]'); } catch (e) {}
        let customValues = {};
        try { customValues = JSON.parse(l.custom_fields || '{}'); } catch (e) {}
        const customText = customFieldsDefs
          .filter((def) => customValues[def.id])
          .map((def) => `${(def.label && (def.label[uiLang] || def.label.ar)) || def.id}: ${customValues[def.id]}`)
          .join('، ');
        tbody.appendChild(el('tr', {}, [
          el('td', {}, [l.name]),
          el('td', {}, [l.phone]),
          el('td', {}, [l.position || '-']),
          el('td', {}, [l.email || '-']),
          el('td', {}, [Array.isArray(interests) ? interests.join('، ') : '-']),
          el('td', {}, [customText || '-']),
          el('td', {}, [l.result_label || '-']),
          el('td', {}, [new Date(l.created_at).toLocaleString(uiLang === 'ar' ? 'ar-EG' : 'en-US')]),
          el('td', {}, [el('button', { class: 'icon-btn', onclick: async () => { await api('/campaigns/' + state.campaign.id + '/leads/' + l.id, { method: 'DELETE' }); TAB_RENDERERS.leads(); } }, [uiLang === 'ar' ? 'حذف' : 'Del'])])
        ]));
      });
      table.appendChild(thead);
      table.appendChild(tbody);
      tableWrap.appendChild(table);
    });
  };

  /* ============ التشغيل ============ */
  async function init() {
    applyI18n();
    try {
      await api('/auth/me');
      showAuthed(true);
      await loadDashboard();
    } catch (e) {
      showAuthed(false);
    }
  }
  init();
})();
