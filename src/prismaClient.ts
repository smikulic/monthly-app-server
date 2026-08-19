// src/prismaClient.ts
// Single place the Prisma client and its connection options are constructed.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

// SSL is configured in DATABASE_URL, not here, and that is deliberate: `pg`
// merges the SSL config it parses from the connection string *over* any `ssl`
// option passed to PrismaPg, so options set here are silently discarded.
//
// The URL uses `uselibpqcompat=true&sslmode=require`, i.e. libpq semantics:
// the connection is encrypted, but the certificate chain is not verified.
// Digital Ocean's managed Postgres uses a self-signed CA, and this matches what
// the Prisma 6 engine did, so it is parity rather than a change.
//
// To move to verified TLS: commit DO's CA certificate (it is public) to
// `certs/do-ca.crt` and change the URL to
// `?sslmode=verify-full&sslrootcert=./certs/do-ca.crt`.
// See SECURITY-AUDIT.local.md (2026-08-19).
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

export const prisma = new PrismaClient({ adapter });
