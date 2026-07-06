import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { withErrorHandler, validateBody } from '@/lib/api'
import { aiChatSchema } from '@/lib/indos/schemas'
import { apiHandler, RATE_LIMITS } from '@/lib/api-handler'

// IndOS AI Center — local-first industrial assistant (powered by z-ai LLM).
// In production this maps to a self-hosted Ollama instance; here we use the
// z-ai-web-dev-sdk as the inference backend with an IndOS-specific persona.
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
    // Pull a small live context snapshot to ground the assistant.
    const [deviceCount, activeAlarms, projectCount, woOpen] = await Promise.all([
      db.device.count(),
      db.alarm.count({ where: { state: 'active' } }),
      db.project.count(),
      db.workOrder.count({ where: { OR: [{ status: 'open' }, { status: 'inprogress' }] } }),
    ])
    const context = `Live platform context: ${projectCount} projects, ${deviceCount} registered devices, ${activeAlarms} active alarms, ${woOpen} open/in-progress work orders. The user is on the IndOS web console.`

    const fullMessages = [
      { role: 'assistant' as const, content: SYSTEM_PROMPT },
      { role: 'user' as const, content: context },
      ...messages,
    ]

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: fullMessages,
      thinking: { type: 'disabled' },
    })
    const content = completion.choices[0]?.message?.content || ''
    return NextResponse.json({ reply: content })
  } catch (e: any) {
    console.error('[indos-ai] error', e)
    return NextResponse.json(
      { error: 'AI_UNAVAILABLE', reply: '⚠️ Local AI engine could not be reached. Verify Ollama service is running and the model is loaded.' },
      { status: 503 }
    )
  }
}))
