# Shannon SaaS - Web Application

This is the web interface for Shannon, the AI-powered security testing platform.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Authentication**: Clerk
- **Database**: PostgreSQL + Prisma
- **Styling**: Tailwind CSS
- **Icons**: Lucide React

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

### 3. Setup Database

Start a local PostgreSQL database (if needed):

```bash
docker run --name shannon-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:15
```

Run migrations:

```bash
npx prisma migrate dev
```

### 4. Configure Clerk Webhook

1. Go to your Clerk Dashboard > Webhooks
2. Add a new webhook endpoint: `https://your-domain.com/api/webhooks/clerk`
3. Select events: `user.created`, `user.updated`, `user.deleted`
4. Copy the signing secret to `CLERK_WEBHOOK_SECRET`

For local development, use [ngrok](https://ngrok.com) to expose your local server.

### 5. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

```
web/
├── app/
│   ├── (auth)/           # Auth pages (sign-in, sign-up)
│   ├── (dashboard)/      # Protected dashboard routes
│   ├── api/              # API routes
│   │   └── webhooks/     # Webhook handlers
│   ├── layout.tsx        # Root layout with ClerkProvider
│   └── page.tsx          # Landing page
├── components/           # React components
├── lib/
│   ├── actions/          # Server actions
│   ├── auth.ts           # Auth helpers
│   ├── audit.ts          # Audit logging
│   └── db.ts             # Prisma client
├── prisma/
│   └── schema.prisma     # Database schema
└── middleware.ts         # Clerk auth middleware
```

## Database Schema

The application uses the following main entities:

- **User**: Synced from Clerk, linked to organizations
- **Organization**: Multi-tenant workspace
- **OrganizationMembership**: User-org relationship with roles
- **AuditLog**: Security event logging

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npx prisma studio` | Open Prisma database viewer |
| `npx prisma migrate dev` | Run database migrations |

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Other Platforms

Build the application:

```bash
npm run build
```

Start the production server:

```bash
npm run start
```

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Run linting: `npm run lint`
4. Submit a pull request

## License

Proprietary - All rights reserved.
