import { OrgRole } from "@/lib/auth";

interface SendInvitationEmailParams {
  to: string;
  inviterName: string;
  organizationName: string;
  role: OrgRole;
  token: string;
}

/**
 * Send an invitation email.
 * In production, this would integrate with a real email service
 * like SendGrid, Resend, or AWS SES.
 */
export async function sendInvitationEmail({
  to,
  inviterName,
  organizationName,
  role,
  token,
}: SendInvitationEmailParams): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const inviteUrl = `${baseUrl}/accept-invite/${token}`;

  const roleDisplay = {
    owner: "Owner",
    admin: "Administrator",
    member: "Member",
    viewer: "Viewer",
  }[role];

  // In development, log the email
  if (process.env.NODE_ENV === "development") {
    console.log("=".repeat(60));
    console.log("INVITATION EMAIL");
    console.log("=".repeat(60));
    console.log(`To: ${to}`);
    console.log(`Subject: ${inviterName} invited you to join ${organizationName}`);
    console.log("");
    console.log(`Hi there,`);
    console.log("");
    console.log(`${inviterName} has invited you to join ${organizationName} as a ${roleDisplay}.`);
    console.log("");
    console.log(`Click the link below to accept the invitation:`);
    console.log(inviteUrl);
    console.log("");
    console.log(`This invitation will expire in 7 days.`);
    console.log("");
    console.log(`If you didn't expect this invitation, you can safely ignore this email.`);
    console.log("=".repeat(60));
    return;
  }

  // Production: integrate with email service
  // Example with Resend:
  // const resend = new Resend(process.env.RESEND_API_KEY);
  // await resend.emails.send({
  //   from: 'Shannon <noreply@shannon.security>',
  //   to: [to],
  //   subject: `${inviterName} invited you to join ${organizationName}`,
  //   html: `...email template...`,
  // });

  // For now, just log that we would send an email
  console.log(`[EMAIL] Would send invitation email to ${to}`);
}

interface SendWelcomeEmailParams {
  to: string;
  name: string;
}

/**
 * Send a welcome email after signup.
 */
export async function sendWelcomeEmail({
  to,
  name,
}: SendWelcomeEmailParams): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    console.log("=".repeat(60));
    console.log("WELCOME EMAIL");
    console.log("=".repeat(60));
    console.log(`To: ${to}`);
    console.log(`Subject: Welcome to Shannon!`);
    console.log("");
    console.log(`Hi ${name || "there"},`);
    console.log("");
    console.log(`Welcome to Shannon! We're excited to have you.`);
    console.log("=".repeat(60));
    return;
  }

  console.log(`[EMAIL] Would send welcome email to ${to}`);
}

interface SendPasswordResetEmailParams {
  to: string;
  resetUrl: string;
}

/**
 * Send a password reset email.
 * Note: Clerk handles this automatically, this is for custom flows.
 */
export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: SendPasswordResetEmailParams): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    console.log("=".repeat(60));
    console.log("PASSWORD RESET EMAIL");
    console.log("=".repeat(60));
    console.log(`To: ${to}`);
    console.log(`Reset URL: ${resetUrl}`);
    console.log("=".repeat(60));
    return;
  }

  console.log(`[EMAIL] Would send password reset email to ${to}`);
}
