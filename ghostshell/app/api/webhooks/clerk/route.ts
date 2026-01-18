import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  // Get the webhook secret from environment
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error("Please add CLERK_WEBHOOK_SECRET to .env");
  }

  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with the secret
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  // Handle the event
  const eventType = evt.type;

  if (eventType === "user.created") {
    const { id, email_addresses, first_name, last_name, image_url } = evt.data;

    const email = email_addresses[0]?.email_address;
    if (!email) {
      return new Response("No email found", { status: 400 });
    }

    const name = [first_name, last_name].filter(Boolean).join(" ") || null;

    // Create user and default organization in a transaction
    await db.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          clerkId: id,
          email,
          name,
          avatarUrl: image_url,
        },
      });

      // Generate slug from name or email
      const baseName = name || email.split("@")[0];
      const slug = baseName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      // Create default organization
      const org = await tx.organization.create({
        data: {
          name: `${baseName}'s Workspace`,
          slug: `${slug}-${Date.now().toString(36)}`, // Ensure uniqueness
          plan: "free",
        },
      });

      // Add user as owner
      await tx.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: org.id,
          role: "owner",
        },
      });

      // Create audit log entry
      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          action: "user.created",
          resourceType: "user",
          resourceId: user.id,
          metadata: {
            email,
            createdVia: "clerk_webhook",
          },
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          action: "organization.created",
          resourceType: "organization",
          resourceId: org.id,
          metadata: {
            name: org.name,
            plan: org.plan,
          },
        },
      });
    });

    console.log(`Created user ${email} with default organization`);
  }

  if (eventType === "user.updated") {
    const { id, email_addresses, first_name, last_name, image_url } = evt.data;

    const email = email_addresses[0]?.email_address;
    const name = [first_name, last_name].filter(Boolean).join(" ") || null;

    await db.user.update({
      where: { clerkId: id },
      data: {
        email,
        name,
        avatarUrl: image_url,
      },
    });

    console.log(`Updated user ${email}`);
  }

  if (eventType === "user.deleted") {
    const { id } = evt.data;

    // Soft delete - the cascade will handle memberships
    // In production, you might want to schedule this for GDPR compliance
    const user = await db.user.findUnique({
      where: { clerkId: id },
    });

    if (user) {
      await db.user.delete({
        where: { clerkId: id },
      });
      console.log(`Deleted user ${user.email}`);
    }
  }

  // Handle session events for login/logout audit logging
  if (eventType === "session.created") {
    const { user_id } = evt.data;

    const user = await db.user.findUnique({
      where: { clerkId: user_id },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (user && user.memberships.length > 0) {
      // Log to the user's first organization (or all if needed)
      const primaryOrg = user.memberships[0].organization;
      await db.auditLog.create({
        data: {
          organizationId: primaryOrg.id,
          userId: user.id,
          action: "auth.login",
          resourceType: "session",
          metadata: {
            sessionId: evt.data.id,
            createdVia: "clerk_webhook",
          },
        },
      });
      console.log(`Logged login for user ${user.email}`);
    }
  }

  if (eventType === "session.ended" || eventType === "session.revoked") {
    const { user_id } = evt.data;

    const user = await db.user.findUnique({
      where: { clerkId: user_id },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (user && user.memberships.length > 0) {
      const primaryOrg = user.memberships[0].organization;
      const action = eventType === "session.revoked" ? "auth.session_revoked" : "auth.logout";

      await db.auditLog.create({
        data: {
          organizationId: primaryOrg.id,
          userId: user.id,
          action,
          resourceType: "session",
          metadata: {
            sessionId: evt.data.id,
            reason: eventType,
          },
        },
      });
      console.log(`Logged ${action} for user ${user.email}`);
    }
  }

  return new Response("Webhook processed", { status: 200 });
}
