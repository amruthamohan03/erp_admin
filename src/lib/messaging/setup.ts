// What an operator is told when a channel has not been set up on the server.
// Pure, so the composer shows the same sentence as a banner before anyone
// writes a message that the send route would give on refusal (§4.39).

export const CHANNEL_NOT_CONFIGURED = {
  email:
    'Email is not set up on this server — an administrator must set SMTP_HOST and SMTP_FROM (and SMTP_USER / SMTP_PASSWORD if the server needs them) in the environment, then restart the application.',
  whatsapp:
    'WhatsApp is not set up on this server — an administrator must set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN (from Meta Business → WhatsApp → API setup) in the environment, then restart the application.',
} as const;
