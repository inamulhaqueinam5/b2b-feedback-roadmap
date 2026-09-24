"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/db";
import type { DbClient } from "@/db/repositories/workspaces";
import {
  getRoadmap,
  type GetRoadmapResult,
  type RoadmapData,
  type RoadmapColumns,
  type RoadmapCard,
  type RoadmapStatus,
} from "@/services/roadmap";
import { getActorContext } from "@/lib/auth-context";
import type { ActorContext } from "@/services/boards";

export type {
  GetRoadmapResult,
  RoadmapData,
  RoadmapColumns,
  RoadmapCard,
  RoadmapStatus,
};

/**
 * Returns a deterministic cache tag for roadmap responses.
 */
export function getRoadmapCacheTag(workspaceId: string, boardId?: string): string {
  return boardId
    ? `workspace:${workspaceId}:roadmap:board:${boardId}`
    : `workspace:${workspaceId}:roadmap`;
}

/**
 * Server action to invalidate cached roadmap routes and tags.
 */
export async function revalidateRoadmapAction(
  workspaceSlug: string,
  workspaceId?: string,
  boardId?: string
): Promise<void> {
  try {
    revalidatePath(`/w/${workspaceSlug}/roadmap`);
  } catch {
    // Gracefully ignored outside Next.js request runtime
  }

  try {
    if (workspaceId) {
      revalidateTag(getRoadmapCacheTag(workspaceId, boardId));
      revalidateTag(`workspace:${workspaceId}:roadmap`);
    }
    revalidateTag(getRoadmapCacheTag(workspaceSlug, boardId));
    revalidateTag(`workspace:${workspaceSlug}:roadmap`);
  } catch {
    // Gracefully ignored outside Next.js request runtime
  }
}

/**
 * Server action to query the 3-column public roadmap for a workspace.
 * Supports filtering by board ID, cache tagging and multi-tenant isolation.
 */
export async function getRoadmapAction(
  workspaceId: string,
  options?: { boardId?: string },
  actor?: ActorContext,
  dbClient?: DbClient
): Promise<GetRoadmapResult> {
  const activeDb = dbClient ?? db;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    workspaceId.trim()
  );
  const effectiveActor =
    actor ??
    (await getActorContext({
      workspaceId: isUuid ? workspaceId : undefined,
      workspaceSlug: isUuid ? undefined : workspaceId,
      dbClient: activeDb,
    }));

  return getRoadmap(workspaceId, options, effectiveActor, activeDb);
}
