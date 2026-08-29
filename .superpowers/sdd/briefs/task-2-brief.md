### Task 2: Edge shared auth + CORS

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/auth.ts`

**Interfaces:**
- Produces: `corsHeaders`, `json()`, `getAuthedUserClient(req)` → `{ user, userClient, authHeader }`

- [ ] **Step 1: Add CORS helper**

```ts
// supabase/functions/_shared/cors.ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 2: Add auth helper (mirror export-transactions)**

```ts
// supabase/functions/_shared/auth.ts
import { createClient, type User, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

export async function getAuthedUserClient(req: Request): Promise<{
  user: User
  userClient: SupabaseClient
  authHeader: string
}> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new Error('Missing authorization')

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')

  return { user, userClient, authHeader }
}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/cors.ts supabase/functions/_shared/auth.ts
git commit -m "feat: add shared Edge auth and CORS for Fynn"
```

---
