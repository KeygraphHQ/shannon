# Shannon SaaS - Web Application

This is the web interface for Shannon, the AI-powered security testing platform.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Authentication**: Clerk (OAuth, Email/Password, 2FA)
- **Database**: PostgreSQL + Prisma ORM
- **Styling**: Tailwind CSS 4
- **Icons**: Lucide React
- **Validation**: Zod

## Features

- OAuth authentication (Google, GitHub) and email/password
- Multi-factor authentication (TOTP-based 2FA)
- Multi-tenant organization management
- Team collaboration with role-based access control
- Security scanning workflow integration
- Real-time scan progress tracking
- GDPR-compliant data handling

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ (local or hosted)
- Clerk account (https://clerk.com)

## Getting Started

### 1. Install Dependencies

```bash
cd web
npm install
```

### 2. Configure Environment

Copy the example environment file and fill in your values:

```bash
cp .env.example .env.local
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `CLERK_WEBHOOK_SECRET` | Clerk webhook signing secret |
| `DATABASE_URL` | PostgreSQL connection string |

Optional environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_APP_URL` | Public app URL | `http://localhost:3000` |
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | Enable analytics tracking | `false` |
| `LOG_LEVEL` | Minimum log level | `debug` (dev) / `info` (prod) |

### 3. Setup Database

Start a local PostgreSQL database (if needed):

```bash
docker run --name shannon-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:15
```

Run migrations:

```bash
npx prisma migrate dev
```

### 4. Configure Clerk

#### Webhook Setup

1. Go to your Clerk Dashboard > Webhooks
2. Add a new webhook endpoint: `https://your-domain.com/api/webhooks/clerk`
3. Select events: `user.created`, `user.updated`, `user.deleted`
4. Copy the signing secret to `CLERK_WEBHOOK_SECRET`

For local development, use [ngrok](https://ngrok.com) to expose your local server:

```bash
ngrok http 3000
```

#### Authentication Methods

Enable the following in Clerk Dashboard > User & Authentication:
- OAuth providers (Google, GitHub)
- Email/Password authentication
- TOTP 2FA (Multi-factor authentication)

### 5. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

```
web/
├── app/
│   ├── (auth)/              # Auth pages (sign-in, sign-up, verify)
│   ├── (dashboard)/         # Protected dashboard routes
│   │   ├── org/[orgId]/     # Organization-specific pages
│   │   ├── scans/[scanId]/  # Scan detail pages
│   │   └── settings/        # User settings
│   ├── api/                 # API routes
│   │   └── webhooks/        # Webhook handlers
│   ├── error.tsx            # Global error page
│   ├── not-found.tsx        # 404 page
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Landing page
├── components/
│   ├── ui/                  # Reusable UI components
│   │   ├── skeleton.tsx     # Loading skeletons
│   │   └── spinner.tsx      # Loading spinners
│   ├── error-boundary.tsx   # Error boundary component
│   ├── toast-provider.tsx   # Toast notifications
│   ├── onboarding-tour.tsx  # New user onboarding
│   └── optimized-image.tsx  # Optimized image components
├── lib/
│   ├── actions/             # Server actions
│   │   ├── users.ts         # User actions (GDPR export/delete)
│   │   ├── organizations.ts # Organization management
│   │   ├── scans.ts         # Scan operations
│   │   ├── invitations.ts   # Team invitations
│   │   └── memberships.ts   # Team member management
│   ├── validations/         # Zod validation schemas
│   ├── email-templates/     # Transactional email templates
│   ├── accessibility.ts     # Accessibility utilities
│   ├── analytics.ts         # Analytics tracking
│   ├── audit.ts             # Audit logging
│   ├── auth.ts              # Auth helpers
│   ├── db.ts                # Prisma client
│   ├── logger.ts            # Logging utility
│   ├── rate-limit.ts        # Rate limiting
│   └── security.ts          # Security utilities
├── prisma/
│   └── schema.prisma        # Database schema
├── middleware.ts            # Auth + rate limiting middleware
└── next.config.ts           # Next.js + security headers config
```

## Database Schema

The application uses the following main entities:

- **User**: Synced from Clerk, linked to organizations
- **Organization**: Multi-tenant workspace with plan tiers
- **OrganizationMembership**: User-org relationship with roles (owner, admin, member, viewer)
- **Invitation**: Team member invitations with 7-day expiry
- **AuditLog**: Security event logging
- **Scan**: Security scan records
- **Finding**: Vulnerability findings from scans
- **Project**: Grouping for scans

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npx prisma studio` | Open Prisma database viewer |
| `npx prisma migrate dev` | Run database migrations |
| `npx prisma generate` | Regenerate Prisma client |

## Security Features

- **CSP Headers**: Strict Content Security Policy
- **Rate Limiting**: Protection against abuse
- **Input Validation**: Zod schemas for all inputs
- **GDPR Compliance**: Data export and deletion
- **Audit Logging**: All sensitive actions logged
- **2FA Support**: TOTP-based multi-factor auth
- **Secure Headers**: HSTS, X-Frame-Options, etc.

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Docker

```bash
# Build the image
docker build -t shannon-web .

# Run the container
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_..." \
  -e CLERK_SECRET_KEY="sk_..." \
  shannon-web
```

### Other Platforms

Build the application:

```bash
npm run build
```

Start the production server:

```bash
npm run start
```

## Troubleshooting

### Common Issues

**Clerk webhook not receiving events**
- Ensure the webhook URL is publicly accessible
- Check the signing secret matches `CLERK_WEBHOOK_SECRET`
- For local dev, use ngrok to expose localhost

**Database connection errors**
- Verify `DATABASE_URL` is correct
- Ensure PostgreSQL is running
- Run `npx prisma migrate dev` to apply migrations

**2FA not working**
- Enable TOTP in Clerk Dashboard
- Ensure time synchronization on user's device

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Run linting: `npm run lint`
4. Run type checking: `npx tsc --noEmit`
5. Submit a pull request

## License

Proprietary - All rights reserved.
