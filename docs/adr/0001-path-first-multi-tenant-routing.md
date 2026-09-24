# Path-First Multi-Tenant Routing

We chose path-based tenant routing (`/w/[workspaceSlug]`) for V1 rather than mandatory subdomains (`[workspaceSlug].domain.com`). This avoids wildcard DNS and dynamic SSL certificate overhead during local development and MVP deployment, while keeping the data layer and Next.js middleware modular so vanity subdomains or custom domains can be added later without schema changes.
