import express from 'express';
import { updateAlertFromTwilio } from '../services/notificationService.js';
import { validateTwilioRequest } from '../services/smsProvider.js';

const router = express.Router();

router.post('/twilio/sms-status', async (req, res) => {
  const callbackUrl = process.env.SMS_STATUS_CALLBACK_URL;
  const signature = req.get('X-Twilio-Signature');
  if (!callbackUrl || !signature || !req.body || typeof req.body !== 'object') {
    return res.status(403).json({ message: 'Invalid callback signature.' });
  }

  let validSignature = false;
  try {
    validSignature = validateTwilioRequest(signature, callbackUrl, req.body);
  } catch {
    validSignature = false;
  }
  if (!validSignature) return res.status(403).json({ message: 'Invalid callback signature.' });

  const messageSid = req.body.MessageSid || req.body.SmsSid;
  const status = String(req.body.MessageStatus || req.body.SmsStatus || '').toLowerCase();
  try {
    const result = await updateAlertFromTwilio({
      messageSid,
      status,
      errorCode: req.body.ErrorCode || null,
    });
    if (!result.found) return res.status(404).json({ message: 'Notification not found.' });
    return res.status(200).json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    console.error('Twilio callback processing failed:', error.name || 'callback_error');
    return res.status(500).json({ message: 'Unable to process delivery status callback.' });
  }
});

export default router;
