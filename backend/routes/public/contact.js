import express from 'express';

const router = express.Router();

const INQUIRY_TYPES = new Set(['general', 'demo', 'partnership', 'support', 'press']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

router.post('/', (req, res) => {
  const firstName = cleanText(req.body?.firstName, 80);
  const lastName = cleanText(req.body?.lastName, 80);
  const email = cleanText(req.body?.email, 160).toLowerCase();
  const phone = cleanText(req.body?.phone, 40);
  const organization = cleanText(req.body?.organization, 160);
  const inquiryType = cleanText(req.body?.inquiryType, 40);
  const subject = cleanText(req.body?.subject, 200);
  const message = cleanText(req.body?.message, 2000);

  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'First and last name are required' });
  }
  if (!email || !EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }
  if (!INQUIRY_TYPES.has(inquiryType)) {
    return res.status(400).json({ error: 'Invalid inquiry type' });
  }
  if (!subject || subject.length < 3) {
    return res.status(400).json({ error: 'Subject must be at least 3 characters' });
  }
  if (!message || message.length < 20) {
    return res.status(400).json({ error: 'Message must be at least 20 characters' });
  }

  const payload = {
    firstName,
    lastName,
    email,
    phone: phone || null,
    organization: organization || null,
    inquiryType,
    subject,
    message,
    receivedAt: new Date().toISOString(),
  };

  console.info('[contact] New inquiry received:', payload);

  return res.json({
    success: true,
    message: 'Thanks for reaching out. We will respond within one business day.',
  });
});

export default router;
