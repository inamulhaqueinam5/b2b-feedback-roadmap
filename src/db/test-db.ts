import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";

let testDbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export async function getTestDb() {
  if (testDbInstance) {
    return testDbInstance;
  }

  const client = new PGlite();

  try {
    await client.exec(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
  } catch {
    // pg_trgm extension not available in WASM environment
  }

  await client.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(64) NOT NULL,
      slug VARCHAR(48) NOT NULL UNIQUE,
      brand_color VARCHAR(16) NOT NULL DEFAULT '#0ea5e9',
      logo_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(128),
      email VARCHAR(255) NOT NULL UNIQUE,
      email_verified TIMESTAMPTZ,
      image TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS boards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name VARCHAR(64) NOT NULL,
      slug VARCHAR(48) NOT NULL,
      description TEXT,
      icon VARCHAR(32) NOT NULL DEFAULT 'message-square',
      is_private BOOLEAN NOT NULL DEFAULT FALSE,
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_boards_workspace_slug UNIQUE (workspace_id, slug)
    );

    CREATE INDEX IF NOT EXISTS idx_boards_workspace_active ON boards(workspace_id, is_archived, sort_order);

    CREATE TABLE IF NOT EXISTS accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(32) NOT NULL,
      provider VARCHAR(32) NOT NULL,
      provider_account_id VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_accounts_provider_account UNIQUE (provider, provider_account_id)
    );

    CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_token VARCHAR(255) NOT NULL UNIQUE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS verification_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      identifier VARCHAR(255) NOT NULL,
      token VARCHAR(255) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_verification_tokens_identifier ON verification_tokens(identifier);

    CREATE TABLE IF NOT EXISTS workspace_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(32) NOT NULL DEFAULT 'member',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_workspace_members_workspace_user UNIQUE (workspace_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON workspace_members(user_id);

    CREATE TABLE IF NOT EXISTS posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'open',
      upvote_count INTEGER NOT NULL DEFAULT 1,
      associated_mrr NUMERIC(10, 2) DEFAULT 0,
      is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
      merged_into_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_posts_workspace_board ON posts(workspace_id, board_id);
    CREATE INDEX IF NOT EXISTS idx_posts_workspace_status ON posts(workspace_id, status);
    CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id);
    CREATE INDEX IF NOT EXISTS idx_posts_merged_into ON posts(merged_into_post_id);

    CREATE TABLE IF NOT EXISTS post_upvotes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_post_upvotes_post_user UNIQUE (post_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_post_upvotes_user_id ON post_upvotes(user_id);

    CREATE TABLE IF NOT EXISTS post_subscribers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_post_subscribers_post_user UNIQUE (post_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_post_subscribers_user_id ON post_subscribers(user_id);

    CREATE TABLE IF NOT EXISTS comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      is_internal_note BOOLEAN NOT NULL DEFAULT FALSE,
      is_system_audit BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
    CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id);
    CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
  `);

  testDbInstance = drizzle(client, { schema });
  return testDbInstance;
}
