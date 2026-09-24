export type IntentType =
  | "upvote"
  | "create_post"
  | "create_comment"
  | "custom";

export interface QueuedIntent<T = unknown> {
  id: string;
  type: IntentType;
  payload: T;
  createdAt: number;
}

export interface UpvoteIntentPayload {
  postId: string;
  workspaceSlug?: string;
}

export interface CreatePostIntentPayload {
  workspaceSlug: string;
  boardSlug: string;
  title: string;
  description: string;
}

export interface CreateCommentIntentPayload {
  postId: string;
  content: string;
  workspaceSlug?: string;
}

const INTENT_STORAGE_KEY = "b2b_pending_intent";

// In-memory fallback for environments without browser storage (SSR, testing)
let memoryStore: QueuedIntent | null = null;

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage ?? window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function saveQueuedIntent<T = unknown>(
  type: IntentType,
  payload: T
): QueuedIntent<T> {
  const intent: QueuedIntent<T> = {
    id: `intent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type,
    payload,
    createdAt: Date.now(),
  };

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(INTENT_STORAGE_KEY, JSON.stringify(intent));
    } catch {
      memoryStore = intent as unknown as QueuedIntent;
    }
  } else {
    memoryStore = intent as unknown as QueuedIntent;
  }

  return intent;
}

export function getQueuedIntent(): QueuedIntent | null {
  const storage = getStorage();
  if (storage) {
    try {
      const raw = storage.getItem(INTENT_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw) as QueuedIntent;
      }
    } catch {
      return memoryStore;
    }
  }
  return memoryStore;
}

export function clearQueuedIntent(): void {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(INTENT_STORAGE_KEY);
    } catch {
      // ignore storage access errors
    }
  }
  memoryStore = null;
}

export function hasQueuedIntent(): boolean {
  return getQueuedIntent() !== null;
}

export function queueUpvoteIntent(
  postId: string,
  workspaceSlug?: string
): QueuedIntent<UpvoteIntentPayload> {
  return saveQueuedIntent<UpvoteIntentPayload>("upvote", {
    postId,
    workspaceSlug,
  });
}

export function queueCreatePostIntent(
  data: CreatePostIntentPayload
): QueuedIntent<CreatePostIntentPayload> {
  return saveQueuedIntent<CreatePostIntentPayload>("create_post", data);
}

export function queueCommentIntent(
  data: CreateCommentIntentPayload
): QueuedIntent<CreateCommentIntentPayload> {
  return saveQueuedIntent<CreateCommentIntentPayload>("create_comment", data);
}

export async function executeQueuedIntent(
  executor: (intent: QueuedIntent) => Promise<boolean> | boolean
): Promise<boolean> {
  const intent = getQueuedIntent();
  if (!intent) {
    return false;
  }

  try {
    const success = await executor(intent);
    if (success) {
      clearQueuedIntent();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
