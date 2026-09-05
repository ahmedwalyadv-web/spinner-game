// نطق نصوص بصوت طبيعي عن طريق خدمة Google Cloud Text-to-Speech (بديل خارجي أعلى جودة من صوت المتصفح)
// شغال بس لو متغير البيئة GOOGLE_TTS_API_KEY متعرّف على السيرفر - لو مش متعرّف بيرجع 501
// عشان الواجهة (play/sound.js و admin/admin.js) ترجع تلقائيًا لصوت المتصفح المجاني بدل ما تفشل
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// لو معرّف متغير بيئة DATA_DIR (مسار قرص دائم على الاستضافة) بنخزن ملفات الصوت المولّدة جواه عشان تفضل موجودة
// بين عمليات النشر، وإلا بنستخدم مجلد محلي جوه public - نفس الأسلوب المتبع في server/routes/upload.js
const CACHE_DIR = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'tts-cache')
  : path.join(__dirname, '..', '..', 'public', 'tts-cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// الصوت الافتراضي لو الأدمن ماختارش صوت معين من قايمة تبويب "الصوت والتفاعل"
const DEFAULT_VOICE = {
  ar: 'ar-XA-Chirp3-HD-Puck',
  en: 'en-US-Chirp3-HD-Puck'
};

// أي اسم صوت جاي من الأدمن (querystring) لازم يتطابق مع الشكل ده بالظبط عشان نقبله - حماية من إساءة الاستخدام
// وفي نفس الوقت بيسمح بكل أصوات Chirp3 HD (أعلى جودة) وWaveNet وStandard المتاحة لـ ar-XA وen-US من غير
// ما نحتاج نسرد كل الأسماء الـ30 يدويًا واحد واحد
const VOICE_NAME_PATTERN = /^(ar-XA|en-US)-(Chirp3-HD-[A-Za-z]{3,20}|Wavenet-[A-D]|Standard-[A-D])$/;

const MAX_TEXT_LENGTH = 400; // حماية بسيطة من إساءة الاستخدام وتكلفة زيادة

function resolveVoiceName(requested, lang) {
  if (requested && VOICE_NAME_PATTERN.test(requested)) return requested;
  return DEFAULT_VOICE[lang];
}

function languageCodeFromVoiceName(voiceName) {
  return voiceName.startsWith('ar-XA') ? 'ar-XA' : 'en-US';
}

function cacheKeyFor(text, voiceName) {
  return crypto.createHash('sha1').update(voiceName + '::' + text).digest('hex');
}

router.get('/', async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    if (!apiKey) {
      return res.status(501).json({ error: 'tts_not_configured' });
    }

    const rawText = (req.query.text || '').toString().trim();
    const lang = req.query.lang === 'en' ? 'en' : 'ar';
    if (!rawText) return res.status(400).json({ error: 'text_required' });
    const text = rawText.slice(0, MAX_TEXT_LENGTH);
    const voiceName = resolveVoiceName((req.query.voice || '').toString(), lang);

    const key = cacheKeyFor(text, voiceName);
    const filePath = path.join(CACHE_DIR, key + '.mp3');

    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return fs.createReadStream(filePath).pipe(res);
    }

    const googleRes = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: languageCodeFromVoiceName(voiceName), name: voiceName },
          audioConfig: { audioEncoding: 'MP3' }
        })
      }
    );

    // بنقرأ الرد كنص أول حاجة عشان لو جوجل رجّعت حاجة مش JSON (مثلاً خطأ شبكة/بروكسي) منكسرش بـ exception غير متوقع
    const rawBody = await googleRes.text();
    let data;
    try {
      data = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error('[TTS] Google API returned non-JSON response:', googleRes.status, rawBody.slice(0, 300));
      return res.status(502).json({ error: 'tts_upstream_unreachable' });
    }
    if (!googleRes.ok || !data.audioContent) {
      console.error('[TTS] Google API error:', googleRes.status, data && data.error);
      return res.status(502).json({
        error: 'tts_upstream_failed',
        detail: (data && data.error && data.error.message) || null
      });
    }

    const audioBuffer = Buffer.from(data.audioContent, 'base64');
    // بنخزن نسخة على القرص عشان أي طلب تاني بنفس النص واللغة (زي رسالة الترحيب المتكررة) ميتحسبش عليه تكلفة تانية
    fs.writeFile(filePath, audioBuffer, (err) => {
      if (err) console.error('[TTS] cache write failed:', err.message);
    });

    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(audioBuffer);
  } catch (e) {
    console.error('[TTS] server error:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
