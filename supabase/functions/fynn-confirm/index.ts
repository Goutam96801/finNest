import { getAuthedUserClient } from '../_shared/auth.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import { applyProposal } from '../_shared/tools/apply.ts'

type Proposal = {
  id: string
  user_id: string
  tool_name: string
  payload: Record<string, unknown>
  status: 'pending'
  expires_at: string
}

type FynnConfirmDependencies = {
  getAuthedUserClient: (req: Request) => Promise<{
    user: { id: string }
    userClient: any
  }>
  getProposal: (userClient: any, proposalId: string, userId: string) => Promise<Proposal | null>
  updateProposal: (
    userClient: any,
    proposalId: string,
    patch: { status: 'accepted' | 'rejected' | 'expired'; resolved_at: string }
  ) => Promise<void>
  applyProposal: (userClient: any, userId: string, proposal: Proposal) => Promise<unknown>
}

async function getProposal(userClient: any, proposalId: string, userId: string): Promise<Proposal | null> {
  const { data, error } = await userClient
    .from('fynn_proposals')
    .select('id, user_id, tool_name, payload, status, expires_at')
    .eq('id', proposalId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .maybeSingle()
  if (error) throw error
  return data as Proposal | null
}

async function updateProposal(
  userClient: any,
  proposalId: string,
  patch: { status: 'accepted' | 'rejected' | 'expired'; resolved_at: string }
) {
  const { error } = await userClient
    .from('fynn_proposals')
    .update(patch)
    .eq('id', proposalId)
  if (error) throw error
}

function parseRequest(body: unknown): { proposalId: string; action: 'accept' | 'reject' } | null {
  if (!body || typeof body !== 'object') return null
  const { proposal_id: proposalId, action } = body as Record<string, unknown>
  if (typeof proposalId !== 'string' || !proposalId.trim()) return null
  if (action !== 'accept' && action !== 'reject') return null
  return { proposalId, action }
}

export function createFynnConfirmHandler(
  dependencies: FynnConfirmDependencies = {
    getAuthedUserClient,
    getProposal,
    updateProposal,
    applyProposal,
  }
) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    try {
      const body = parseRequest(await req.json().catch(() => null))
      if (!body) return json({ error: 'proposal_id and action are required' }, 400)

      const { user, userClient } = await dependencies.getAuthedUserClient(req)
      const proposal = await dependencies.getProposal(userClient, body.proposalId, user.id)
      if (!proposal) return json({ error: 'Proposal not found or already resolved' }, 404)

      const resolvedAt = new Date().toISOString()
      if (new Date(proposal.expires_at).getTime() < Date.now()) {
        await dependencies.updateProposal(userClient, proposal.id, {
          status: 'expired',
          resolved_at: resolvedAt,
        })
        return json({ error: 'Proposal has expired' }, 400)
      }

      if (body.action === 'reject') {
        await dependencies.updateProposal(userClient, proposal.id, {
          status: 'rejected',
          resolved_at: resolvedAt,
        })
        return json({ success: true, status: 'rejected' })
      }

      const data = await dependencies.applyProposal(userClient, user.id, proposal)
      await dependencies.updateProposal(userClient, proposal.id, {
        status: 'accepted',
        resolved_at: resolvedAt,
      })
      return json({ success: true, status: 'accepted', data })
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Unable to confirm proposal' },
        400
      )
    }
  }
}

if (import.meta.main) {
  Deno.serve(createFynnConfirmHandler())
}
