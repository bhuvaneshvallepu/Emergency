import twilio from 'twilio';

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
let clientFactory = (accountSid, authToken) => twilio(accountSid, authToken);

export class SmsProviderError extends Error {
  constructor(message, code = 'SMS_PROVIDER_ERROR') {
    super(message);
    this.name = 'SmsProviderError';
    this.code = code;
  }
}

export function isValidE164(phone) {
  return typeof phone === 'string' && E164_PATTERN.test(phone);
}

export function isSmsEnabled() {
  return process.env.SMS_PROVIDER === 'twilio' && process.env.SMS_ENABLED === 'true';
}

function getTwilioConfig() {
  const { SMS_ACCOUNT_ID: accountSid, SMS_AUTH_TOKEN: authToken, SMS_FROM_NUMBER: from } = process.env;
  if (!accountSid || !authToken || !from) {
    throw new SmsProviderError('SMS is enabled but Twilio credentials or sender number are not configured.', 'SMS_CONFIGURATION_ERROR');
  }
  if (!isValidE164(from)) {
    throw new SmsProviderError('The configured SMS sender number must be in E.164 format.', 'SMS_CONFIGURATION_ERROR');
  }
  const statusCallback = process.env.SMS_STATUS_CALLBACK_URL;
  if (statusCallback) {
    let callbackUrl;
    try {
      callbackUrl = new URL(statusCallback);
    } catch {
      throw new SmsProviderError('The SMS status callback URL is invalid.', 'SMS_CONFIGURATION_ERROR');
    }
    if (callbackUrl.protocol !== 'https:') {
      throw new SmsProviderError('The SMS status callback URL must use HTTPS.', 'SMS_CONFIGURATION_ERROR');
    }
  }
  return { accountSid, authToken, from, statusCallback };
}

export async function sendSms({ to, body }) {
  if (!isValidE164(to)) {
    throw new SmsProviderError('Recipient phone number must be in E.164 format.', 'INVALID_RECIPIENT');
  }
  if (typeof body !== 'string' || !body.trim() || body.length > 1600) {
    throw new SmsProviderError('SMS message body must contain 1 to 1600 characters.', 'INVALID_MESSAGE');
  }
  if (!isSmsEnabled()) {
    return { provider: 'none', sid: null, recipient: to, sender: null, status: 'disabled' };
  }

  const { accountSid, authToken, from, statusCallback } = getTwilioConfig();
  try {
    const client = clientFactory(accountSid, authToken);
    const result = await client.messages.create({
      to,
      from,
      body: body.trim(),
      ...(statusCallback ? { statusCallback } : {}),
    });
    return {
      provider: 'twilio',
      sid: result.sid,
      recipient: to,
      sender: from,
      status: result.status || 'queued',
    };
  } catch (error) {
    if (error instanceof SmsProviderError) throw error;
    throw new SmsProviderError('Twilio could not accept the SMS request.', error?.code ? String(error.code) : 'SMS_PROVIDER_ERROR');
  }
}

export function validateTwilioRequest(signature, callbackUrl, parameters) {
  const authToken = process.env.SMS_AUTH_TOKEN;
  if (!authToken || !signature || !callbackUrl) return false;
  return twilio.validateRequest(authToken, signature, callbackUrl, parameters);
}

export function setSmsClientFactory(factory) {
  if (typeof factory !== 'function') throw new TypeError('SMS client factory must be a function.');
  clientFactory = factory;
}

export function resetSmsClientFactory() {
  clientFactory = (accountSid, authToken) => twilio(accountSid, authToken);
}
