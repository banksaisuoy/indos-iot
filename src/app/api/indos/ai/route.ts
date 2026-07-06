import { NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { aiChatSchema } from '@/lib/indos/schemas'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'

const SYSTEM_PROMPT = `You are "IndOS Assistant", the AI copilot of IndOS — a self-hosted, enterprise-grade Industrial IoT Operating System.

You help plant engineers, operators and managers reason about their industrial data. You are concise, technical and action-oriented. You understand:
- Devices (ESP32, ESP8266, Raspberry Pi, industrial PCs, PLCs, gateways), protocols (MQTT, Modbus RTU/TCP, OPC-UA, BACnet, Ethernet/IP, CAN, LoRaWAN, Zigbee, BLE)
- Monitoring: energy, water, gas, solar, environment, machine, production
- Operations: OEE, MES, SCADA, alarms, maintenance work orders, OTA firmware
- Self-hosted stack: PostgreSQL, InfluxDB, Redis, Mosquitto, Node-RED, Keycloak, MinIO, Prometheus, Grafana, Loki, Ollama, Qdrant, Frigate, YOLO, Docker
- Capabilities: predictive maintenance, energy forecasting, root-cause analysis, natural-language querying of telemetry, automation flows

When asked for numbers or status, give realistic, concrete figures and a short reasoning. Prefer Markdown with short sections and bullet points. Never invent that you are using OpenAI — you run on the local IndOS AI stack.`

export const POST = withErrorHandler(apiHandler('viewer', RATE_LIMITS.ai, async (req) => {
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

    // Primary: z-ai SDK (built-in, always works)
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
      console.log('[indos-ai] z-ai failed, trying OpenRouter...')
      
      // Fallback: OpenRouter API (if configured)
      const openrouterKey = process.env.OPENROUTER_API_KEY
      if (openrouterKey) {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openrouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'IndOS AI Center',
          },
          body: JSON.stringify({
            model: 'meta-llama/llama-3.2-3b-instruct:free',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: context },
              ...messages,
            ],
            max_tokens: 1000,
            temperature: 0.7,
          }),
        })
        if (response.ok) {
          const data = await response.json()
          const content = data.choices?.[0]?.message?.content || ''
          if (content) return NextResponse.json({ reply: content })
        }
      }
      throw zaiErr
    }
  } catch (e: any) {
    console.error('[indos-ai] error', e)
    return NextResponse.json(
      { error: 'AI_UNAVAILABLE', reply: '⚠️ AI service could not be reached. Both z-ai and OpenRouter failed.' },
      { status: 503 }
    )
  }
}))
