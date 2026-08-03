import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(url, service)

    const { error: profileError } = await admin
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', user.id)

    if (profileError) throw profileError

    const { error: banError } = await admin.auth.admin.updateUserById(user.id, {
      ban_duration: '876000h',
    })

    if (banError) throw banError

    return json({
      success: true,
      message: 'Account disabled. You have been signed out.',
    })
  } catch (error) {
    console.error(error)
    return json({ error: error instanceof Error ? error.message : 'Delete failed' }, 400)
  }
})
