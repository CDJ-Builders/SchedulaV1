const path = require('path');
const fs = require('fs');
const { SMTP } = require('../config/env');
const { logDebug } = require('./helpers');

let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  console.warn('WARNING: nodemailer is not installed locally. SMTP features will fallback to console logging.');
}

const smtpConfigured = !!(SMTP.HOST && SMTP.USER && SMTP.PASS);
let transporter;

if (smtpConfigured && nodemailer) {
  try {
    transporter = nodemailer.createTransport({
      host: SMTP.HOST,
      port: SMTP.PORT,
      secure: SMTP.SECURE,
      auth: {
        user: SMTP.USER,
        pass: SMTP.PASS,
      },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production' // avoid strict cert errors in local dev
      }
    });
    logDebug('Nodemailer SMTP Transporter initialized successfully.');
  } catch (err) {
    console.error('Failed to initialize Nodemailer SMTP Transporter:', err);
  }
} else {
  logDebug('Nodemailer not configured: password reset emails will be logged locally.');
}

/**
 * Sends a password reset email using the configured SMTP transporter.
 * If SMTP parameters are missing, falls back to logging the reset link and writing a local preview file.
 * @param {string} to - Destination email address
 * @param {string} pin - 6-digit PIN
 */
async function sendResetPinEmail(to, pin) {
  const fromEmail = SMTP.FROM;

  const textContent = `You requested a password reset. Please use the following 6-digit PIN to reset your password:\n\n${pin}\n\nThis PIN will expire in 1 hour. If you did not request this, please ignore this email.`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff;">
      <h2 style="color: #333333; text-align: center;">Schedula</h2>
      <hr style="border: none; border-top: 1px solid #eeeeee;" />
      <p style="color: #666666; font-size: 16px;">Hello,</p>
      <p style="color: #666666; font-size: 16px;">We received a request to reset your password. Please use the secure 6-digit verification PIN below to reset your password:</p>
      <div style="text-align: center; margin: 30px 0;">
        <div style="background-color: #f4f4f4; color: #333333; letter-spacing: 8px; font-family: monospace; font-size: 32px; font-weight: bold; padding: 15px 30px; border-radius: 6px; display: inline-block; border: 1px dashed #cccccc;">
          ${pin}
        </div>
      </div>
      <hr style="border: none; border-top: 1px solid #eeeeee; margin-top: 30px;" />
      <p style="color: #999999; font-size: 12px; text-align: center;">This PIN will expire in 1 hour. If you did not make this request, you can safely ignore this email.</p>
    </div>
  `;

  if (smtpConfigured && transporter) {
    await transporter.sendMail({
      from: `"Schedula" <${fromEmail}>`,
      to,
      subject: 'Reset your password - Verification PIN',
      text: textContent,
      html: htmlContent
    });
  } else {
    // Development fallback: Log email details and save to mock file
    logDebug('\n==================================================');
    logDebug('[DEV MOCK EMAIL DISPATCH]');
    logDebug(`FROM: ${fromEmail}`);
    logDebug(`TO: ${to}`);
    logDebug('SUBJECT: Reset your password - Verification PIN');
    logDebug(`PIN: ${pin}`);
    logDebug('==================================================\n');

    const logDir = path.join(__dirname, '..', 'logs', 'password-resets');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const sanitizedTo = to.replace(/[^a-zA-Z0-9]/g, '_');
    const logFile = path.join(logDir, `${Date.now()}-${sanitizedTo}.html`);
    fs.writeFileSync(logFile, `
      <p><strong>To:</strong> ${to}</p>
      <p><strong>Subject:</strong> Reset your password - Verification PIN</p>
      <p><strong>PIN:</strong> ${pin}</p>
      <hr/>
      ${htmlContent}
    `);
    logDebug(`Mock email preview written to: ${logFile}`);
  }
}

module.exports = { sendResetPinEmail };
