import express from 'express';
import { randomUUID } from 'node:crypto';
import TrustedContact from '../models/TrustedContact.js';
import { demoStore } from '../data/store.js';
import { authenticate } from '../middleware/auth.js';
import { isDemoMode, handlePersistenceError, isObjectId } from '../config/persistence.js';
import { isValidE164 } from '../services/smsProvider.js';

const router = express.Router();
const preferences = ['sms', 'email', 'push'];
router.use(authenticate);

function serializeContact(contact) {
  if (isDemoMode()) return contact;
  if (typeof contact.toJSON === 'function') return contact.toJSON();
  return { ...contact, id: String(contact._id), userId: String(contact.userId) };
}

router.get('/', async (req, res) => {
  try {
    const contacts = isDemoMode()
      ? demoStore.contacts.filter((contact) => contact.userId === req.user.id)
      : await TrustedContact.find({ userId: req.user.id }).sort({ priority: 1 });
    return res.json({ contacts: contacts.map(serializeContact) });
  } catch (error) {
    return handlePersistenceError(res, error, 'Trusted contact lookup');
  }
});

router.post('/', async (req, res) => {
  const { name, phone, email, priority, notificationPreference, smsConsent = false } = req.body || {};

  if (typeof name !== 'string' || !name.trim() || typeof phone !== 'string' || !phone.trim()) {
    return res.status(400).json({ message: 'Name and phone are required.' });
  }
  if (notificationPreference && !preferences.includes(notificationPreference)) {
    return res.status(400).json({ message: 'Notification preference must be sms, email, or push.' });
  }
  if ((notificationPreference || 'sms') === 'sms' && !isValidE164(phone.trim())) {
    return res.status(400).json({ message: 'SMS contact phone numbers must use international E.164 format, for example +14155552671.' });
  }
  if (typeof smsConsent !== 'boolean') {
    return res.status(400).json({ message: 'SMS consent must be a boolean value.' });
  }

  const contactData = {
    userId: req.user.id,
    name: name.trim(),
    phone: phone.trim(),
    email: typeof email === 'string' ? email.trim() : '',
    priority: Number.isInteger(priority) && priority > 0 ? priority : 99,
    verified: false,
    smsConsent,
    notificationPreference: notificationPreference || 'sms',
  };
  try {
    if (isDemoMode()) {
      const contact = { id: `contact-${randomUUID()}`, ...contactData };
      demoStore.contacts.push(contact);
      return res.status(201).json({ contact });
    }
    const contact = await TrustedContact.create(contactData);
    return res.status(201).json({ contact: serializeContact(contact) });
  } catch (error) {
    return handlePersistenceError(res, error, 'Trusted contact creation');
  }
});

router.patch('/:id', async (req, res) => {
  const updates = req.body || {};
  const allowedFields = ['name', 'phone', 'email', 'priority', 'notificationPreference', 'smsConsent'];
  if (Object.keys(updates).some((field) => !allowedFields.includes(field))) {
    return res.status(400).json({ message: 'One or more contact fields cannot be updated.' });
  }
  if (Object.hasOwn(updates, 'name') && (typeof updates.name !== 'string' || !updates.name.trim())) {
    return res.status(400).json({ message: 'Name is required.' });
  }
  if (Object.hasOwn(updates, 'phone') && (typeof updates.phone !== 'string' || !updates.phone.trim())) {
    return res.status(400).json({ message: 'Phone is required.' });
  }

  try {
    const contact = isDemoMode()
      ? demoStore.contacts.find((item) => item.id === req.params.id && item.userId === req.user.id)
      : isObjectId(req.params.id)
        ? await TrustedContact.findOne({ _id: req.params.id, userId: req.user.id })
        : null;
    if (!contact) return res.status(404).json({ message: 'Contact not found.' });

    const preference = updates.notificationPreference ?? contact.notificationPreference;
    const phone = updates.phone ?? contact.phone;
    if (!preferences.includes(preference)) {
      return res.status(400).json({ message: 'Notification preference must be sms, email, or push.' });
    }
    if (preference === 'sms' && !isValidE164(phone.trim())) {
      return res.status(400).json({ message: 'SMS contact phone numbers must use international E.164 format, for example +14155552671.' });
    }
    if (Object.hasOwn(updates, 'smsConsent') && typeof updates.smsConsent !== 'boolean') {
      return res.status(400).json({ message: 'SMS consent must be a boolean value.' });
    }
    if (Object.hasOwn(updates, 'priority') && (!Number.isInteger(updates.priority) || updates.priority < 1)) {
      return res.status(400).json({ message: 'Priority must be a positive integer.' });
    }
    for (const field of allowedFields) {
      if (!Object.hasOwn(updates, field)) continue;
      contact[field] = ['name', 'phone', 'email'].includes(field) && typeof updates[field] === 'string'
        ? updates[field].trim()
        : updates[field];
    }
    if (!isDemoMode()) await contact.save();
    return res.json({ contact: serializeContact(contact) });
  } catch (error) {
    return handlePersistenceError(res, error, 'Trusted contact update');
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (isDemoMode()) {
      const index = demoStore.contacts.findIndex((item) => item.id === req.params.id && item.userId === req.user.id);
      if (index === -1) return res.status(404).json({ message: 'Contact not found.' });
      demoStore.contacts.splice(index, 1);
      return res.json({ message: 'Contact deleted.' });
    }
    if (!isObjectId(req.params.id)) return res.status(404).json({ message: 'Contact not found.' });
    const result = await TrustedContact.deleteOne({ _id: req.params.id, userId: req.user.id });
    if (!result.deletedCount) return res.status(404).json({ message: 'Contact not found.' });
    return res.json({ message: 'Contact deleted.' });
  } catch (error) {
    return handlePersistenceError(res, error, 'Trusted contact deletion');
  }
});

export default router;
