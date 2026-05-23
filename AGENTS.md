<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Schema changes

Any change to `prisma/schema.prisma` MUST be paired with a migration file under `prisma/migrations/`. Generate it with `npx prisma migrate dev --name xxx`. The production entrypoint runs `prisma migrate deploy` (NOT `db push`) — schema drift without a committed migration will fail boot, and `db push --accept-data-loss` is forbidden because it would silently drop columns in the auto-update path.
