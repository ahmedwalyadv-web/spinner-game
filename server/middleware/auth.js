const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-please-1234567890';

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) return res.status(401).json({ error: 'غير مصرح، من فضلك سجل دخول' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.admin = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'الجلسة انتهت، من فضلك سجل دخول تاني' });
  }
}

module.exports = { requireAuth, JWT_SECRET };
