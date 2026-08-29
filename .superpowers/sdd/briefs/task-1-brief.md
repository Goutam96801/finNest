### Task 1: Migration — `fynn_proposals`

**Files:**
- Create: `supabase/migrations/20260808120000_fynn_proposals.sql`

**Interfaces:**
- Consumes: existing `public.profiles(id)`
- Produces: table `public.fynn_proposals` with RLS for own rows

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/20260808120000_fynn_proposals.sql
CREATE TABLE IF NOT EXISTS public.fynn_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  payload jsonb NOT NULL,
  summary text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS fynn_proposals_user_status_idx
  ON public.fynn_proposals (user_id, status, expires_at DESC);

ALTER TABLE public.fynn_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fynn proposals"
  ON public.fynn_proposals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own fynn proposals"
  ON public.fynn_proposals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fynn proposals"
  ON public.fynn_proposals FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON TABLE public.fynn_proposals TO anon, authenticated, service_role;
```

- [ ] **Step 2: Apply migration** (local or linked project)

Run: `npx supabase db push` (or your project’s usual migrate command)  
Expected: migration applied; table visible in Studio.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260808120000_fynn_proposals.sql
git commit -m "feat: add fynn_proposals table for confirmed LLM mutations"
```

---
