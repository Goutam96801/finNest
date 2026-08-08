### Task 4: Read tools + catalog skeleton

**Files:**
- Create: `supabase/functions/_shared/validate.ts`
- Create: `supabase/functions/_shared/tools/catalog.ts`
- Create: `supabase/functions/_shared/tools/reads.ts`
- Create: `supabase/functions/_shared/tools/executor.ts`

**Interfaces:**
- Consumes: `userClient`, verified `user.id`
- Produces: `TOOL_DEFS`, `executeTool({ name, args, user, userClient })` for **reads only** in this task

- [ ] **Step 1: Validators**

```ts
// supabase/functions/_shared/validate.ts
export function assertPositiveAmount(amount: unknown): number {
  const n = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(n) || n <= 0) throw new Error('Amount must be a positive number')
  return n
}

export const ALLOWED_ACCOUNT_TYPES = [
  'bank', 'cash', 'wallet', 'credit_card', 'investment', 'loan', 'other',
] as const
```

- [ ] **Step 2: Catalog (read tools first)**

Define JSON-schema `parameters` for:

- `list_accounts`
- `list_transactions` (limit≤25, optional type/accountId/from/to/search)
- `get_transaction`
- `list_subscriptions`
- `get_profile`
- `list_notifications`

- [ ] **Step 3: Read implementations**

Use `.eq('user_id', user.id)` **and** rely on RLS. Never trust args.userId.

Cap lists at 25 rows. Return compact JSON (ids, amounts, dates, names) suitable for the model.

- [ ] **Step 4: Executor dispatcher**

```ts
export async function executeTool(input: {
  name: string
  args: Record<string, unknown>
  userId: string
  userClient: SupabaseClient
}): Promise<{ ok: true; result: unknown } | { ok: false; error: string }>
```

Unknown tool → `{ ok: false, error: 'Unknown tool' }`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/validate.ts supabase/functions/_shared/tools
git commit -m "feat: add Fynn read tools and catalog"
```

---
