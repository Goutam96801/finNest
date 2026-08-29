### Task 8: Chat persistence (optional but planned)

**Files:**
- Create: `supabase/migrations/20260808130000_fynn_chats.sql`
- Modify: `fynn-chat`, `lib/services/fynn.ts`, `fynn.tsx`

- [ ] **Step 1: Tables `fynn_chats` + `fynn_messages`** with RLS `auth.uid() = user_id`

- [ ] **Step 2: `fynn-chat` accepts `chat_id`; creates chat on first message; stores user + assistant (+ proposal metadata) messages

- [ ] **Step 3: Client loads recent chats for sidebar from Supabase instead of only local state

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: persist Fynn chats server-side with RLS"
```

---
