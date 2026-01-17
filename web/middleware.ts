import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { rateLimiters, getClientIp, createRateLimitHeaders } from "@/lib/rate-limit";

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/accept-invite(.*)",
  "/api/webhooks(.*)",
  "/api/cron(.*)",
]);

// Define rate-limited routes and their limiters
const authRoutes = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/clerk(.*)",
]);

// SSO callbacks are excluded from rate limiting because OAuth flows
// make multiple internal requests that would exceed limits
const isSsoCallback = createRouteMatcher([
  "/sign-in/sso-callback(.*)",
  "/sign-up/sso-callback(.*)",
]);

const sensitiveRoutes = createRouteMatcher([
  "/api/scans(.*)",
  "/api/organizations(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  const ip = getClientIp(request.headers);

  // Apply rate limiting for auth routes (stricter), excluding SSO callbacks
  if (authRoutes(request) && !isSsoCallback(request)) {
    const result = await rateLimiters.auth.check(`auth:${ip}`);
    if (!result.success) {
      return new NextResponse("Too many requests. Please try again later.", {
        status: 429,
        headers: createRateLimitHeaders(result),
      });
    }
  }

  // Apply rate limiting for sensitive API routes
  if (sensitiveRoutes(request)) {
    const result = await rateLimiters.api.check(`api:${ip}`);
    if (!result.success) {
      return new NextResponse(
        JSON.stringify({ error: "Rate limit exceeded" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            ...createRateLimitHeaders(result),
          },
        }
      );
    }
  }

  // Protect all routes except public ones
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
