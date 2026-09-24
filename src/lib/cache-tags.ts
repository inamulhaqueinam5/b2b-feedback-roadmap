/**
 * Returns a deterministic cache tag for roadmap responses.
 */
export function getRoadmapCacheTag(workspaceId: string, boardId?: string): string {
  return boardId
    ? `workspace:${workspaceId}:roadmap:board:${boardId}`
    : `workspace:${workspaceId}:roadmap`;
}
