### Task 6: Propose tools + `fynn-confirm` + confirm UI

**Files:**
- Modify: `supabase/functions/_shared/tools/catalog.ts`
- Create/Modify: `supabase/functions/_shared/tools/proposals.ts`
- Create: `supabase/functions/_shared/tools/apply.ts`
- Create: `supabase/functions/fynn-confirm/index.ts`
- Modify: `supabase/functions/fynn-chat/index.ts`
- Modify: `lib/services/fynn.ts`
- Modify: `app/(tabs)/fynn.tsx`

**Interfaces:**
- Produces: `type: 'proposal'` chat responses; `confirmFynnProposal(proposalId, 'accept' | 'reject')`

- [ ] **Step 1: Add propose_* tools for transactions first**

- `propose_create_transaction`
- `propose_update_transaction`
- `propose_delete_transaction`

Each implementation:

1. Validate args (amount, type, account ownership via select on `accounts`).
2. Insert into `fynn_proposals` with `expires_at = now() + 10 minutes`, `status = pending`, human `summary`.
3. Return `{ proposal_id, summary, preview }` to the model.
4. Chat handler: if any tool result contains `proposal_id`, prefer returning `{ type: 'proposal', ... }` to the client (assistant text optional).

- [ ] **Step 2: `fynn-confirm`**

```ts
// body: { proposal_id: string, action: 'accept' | 'reject' }
```

1. Auth required.
2. Load proposal where `id` + `user_id = user.id` + `status = pending`.
3. If `expires_at < now()` → mark `expired`, return error.
4. Reject → set `rejected` + `resolved_at`.
5. Accept → run `applyProposal(userClient, proposal)` then set `accepted`.
6. `applyProposal` switches on `tool_name` and performs the domain insert/update/delete via `userClient` only.

- [ ] **Step 3: Client confirm API**

```ts
export async function confirmFynnProposal(
  proposalId: string,
  action: 'accept' | 'reject'
): Promise<ResponseType & { data?: unknown }> {
  const { data, error } = await supabase.functions.invoke('fynn-confirm', {
    body: { proposal_id: proposalId, action },
  })
  // map errors like sendFynnMessage
}
```

- [ ] **Step 4: Confirm card in Fynn UI**

When response `type === 'proposal'`, render a card with `summary`, Accept / Reject buttons. Disable buttons while invoking. On accept success, append a short assistant confirmation message.

- [ ] **Step 5: Deploy + smoke**

```bash
npx supabase functions deploy fynn-chat
npx supabase functions deploy fynn-confirm
```

Ask: “Add expense ₹50 for tea on Cash”. Expect confirm card → Accept → row in `transactions` for **you** only. Reject path leaves DB unchanged.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions lib/services/fynn.ts "app/(tabs)/fynn.tsx"
git commit -m "feat: add Fynn mutation proposals with confirm/reject"
```

---
