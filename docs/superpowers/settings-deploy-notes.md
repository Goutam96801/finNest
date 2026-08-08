# Settings / export deploy notes

## Migrations
```bash
npx supabase db push --yes
```

Includes settings columns, feedback, `data_exports`, and private `exports` storage bucket.

## Edge functions
```bash
npx supabase functions deploy export-transactions
npx supabase functions deploy delete-account
npx supabase functions deploy fynn-chat
npx supabase functions deploy fynn-confirm
```

Export: CSV/PDF → Storage `exports/{userId}/…` (no email).

## Fynn LLM Edge secrets

Configure these secrets only for Supabase Edge Functions. Never expose them through
`EXPO_PUBLIC_*` variables or include them in the mobile application.

```bash
npx supabase secrets set LLM_PROVIDER=gemini LLM_API_KEY=YOUR_KEY LLM_MODEL=gemini-2.0-flash
```

- `LLM_PROVIDER`: `gemini` (default)
- `LLM_API_KEY`: Gemini API key, stored only in Supabase Edge Function secrets
- `LLM_MODEL`: optional Gemini model override; defaults to `gemini-2.0-flash`

### OpenAI provider swap

No Expo rebuild is needed to swap the Edge Function provider. Set the OpenAI key and
model, then deploy the Fynn functions if the latest code is not already deployed:

```bash
npx supabase secrets set LLM_PROVIDER=openai LLM_API_KEY=YOUR_OPENAI_KEY LLM_MODEL=gpt-4o-mini
npx supabase functions deploy fynn-chat
npx supabase functions deploy fynn-confirm
```

With a logged-in test user, smoke test one read turn (for example, “List my
accounts”) and one confirmed write (for example, propose a small transaction,
tap Accept, and verify the row). Switch back to the Gemini default after the
test:

```bash
npx supabase secrets set LLM_PROVIDER=gemini LLM_API_KEY=YOUR_GEMINI_KEY LLM_MODEL=gemini-2.0-flash
```

### Fynn hardening limits

- A chat turn performs at most 6 LLM/tool iterations.
- List tools are capped at 25 records.
- Mutation proposals expire after 10 minutes.
- `fynn-chat` allows 20 valid turns per user per rolling minute. This limiter is
  an in-memory `Map` per Edge isolate, so it is best-effort and does not enforce
  a shared global limit across isolates or deployments. Replace it with a shared
  store before relying on it for abuse prevention at scale.
