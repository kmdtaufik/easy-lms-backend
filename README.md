# Easy LMS Backend

Express + Better Auth + MongoDB backend powering the Easy LMS platform.

## Stack
- Node.js / Express (`src/index.ts`)
- Auth: Better Auth (email+password, Google OAuth, Email OTP via Resend) – see [`src/lib/auth.ts`](src/lib/auth.ts)
- DB: MongoDB via `better-auth` mongodb adapter (`src/db`)
- Mailing: Resend (OTP + transactional)
- Rate / Abuse protection: Arcjet middleware (`src/middleware/arcjet.middleware.ts`)
- File/Object storage (course media): S3-compatible (keys stored; actual upload handled client-side)
- Deployment Target: Vercel Serverless (uses pre-built `dist/index.js` with `vercel.json`)
- TypeScript build → `dist/`

## Main Features
| Domain | Routes (prefix `/api`) | Description |
|--------|------------------------|-------------|
| Auth | `/auth/*` | Better Auth handlers (session, signup, signin, social, otp, admin) |
| Products (Courses) | `/product` | Create / list / update courses |
| Chapters | `/chapter` | CRUD chapters per course |
| Lessons | `/lesson` | CRUD lessons (video + metadata) |
| Enrollment | `/enrollment` | Enroll user, list user enrollments |
| Progress | `/lesson/progress` | Track lesson completion, aggregate progress |
| Stats / Analytics | `/stats` | Aggregated platform metrics |

(Check controllers/services under `src/routers` and `src/services` for exact contracts.)

## Auth Overview
Better Auth is mounted in [`src/index.ts`](src/index.ts):
```ts
app.all("/api/auth/{*path}", arcjetMiddleware(), toNodeHandler(auth));
```
Core config: [`src/lib/auth.ts`](src/lib/auth.ts)
- Email/password enabled
- Google social provider
- Email OTP plugin (`emailOTP`)
- Admin plugin (used in frontend admin dashboard)
- Cookie cache + `sameSite: "none"` for cross-site usage with separate frontend domain

### Client Flows
Password signup:
```
POST /api/auth/sign-up/email
{ email, password, name }
```
Password signin:
```
POST /api/auth/sign-in/password
{ email, password }
```
Google OAuth redirect:
```
GET /api/auth/sign-in/google?callbackURL=<url>
```
Email OTP:
```
POST /api/auth/email-otp/send { email, type: "sign-in" }
POST /api/auth/email-otp/verify { email, otp, type }
```
Session:
```
GET /api/auth/session
POST /api/auth/sign-out
```

## Project Structure
```
src/
  index.ts              # Express bootstrap (export default app for serverless)
  lib/
    auth.ts             # Better Auth configuration
    arcjet.ts           # Arcjet client setup
    s3Client.ts         # S3 client helper
  middleware/
    arcjet.middleware.ts
    auth.middleware.ts  # token-based guard (non Better Auth)
  routers/
    productRoutes.ts
    chapter.route.ts
    lesson.route.ts
    enrollment.route.ts
    stats.route.ts
    lessonProgress.route.ts
  db/
    index.ts            # Mongo / connection
    models/             # Mongoose (or schema) models
    controllers/        # Business logic handlers
    services/           # Reusable data / domain services
```

## Environment Variables
(Configure in Vercel project settings or `.env` locally.)
```
DATABASE_URL=<mongodb URI>  # or MONGODB_URI if used internally
CORS_ORIGIN=https://your-frontend-domain
RESEND_API_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
ARCJET_KEY=...
AWS_BUCKET_NAME_S3=...
AWS_ENDPOINT_URL_S3=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

## Local Development
```bash
pnpm install
pnpm dev     # ts-node/tsx dev
```

## Build
Generates `dist/` used by Vercel:
```bash
pnpm build   # tsc
```

Ensure `vercel.json` (already present) points to `dist/index.js`.

## Deployment Notes
1. Remove/avoid `app.listen` in serverless (only export default app).
2. Set all secrets in Vercel dashboard.
3. If enabling custom domains, update `CORS_ORIGIN` and (optionally) Better Auth `trustedOrigins`.

## Security / CORS
CORS configured in `index.ts`:
```ts
cors({
  origin: process.env.CORS_ORIGIN || "",
  credentials: true,
  methods: ["GET","POST","OPTIONS","PUT","DELETE"],
})
```
Keep `CORS_ORIGIN` strict (single origin) for production.

## Progress Tracking
Lesson progress endpoints aggregate counts; frontend dashboard maps results to:
```js
progress.completionPercentage
progress.completedLessons
progress.totalLessons
progress.lastActivity
```

## Admin Operations
Frontend admin uses Better Auth admin plugin for:
- List users (`admin.listUsers`)
- Create user (`admin.createUser`)
- Ban / unban (`admin.banUser`, `admin.unbanUser`)
- Set role (`admin.setRole`)

## Error Handling
Return shape (typical):
```json
{ "success": false, "message": "Error message" }
```
Prefer consistent envelope (`data`, `message`) across routers.

## Future Enhancements (Suggested)
- Paginated listing for large datasets (already partial with limit/offset)
- Rate limiting (Arcjet per route)
- Input validation middleware (Zod or Joi)
- OpenAPI spec generation

---
