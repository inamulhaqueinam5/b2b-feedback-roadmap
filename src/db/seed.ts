import { eq } from "drizzle-orm";
import type { DbClient } from "./repositories/workspaces";
import { workspaces } from "./schema/workspaces";
import { boards } from "./schema/boards";
import { users, workspaceMembers } from "./schema/auth";
import { posts, postUpvotes, postSubscribers } from "./schema/posts";
import { comments } from "./schema/comments";
import { notifications } from "./schema/notifications";

export interface SeedResult {
  workspace: typeof workspaces.$inferSelect;
  users: Array<typeof users.$inferSelect>;
  boards: Array<typeof boards.$inferSelect>;
  posts: Array<typeof posts.$inferSelect>;
}

/**
 * Seeds a rich, realistic demo workspace with users, categorized boards,
 * feature requests, comments, upvotes, roadmap items and internal notes.
 */
export async function seedDatabase(db: DbClient): Promise<SeedResult> {
  // 1. Create or retrieve demo workspace
  const workspaceSlug = "acme-cloud";
  const [existingWorkspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, workspaceSlug))
    .limit(1);

  let workspace = existingWorkspace;
  if (!workspace) {
    const [createdWorkspace] = await db
      .insert(workspaces)
      .values({
        name: "Acme Cloud Platform",
        slug: workspaceSlug,
        brandColor: "#0ea5e9",
        logoUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&auto=format&fit=crop&q=80",
      })
      .returning();
    workspace = createdWorkspace;
  }

  // 2. Create demo users
  const demoUserData = [
    { name: "Alex Rivers", email: "alex@acme.com", role: "owner" as const },
    { name: "Sarah Chen", email: "sarah@acme.com", role: "admin" as const },
    { name: "Marcus Brody", email: "marcus@acme.com", role: "member" as const },
    { name: "Elena Rostova", email: "elena@customer.com", role: "guest" as const },
    { name: "Dave Miller", email: "dave@partner.com", role: "guest" as const },
  ];

  const createdUsers: Array<typeof users.$inferSelect> = [];
  for (const u of demoUserData) {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, u.email))
      .limit(1);

    if (existing) {
      createdUsers.push(existing);
    } else {
      const [newUser] = await db
        .insert(users)
        .values({
          name: u.name,
          email: u.email,
          image: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.name)}`,
        })
        .returning();

      await db
        .insert(workspaceMembers)
        .values({
          workspaceId: workspace.id,
          userId: newUser.id,
          role: u.role,
        })
        .onConflictDoNothing();

      createdUsers.push(newUser);
    }
  }

  const [owner, admin, member, customerElena, customerDave] = createdUsers;

  // 3. Create categorized boards
  const demoBoardsData = [
    {
      name: "Feature Requests",
      slug: "features",
      description: "Suggest new product capabilities, workflows and UX enhancements.",
      icon: "sparkles",
      isPrivate: false,
      sortOrder: 0,
    },
    {
      name: "Integrations",
      slug: "integrations",
      description: "Vote on third-party tools, webhooks and developer ecosystem connectors.",
      icon: "puzzle",
      isPrivate: false,
      sortOrder: 1,
    },
    {
      name: "Bug Reports",
      slug: "bugs",
      description: "Report unexpected behavior, performance regressions and rendering issues.",
      icon: "bug",
      isPrivate: false,
      sortOrder: 2,
    },
    {
      name: "Internal Architecture",
      slug: "infra",
      description: "Confidential infrastructure scaling, compliance and platform reliability roadmap.",
      icon: "lock",
      isPrivate: true,
      sortOrder: 3,
    },
  ];

  const createdBoards: Array<typeof boards.$inferSelect> = [];
  for (const b of demoBoardsData) {
    const [existingBoard] = await db
      .select()
      .from(boards)
      .where(eq(boards.workspaceId, workspace.id))
      .limit(10);

    const match = existingBoard && (await db.select().from(boards).where(eq(boards.slug, b.slug)).limit(1))[0];
    if (match) {
      createdBoards.push(match);
    } else {
      const [newBoard] = await db
        .insert(boards)
        .values({
          workspaceId: workspace.id,
          name: b.name,
          slug: b.slug,
          description: b.description,
          icon: b.icon,
          isPrivate: b.isPrivate,
          sortOrder: b.sortOrder,
        })
        .returning();
      createdBoards.push(newBoard);
    }
  }

  const [featuresBoard, integrationsBoard, bugsBoard, infraBoard] = createdBoards;

  // 4. Create realistic posts across lifecycle states
  const demoPostsData = [
    // Planned (Roadmap Column 1)
    {
      boardId: featuresBoard.id,
      authorId: customerElena.id,
      title: "Granular API permission scopes for token authentication",
      description: "Allow teams to generate read-only API tokens restricted to specific project resources rather than blanket workspace admin access.",
      status: "planned" as const,
      upvoteCount: 42,
      associatedMrr: "14500.00",
    },
    {
      boardId: integrationsBoard.id,
      authorId: customerDave.id,
      title: "Native Datadog integration for streaming webhook telemetry",
      description: "Export real-time delivery latency, error codes and retry frequency metrics directly into Datadog dashboards.",
      status: "planned" as const,
      upvoteCount: 28,
      associatedMrr: "8200.00",
    },

    // In Progress (Roadmap Column 2)
    {
      boardId: featuresBoard.id,
      authorId: member.id,
      title: "Real-time webhook delivery logs with payload inspection",
      description: "Interactive stream of outgoing webhook attempts with response headers, timestamps and one-click replay controls.",
      status: "in_progress" as const,
      upvoteCount: 56,
      associatedMrr: "19800.00",
    },
    {
      boardId: bugsBoard.id,
      authorId: customerElena.id,
      title: "High-DPI canvas flicker during interactive diagram zoom",
      description: "Investigate and resolve sporadic webgl context reset on Apple Silicon Retina displays when panning across large architectures.",
      status: "in_progress" as const,
      upvoteCount: 15,
      associatedMrr: "0.00",
    },

    // Completed (Roadmap Column 3)
    {
      boardId: featuresBoard.id,
      authorId: admin.id,
      title: "Public REST API v1 release with OpenAPI specifications",
      description: "Complete programmatic access to feedback items, boards, changelogs and voter counts with comprehensive interactive docs.",
      status: "completed" as const,
      upvoteCount: 89,
      associatedMrr: "32000.00",
    },
    {
      boardId: integrationsBoard.id,
      authorId: customerDave.id,
      title: "Slack notification alerts for critical failures and updates",
      description: "Instant notification broadcasts into team Slack channels whenever high-priority items transition status.",
      status: "completed" as const,
      upvoteCount: 64,
      associatedMrr: "12000.00",
    },

    // Open (Board View)
    {
      boardId: featuresBoard.id,
      authorId: customerElena.id,
      title: "Dark mode support for webhooks dashboard and logs",
      description: "Provide high-contrast dark theme optimized for long operational debugging sessions in dark terminal environments.",
      status: "open" as const,
      upvoteCount: 19,
      associatedMrr: "4500.00",
    },
    {
      boardId: featuresBoard.id,
      authorId: customerDave.id,
      title: "Custom export to CSV and JSON formats",
      description: "Allow workspace managers to download filtered subsets of feature suggestions and feedback threads for offline analysis.",
      status: "open" as const,
      upvoteCount: 31,
      associatedMrr: "9000.00",
    },

    // Under Review
    {
      boardId: featuresBoard.id,
      authorId: customerElena.id,
      title: "SAML 2.0 Single Sign-On for enterprise organizations",
      description: "Support Okta, Azure AD and Google Workspace corporate authentication with automatic Just-In-Time role provisioning.",
      status: "under_review" as const,
      upvoteCount: 77,
      associatedMrr: "54000.00",
    },

    // Private Board Post
    {
      boardId: infraBoard.id,
      authorId: admin.id,
      title: "Multi-region database read replica failover strategy",
      description: "Establish automated latency-based query routing across US East, EU Central and AP Southeast PostgreSQL replicas.",
      status: "planned" as const,
      upvoteCount: 8,
      associatedMrr: "0.00",
    },
  ];

  const createdPosts: Array<typeof posts.$inferSelect> = [];
  for (const p of demoPostsData) {
    const [existingPost] = await db
      .select()
      .from(posts)
      .where(eq(posts.title, p.title))
      .limit(1);

    if (existingPost) {
      createdPosts.push(existingPost);
    } else {
      const [newPost] = await db
        .insert(posts)
        .values({
          workspaceId: workspace.id,
          boardId: p.boardId,
          authorId: p.authorId,
          title: p.title,
          description: p.description,
          status: p.status,
          upvoteCount: p.upvoteCount,
          associatedMrr: p.associatedMrr,
        })
        .returning();

      // Register author as upvoter and subscriber
      await db
        .insert(postUpvotes)
        .values({
          postId: newPost.id,
          userId: p.authorId,
        })
        .onConflictDoNothing();

      await db
        .insert(postSubscribers)
        .values({
          postId: newPost.id,
          userId: p.authorId,
        })
        .onConflictDoNothing();

      createdPosts.push(newPost);
    }
  }

  // 5. Seed duplicate merge demonstration
  const [csvPost] = createdPosts.filter((p) => p.title.includes("Custom export to CSV"));
  if (csvPost) {
    const duplicateTitle = "CSV download of billing events and usage logs";
    const [existingDup] = await db
      .select()
      .from(posts)
      .where(eq(posts.title, duplicateTitle))
      .limit(1);

    if (!existingDup) {
      const [dupPost] = await db
        .insert(posts)
        .values({
          workspaceId: workspace.id,
          boardId: featuresBoard.id,
          authorId: customerDave.id,
          title: duplicateTitle,
          description: "We need an export option to pull down our invoice history into spreadsheet software.",
          status: "closed",
          upvoteCount: 12,
          mergedIntoPostId: csvPost.id,
        })
        .returning();

      // Add merge audit comments
      await db.insert(comments).values([
        {
          postId: dupPost.id,
          authorId: admin.id,
          content: `Merged into ${csvPost.title}`,
          isSystemAudit: true,
          isInternalNote: false,
        },
        {
          postId: csvPost.id,
          authorId: admin.id,
          content: `Merged post "${dupPost.title}" into this request (transferred 12 upvotes)`,
          isSystemAudit: true,
          isInternalNote: false,
        },
      ]);
    }
  }

  // 6. Seed rich comments, team replies and internal notes
  const [apiPost] = createdPosts.filter((p) => p.title.includes("Granular API permission"));
  if (apiPost) {
    await db
      .insert(comments)
      .values([
        {
          postId: apiPost.id,
          authorId: customerElena.id,
          content: "We specifically need a scope for `webhooks:read` so our monitoring agent can inspect health without modifying endpoints.",
          isInternalNote: false,
          isSystemAudit: false,
        },
        {
          postId: apiPost.id,
          authorId: admin.id,
          content: "Thanks Elena! We have scoped this into the Q4 authentication overhaul. Scopes will map directly to OAuth resource identifiers.",
          isInternalNote: false,
          isSystemAudit: false,
        },
        {
          postId: apiPost.id,
          authorId: owner.id,
          content: "Changed status from Open to Planned",
          isInternalNote: false,
          isSystemAudit: true,
        },
        {
          postId: apiPost.id,
          authorId: admin.id,
          content: "Confidential: Enterprise client Renewal Depends on this. Associated ARR impact exceeds $150k.",
          isInternalNote: true,
          isSystemAudit: false,
        },
      ])
      .onConflictDoNothing();
  }

  // 7. Seed notifications
  if (apiPost) {
    await db
      .insert(notifications)
      .values([
        {
          workspaceId: workspace.id,
          userId: customerElena.id,
          postId: apiPost.id,
          type: "status_change",
          message: `Post "${apiPost.title}" was moved to Planned`,
          isRead: false,
        },
        {
          workspaceId: workspace.id,
          userId: customerDave.id,
          postId: apiPost.id,
          type: "status_change",
          message: `Post "${apiPost.title}" was moved to Planned`,
          isRead: true,
        },
      ])
      .onConflictDoNothing();
  }

  return {
    workspace,
    users: createdUsers,
    boards: createdBoards,
    posts: createdPosts,
  };
}
