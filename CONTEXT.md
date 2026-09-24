# B2B Feedback & Product Roadmap

A multi-tenant feedback management and public product roadmap platform enabling software teams to collect user feature requests, prioritize development via community upvotes and publish transparent roadmap progress.

## Language

### Tenancy & Containers

**Workspace**:
An isolated customer tenant identified by a unique URL slug, containing its own boards, posts, members and settings.
_Avoid_: Organization, tenant, company, team

**Board**:
A categorized container for feedback posts within a workspace, such as Feature Requests, Integrations or Bug Reports.
_Avoid_: Forum, category, channel

### Feedback & Engagement

**Post**:
A structured feedback submission created by a user, containing a title, description, status, tags and upvotes.
_Avoid_: Feedback item, idea, feature request, ticket, issue

**Upvote**:
An endorsement cast by an authenticated user on a post to signal interest and demand.
_Avoid_: Vote, like, cheer, +1

**Comment**:
A public remark posted under a post by a user or admin to clarify use cases, suggest workarounds or provide updates.
_Avoid_: Reply, message, note

**Internal Note**:
A private discussion entry on a post visible exclusively to workspace admins, used for confidential triage and customer value notes.
_Avoid_: Admin memo, staff comment, private note

**Merge**:
The administrative consolidation of a duplicate post into a canonical post, transferring unique upvotes and locking the duplicate with a redirect link.
_Avoid_: Combine, de-duplicate, join

**Attachment**:
An uploaded image or screenshot associated with a post or comment to illustrate a use case, bug or mockup.
_Avoid_: File, upload, asset

### Users & Permissions

**User**:
An authenticated account holder who can submit posts, cast upvotes, participate in discussions and manage workspaces.
_Avoid_: Account, customer, client

**Role**:
The permission level of a user within a specific workspace: Owner, Admin, Member or Guest.
_Avoid_: User tier, permission group

### Planning & Delivery

**Roadmap**:
A public or private visual board organizing posts across development stages: Planned, In Progress and Completed.
_Avoid_: Release plan, milestone tracker, timeline board

**Status**:
The lifecycle stage of a post: Open, Under Review, Planned, In Progress, Completed or Closed.
_Avoid_: State, stage, phase

**Notification**:
An in-app alert or transactional email delivered to voters and subscribers when a post transitions status or receives an official update.
_Avoid_: Alert, ping, digest
