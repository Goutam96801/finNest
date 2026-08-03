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
