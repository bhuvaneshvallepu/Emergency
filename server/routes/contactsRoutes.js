import express from 'express';
import { demoStore } from '../data/store.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const contacts = demoStore.contacts.filter((contact) => contact.userId === req.user.id);
  return res.json({ contacts });
});

router.post('/', (req, res) => {
  const { name, phone, email, priority, notificationPreference } = req.body || {};

  if (!name || !phone) {
    return res.status(400).json({ message: 'Name and phone are required.' });
  }

  const contact = {
    id: `contact-${Date.now()}`,
    userId: req.user.id,
    name,
    phone,
    email: email || '',
    priority: priority || 99,
    verified: true,
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

  Object.assign(contact, req.body);
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
