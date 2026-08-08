### Task 7: Remaining entity propose_* tools

**Files:**
- Modify: `supabase/functions/_shared/tools/catalog.ts`
- Modify: `supabase/functions/_shared/tools/proposals.ts`
- Modify: `supabase/functions/_shared/tools/apply.ts`

**Interfaces:**
- Extends Task 6 apply switch for accounts, subscriptions, profile, notifications

- [ ] **Step 1: Add tools**

Accounts: create / update / delete (delete only if existing app rules allow — otherwise return a proposal that Edge rejects with a clear error, or block at propose time).  
Subscriptions: create / update / delete.  
Profile: `propose_update_profile` — only `full_name`, `currency`, `timezone`, `subscription_reminders_enabled`, `low_balance_alerts_enabled`, `low_balance_threshold`.  
Notifications: `propose_mark_notification_read` (one id or all).

- [ ] **Step 2: Apply handlers**

Mirror constraints from `lib/services/accounts.ts`, `subscriptions.ts`, `profile.ts`, `notifications.ts` (positive amounts, allowed types, ownership).

- [ ] **Step 3: Smoke each entity**

One accept + one reject per entity group. Verify RLS: forging another user’s UUID in payload still fails (row not found / RLS).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/tools
git commit -m "feat: extend Fynn propose/apply tools to all user entities"
```

---
