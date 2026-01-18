/**
 * Zod validation schemas for form inputs
 *
 * Usage:
 *   import { scanSchema, orgSchema } from '@/lib/validations';
 *
 *   const result = scanSchema.createScan.safeParse(input);
 *   if (!result.success) {
 *     return { error: result.error.issues[0].message };
 *   }
 */

import { z } from "zod";

// Common validators
const url = z
  .string()
  .url("Please enter a valid URL")
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return ["http:", "https:"].includes(parsed.protocol);
      } catch {
        return false;
      }
    },
    { message: "URL must use HTTP or HTTPS protocol" }
  );

const email = z.string().email("Please enter a valid email address").toLowerCase();

const cuid = z.string().min(1, "ID is required");

const name = z
  .string()
  .min(1, "Name is required")
  .max(100, "Name must be 100 characters or less")
  .trim();

const orgRole = z.enum(["owner", "admin", "member", "viewer"], {
  message: "Invalid role",
});

// Scan validation schemas
export const scanSchema = {
  createScan: z.object({
    targetUrl: url,
    projectId: cuid.optional(),
    organizationId: cuid,
  }),

  getScan: z.object({
    scanId: cuid,
  }),

  updateProgress: z.object({
    scanId: cuid,
    status: z.enum(["pending", "running", "completed", "failed"]).optional(),
    progress: z.number().min(0).max(100).optional(),
    currentPhase: z
      .enum(["pre-recon", "recon", "vuln-analysis", "exploitation", "reporting"])
      .optional(),
    completedAt: z.date().optional(),
  }),
};

// Organization validation schemas
export const orgSchema = {
  create: z.object({
    name: name,
  }),

  update: z.object({
    orgId: cuid,
    name: name.optional(),
    logoUrl: z
      .string()
      .url("Please enter a valid image URL")
      .nullable()
      .optional(),
  }),

  delete: z.object({
    orgId: cuid,
  }),

  set2FA: z.object({
    orgId: cuid,
    require2FA: z.boolean(),
  }),
};

// User validation schemas
export const userSchema = {
  updateProfile: z.object({
    name: name.optional(),
    avatarUrl: z
      .string()
      .url("Please enter a valid image URL")
      .nullable()
      .optional(),
  }),

  deleteAccount: z.object({
    confirmation: z.literal("DELETE", {
      message: 'Please type "DELETE" to confirm',
    }),
  }),

  gdprExport: z.object({
    format: z.enum(["json", "csv"]).default("json"),
  }),
};

// Invitation validation schemas
export const invitationSchema = {
  send: z.object({
    orgId: cuid,
    email: email,
    role: orgRole.default("member"),
  }),

  accept: z.object({
    token: z.string().min(1, "Token is required"),
  }),

  resend: z.object({
    invitationId: cuid,
  }),

  revoke: z.object({
    invitationId: cuid,
  }),
};

// Membership validation schemas
export const membershipSchema = {
  changeRole: z.object({
    memberId: cuid,
    newRole: orgRole,
  }),

  remove: z.object({
    memberId: cuid,
  }),
};

// Project validation schemas
export const projectSchema = {
  create: z.object({
    name: name,
    description: z.string().max(500, "Description must be 500 characters or less").optional(),
    organizationId: cuid,
  }),

  update: z.object({
    projectId: cuid,
    name: name.optional(),
    description: z.string().max(500).optional(),
  }),

  delete: z.object({
    projectId: cuid,
  }),
};

// Helper function to validate and return formatted errors
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string; zodError: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.issues[0]?.message || "Validation failed",
    zodError: result.error,
  };
}

// Sanitization helpers
export const sanitize = {
  /**
   * Remove HTML tags and trim whitespace
   */
  text: (input: string): string => {
    return input.replace(/<[^>]*>/g, "").trim();
  },

  /**
   * Sanitize URL by ensuring protocol
   */
  url: (input: string): string => {
    const trimmed = input.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return trimmed;
  },

  /**
   * Normalize email to lowercase
   */
  email: (input: string): string => {
    return input.trim().toLowerCase();
  },

  /**
   * Sanitize slug (URL-safe string)
   */
  slug: (input: string): string => {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  },
};

// Re-export zod for convenience
export { z };
