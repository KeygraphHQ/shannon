/**
 * Auth types for Shannon web application.
 *
 * These types mirror the Prisma schema types but are standalone
 * to work before `prisma generate` is run against the database.
 */

export type AuthMethod = "NONE" | "FORM" | "API_TOKEN" | "BASIC" | "SSO";
