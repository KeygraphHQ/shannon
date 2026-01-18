import type { NextConfig } from "next";

// Content Security Policy directives
const cspDirectives = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'", // Required for Next.js inline scripts
    "'unsafe-eval'", // Required for development mode - remove in production if possible
    "https://accounts.clerk.com",
    "https://*.clerk.accounts.dev",
  ],
  "style-src": ["'self'", "'unsafe-inline'"], // Required for Tailwind and styled-jsx
  "img-src": ["'self'", "data:", "blob:", "https://*.clerk.com", "https://img.clerk.com"],
  "font-src": ["'self'", "data:"],
  "connect-src": [
    "'self'",
    "https://accounts.clerk.com",
    "https://*.clerk.accounts.dev",
    "https://api.clerk.com",
    "wss://*.clerk.com", // WebSocket for Clerk real-time updates
  ],
  "frame-src": ["'self'", "https://accounts.clerk.com", "https://*.clerk.accounts.dev"],
  "frame-ancestors": ["'self'"],
  "form-action": ["'self'"],
  "base-uri": ["'self'"],
  "object-src": ["'none'"],
  "upgrade-insecure-requests": [],
};

// Build CSP string
const buildCsp = (directives: typeof cspDirectives): string => {
  return Object.entries(directives)
    .map(([key, values]) => {
      if (values.length === 0) return key;
      return `${key} ${values.join(" ")}`;
    })
    .join("; ");
};

// Security headers
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: buildCsp(cspDirectives),
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Enable strict mode for better error handling
  reactStrictMode: true,

  // Optimize production builds
  poweredByHeader: false, // Remove X-Powered-By header

  // Image optimization configuration
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.clerk.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.clerk.com",
        pathname: "/**",
      },
    ],
    // Enable modern image formats
    formats: ["image/avif", "image/webp"],
  },

  // Security headers
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Additional headers for API routes
        source: "/api/:path*",
        headers: [
          ...securityHeaders,
          {
            key: "Cache-Control",
            value: "no-store, max-age=0",
          },
        ],
      },
    ];
  },

  // Redirect HTTP to HTTPS in production
  async redirects() {
    return [];
  },

  // Experimental features
  experimental: {
    // Enable server actions (stable in Next.js 14+)
    // Optimize package imports
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
