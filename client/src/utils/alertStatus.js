const STATUS_DETAILS = {
  accepted: {
    label: 'Queued',
    description: 'Twilio accepted the request for processing; delivery is not confirmed.',
  },
  queued: {
    label: 'Queued',
    description: 'Twilio accepted the request for processing; delivery is not confirmed.',
  },
  sending: {
    label: 'Sending',
    description: 'Twilio is processing the message; delivery is not confirmed.',
  },
  sent: {
    label: 'Sent',
    description: 'Twilio reports the message was sent; delivery is not confirmed.',
  },
  delivered: {
    label: 'Delivered',
    description: 'Twilio confirmed delivery to the recipient.',
  },
  disabled: {
    label: 'Disabled',
    description: 'SMS was not sent because SMS_ENABLED is not true on the backend.',
  },
  configuration_error: {
    label: 'Configuration error',
    description: 'SMS was not sent. Correct the Twilio backend configuration before retrying.',
  },
  skipped: {
    label: 'Skipped',
    description: 'This contact is not eligible for SMS; SMS consent and preference are required.',
  },
  failed: {
    label: 'Failed',
    description: 'Twilio did not accept the SMS request.',
  },
  undelivered: {
    label: 'Undelivered',
    description: 'Twilio reported that the message could not be delivered.',
  },
};

export function describeAlertStatus(status) {
  const normalizedStatus = typeof status === 'string' ? status.toLowerCase() : '';
  return STATUS_DETAILS[normalizedStatus] || {
    label: normalizedStatus ? normalizedStatus.replaceAll('_', ' ') : 'Unknown',
    description: 'No additional notification status details are available.',
  };
}
