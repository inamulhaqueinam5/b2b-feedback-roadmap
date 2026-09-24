# PostgreSQL with Drizzle ORM

We chose PostgreSQL paired with Drizzle ORM over Prisma or direct raw drivers. Drizzle gives zero cold-start penalty on serverless runtimes, compile-time TypeScript type safety without a heavy client engine and full control over SQL queries for strict multi-tenant tenant-isolation filters.
