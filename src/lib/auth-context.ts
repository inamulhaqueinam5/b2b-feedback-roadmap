import { cookies } from "next/headers";
import type { ActorContext, WorkspaceRole } from "@/services/boards";

/**
 * Resolves current user session and actor context for the given workspace.
 * In Phase 2, this provides an extensible seam that defaults to visitor
 * unless an authenticated session or dev override cookie is present.
 * Full OAuth and magic link session resolution will plug in during Issue #5.
 */
export async function getActorContext(): Promise<ActorContext> {
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
  } catch {
    // cookies() unavailable in non-request environments
  }

  return { role: "visitor" };
}
