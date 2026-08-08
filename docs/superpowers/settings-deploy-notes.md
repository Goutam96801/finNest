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
