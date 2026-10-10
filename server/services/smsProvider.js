import twilio from 'twilio';

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const SAFE_TRANSPORT_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED']);
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

export function getSmsConfigurationStatus() {
  return {
    providerConfigured: process.env.SMS_PROVIDER === 'twilio',
    smsEnabled: process.env.SMS_ENABLED === 'true',
    accountSidConfigured: Boolean(process.env.SMS_ACCOUNT_ID?.trim()),
    authTokenConfigured: Boolean(process.env.SMS_AUTH_TOKEN?.trim()),
    senderNumberConfigured: Boolean(process.env.SMS_FROM_NUMBER?.trim()),
    callbackUrlConfigured: Boolean(process.env.SMS_STATUS_CALLBACK_URL?.trim()),
  };
}

export function isSmsEnabled() {
  const status = getSmsConfigurationStatus();
  return status.providerConfigured && status.smsEnabled;
}

export function getSmsConfigurationError() {
  const status = getSmsConfigurationStatus();
  if (!status.providerConfigured) {
    return new SmsProviderError('SMS_PROVIDER must be set to twilio.', 'SMS_CONFIGURATION_ERROR');
  }

  const missing = [];
  if (!status.accountSidConfigured) missing.push('SMS_ACCOUNT_ID');
  if (!status.authTokenConfigured) missing.push('SMS_AUTH_TOKEN');
  if (!status.senderNumberConfigured) missing.push('SMS_FROM_NUMBER');
  if (missing.length) {
    return new SmsProviderError(`SMS is enabled, but required Twilio settings are missing: ${missing.join(', ')}.`, 'SMS_CONFIGURATION_ERROR');
  }

  if (!isValidE164(process.env.SMS_FROM_NUMBER.trim())) {
    return new SmsProviderError('SMS_FROM_NUMBER must use E.164 format.', 'SMS_CONFIGURATION_ERROR');
  }

  const statusCallback = process.env.SMS_STATUS_CALLBACK_URL?.trim();
  if (statusCallback) {
    let callbackUrl;
    try {
      callbackUrl = new URL(statusCallback);
    } catch {
      return new SmsProviderError('SMS_STATUS_CALLBACK_URL is not a valid URL.', 'SMS_CONFIGURATION_ERROR');
    }
    if (callbackUrl.protocol !== 'https:') {
      return new SmsProviderError('SMS_STATUS_CALLBACK_URL must use HTTPS.', 'SMS_CONFIGURATION_ERROR');
    }
  }
  return null;
}

function getTwilioConfig() {
  const configurationError = getSmsConfigurationError();
  if (configurationError) throw configurationError;
  return {
    accountSid: process.env.SMS_ACCOUNT_ID.trim(),
    authToken: process.env.SMS_AUTH_TOKEN.trim(),
    from: process.env.SMS_FROM_NUMBER.trim(),
    statusCallback: process.env.SMS_STATUS_CALLBACK_URL?.trim() || '',
  };
}

export async function sendSms({ to, body }) {
  if (!isValidE164(to)) {
    throw new SmsProviderError('Recipient phone number must be in E.164 format.', 'INVALID_RECIPIENT');
  }
  if (typeof body !== 'string' || !body.trim() || body.length > 1600) {
    throw new SmsProviderError('SMS message body must contain 1 to 1600 characters.', 'INVALID_MESSAGE');
  }
  if (!getSmsConfigurationStatus().smsEnabled) {
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
    if (typeof result?.sid !== 'string' || !result.sid || typeof result?.status !== 'string' || !result.status) {
      throw new SmsProviderError('Twilio returned an incomplete response for the SMS request.', 'INVALID_PROVIDER_RESPONSE');
    }
    return {
      provider: 'twilio',
      sid: result.sid,
      recipient: to,
      sender: from,
      status: result.status,
    };
  } catch (error) {
    if (error instanceof SmsProviderError) throw error;
    const providerCode = typeof error?.code === 'string' || typeof error?.code === 'number'
      ? String(error.code)
      : '';
    const safeCode = /^\d{1,10}$/.test(providerCode) || SAFE_TRANSPORT_CODES.has(providerCode)
      ? providerCode
      : '';
    const codeMessage = safeCode ? ` Provider error code: ${safeCode}.` : '';
    throw new SmsProviderError(
      `Twilio could not accept the SMS request.${codeMessage} Check the Twilio credentials, sender configuration, and destination eligibility.`,
      safeCode || 'SMS_PROVIDER_ERROR',
    );
  }
}

export function validateTwilioRequest(signature, callbackUrl, parameters) {
  const authToken = process.env.SMS_AUTH_TOKEN?.trim();
  if (!authToken || !signature || !callbackUrl) return false;
  return twilio.validateRequest(authToken, signature, callbackUrl.trim(), parameters);
}

export function setSmsClientFactory(factory) {
  if (typeof factory !== 'function') throw new TypeError('SMS client factory must be a function.');
  clientFactory = factory;
}

export function resetSmsClientFactory() {
  clientFactory = (accountSid, authToken) => twilio(accountSid, authToken);
}
