import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { decrypt } from '../../utils/encrypt.js';
import { logger } from '../../utils/logger.js';
import type { IEmailConfig } from '../../models/Workspace.js';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  messageId: string;
}

export async function sendEmailForWorkspace(
  config: IEmailConfig & { apiKey?: string; smtpPass?: string },
  opts: SendEmailOptions,
): Promise<SendEmailResult> {
  if (config.provider === 'resend') {
    if (!config.apiKey) throw new Error('Resend API key not configured for this workspace');
    const apiKey = decrypt(config.apiKey);
    const resend = new Resend(apiKey);
    const from = `${config.fromName} <${config.fromEmail}>`;
    const { data, error } = await resend.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      ...(config.replyTo ? { replyTo: config.replyTo } : {}),
    });
    if (error || !data) {
      logger.error('[emailService] Resend error', { error });
      throw new Error(error?.message ?? 'Resend: failed to send email');
    }
    return { messageId: data.id };
  }

  if (config.provider === 'sendgrid') {
    if (!config.apiKey) throw new Error('SendGrid API key not configured for this workspace');
    const apiKey = decrypt(config.apiKey);
    // SendGrid via SMTP relay — avoids adding another SDK dependency
    const transporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: { user: 'apikey', pass: apiKey },
    });
    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      ...(config.replyTo ? { replyTo: config.replyTo } : {}),
    });
    return { messageId: String(info.messageId) };
  }

  if (config.provider === 'smtp') {
    if (!config.smtpHost) throw new Error('SMTP host not configured for this workspace');
    const pass = config.smtpPass ? decrypt(config.smtpPass) : undefined;
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort ?? 587,
      secure: config.smtpSecure ?? false,
      auth: config.smtpUser ? { user: config.smtpUser, pass } : undefined,
    });
    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      ...(config.replyTo ? { replyTo: config.replyTo } : {}),
    });
    return { messageId: String(info.messageId) };
  }

  throw new Error(`Unsupported email provider: ${String(config.provider)}`);
}

// Converts plain-text body to minimal HTML, preserving line breaks (XSS-safe)
export function textToHtml(text: string): string {
  return `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#333">${text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')}</div>`;
}
