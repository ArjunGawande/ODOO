import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@backend/lib/db';

import { resetTables } from './helpers/db';
import { createCustomer } from './helpers/factories';

const transportSend = vi.hoisted(() => vi.fn(async () => ({ messageId: '1' })));
const createTransport = vi.hoisted(() => vi.fn(() => ({ sendMail: transportSend })));
vi.mock('nodemailer', () => ({ default: { createTransport } }));

const MESSAGE = {
  to: 'owner@sharma.in',
  subject: 'Reset your Brightloop password',
  text: 'Link: http://localhost:3000/reset-password?token=abc',
  html: '<a href="http://localhost:3000/reset-password?token=abc">Reset</a>',
};

async function loadMailer() {
  vi.resetModules();
  return import('@backend/lib/mailer');
}

beforeEach(() => {
  transportSend.mockClear();
  transportSend.mockImplementation(async () => ({ messageId: '1' }));
  createTransport.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('sendMail without SMTP_HOST', () => {
  it('logs the recipient, subject and link instead of sending', async () => {
    vi.stubEnv('SMTP_HOST', '');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { sendMail } = await loadMailer();

    await sendMail(MESSAGE);

    expect(createTransport).not.toHaveBeenCalled();
    const logged = info.mock.calls[0][0];
    expect(logged).toContain('owner@sharma.in');
    expect(logged).toContain('Reset your Brightloop password');
    expect(logged).toContain('/reset-password?token=abc');
  });
});

describe('sendMail in production without SMTP_HOST', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMTP_HOST', '');
  });

  function spyOnConsole() {
    return ['log', 'info', 'warn', 'error', 'debug'].map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
  }

  function allLogged(spies) {
    return JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
  }

  it('logs a configuration error, sends nothing and fails the send', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sendMail } = await loadMailer();

    await expect(sendMail(MESSAGE)).rejects.toThrow('SMTP_HOST');

    expect(createTransport).not.toHaveBeenCalled();
    expect(error.mock.calls[0][0]).toContain('Configuration error');
    expect(error.mock.calls[0][0]).toContain('SMTP_HOST');
  });

  it('never logs the link, the token or the message', async () => {
    const spies = spyOnConsole();
    const { sendMail } = await loadMailer();

    await expect(sendMail(MESSAGE)).rejects.toThrow();

    const logged = allLogged(spies);
    expect(logged).not.toContain('token=');
    expect(logged).not.toContain('reset-password');
    expect(logged).not.toContain(MESSAGE.subject);
  });

  it('keeps a real reset request silent about the link, and still never rejects', async () => {
    await resetTables();
    const user = await createCustomer();
    const spies = spyOnConsole();
    await loadMailer();
    const { requestPasswordReset } = await import('@backend/services/password-reset');

    await expect(requestPasswordReset(user.email)).resolves.toBeUndefined();

    const logged = allLogged(spies);
    expect(logged).toContain('Configuration error');
    expect(logged).not.toContain('token=');
    expect(await db('password_reset_tokens').where('user_id', user.id)).toHaveLength(1);
    const [{ token_hash: tokenHash }] = await db('password_reset_tokens');
    expect(logged).not.toContain(tokenHash);
  });
});

describe('sendMail with SMTP_HOST in production', () => {
  it('sends normally', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMTP_HOST', 'smtp.example.test');
    const { sendMail } = await loadMailer();

    await sendMail(MESSAGE);

    expect(transportSend).toHaveBeenCalledTimes(1);
  });
});

describe('sendMail with SMTP_HOST', () => {
  beforeEach(() => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.test');
    vi.stubEnv('SMTP_PORT', '2525');
    vi.stubEnv('SMTP_USER', 'mailer');
    vi.stubEnv('SMTP_PASS', 'secret');
    vi.stubEnv('MAIL_FROM', 'Brightloop <billing@example.test>');
  });

  it('sends through nodemailer with the configured sender', async () => {
    const { sendMail } = await loadMailer();

    await sendMail(MESSAGE);

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.test',
        port: 2525,
        secure: false,
        auth: { user: 'mailer', pass: 'secret' },
      }),
    );
    expect(transportSend).toHaveBeenCalledWith({
      ...MESSAGE,
      from: 'Brightloop <billing@example.test>',
    });
  });

  it('uses TLS on port 465', async () => {
    vi.stubEnv('SMTP_PORT', '465');
    const { sendMail } = await loadMailer();
    await sendMail(MESSAGE);
    expect(createTransport.mock.calls[0][0].secure).toBe(true);
  });

  it('skips auth when there is no user', async () => {
    vi.stubEnv('SMTP_USER', '');
    const { sendMail } = await loadMailer();
    await sendMail(MESSAGE);
    expect(createTransport.mock.calls[0][0].auth).toBeUndefined();
  });

  it('reuses one transport', async () => {
    const { sendMail } = await loadMailer();
    await sendMail(MESSAGE);
    await sendMail(MESSAGE);
    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(transportSend).toHaveBeenCalledTimes(2);
  });

  it('rejects when the server refuses, so the caller can decide', async () => {
    transportSend.mockRejectedValueOnce(new Error('refused'));
    const { sendMail } = await loadMailer();
    await expect(sendMail(MESSAGE)).rejects.toThrow('refused');
  });
});
