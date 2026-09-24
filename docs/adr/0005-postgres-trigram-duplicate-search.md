# PostgreSQL Trigram Duplicate Search

We chose PostgreSQL `pg_trgm` extension over external search services like Algolia or Meilisearch for duplicate detection. Trigram similarity matches user typos and partial queries with high precision directly against the tenant database, eliminating external synchronization pipelines, reducing network latency and avoiding third-party hosting expenses.
