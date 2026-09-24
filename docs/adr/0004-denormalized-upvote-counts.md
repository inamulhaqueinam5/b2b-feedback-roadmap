# Denormalized Upvote Counts

We chose to store a denormalized `upvote_count` integer on the `posts` table alongside a relational `post_upvotes` join table (`post_id`, `user_id`). Maintaining this counter inside atomic database transactions eliminates expensive dynamic `COUNT(*)` aggregations across thousands of records, ensuring public boards and roadmap columns load with sub-millisecond query execution.
