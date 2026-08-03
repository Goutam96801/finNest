import { PDFDocument, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'
import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ExportFormat = 'csv' | 'pdf'

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function getAuthedUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new Error('Missing authorization')

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')

  const admin = createClient(url, service)
  return { user: user as User, admin }
}

function toCsv(rows: Record<string, unknown>[]) {
  const headers = [
    'id',
    'type',
    'category',
    'amount',
    'description',
    'status',
    'transaction_date',
    'account_id',
    'to_account_id',
    'created_at',
  ]
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value)
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
    return text
  }
  return [headers.join(','), ...rows.map((row) => headers.map((key) => escape(row[key])).join(','))].join(
    '\n'
  )
}

async function toPdf(rows: Record<string, unknown>[]) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)
  let page = doc.addPage([595, 842])
  let y = 800
  const draw = (text: string, bold = false, size = 10) => {
    if (y < 40) {
      page = doc.addPage([595, 842])
      y = 800
    }
    page.drawText(text.slice(0, 110), {
      x: 40,
      y,
      size,
      font: bold ? fontBold : font,
    })
    y -= size + 6
  }

  draw('FinNest transaction export', true, 16)
  draw(`Generated ${new Date().toISOString()}`, false, 9)
  draw(`Rows: ${rows.length}`, false, 9)
  y -= 8

  for (const row of rows) {
    const line = [
      row.transaction_date ?? '',
      row.type ?? '',
      row.category ?? '',
      row.amount ?? '',
      row.description ?? '',
    ].join(' | ')
    draw(String(line), false, 9)
  }

  return await doc.save()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { user, admin } = await getAuthedUser(req)
    const body = await req.json().catch(() => ({}))
    const format = (body?.format === 'pdf' ? 'pdf' : 'csv') as ExportFormat

    const { data, error } = await admin
      .from('transactions')
      .select(
        'id, type, category, amount, description, status, transaction_date, account_id, to_account_id, created_at'
      )
      .eq('user_id', user.id)
      .order('transaction_date', { ascending: false })

    if (error) throw error
    const rows = (data ?? []) as Record<string, unknown>[]

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `transactions-${stamp}.${format}`
    const storagePath = `${user.id}/${fileName}`
    const contentType = format === 'pdf' ? 'application/pdf' : 'text/csv'
    const bytes =
      format === 'pdf'
        ? await toPdf(rows)
        : new TextEncoder().encode(toCsv(rows))

    const { error: uploadError } = await admin.storage.from('exports').upload(storagePath, bytes, {
      contentType,
      upsert: true,
    })
    if (uploadError) throw uploadError

    const { data: exportRow, error: insertError } = await admin
      .from('data_exports')
      .insert({
        user_id: user.id,
        format,
        storage_path: storagePath,
        file_name: fileName,
      })
      .select('*')
      .single()

    if (insertError) throw insertError

    return json({
      success: true,
      message: `${format.toUpperCase()} export ready`,
      export: exportRow,
      count: rows.length,
    })
  } catch (error) {
    console.error(error)
    return json({ error: error instanceof Error ? error.message : 'Export failed' }, 400)
  }
})
