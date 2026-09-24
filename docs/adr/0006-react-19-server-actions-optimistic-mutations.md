# React 19 Server Actions & Optimistic Mutations

We chose native Next.js 15 Server Actions paired with React 19 `useOptimistic` over client-side REST libraries and external cache managers like TanStack Query. This architecture guarantees sub-50ms optimistic UI transitions on upvotes and comments while keeping client bundle sizes minimal, preserving full server-side caching and simplifying data revalidation with `revalidateTag`.
