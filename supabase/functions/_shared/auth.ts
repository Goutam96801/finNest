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
