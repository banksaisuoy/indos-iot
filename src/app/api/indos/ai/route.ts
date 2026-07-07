import { NextResponse, NextRequest } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { aiChatSchema } from '@/lib/indos/schemas'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'

// Vercel serverless function max duration (free tier = 60s; AI calls need it)
export const maxDuration = 60

const SYSTEM_PROMPT = `You are "IndOS Assistant", the AI copilot of IndOS — a self-hosted, enterprise-grade Industrial IoT Operating System.

You help plant engineers, operators and managers reason about their industrial data. You are concise, technical and action-oriented. You understand:
- Devices (ESP32, ESP8266, Raspberry Pi, industrial PCs, PLCs, gateways), protocols (MQTT, Modbus RTU/TCP, OPC-UA, BACnet, Ethernet/IP, CAN, LoRaWAN, Zigbee, BLE)
- Monitoring: energy, water, gas, solar, environment, machine, production
- Operations: OEE, MES, SCADA, alarms, maintenance work orders, OTA firmware
- Self-hosted stack: PostgreSQL, InfluxDB, Redis, Mosquitto, Node-RED, Keycloak, MinIO, Prometheus, Grafana, Loki, Ollama, Qdrant, Frigate, YOLO, Docker
- Capabilities: predictive maintenance, energy forecasting, root-cause analysis, natural-language querying of telemetry, automation flows

When asked for numbers or status, give realistic, concrete figures and a short reasoning. Prefer Markdown with short sections and bullet points. Never invent that you are using OpenAI — you run on the local IndOS AI stack.`

type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string }

/**
 * Try OpenRouter first, then Manas. Returns a NextResponse with the AI reply
 * or throws if both fail. Used both as a fallback (dev z-ai fails) and as the
 * primary path on Vercel production (z-ai SDK incompatible with edge runtime).
 */
async function tryOpenRouterAndManas(
  systemPrompt: string,
  context: string,
  messages: ChatMsg[],
  req: NextRequest,
): Promise<Response> {
  const referer = process.env.NEXTAUTH_URL || `https://${req.headers.get('host') || 'indos-iot.vercel.app'}`
  const allMessages: ChatMsg[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: context },
    ...messages,
  ]

  // 1. OpenRouter
  const openrouterKey = process.env.OPENROUTER_API_KEY
  if (openrouterKey) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openrouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer,
          'X-Title': 'IndOS AI Center',
        },
        body: JSON.stringify({
          model: 'openrouter/auto',
          messages: allMessages,
          max_tokens: 1000,
          temperature: 0.7,
        }),
      })
      if (response.ok) {
        const data = await response.json()
        const content = data.choices?.[0]?.message?.content || ''
        if (content) return NextResponse.json({ reply: content })
      }
      console.log('[indos-ai] OpenRouter failed:', response.status, (await response.text().catch(() => '')).slice(0, 100))
    } catch (e: any) {
      console.log('[indos-ai] OpenRouter error:', (e.message || '').slice(0, 100))
    }
  }

  // 2. Manas
  const manasKey = process.env.MANAS_API_KEY
  if (manasKey) {
    try {
      const response = await fetch('https://api.manas.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${manasKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'manas-1',
          messages: allMessages,
          max_tokens: 1000,
          temperature: 0.7,
        }),
      })
      if (response.ok) {
        const data = await response.json()
        const content = data.choices?.[0]?.message?.content || ''
        if (content) return NextResponse.json({ reply: content })
      }
      console.log('[indos-ai] Manas failed:', response.status)
    } catch (e: any) {
      console.log('[indos-ai] Manas error:', (e.message || '').slice(0, 100))
    }
  }

  throw new Error('All AI providers failed')
}

export const POST = withErrorHandler(apiHandler('viewer', RATE_LIMITS.ai, async (req: NextRequest) => {
  const body = await req.json()
  const v = validateBody(aiChatSchema, body)
  if (!v.success) return v.error
  const { messages } = v.data

  try {
    const [deviceCount, activeAlarms, projectCount, woOpen] = await Promise.all([
      db.device.count(),
      db.alarm.count({ where: { state: 'active' } }),
      db.project.count(),
      db.workOrder.count({ where: { OR: [{ status: 'open' }, { status: 'inprogress' }] } }),
    ])
    const context = `Live platform context: ${projectCount} projects, ${deviceCount} registered devices, ${activeAlarms} active alarms, ${woOpen} open/in-progress work orders. The user is on the IndOS web console.`

    // On Vercel production, skip z-ai SDK (incompatible with edge runtime) and
    // go straight to OpenRouter/Manas. In dev/sandbox, try z-ai first.
    const isVercelProd = !!process.env.VERCEL && process.env.NODE_ENV === 'production'

    if (!isVercelProd) {
      try {
        const zai = await ZAI.create()
        const completion = await zai.chat.completions.create({
          messages: [
            { role: 'assistant' as const, content: SYSTEM_PROMPT },
            { role: 'user' as const, content: context },
            ...messages,
          ],
          thinking: { type: 'disabled' },
        })
        const content = completion.choices[0]?.message?.content || ''
        return NextResponse.json({ reply: content })
      } catch (zaiErr) {
        console.log('[indos-ai] z-ai failed, trying OpenRouter/Manas...')
        return await tryOpenRouterAndManas(SYSTEM_PROMPT, context, messages, req)
      }
    } else {
      return await tryOpenRouterAndManas(SYSTEM_PROMPT, context, messages, req)
    }
  } catch (e: any) {
    console.error('[indos-ai] error', e)
    return NextResponse.json(
      { error: 'AI_UNAVAILABLE', reply: '⚠️ AI service could not be reached. Both z-ai and OpenRouter failed.' },
      { status: 503 }
    )
  }
}))
