/**
 * Email Templates - Transactional email templates
 *
 * These templates generate HTML and plain text versions of emails.
 * They're designed to be simple, accessible, and render well in all email clients.
 *
 * Usage:
 *   import { emailTemplates } from '@/lib/email-templates';
 *
 *   const { html, text, subject } = emailTemplates.invitation({
 *     inviterName: 'John',
 *     organizationName: 'Acme Inc',
 *     role: 'member',
 *     acceptUrl: 'https://...',
 *   });
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const APP_NAME = "Shannon";

// Common styles for email templates
const styles = {
  container: `
    max-width: 600px;
    margin: 0 auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    color: #1a1a1a;
  `,
  button: `
    display: inline-block;
    padding: 12px 24px;
    background-color: #2563eb;
    color: #ffffff !important;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 500;
  `,
  footer: `
    margin-top: 32px;
    padding-top: 16px;
    border-top: 1px solid #e5e5e5;
    font-size: 14px;
    color: #666666;
  `,
  heading: `
    font-size: 24px;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 16px;
  `,
};

// Wrap content in base email layout
function baseLayout(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f5f5f5;">
  <div style="${styles.container}">
    <div style="background-color: #ffffff; padding: 32px; border-radius: 8px;">
      ${content}
    </div>
    <div style="${styles.footer}">
      <p>
        This email was sent by <a href="${BASE_URL}">${APP_NAME}</a>.
        If you didn't expect this email, you can safely ignore it.
      </p>
      <p style="margin-top: 8px;">
        &copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// Team invitation email
interface InvitationEmailData {
  inviterName: string;
  organizationName: string;
  role: string;
  acceptUrl: string;
}

function invitationEmail(data: InvitationEmailData) {
  const { inviterName, organizationName, role, acceptUrl } = data;

  const html = baseLayout(`
    <h1 style="${styles.heading}">You're invited to join ${organizationName}</h1>
    <p>
      <strong>${inviterName}</strong> has invited you to join
      <strong>${organizationName}</strong> on ${APP_NAME} as a <strong>${role}</strong>.
    </p>
    <p>
      ${APP_NAME} is an AI-powered security testing platform that helps teams
      identify vulnerabilities in their applications.
    </p>
    <p style="margin-top: 24px; margin-bottom: 24px;">
      <a href="${acceptUrl}" style="${styles.button}">Accept Invitation</a>
    </p>
    <p style="font-size: 14px; color: #666666;">
      This invitation will expire in 7 days. If you don't want to join,
      you can ignore this email.
    </p>
    <p style="font-size: 14px; color: #666666; margin-top: 16px;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${acceptUrl}" style="color: #2563eb;">${acceptUrl}</a>
    </p>
  `);

  const text = `
You're invited to join ${organizationName}

${inviterName} has invited you to join ${organizationName} on ${APP_NAME} as a ${role}.

${APP_NAME} is an AI-powered security testing platform that helps teams identify vulnerabilities in their applications.

Accept the invitation: ${acceptUrl}

This invitation will expire in 7 days. If you don't want to join, you can ignore this email.

---
This email was sent by ${APP_NAME}. If you didn't expect this email, you can safely ignore it.
  `.trim();

  return {
    subject: `${inviterName} invited you to join ${organizationName} on ${APP_NAME}`,
    html,
    text,
  };
}

// Scan completed email
interface ScanCompletedEmailData {
  targetUrl: string;
  scanId: string;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
  scanUrl: string;
}

function scanCompletedEmail(data: ScanCompletedEmailData) {
  const { targetUrl, scanId, findingsCount, criticalCount, highCount, scanUrl } = data;

  const severityBadge = (count: number, severity: string, color: string) =>
    count > 0
      ? `<span style="display: inline-block; padding: 2px 8px; background-color: ${color}; color: white; border-radius: 4px; font-size: 12px; margin-right: 8px;">${count} ${severity}</span>`
      : "";

  const html = baseLayout(`
    <h1 style="${styles.heading}">Scan Complete</h1>
    <p>
      Your security scan of <strong>${targetUrl}</strong> has completed.
    </p>
    <div style="background-color: #f5f5f5; padding: 16px; border-radius: 6px; margin: 24px 0;">
      <p style="margin: 0 0 8px 0; font-size: 14px; color: #666666;">Scan Results</p>
      <p style="margin: 0; font-size: 20px; font-weight: 600;">
        ${findingsCount} ${findingsCount === 1 ? "finding" : "findings"} detected
      </p>
      <p style="margin: 8px 0 0 0;">
        ${severityBadge(criticalCount, "Critical", "#dc2626")}
        ${severityBadge(highCount, "High", "#ea580c")}
      </p>
    </div>
    <p>
      <a href="${scanUrl}" style="${styles.button}">View Full Report</a>
    </p>
    <p style="font-size: 14px; color: #666666; margin-top: 24px;">
      Scan ID: ${scanId}
    </p>
  `);

  const text = `
Scan Complete

Your security scan of ${targetUrl} has completed.

Results: ${findingsCount} ${findingsCount === 1 ? "finding" : "findings"} detected
${criticalCount > 0 ? `- ${criticalCount} Critical` : ""}
${highCount > 0 ? `- ${highCount} High` : ""}

View the full report: ${scanUrl}

Scan ID: ${scanId}

---
This email was sent by ${APP_NAME}.
  `.trim();

  return {
    subject: `Scan Complete: ${findingsCount} findings detected for ${targetUrl}`,
    html,
    text,
  };
}

// Welcome email
interface WelcomeEmailData {
  userName: string;
  organizationName: string;
  dashboardUrl: string;
}

function welcomeEmail(data: WelcomeEmailData) {
  const { userName, organizationName, dashboardUrl } = data;

  const html = baseLayout(`
    <h1 style="${styles.heading}">Welcome to ${APP_NAME}!</h1>
    <p>
      Hi ${userName},
    </p>
    <p>
      Thanks for signing up! Your organization <strong>${organizationName}</strong>
      is all set up and ready to go.
    </p>
    <h2 style="font-size: 18px; margin-top: 24px;">Get started with your first scan</h2>
    <ol style="padding-left: 20px;">
      <li>Go to your dashboard</li>
      <li>Click "New Scan"</li>
      <li>Enter the URL you want to test</li>
      <li>Our AI will analyze it for security vulnerabilities</li>
    </ol>
    <p style="margin-top: 24px;">
      <a href="${dashboardUrl}" style="${styles.button}">Go to Dashboard</a>
    </p>
    <p style="margin-top: 24px; font-size: 14px; color: #666666;">
      Need help? Check out our <a href="${BASE_URL}/docs" style="color: #2563eb;">documentation</a>
      or reach out to our support team.
    </p>
  `);

  const text = `
Welcome to ${APP_NAME}!

Hi ${userName},

Thanks for signing up! Your organization ${organizationName} is all set up and ready to go.

Get started with your first scan:
1. Go to your dashboard
2. Click "New Scan"
3. Enter the URL you want to test
4. Our AI will analyze it for security vulnerabilities

Go to Dashboard: ${dashboardUrl}

Need help? Check out our documentation at ${BASE_URL}/docs

---
This email was sent by ${APP_NAME}.
  `.trim();

  return {
    subject: `Welcome to ${APP_NAME}!`,
    html,
    text,
  };
}

// Account deletion confirmation email
interface DeletionConfirmationEmailData {
  userName: string;
}

function deletionConfirmationEmail(data: DeletionConfirmationEmailData) {
  const { userName } = data;

  const html = baseLayout(`
    <h1 style="${styles.heading}">Account Deleted</h1>
    <p>
      Hi ${userName},
    </p>
    <p>
      This email confirms that your ${APP_NAME} account has been permanently deleted
      as requested.
    </p>
    <p>
      All your personal data has been removed from our systems in compliance with
      GDPR and other privacy regulations.
    </p>
    <p style="margin-top: 24px;">
      If you did not request this deletion, please contact our support team
      immediately at <a href="mailto:support@shannon.ai" style="color: #2563eb;">support@shannon.ai</a>.
    </p>
    <p style="margin-top: 24px; font-size: 14px; color: #666666;">
      Thank you for using ${APP_NAME}. We hope to see you again!
    </p>
  `);

  const text = `
Account Deleted

Hi ${userName},

This email confirms that your ${APP_NAME} account has been permanently deleted as requested.

All your personal data has been removed from our systems in compliance with GDPR and other privacy regulations.

If you did not request this deletion, please contact our support team immediately at support@shannon.ai.

Thank you for using ${APP_NAME}. We hope to see you again!

---
This email was sent by ${APP_NAME}.
  `.trim();

  return {
    subject: `Your ${APP_NAME} account has been deleted`,
    html,
    text,
  };
}

// Member added notification email
interface MemberAddedEmailData {
  memberName: string;
  organizationName: string;
  addedByName: string;
  role: string;
  teamUrl: string;
}

function memberAddedEmail(data: MemberAddedEmailData) {
  const { memberName, organizationName, addedByName, role, teamUrl } = data;

  const html = baseLayout(`
    <h1 style="${styles.heading}">New Team Member</h1>
    <p>
      <strong>${memberName}</strong> has joined <strong>${organizationName}</strong>
      as a <strong>${role}</strong>.
    </p>
    <p>
      They were added by ${addedByName}.
    </p>
    <p style="margin-top: 24px;">
      <a href="${teamUrl}" style="${styles.button}">View Team</a>
    </p>
  `);

  const text = `
New Team Member

${memberName} has joined ${organizationName} as a ${role}.

They were added by ${addedByName}.

View team: ${teamUrl}

---
This email was sent by ${APP_NAME}.
  `.trim();

  return {
    subject: `${memberName} joined ${organizationName}`,
    html,
    text,
  };
}

// Export all templates
export const emailTemplates = {
  invitation: invitationEmail,
  scanCompleted: scanCompletedEmail,
  welcome: welcomeEmail,
  deletionConfirmation: deletionConfirmationEmail,
  memberAdded: memberAddedEmail,
};

// Export types for external use
export type {
  InvitationEmailData,
  ScanCompletedEmailData,
  WelcomeEmailData,
  DeletionConfirmationEmailData,
  MemberAddedEmailData,
};
