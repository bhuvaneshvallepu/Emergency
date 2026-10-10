import express from 'express';
import { demoStore } from '../data/store.js';
import { authenticate } from '../middleware/auth.js';
import { isValidE164 } from '../services/smsProvider.js';

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const contacts = demoStore.contacts.filter((contact) => contact.userId === req.user.id);
  return res.json({ contacts });
});

router.post('/', (req, res) => {
  const { name, phone, email, priority, notificationPreference, smsConsent = false } = req.body || {};

  if (typeof name !== 'string' || !name.trim() || typeof phone !== 'string' || !phone.trim()) {
    return res.status(400).json({ message: 'Name and phone are required.' });
  }
  if (notificationPreference && !['sms', 'email', 'push'].includes(notificationPreference)) {
    return res.status(400).json({ message: 'Notification preference must be sms, email, or push.' });
  }
  if ((notificationPreference || 'sms') === 'sms' && !isValidE164(phone.trim())) {
    return res.status(400).json({ message: 'SMS contact phone numbers must use international E.164 format, for example +14155552671.' });
  }
  if (typeof smsConsent !== 'boolean') {
    return res.status(400).json({ message: 'SMS consent must be a boolean value.' });
  }

  const contact = {
    id: `contact-${Date.now()}`,
    userId: req.user.id,
    name: name.trim(),
    phone: phone.trim(),
    email: typeof email === 'string' ? email.trim() : '',
    priority: Number.isInteger(priority) && priority > 0 ? priority : 99,
    verified: false,
    smsConsent,
    notificationPreference: notificationPreference || 'sms',
  };

  demoStore.contacts.push(contact);
  return res.status(201).json({ contact });
});

router.patch('/:id', (req, res) => {
  const contact = demoStore.contacts.find((item) => item.id === req.params.id && item.userId === req.user.id);

  if (!contact) {
    return res.status(404).json({ message: 'Contact not found.' });
  }

  const updates = req.body || {};
  const allowedFields = ['name', 'phone', 'email', 'priority', 'notificationPreference', 'smsConsent'];
  if (Object.hasOwn(updates, 'name') && (typeof updates.name !== 'string' || !updates.name.trim())) {
    return res.status(400).json({ message: 'Name is required.' });
  }
  if (Object.hasOwn(updates, 'phone') && (typeof updates.phone !== 'string' || !updates.phone.trim())) {
    return res.status(400).json({ message: 'Phone is required.' });
  }
  const preference = updates.notificationPreference ?? contact.notificationPreference;
  const phone = updates.phone ?? contact.phone;
  if (!['sms', 'email', 'push'].includes(preference)) {
    return res.status(400).json({ message: 'Notification preference must be sms, email, or push.' });
  }
  if (preference === 'sms' && !isValidE164(phone.trim())) {
    return res.status(400).json({ message: 'SMS contact phone numbers must use international E.164 format, for example +14155552671.' });
  }
  if (Object.hasOwn(updates, 'smsConsent') && typeof updates.smsConsent !== 'boolean') {
    return res.status(400).json({ message: 'SMS consent must be a boolean value.' });
  }
  for (const field of allowedFields) {
    if (!Object.hasOwn(updates, field)) continue;
    contact[field] = ['name', 'phone', 'email'].includes(field) && typeof updates[field] === 'string'
      ? updates[field].trim()
      : updates[field];
  }
  return res.json({ contact });
});

router.delete('/:id', (req, res) => {
  const index = demoStore.contacts.findIndex((item) => item.id === req.params.id && item.userId === req.user.id);

  if (index === -1) {
    return res.status(404).json({ message: 'Contact not found.' });
  }

  demoStore.contacts.splice(index, 1);
  return res.json({ message: 'Contact deleted.' });
});

export default router;
