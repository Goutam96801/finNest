### Task 9: Hardening + second provider env swap

**Files:**
- Create: `supabase/functions/_shared/llm/openai.ts` (or Anthropic)
- Modify: `provider.ts`
- Modify: chat loop (rate / iteration already present — verify)
- Modify: deploy notes

- [ ] **Step 1: Add OpenAI-compatible adapter** behind `LLM_PROVIDER=openai`

- [ ] **Step 2: Env-only smoke**

```bash
npx supabase secrets set LLM_PROVIDER=openai LLM_API_KEY=... LLM_MODEL=gpt-4o-mini
```

No app rebuild; one read turn + one confirmed write must still work. Switch back to Gemini for default for free-tier.

- [ ] **Step 3: Caps**

Confirm: max 6 tool iterations, list limit 25, proposal TTL 10m, basic per-user rate limit (in-memory per isolate is ok for v1; document limitation).

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add env-swappable LLM providers and Fynn hardening"
```

---
