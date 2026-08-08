import { getAuthedUserClient } from '../_shared/auth.ts'
import { corsHeaders, json } from '../_shared/cors.ts'
import { applyProposal } from '../_shared/tools/apply.ts'

function isAuthError(error: unknown): boolean {
  return error instanceof Error && (error.message === 'Missing authorization' || error.message === 'Unauthorized')
}

function logConfirmRequest(input: {
  userId: string | null
  toolName: string | null
  latencyMs: number
  errorCode: string | null
}) {
  console.log(JSON.stringify({
    event: 'fynn_confirm_request',
    user_id: input.userId,
    tool_names: input.toolName ? [input.toolName] : [],
    latency_ms: input.latencyMs,
    provider: null,
    error_code: input.errorCode,
  }))
}

type Proposal = {
  id: string
  user_id: string
  tool_name: string
  payload: Record<string, unknown>
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  expires_at: string
}

type FynnConfirmDependencies = {
  getAuthedUserClient: (req: Request) => Promise<{
    user: { id: string }
    userClient: any
  }>
  getProposal: (userClient: any, proposalId: string, userId: string) => Promise<Proposal | null>
  claimProposal: (
    userClient: any,
    proposalId: string,
    userId: string,
    status: 'accepted' | 'rejected'
  ) => Promise<Proposal | null>
  updateProposal: (
    userClient: any,
    proposalId: string,
    patch: { status: 'accepted' | 'rejected' | 'expired'; resolved_at: string }
  ) => Promise<void>
  rollbackAcceptedProposal: (userClient: any, proposalId: string, userId: string) => Promise<void>
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

async function claimProposal(
  userClient: any,
  proposalId: string,
  userId: string,
  status: 'accepted' | 'rejected'
): Promise<Proposal | null> {
  const { data, error } = await userClient
    .from('fynn_proposals')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', proposalId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .select('id, user_id, tool_name, payload, status, expires_at')
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

async function rollbackAcceptedProposal(userClient: any, proposalId: string, userId: string) {
  const { error } = await userClient
    .from('fynn_proposals')
    .update({ status: 'pending', resolved_at: null })
    .eq('id', proposalId)
    .eq('user_id', userId)
    .eq('status', 'accepted')
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
    claimProposal,
    updateProposal,
    rollbackAcceptedProposal,
    applyProposal,
  }
) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const startedAt = Date.now()
    let userId: string | null = null
    let toolName: string | null = null
    let errorCode: string | null = null

    try {
      const { user, userClient } = await dependencies.getAuthedUserClient(req)
      userId = user.id
      const body = parseRequest(await req.json().catch(() => null))
      if (!body) {
        errorCode = 'VALIDATION_ERROR'
        return json({ error: 'proposal_id and action are required' }, 400)
      }

      const proposal = await dependencies.getProposal(userClient, body.proposalId, user.id)
      if (!proposal) {
        errorCode = 'PROPOSAL_NOT_FOUND'
        return json({ error: 'Proposal not found or already resolved' }, 404)
      }
      toolName = proposal.tool_name

      const resolvedAt = new Date().toISOString()
      if (new Date(proposal.expires_at).getTime() < Date.now()) {
        await dependencies.updateProposal(userClient, proposal.id, {
          status: 'expired',
          resolved_at: resolvedAt,
        })
        errorCode = 'PROPOSAL_EXPIRED'
        return json({ error: 'Proposal has expired' }, 400)
      }

      if (body.action === 'reject') {
        const claimed = await dependencies.claimProposal(userClient, proposal.id, user.id, 'rejected')
        if (!claimed) {
          errorCode = 'PROPOSAL_NOT_FOUND'
          return json({ error: 'Proposal not found or already resolved' }, 404)
        }
        return json({ success: true, status: 'rejected' })
      }

      const claimed = await dependencies.claimProposal(userClient, proposal.id, user.id, 'accepted')
      if (!claimed) {
        errorCode = 'PROPOSAL_NOT_FOUND'
        return json({ error: 'Proposal not found or already resolved' }, 404)
      }

      let data: unknown
      try {
        data = await dependencies.applyProposal(userClient, user.id, claimed)
      } catch (error) {
        await dependencies.rollbackAcceptedProposal(userClient, proposal.id, user.id)
        throw error
      }
      return json({ success: true, status: 'accepted', data })
    } catch (error) {
      const unauthorized = isAuthError(error)
      errorCode = unauthorized ? 'AUTH_FAILED' : 'REQUEST_FAILED'
      return json(
        { error: error instanceof Error ? error.message : 'Unable to confirm proposal' },
        unauthorized ? 401 : 400
      )
    } finally {
      logConfirmRequest({
        userId,
        toolName,
        latencyMs: Date.now() - startedAt,
        errorCode,
      })
    }
  }
}

if (import.meta.main) {
  Deno.serve(createFynnConfirmHandler())
}
