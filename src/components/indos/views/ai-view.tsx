'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { ViewHeader } from '@/components/indos/shared/view-header'
import { LiveDot } from '@/components/indos/shared/charts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { useIndOS } from '@/lib/indos/store'
import { cn } from '@/lib/utils'
import {
  Bot, Send, Sparkles, Brain, TrendingUp, Wrench, Zap, AlertTriangle,
  Activity, Cpu, Database, RefreshCw, Search, GitBranch, ScanEye,
  Server, ShieldCheck, Box, CornerDownLeft, Trash2, Cpu as CpuIcon,
} from 'lucide-react'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  ts: number
}

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "I'm your **IndOS assistant**. Ask me about device health, energy usage, alarms, predictive maintenance, or anything across your industrial fleet.\n\nI run on the **local IndOS AI stack** — your data never leaves the plant network.",
  ts: Date.now(),
}

const SUGGESTED_PROMPTS = [
  'Why is Line A1 OEE below target?',
  'Summarize active critical alarms',
  'Forecast next 24h energy demand',
  'Root-cause the GW-KKC-04 disconnect',
  'Which devices need firmware updates?',
]

const CAPABILITIES = [
  { icon: Wrench, title: 'Predictive Maintenance', desc: 'Vibration & thermal trend RUL for rotating equipment.', color: 'text-amber-400' },
  { icon: Zap, title: 'Energy Forecast', desc: '24–72h kW demand using weather + production schedule.', color: 'text-yellow-400' },
  { icon: TrendingUp, title: 'Production Forecast', desc: 'Output vs plan with OEE decomposition by line.', color: 'text-emerald-400' },
  { icon: GitBranch, title: 'Root Cause Analysis', desc: 'Trace alarms back through correlated telemetry chains.', color: 'text-rose-400' },
  { icon: Search, title: 'Natural Language Query', desc: 'Ask “show me INV-03 yield last 7d” → SQL + chart.', color: 'text-sky-400' },
  { icon: ScanEye, title: 'Anomaly Detection', desc: 'Unsupervised drift detection across all sensors.', color: 'text-violet-400' },
]

const LOCAL_STACK = [
  { name: 'Ollama', detail: 'llama3.1:8b · llama.cpp runtime', icon: Brain },
  { name: 'Qdrant', detail: 'Vector DB · 1.2M embeddings', icon: Database },
  { name: 'Frigate + YOLO', detail: 'Edge vision · 12 cameras', icon: ScanEye },
]

const MODELS = [
  { name: 'llama3.1:8b', size: '4.9 GB', loaded: true, kind: 'Instruct' },
  { name: 'mistral:7b', size: '4.4 GB', loaded: false, kind: 'Instruct' },
  { name: 'phi3:mini', size: '2.3 GB', loaded: false, kind: 'Instruct' },
  { name: 'nomic-embed-text', size: '274 MB', loaded: true, kind: 'Embedding' },
]

const INSIGHTS = [
  {
    icon: Zap,
    color: 'text-amber-400',
    title: 'Solar yield −18% on inverter INV-03',
    detail: 'Possible soiling — recommend cleaning.',
    prompt: 'Why is solar yield down 18% on inverter INV-03 and what should I do?',
  },
  {
    icon: Wrench,
    color: 'text-rose-400',
    title: 'Reflow Oven bearing vibration trending up',
    detail: 'Schedule maintenance within 7 days.',
    prompt: 'Vibration on the Reflow Oven is trending up — what is the likely failure mode and recommended action window?',
  },
  {
    icon: TrendingUp,
    color: 'text-emerald-400',
    title: 'Peak demand forecast tomorrow 14:00–16:00 ~ 460 kW',
    detail: 'Pre-cool cold storage to flatten the curve.',
    prompt: 'Forecast peak demand for tomorrow and recommend a load-shifting plan for cold storage.',
  },
  {
    icon: AlertTriangle,
    color: 'text-sky-400',
    title: 'GW-KKC-04 disconnected 3× in last 24h',
    detail: 'Probable MQTT keep-alive timeout on LoRa gateway.',
    prompt: 'Root-cause the GW-KKC-04 disconnect events — what telemetry points correlate with each outage?',
  },
]

export function AiView() {
  const { setView } = useIndOS()
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)

  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll on new message / loading change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || loading) return
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: trimmed,
        ts: Date.now(),
      }
      const nextMessages = [...messages, userMsg]
      setMessages(nextMessages)
      setInput('')
      setShowSuggestions(false)
      setLoading(true)
      try {
        const res = await fetch('/api/indos/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: nextMessages
              .filter((m) => m.id !== 'welcome')
              .map(({ role, content }) => ({ role, content })),
          }),
        })
        const data = await res.json()
        const reply =
          (data && typeof data.reply === 'string' && data.reply) ||
          '⚠️ Unexpected response shape from local AI engine.'
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', content: reply, ts: Date.now() },
        ])
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: '⚠️ Local AI engine unreachable. Verify Ollama service.',
            ts: Date.now(),
          },
        ])
      } finally {
        setLoading(false)
        requestAnimationFrame(() => taRef.current?.focus())
      }
    },
    [loading, messages],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const handleClear = () => {
    setMessages([{ ...WELCOME, ts: Date.now() }])
    setShowSuggestions(true)
    setInput('')
    requestAnimationFrame(() => taRef.current?.focus())
  }

  const canSend = input.trim().length > 0 && !loading

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ViewHeader
        title="AI Center"
        description="Local-first industrial copilot. Self-hosted LLM, vector DB and edge vision — no cloud, no data egress."
        icon={<Brain className="h-5 w-5" />}
        actions={
          <>
            <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <LiveDot color="bg-emerald-400" /> Ollama online
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={() => setView('automation')}
            >
              <Sparkles className="h-3.5 w-3.5" /> Automation flows
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px]">
        {/* ─── Chat panel ─── */}
        <Card className="flex h-[calc(100vh-220px)] min-h-[520px] flex-col overflow-hidden p-0">
          {/* Chat header */}
          <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-card/60 px-4 py-3 backdrop-blur">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/30">
                <Bot className="h-5 w-5 text-primary" />
                <span className="absolute -bottom-0.5 -right-0.5">
                  <LiveDot color="bg-emerald-400" />
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-semibold">IndOS Assistant</h2>
                  <Badge variant="secondary" className="gap-1 bg-muted/60 font-mono text-[10px] font-normal">
                    <Cpu className="h-3 w-3" /> llama3.1:8b · self-hosted
                  </Badge>
                </div>
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="text-emerald-400">●</span> Ready · grounded with live platform context
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={handleClear}
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="relative flex-1 overflow-hidden">
            <ScrollArea className="indos-scroll h-full">
              <div className="space-y-4 px-4 py-4 sm:px-6">
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
                {loading && <TypingBubble />}
                <div ref={bottomRef} className="h-px" />
              </div>
            </ScrollArea>
          </div>

          {/* Suggestions */}
          {showSuggestions && (
            <div className="border-t border-border/60 bg-card/30 px-4 py-2.5 sm:px-6">
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" /> Suggested prompts
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => send(p)}
                    className="rounded-full border border-border/70 bg-card/60 px-3 py-1.5 text-left text-xs text-foreground/80 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border/60 bg-card/40 p-3 sm:p-4">
            <div className="relative rounded-xl border border-border/70 bg-background/60 p-2 transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
              <Textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                placeholder="Ask about devices, alarms, energy, maintenance… (Enter to send · Shift+Enter for newline)"
                className="min-h-[44px] resize-none border-0 bg-transparent px-2 py-1 text-sm shadow-none focus-visible:ring-0"
                disabled={loading}
              />
              <div className="flex items-center justify-between gap-2 px-1 pt-1">
                <span className="hidden items-center gap-1 text-[10px] text-muted-foreground sm:flex">
                  <CornerDownLeft className="h-3 w-3" /> Send ·
                  <kbd className="rounded border border-border bg-muted/50 px-1 py-0.5 font-mono text-[9px]">Shift</kbd>
                  +
                  <kbd className="rounded border border-border bg-muted/50 px-1 py-0.5 font-mono text-[9px]">↵</kbd>
                  newline
                </span>
                <Button
                  size="sm"
                  className="ml-auto h-8 gap-1.5"
                  onClick={() => send(input)}
                  disabled={!canSend}
                >
                  {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {loading ? 'Thinking…' : 'Send'}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* ─── Capabilities panel ─── */}
        <div className="flex flex-col gap-4">
          {/* AI Capabilities */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" /> AI Capabilities
              </CardTitle>
              <CardDescription className="text-xs">What the assistant can reason about</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 pt-0">
              {CAPABILITIES.map((c) => (
                <div
                  key={c.title}
                  className="group flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/40"
                >
                  <div className="mt-0.5 rounded-md bg-muted/60 p-1.5 ring-1 ring-border/60">
                    <c.icon className={cn('h-3.5 w-3.5', c.color)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">{c.title}</p>
                    <p className="text-[11px] leading-snug text-muted-foreground">{c.desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Local AI Stack */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="h-4 w-4 text-emerald-400" /> Local AI Stack
              </CardTitle>
              <CardDescription className="text-xs">Running entirely on the IndOS node</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {LOCAL_STACK.map((s) => (
                <div key={s.name} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card/40 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <s.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{s.detail}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <LiveDot color="bg-emerald-400" />
                    <span className="text-[10px] font-medium text-emerald-400">running</span>
                  </div>
                </div>
              ))}
              <div className="mt-2 flex items-center justify-center gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-center">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <p className="text-[11px] font-medium text-emerald-400">
                  No OpenAI · No cloud · 100% local
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Models */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Box className="h-4 w-4 text-sky-400" /> Models
              </CardTitle>
              <CardDescription className="text-xs">Local Ollama model registry</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {MODELS.map((m) => (
                <div
                  key={m.name}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-md border px-3 py-2 transition-colors',
                    m.loaded
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-border/60 bg-card/40',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <CpuIcon className={cn('h-4 w-4 shrink-0', m.loaded ? 'text-primary' : 'text-muted-foreground')} />
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate font-mono text-xs font-medium">
                        {m.name}
                        {m.loaded && (
                          <Badge variant="outline" className="border-primary/40 bg-primary/10 px-1 py-0 text-[9px] text-primary">
                            loaded
                          </Badge>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{m.size} · {m.kind}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={m.loaded ? 'ghost' : 'outline'}
                    className="h-7 shrink-0 px-2 text-[11px]"
                    disabled={m.loaded}
                  >
                    {m.loaded ? '✓ Active' : 'Load'}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Recent Insights */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-amber-400" /> Recent Insights
              </CardTitle>
              <CardDescription className="text-xs">Generated by IndOS AI · click to ask</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {INSIGHTS.map((i) => (
                <button
                  key={i.title}
                  type="button"
                  onClick={() => {
                    setInput(i.prompt)
                    setShowSuggestions(false)
                    requestAnimationFrame(() => taRef.current?.focus())
                  }}
                  className="group block w-full rounded-md border border-border/60 bg-card/40 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="flex items-start gap-2.5">
                    <i.icon className={cn('mt-0.5 h-4 w-4 shrink-0', i.color)} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium leading-tight">{i.title}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{i.detail}</p>
                      <p className="mt-1 hidden items-center gap-1 text-[10px] text-primary opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
                        Ask assistant →
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ─── Message bubble ──────────────────────────────────────────────────────────
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex w-full gap-2.5', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/25 to-primary/5 ring-1 ring-primary/30">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm shadow-sm sm:max-w-[78%]',
          isUser
            ? 'bg-primary/15 text-foreground ring-1 ring-primary/20'
            : 'border border-border bg-card text-card-foreground',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        ) : (
          <div className="prose-chat">
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h3 className="mb-1 mt-1 text-sm font-semibold">{children}</h3>,
                h2: ({ children }) => <h3 className="mb-1 mt-1 text-sm font-semibold">{children}</h3>,
                h3: ({ children }) => <h4 className="mb-1 mt-1 text-sm font-semibold">{children}</h4>,
                h4: ({ children }) => <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>,
                p: ({ children }) => <p className="mb-1.5 leading-relaxed last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="mb-1.5 ml-4 list-disc space-y-0.5 last:mb-0">{children}</ul>,
                ol: ({ children }) => <ol className="mb-1.5 ml-4 list-decimal space-y-0.5 last:mb-0">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                em: ({ children }) => <em className="italic text-muted-foreground">{children}</em>,
                code: ({ className, children, ...props }) => {
                  const isBlock = (className || '').includes('language-')
                  if (isBlock) {
                    return (
                      <pre className="my-2 overflow-x-auto rounded-md border border-border bg-background/80 p-2.5 text-[12px]">
                        <code className="font-mono" {...props}>
                          {children}
                        </code>
                      </pre>
                    )
                  }
                  return (
                    <code className="rounded bg-muted/70 px-1 py-0.5 font-mono text-[12px] text-primary" {...props}>
                      {children}
                    </code>
                  )
                },
                pre: ({ children }) => <>{children}</>,
                blockquote: ({ children }) => (
                  <blockquote className="my-1.5 border-l-2 border-primary/40 pl-3 text-muted-foreground">{children}</blockquote>
                ),
                hr: () => <Separator className="my-2" />,
                a: ({ children, href }) => (
                  <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80">
                    {children}
                  </a>
                ),
                table: ({ children }) => (
                  <div className="my-2 overflow-x-auto">
                    <table className="w-full border-collapse text-xs">{children}</table>
                  </div>
                ),
                th: ({ children }) => <th className="border border-border bg-muted/40 px-2 py-1 text-left font-medium">{children}</th>,
                td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        <p className={cn('mt-1 text-[10px] text-muted-foreground/70', isUser ? 'text-right' : 'text-left')}>
          {new Date(message.ts).toLocaleTimeString('en-GB', { hour12: false })}
        </p>
      </div>
      {isUser && (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/60 ring-1 ring-border/60">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

// ─── Typing indicator ────────────────────────────────────────────────────────
function TypingBubble() {
  return (
    <div className="flex w-full justify-start gap-2.5">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/25 to-primary/5 ring-1 ring-primary/30">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div className="flex items-center gap-1 rounded-xl border border-border bg-card px-4 py-3.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.3s] [animation-duration:0.9s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.15s] [animation-duration:0.9s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-duration:0.9s]" />
        <span className="ml-1.5 text-[10px] text-muted-foreground">thinking…</span>
      </div>
    </div>
  )
}
