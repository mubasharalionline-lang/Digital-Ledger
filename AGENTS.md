<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:supabase-agent-rules -->
# Supabase Data API Grants (May 2026 Update)

Starting May 30, 2026, Supabase no longer automatically exposes new tables in the "public" schema to the Data API.
When creating any new tables in the "public" schema, you MUST include an explicit `GRANT` statement to allow access via `supabase-js` or PostgREST.

Example:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table TO anon, authenticated;
```
Always add these explicit grants in the table-creation flow or migrations.
<!-- END:supabase-agent-rules -->
