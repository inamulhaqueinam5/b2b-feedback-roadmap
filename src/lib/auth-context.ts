import { cookies } from "next/headers";
import { db as defaultDb } from "@/db";
import type { DbClient } from "@/db/repositories/workspaces";
import {
  SESSION_COOKIE_NAME,
  validateSession,
  getUserWorkspaceRole,
} from "@/services/auth";
import type { ActorContext, WorkspaceRole } from "@/services/boards";

export interface ActorContextOptions {
  workspaceId?: string;
  workspaceSlug?: string;
  dbClient?: DbClient;
}

/**
 * Resolves current user session and actor context for the given workspace.
 * First checks for local development overrides (dev_role and dev_user_id cookies).
 * Next resolves authenticated sessions via session cookie and looks up workspace membership.
 * Defaults cleanly to visitor role when unauthenticated.
 */
export async function getActorContext(
  optionsOrSlug?: ActorContextOptions | string
): Promise<ActorContext> {
  const options: ActorContextOptions =
    typeof optionsOrSlug === "string"
      ? { workspaceSlug: optionsOrSlug }
      : optionsOrSlug ?? {};

  try {
    const cookieStore = await cookies();
    const devRole = cookieStore.get("dev_role")?.value as WorkspaceRole | undefined;
    const devUserId = cookieStore.get("dev_user_id")?.value;

    if (devRole && ["owner", "admin", "member", "guest"].includes(devRole)) {
      return {
        userId: devUserId ?? "dev-user",
        role: devRole,
      };
    }

    const sessionCookie =
      cookieStore.get(SESSION_COOKIE_NAME)?.value ??
      cookieStore.get("sessionToken")?.value;

    if (sessionCookie) {
      const activeDb = options.dbClient ?? defaultDb;
      const sessionResult = await validateSession(sessionCookie, activeDb);

      if (sessionResult.valid) {
        const workspaceTarget = options.workspaceId ?? options.workspaceSlug;
        let role: WorkspaceRole = "visitor";

        if (workspaceTarget) {
          role = await getUserWorkspaceRole(
            sessionResult.user.id,
            workspaceTarget,
            activeDb
          );
        }

        return {
          userId: sessionResult.user.id,
          role,
          user: {
            id: sessionResult.user.id,
            name: sessionResult.user.name,
            email: sessionResult.user.email,
            image: sessionResult.user.image,
          },
        };
      }
    }
  } catch {
    // cookies() unavailable in non-request environments or tests
  }

  return { role: "visitor" };
}
