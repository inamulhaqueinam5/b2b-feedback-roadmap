# Specification: B2B Feedback & Product Roadmap Platform

## Problem Statement

Software teams and product creators often struggle to collect, validate and organize customer feedback efficiently. Feature requests end up scattered across emails, chat channels and issue trackers. This fragmentation leads to duplicate discussions, misplaced priorities and wasted engineering effort on low-demand features. At the same time, end users feel unheard because they lack visibility into whether their suggestions are acknowledged, prioritized or actively being built.

## Solution

A dedicated, multi-tenant feedback management and public roadmap platform that bridges software teams and their communities. Users can submit structured posts, discover existing suggestions via debounced duplicate detection, participate in discussions and cast instant upvotes with zero perceptible latency. Workspace admins can triage feedback, change post statuses across a unified lifecycle, write confidential internal notes with customer revenue weighting, merge duplicates without losing voter intent and publish an interactive three-column public roadmap (Planned, In Progress and Completed) to keep everyone aligned.

## User Stories

1. As a visitor, I want to explore a workspace's public boards without logging in, so that I can see what features other community members are suggesting.
2. As a visitor, I want to view a workspace's public roadmap, so that I can understand the product direction and upcoming releases.
3. As a visitor, I want to search posts by keyword across titles and descriptions, so that I can find topics relevant to my needs.
4. As a visitor, I want to click upvote or start drafting a post without an initial login barrier, so that my workflow remains uninterrupted until I commit my action.
5. As a visitor, I want my drafted post or pending upvote action preserved across authentication, so that I do not lose my input after signing in.
6. As a user, I want to log in using Google OAuth, GitHub OAuth or a passwordless Magic Link, so that I have a fast and secure authentication experience.
7. As a user, I want to submit a new post with a title, description, category board and optional image attachments, so that the product team understands my use case clearly.
8. As a user, I want to see real-time duplicate post suggestions as I type my post title, so that I can upvote existing requests rather than creating duplicate entries.
9. As a user, I want to cast an upvote and see the counter update immediately, so that the application feels snappy and responsive without network delays.
10. As a user, I want to withdraw my upvote by clicking the upvote button again, so that I can change my mind if a post is no longer relevant to me.
11. As a user, I want to post comments on any open post, so that I can share workarounds, add context or discuss implementation details.
12. As a user, I want to edit or delete my own comments within fifteen minutes of posting, so that I can fix typos or retract accidental submissions.
13. As a user, I want to filter posts by board, status and tags, so that I can browse requests by specific product areas.
14. As a user, I want to sort posts by Trending, Top Voted and Newest, so that I can discover popular or recently submitted ideas.
15. As a user, I want to share a direct URL that preserves my active filters and search queries, so that colleagues can view the exact filtered subset of posts.
16. As a user, I want to open any roadmap card in a modal or detail page, so that I can read the full discussion and upvote history.
17. As a user, I want to receive in-app notifications and email updates when a post I upvoted or commented on changes status, so that I stay informed when features ship.
18. As a workspace owner, I want to provision a new workspace with a company name and unique URL slug, so that my team has a branded home for feedback.
19. As a workspace owner, I want to invite team members and assign roles (Admin, Member or Guest), so that our team can collaborate on moderation.
20. As a workspace admin, I want to create, edit and archive multiple distinct boards, so that customer feedback is neatly segmented.
21. As a workspace admin, I want to configure board privacy as Public or Private, so that confidential or internal feedback remains restricted to team members.
22. As a workspace admin, I want to change a post's status between Open, Under Review, Planned, In Progress, Completed and Closed, so that the community knows the true state of every item.
23. As a workspace admin, I want status transitions to automatically create system audit comments in the post thread, so that the history of changes is transparent.
24. As a workspace admin, I want to write confidential internal notes on any post, so that our team can discuss implementation feasibility and estimates privately.
25. As a workspace admin, I want to record customer revenue weighting (Associated MRR) on posts, so that our team can prioritize requests by financial impact.
26. As a workspace admin, I want to merge duplicate posts into a canonical master post, so that split upvotes are consolidated while preserving audit redirects.
27. As a workspace admin, I want to pin high-priority posts or announcements to the top of a board, so that important topics receive immediate visibility.
28. As a workspace admin, I want to edit or remove offensive, spammy or inappropriate posts and comments, so that our feedback forum remains constructive.

## Implementation Decisions

### Frontend Independence & Impeccable Skill Authority
- The frontend interface design, component layout, aesthetic polish, micro-interactions, motion, spacing and typography are fully delegated to the `/impeccable` agentic skill.
- The interface will adopt the Modern Precision visual world (slate and zinc neutral foundations, 1px border hierarchy, crisp typography, tactile upvote toggles and smooth status transitions).
- Public feedback boards and roadmap visualizers will operate under the **Operate / Experience** mode, emphasizing responsive speed, scanability and delightful micro-interactions.
- The admin dashboard, moderation bar and internal collaboration drawers will operate under the **Operate** mode, prioritizing keyboard speed, dense information display and rapid triage.

### Architecture & Routing Modules
- Built on Next.js 15 App Router using TypeScript.
- Workspaces will resolve via path-based routing (`/w/[workspaceSlug]`), with middleware abstractions prepared for future custom domains and subdomains (ADR 0001).
- Server Actions will handle all database mutations and authorization validation, while React 19 `useOptimistic` manages instantaneous client updates (ADR 0006).
- Selective server cache revalidation (`revalidateTag` and `revalidatePath`) will purge public feeds within two seconds of state changes.

### Database & Multi-Tenant Data Layer
- PostgreSQL powered by Drizzle ORM (ADR 0002).
- Strict tenant query helper wrappers enforcing `workspaceId` equality on every query to prevent cross-tenant data leakage.
- Core relational entities:
  - `workspaces`: id, name, slug, brandColor, logoUrl, createdAt.
  - `boards`: id, workspaceId, name, slug, description, isPrivate, icon, sortOrder.
  - `posts`: id, workspaceId, boardId, authorId, title, description, status, upvoteCount, associatedMrr, isPinned, mergedIntoPostId, createdAt, updatedAt.
  - `post_upvotes`: id, postId, userId, createdAt (unique constraint on postId + userId).
  - `comments`: id, postId, authorId, content, isInternalNote, createdAt, updatedAt.
  - `workspace_members`: id, workspaceId, userId, role (Owner, Admin, Member, Guest), createdAt.
  - `notifications`: id, userId, postId, type, message, isRead, createdAt.
- PostgreSQL `pg_trgm` extension enabled for trigram similarity duplicate detection on post titles (ADR 0005).
- Atomic counter increments and decrements for `upvoteCount` on the `posts` table within database transactions (ADR 0004).

### Authentication & Authorization Engine
- Self-hosted authentication persisting directly in PostgreSQL tables via Better Auth or Auth.js v5 (ADR 0003).
- Supports Google OAuth, GitHub OAuth and email Magic Links.
- Anonymous visitor intent capture: client-side session caching preserves unauthenticated post drafts and upvote actions, completing them automatically upon login completion.
- Role-Based Access Control (RBAC) enforced at both Server Action guards and UI conditional renders.

### Public Roadmap Engine
- Interactive three-column Kanban board mapping:
  - `Planned` column maps to posts with status `Planned`.
  - `In Progress` column maps to posts with status `In Progress`.
  - `Completed` column maps to posts with status `Completed`.
- Posts with status `Open`, `Under Review` and `Closed` are excluded from roadmap columns.
- Real-time filtering by board, tag and release quarter.

### Media & Notifications
- S3-compatible cloud storage (Cloudflare R2 or Uploadthing) for direct image attachments in post descriptions and comments.
- Notifications orchestrated via an in-app notification dropdown and transactional status update emails via Resend.

## Testing Decisions

### What Makes a Good Test
- Tests must verify external behavioral contracts, user interactions and security boundaries, rather than internal implementation details.
- Tests will assert that:
  - Optimistic upvoting immediately toggles state and correctly increments the persisted database count.
  - Unauthenticated users cannot trigger server mutations without valid session tokens.
  - Cross-tenant queries never expose data belonging to another workspace.
  - Duplicate merges transfer all unique upvoters and create appropriate redirect records.
  - Admin-only internal notes are completely excluded from API responses for standard users.

### Modules Tested
- **Highest Seam (Server Actions & HTTP Boundary):** Direct invocation of Server Actions with mocked and authenticated session contexts against an isolated PostgreSQL test environment.
- **Tenant Isolation Guards:** Automated boundary tests verifying queries reject mismatched workspace slugs.
- **Core State Machines:** Post status transition triggers, upvote deduplication logic and duplicate merge workflows.

### Prior Art
- Standard Next.js 15 Server Action testing patterns with Vitest and test database transactions.

## Out of Scope

- Timeline and Gantt chart scheduling views (deferred to V2).
- Automatic wildcard DNS and SSL custom domain management in V1 (schema is prepared, but routing remains path-first).
- Deep two-way CRM sync with Salesforce or HubSpot (V1 uses manual Associated MRR fields).
- Public API keys and webhooks for external third-party integrations (planned for V2).

## Further Notes

- `/impeccable` possesses complete autonomy over component architecture, design tokens, color ramps, responsive layout behavior, empty states and tactile polish.
- A comprehensive database seeding script will be provided, populating realistic demo workspaces, categorized boards, feature requests, comments and roadmap stages to showcase the platform immediately upon installation.
