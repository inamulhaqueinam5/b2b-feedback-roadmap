import {
  getRoadmapPosts,
  type RoadmapData,
  type RoadmapColumns,
  type RoadmapCard,
  type RoadmapStatus,
} from "@/db/repositories/roadmap";
import {
  getWorkspaceRecordById,
  getWorkspaceRecordBySlug,
  type DbClient,
} from "@/db/repositories/workspaces";
import { getBoardRecordById } from "@/db/repositories/boards";
import { canViewPrivateBoards, type ActorContext } from "@/services/boards";
import type { Workspace } from "@/db/schema/workspaces";

export type { RoadmapData, RoadmapColumns, RoadmapCard, RoadmapStatus };

export type GetRoadmapResult =
  | {
      success: true;
      roadmap: RoadmapData;
      workspace: Workspace;
    }
  | {
      success: false;
      error: string;
      code?: string;
    };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveWorkspace(workspaceIdOrSlug: string, db: DbClient) {
  if (!workspaceIdOrSlug) return null;
  const trimmed = workspaceIdOrSlug.trim();
  if (UUID_REGEX.test(trimmed)) {
    const ws = await getWorkspaceRecordById(db, trimmed);
    if (ws) return ws;
  }
  return await getWorkspaceRecordBySlug(db, trimmed.toLowerCase());
}

/**
 * Retrieves partitioned roadmap data for a workspace.
 * Validates tenant boundaries, enforces board privacy and returns columns.
 */
export async function getRoadmap(
  workspaceIdOrSlug: string,
  options: { boardId?: string } | undefined,
  actor: ActorContext | undefined,
  db: DbClient
): Promise<GetRoadmapResult> {
  const workspace = await resolveWorkspace(workspaceIdOrSlug, db);
  if (!workspace) {
    return {
      success: false,
      error: "Workspace not found",
      code: "NOT_FOUND",
    };
  }

  const includePrivateBoards = canViewPrivateBoards(actor);

  if (options?.boardId) {
    const targetBoard = await getBoardRecordById(db, workspace.id, options.boardId);
    if (!targetBoard || targetBoard.isArchived) {
      return {
        success: false,
        error: "Board not found",
        code: "NOT_FOUND",
      };
    }

    if (targetBoard.isPrivate && !includePrivateBoards) {
      return {
        success: false,
        error: "Board not found",
        code: "NOT_FOUND",
      };
    }
  }

  const roadmap = await getRoadmapPosts(db, {
    workspaceId: workspace.id,
    boardId: options?.boardId,
    includePrivateBoards,
    userId: actor?.userId,
  });

  return {
    success: true,
    roadmap,
    workspace,
  };
}
