import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Health check endpoint for Docker/K8s/LB probes
export async function GET() {
  const checks: Record<string, boolean> = {}
  try {
    await db.$queryRaw`SELECT 1`
    checks.db = true
  } catch {
    checks.db = false
  }
  const allOk = Object.values(checks).every(Boolean)
  return NextResponse.json({ ok: allOk, checks, ts: new Date().toISOString() }, { status: allOk ? 200 : 503 })
}
