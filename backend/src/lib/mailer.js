import nodemailer from 'nodemailer';

const DEFAULT_FROM = 'Brightloop <no-reply@brightloop.in>';
const SMTP_SECURE_PORT = 465;

let transporter;

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === SMTP_SECURE_PORT,
      auth: user ? { user, pass: process.env.SMTP_PASS } : undefined,
      // A stalled mail server must not hold up a request.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

/**
 * Sends through SMTP when SMTP_HOST is set. Without it the message goes to the
 * server console, so reset and invite links work in a local demo. In production
 * nothing is logged but the error, because the message holds a live link. Rejects
 * when mail can't be sent: callers decide what the person sees.
 */
export async function sendMail({ to, subject, text, html }) {
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[mail] Configuration error: SMTP_HOST is not set, so no email can be sent.');
      throw new Error('Mail is not configured: SMTP_HOST is not set.');
    }
    console.info(`[mail] SMTP_HOST is not set. Message not sent.\nTo: ${to}\nSubject: ${subject}\n\n${text}`);
    return;
  }
  await getTransporter().sendMail({
    from: process.env.MAIL_FROM || DEFAULT_FROM,
    to,
    subject,
    text,
    html,
  });
}
