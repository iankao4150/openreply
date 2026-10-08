// Issue a one-time sign-in link without sending email.
//
// For an instance run without a mail provider: an operator with database
// access creates the same verification token Auth.js would have emailed and
// opens the link. The address must still pass ALLOWED_EMAILS.
//
//   DATABASE_URL=... NEXTAUTH_SECRET=... NEXTAUTH_URL=https://... \
//     node scripts/login-link.mjs you@example.com
//
// The link signs in whoever opens it within 15 minutes, once. Do not paste it
// anywhere it could be read by someone else.
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const email = process.argv[2]?.trim().toLowerCase();
const { DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL } = process.env;
if (!email || !DATABASE_URL || !NEXTAUTH_SECRET || !NEXTAUTH_URL) {
  console.error(
    "usage: DATABASE_URL=… NEXTAUTH_SECRET=… NEXTAUTH_URL=… node scripts/login-link.mjs <email>"
  );
  process.exit(1);
}

// Mirrors @auth/core sendToken: the database keeps sha256(token + secret).
const token = randomBytes(32).toString("hex");
const hashed = createHash("sha256").update(`${token}${NEXTAUTH_SECRET}`).digest("hex");
const expires = new Date(Date.now() + 15 * 60 * 1000);

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
await client.query(
  'INSERT INTO "VerificationToken" (identifier, token, expires) VALUES ($1, $2, $3)',
  [email, hashed, expires]
);
await client.end();

const base = NEXTAUTH_URL.replace(/\/$/, "");
const params = new URLSearchParams({ callbackUrl: `${base}/dashboard`, token, email });
console.log(`${base}/api/auth/callback/resend?${params}`);
