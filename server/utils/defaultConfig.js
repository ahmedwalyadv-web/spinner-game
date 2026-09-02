// الإعدادات الافتراضية لأي كامبين جديد - كل حاجة فيها قابلة للتعديل من الداشبورد
function defaultCampaignConfig(name) {
  return {
    meta: {
      name: name || 'كامبين جديد',
      language: 'both', // 'ar' | 'en' | 'both' -> both يظهر زرار تبديل لغة للاعب
      defaultLanguage: 'ar'
    },
    theme: {
      backgroundColor: '#0f1223',
      backgroundImage: '',
      primaryColor: '#ffb703',
      secondaryColor: '#ff477e',
      textColor: '#ffffff',
      buttonTextColor: '#0f1223',
      cardColor: '#1c1f3a',
      fontFamily: 'Cairo, Tajawal, sans-serif'
    },
    intro: {
      mediaType: 'image', // 'image' | 'video'
      mediaUrl: '',
      overlayOpacity: 0.35,
      title: { ar: 'مرحبًا بيك!', en: 'Welcome!' },
      subtitle: { ar: 'دور العجلة واكسب هديتك دلوقتي', en: 'Spin the wheel and win your gift now' },
      startButtonText: { ar: 'ابدأ الآن', en: 'Start Now' }
    },
    logos: [
      // { id, url, xPct, yPct, widthPct, animation:'none'|'fade'|'bounce'|'float'|'pulse', delayMs, screen:'all'|'intro'|'form'|'wheel'|'result' }
    ],
    form: {
      title: { ar: 'بياناتك', en: 'Your Info' },
      subtitle: { ar: 'من فضلك أدخل بياناتك عشان تقدر تلف العجلة', en: 'Please enter your details to spin the wheel' },
      fields: {
        name: { enabled: true, required: true, label: { ar: 'الاسم', en: 'Name' } },
        phone: { enabled: true, required: true, label: { ar: 'رقم التليفون', en: 'Phone Number' } },
        position: { enabled: true, required: false, label: { ar: 'المنصب', en: 'Job Title' } },
        email: { enabled: true, required: false, label: { ar: 'البريد الإلكتروني', en: 'Email' } },
        interests: { enabled: true, required: false, label: { ar: 'الاهتمامات', en: 'Interests' }, multiSelect: true }
      },
      interestsList: [
        // linkedSegmentId: لو محدد، اللي يختار الاهتمام ده يتضمنله (لو الكمية متاحة) قسم الجائزة المرتبط بيه
        { id: 'i1', ar: 'تكنولوجيا', en: 'Technology', linkedSegmentId: null },
        { id: 'i2', ar: 'موضة', en: 'Fashion', linkedSegmentId: null },
        { id: 'i3', ar: 'رياضة', en: 'Sports', linkedSegmentId: null },
        { id: 'i4', ar: 'سفر', en: 'Travel', linkedSegmentId: null }
      ],
      // حقول حرة إضافية يضيفها الأدمن بنفسه (نص أو قائمة اختيار)
      customFields: [
        // { id, type:'text'|'select', label:{ar,en}, required:boolean, options:[{id,ar,en}] }
      ],
      submitButtonText: { ar: 'دور العجلة', en: 'Spin the Wheel' },
      duplicatePhoneMessage: { ar: 'لقد شاركت من قبل، شكرًا لمشاركتك 🙏', en: "You've already participated, thanks for playing 🙏" }
    },
    integrations: {
      // رابط Google Apps Script Web App - لو موجود، كل عملية لعب بتتسجل فورًا في Google Sheet المربوط بيه
      googleSheetWebhookUrl: ''
    },
    wheel: {
      sizePct: 90,
      spinDurationMs: 4500,
      spinExtraTurns: 6,
      borderColor: '#ffffff',
      borderWidth: 8,
      centerImage: '',
      pointerColor: '#ffb703',
      segments: [
        seg('s1', 'خصم 10%', 'Discount 10%', '#ff477e', 'win', 20, null, null),
        seg('s2', 'حظ أوفر المرة الجاية', 'Better Luck Next Time', '#3a3f66', 'lose', 40, null, null),
        seg('s3', 'هدية مفاجأة', 'Surprise Gift', '#ffb703', 'win', 15, 10, null),
        seg('s4', 'كوبون شحن', 'Voucher', '#06d6a0', 'win', 15, null, null),
        seg('s5', 'حظ أوفر المرة الجاية', 'Better Luck Next Time', '#3a3f66', 'lose', 5, null, null),
        seg('s6', 'الجائزة الكبرى', 'Grand Prize', '#118ab2', 'win', 5, 25, null)
      ]
    },
    resultPopup: {
      win: {
        title: { ar: 'مبروك! 🎉', en: 'Congratulations! 🎉' },
        subtitle: { ar: 'كسبت:', en: 'You won:' },
        showConfetti: true,
        imageUrl: '',
        buttonText: { ar: 'تمام', en: 'Done' }
      },
      lose: {
        title: { ar: 'حظ أوفر المرة الجاية', en: 'Better Luck Next Time' },
        subtitle: { ar: 'شكرًا لمشاركتك', en: 'Thanks for playing' },
        showConfetti: false,
        imageUrl: '',
        buttonText: { ar: 'تمام', en: 'Done' }
      }
    }
  };
}

function seg(id, ar, en, color, type, weight, guaranteedEvery, stock) {
  return {
    id,
    label: { ar, en },
    color,
    textColor: '#ffffff',
    type, // 'win' | 'lose'
    weight, // نسبة الظهور العشوائية (النسب بتتطبع تلقائيًا لمجموع 100)
    guaranteedEvery: guaranteedEvery || null, // لو موجودة: القسم ده مضمون كل N لفة
    stock: stock || null, // لو موجودة: الكمية الكلية المتاحة من الجائزة دي (null = غير محدودة)
    // المسافة والحجم بيتحسبوا نسبة لمركز العجلة عشان يتناسبوا مع شكل القطاع الدائري
    image: null, // { url, distancePct, widthPct }
    icon: null, // { value, distancePct, sizePct }  value ممكن يكون إيموجي أو رمز نصي
    text: { distancePct: 68, fontSize: 14, color: '#ffffff', showLabel: true }
  };
}

module.exports = { defaultCampaignConfig };
