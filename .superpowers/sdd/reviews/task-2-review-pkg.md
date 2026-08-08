# Review package Task 2
BASE: ee4719f820c1664360544e248810ba619339faf2
HEAD: 54fc06add139142f08ae690e4ac6f1277beeabf5

## Commits
54fc06a feat: add shared Edge auth and CORS for Fynn


## Stat
 supabase/functions/_shared/auth.ts | 25 +++++++++++++++++++++++++
 supabase/functions/_shared/cors.ts | 11 +++++++++++
 2 files changed, 36 insertions(+)


## Diff
```diff
diff --git a/supabase/functions/_shared/auth.ts b/supabase/functions/_shared/auth.ts
new file mode 100644
index 0000000..1f8ce8b
--- /dev/null
+++ b/supabase/functions/_shared/auth.ts
@@ -0,0 +1,25 @@
+import { createClient, type User, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
+
+export async function getAuthedUserClient(req: Request): Promise<{
+  user: User
+  userClient: SupabaseClient
+  authHeader: string
+}> {
+  const authHeader = req.headers.get('Authorization')
+  if (!authHeader) throw new Error('Missing authorization')
+
+  const url = Deno.env.get('SUPABASE_URL')!
+  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
+
+  const userClient = createClient(url, anon, {
+    global: { headers: { Authorization: authHeader } },
+  })
+
+  const {
+    data: { user },
+    error,
+  } = await userClient.auth.getUser()
+  if (error || !user) throw new Error('Unauthorized')
+
+  return { user, userClient, authHeader }
+}
diff --git a/supabase/functions/_shared/cors.ts b/supabase/functions/_shared/cors.ts
new file mode 100644
index 0000000..d92dece
--- /dev/null
+++ b/supabase/functions/_shared/cors.ts
@@ -0,0 +1,11 @@
+export const corsHeaders = {
+  'Access-Control-Allow-Origin': '*',
+  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
+}
+
+export function json(body: Record<string, unknown>, status = 200) {
+  return new Response(JSON.stringify(body), {
+    status,
+    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
+  })
+}

```
