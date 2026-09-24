# Self-Hosted Auth with Postgres Persistence

We chose self-hosted authentication (Better Auth or Auth.js v5) persisting directly in PostgreSQL over managed SaaS auth providers like Clerk. This eliminates external per-user seat pricing, avoids third-party vendor lock-in and allows seamless cross-workspace user identity models with custom workspace membership relations.
