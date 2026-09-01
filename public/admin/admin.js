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
      'tab.form': 'بيانات العميل', 'tab.wheel': 'عجلة الحظ', 'tab.popups': 'نتيجة اللفة', 'tab.leads': 'بيانات العملاء'
    },
    en: {
      'login.title': 'Admin Dashboard Login', 'login.subtitle': 'Spinner Game - Campaign Management',
      'login.username': 'Username', 'login.password': 'Password', 'login.submit': 'Log in',
      'app.title': 'Spinner Admin', 'nav.dashboard': 'Campaigns', 'nav.password': 'Password', 'nav.logout': 'Logout',
      'dash.title': 'Campaigns', 'dash.new': '+ New Campaign',
      'editor.back': 'Back to campaigns', 'editor.preview': '👁 Preview Game', 'editor.save': '💾 Save',
      'editor.link': "Client's game link:", 'editor.copy': 'Copy', 'editor.active': 'Active',
      'tab.theme': 'Branding & Colors', 'tab.logos': 'Logos', 'tab.intro': 'Intro Screen',
      'tab.form': 'Customer Info', 'tab.wheel': 'Lucky Wheel', 'tab.popups': 'Spin Result', 'tab.leads': 'Customer Data'
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
    state.campaign = { id: data.id, slug: data.slug, name: data.name, isActive: data.isActive };
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
        ])
      ]));
    });
    c.appendChild(list);
    c.appendChild(el('button', { class: 'add-btn', onclick: () => {
      state.cfg.form.interestsList.push({ id: uid('int'), ar: '', en: '' });
      TAB_RENDERERS.form();
    } }, ['+ ' + (uiLang === 'ar' ? 'إضافة اهتمام' : 'Add interest')]));
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
        type: 'win', weight: 10, guaranteedEvery: null, image: null, icon: null,
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

  /* ============ تبويب: بيانات العملاء ============ */
  TAB_RENDERERS.leads = function () {
    const c = document.getElementById('tab-leads');
    c.innerHTML = '';
    const header = el('div', { class: 'panel-header', style: 'margin-bottom:14px' }, [
      el('div', { class: 'muted-sm' }, [uiLang === 'ar' ? 'كل العملاء اللي لعبوا الكامبين ده' : 'All customers who played this campaign']),
      el('div', {}, [
        el('button', { class: 'btn btn-sm btn-ghost', onclick: () => { state.cfg.__resetRequested = true; confirmModal(uiLang === 'ar' ? 'هل تريد تصفير عداد اللفات وضمانات الجوائز لهذا الكامبين؟' : 'Reset spin counter and guaranteed-prize progress for this campaign?', async () => { await api('/campaigns/' + state.campaign.id + '/reset-stats', { method: 'POST' }); toast(uiLang === 'ar' ? 'تم التصفير' : 'Reset done', 'success'); }); } }, [uiLang === 'ar' ? '↺ تصفير عداد اللفات' : '↺ Reset spin counter']),
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
        el('th', {}, [uiLang === 'ar' ? 'النتيجة' : 'Result']),
        el('th', {}, [uiLang === 'ar' ? 'التاريخ' : 'Date']),
        el('th', {}, [''])
      ])]);
      const tbody = el('tbody');
      data.leads.forEach((l) => {
        let interests = [];
        try { interests = JSON.parse(l.interests || '[]'); } catch (e) {}
        tbody.appendChild(el('tr', {}, [
          el('td', {}, [l.name]),
          el('td', {}, [l.phone]),
          el('td', {}, [l.position || '-']),
          el('td', {}, [l.email || '-']),
          el('td', {}, [Array.isArray(interests) ? interests.join('، ') : '-']),
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
