# Cloud Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Copy `.env.example` → `.env.local` and paste **Project URL**, **Publishable key** (`sb_publishable_…`), and **Secret key** (`sb_secret_…`, server/tests only).
3. Add database password for one-command setup (Dashboard → **Settings → Database**):

   ```
   SUPABASE_DB_PASSWORD=your-db-password
   ```

   (in `.env.local`, gitignored)

4. Push migrations + seed owner (no Supabase CLI login required):

   ```bash
   pnpm setup:cloud
   ```

   Or CLI: `supabase login` → `link --project-ref YOUR_PROJECT_REF` → `db push`.

   Manual fallback: paste `supabase/cloud-all-migrations.sql` into the SQL Editor.

5. In the SQL editor, set the allowlisted owner (if `seed.sql` was not run):

   ```sql
   update public.app_singleton
   set allowed_owner_email = 'you@yourdomain.com'
   where id = 1;
   ```

6. **Auth → URL configuration**: add `http://localhost:3000/**` (and your production URL) to redirect URLs. Site URL: `http://localhost:3000`.

7. `pnpm dev` → sign up once with `ALLOWED_OWNER_EMAIL`.

Integration tests need real keys in `.env.test` or `SUPABASE_SKIP=1`. Never commit filled `.env*` files.