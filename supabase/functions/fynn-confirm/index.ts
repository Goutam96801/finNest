import { getAuthedUserClient } from '../_shared/auth.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import { executeTransactionWrite, type TransactionWritePayload } from '../_shared/ai-tools.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let ctx: Awaited<ReturnType<typeof getAuthedUserClient>>
  try {
    ctx = await getAuthedUserClient(req)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unauthorized' }, 401)
  }
  const { user, userClient } = ctx

  const body = await req.json().catch(() => ({}))
  const proposalId = body.proposal_id as string | undefined
  const action = body.action as 'accept' | 'reject' | undefined
  if (!proposalId || !action) return json({ error: 'proposal_id and action are required' }, 400)

  // RLS scopes this to the caller's own proposals — a stranger's proposal_id simply won't be found.
  const { data: proposal, error: fetchError } = await userClient
    .from('fynn_proposals')
    .select('*')
    .eq('id', proposalId)
    .single()

  if (fetchError || !proposal) return json({ error: 'Proposal not found' }, 404)

  if (proposal.status !== 'pending') {
    return json({ error: `This proposal was already ${proposal.status}.` }, 400)
  }

  if (new Date(proposal.expires_at).getTime() < Date.now()) {
    await userClient.from('fynn_proposals').update({ status: 'expired', resolved_at: new Date().toISOString() }).eq('id', proposalId)
    return json({ error: 'This confirmation has expired — please ask again.' }, 400)
  }

  if (action === 'accept') {
    const { data: status, error: statusError } = await userClient.rpc('get_fynn_pro_status')
    if (statusError) return json({ error: statusError.message }, 500)
    const statusRow = typeof status === 'string' ? JSON.parse(status) : status
    const entitled = (statusRow as { subscribed?: boolean } | null)?.subscribed === true
    if (!entitled) return json({ error: 'subscription_required', code: 'SUBSCRIPTION_REQUIRED' }, 402)
  }

  if (action === 'reject') {
    await userClient
      .from('fynn_proposals')
      .update({ status: 'rejected', resolved_at: new Date().toISOString() })
      .eq('id', proposalId)
    return json({ success: true, data: { status: 'rejected' } })
  }

  // action === 'accept'
  const payload = proposal.payload as TransactionWritePayload
  let result
  try {
    result = await executeTransactionWrite(userClient, user.id, payload)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Write failed'
    await userClient.from('ai_action_log').insert({
      user_id: user.id,
      proposal_id: proposalId,
      chat_id: null,
      action: payload.action,
      entity: 'transaction',
      status: 'failed',
      error_message: message,
    })
    return json({ error: message }, 400)
  }

  await userClient.from('ai_action_log').insert({
    user_id: user.id,
    proposal_id: proposalId,
    action: payload.action,
    entity: 'transaction',
    entity_id: result.entityId,
    before_data: result.before,
    after_data: result.after,
    status: 'confirmed',
  })

  await userClient
    .from('fynn_proposals')
    .update({ status: 'accepted', resolved_at: new Date().toISOString() })
    .eq('id', proposalId)

  return json({
    success: true,
    data: {
      status: 'accepted',
      result: result.after ?? { id: result.entityId, deleted: true },
      // Reserved for when subscription writes are added — a subscription
      // create/update/delete would need the client to resync local reminders.
      reminderResyncRequired: false,
    },
  })
})
