'use client'
import { useState, useEffect } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { CircuitBoard, Loader2, AlertCircle, Bug } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [logs, setLogs] = useState<string[]>([])

  const log = (msg: string) => {
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false })
    const entry = `[${ts}] ${msg}`
    console.log(entry)
    setLogs(prev => [...prev, entry])
  }

  useEffect(() => {
    log('🔍 Page loaded — checking session...')
    getSession()
      .then(s => {
        if (s?.user) {
          log(`✅ Already logged in: ${s.user.email}`)
          window.location.replace('/')
        } else {
          log('👤 No session — show login form')
        }
      })
      .catch(e => log(`❌ Session check: ${e.message}`))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    log('━━━━━━━━━━━━━━━━━━━━━━')
    log(`📝 Login: ${email}`)
    log('1️⃣ Calling signIn(redirect:false)...')

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      log(`2️⃣ Result: ${JSON.stringify(result)}`)

      if (result?.error) {
        log(`❌ Error: ${result.error}`)
        setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
        setLoading(false)
        return
      }

      if (result?.ok) {
        log('✅ Login OK — checking session...')
        // Wait a moment for cookie to settle
        await new Promise(r => setTimeout(r, 300))
        const session = await getSession()
        log(`3️⃣ Session: ${session?.user?.email || 'NONE'}`)

        if (session?.user) {
          log('4️⃣ Session confirmed — redirecting')
          // Use replace instead of href to avoid back-button issues
          window.location.replace('/')
        } else {
          log('⚠️ No session after login — cookie blocked by browser')
          setError('Login สำเร็จแต่ session cookie ถูกบล็อก ลองเปิดในแท็บใหม่ (Open in New Tab)')
          setLoading(false)
        }
      } else {
        log('⚠️ Unexpected result')
        setError('Login ล้มเหลว — ลองอีกครั้ง')
        setLoading(false)
      }
    } catch (err: any) {
      log(`💥 Exception: ${err.message}`)
      setError(`Error: ${err.message}`)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground ring-1 ring-primary/40 indos-glow">
            <CircuitBoard className="h-6 w-6" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight">IndOS</h1>
            <p className="text-xs text-muted-foreground">Industrial IoT Operating System</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sign in</CardTitle>
            <CardDescription>Enter your credentials to access the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="admin@indos.io" value={email}
                  onChange={(e) => setEmail(e.target.value)} required autoFocus disabled={loading} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="••••••••" value={password}
                  onChange={(e) => setPassword(e.target.value)} required disabled={loading} />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…</> : 'Sign in'}
              </Button>
            </form>

            <div className="mt-3 rounded-md border border-border/50 bg-muted/30 p-2 text-center text-[10px] text-muted-foreground">
              Demo: <span className="font-mono text-primary">admin@indos.io</span> / <span className="font-mono text-primary">indos123</span>
            </div>
          </CardContent>
        </Card>

        {logs.length > 0 && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xs text-amber-400">
                <Bug className="h-3.5 w-3.5" /> Debug Log
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="indos-scroll max-h-40 overflow-y-auto rounded-md bg-slate-950/80 p-3 font-mono text-[10px] leading-relaxed text-slate-300">
                {logs.map((l, i) => (
                  <div key={i} className={l.includes('❌') || l.includes('⚠️') || l.includes('💥') ? 'text-rose-400' : l.includes('✅') ? 'text-emerald-400' : 'text-slate-300'}>
                    {l}
                  </div>
                ))}
              </div>
              <Button size="sm" variant="outline" className="mt-2 h-7 w-full gap-1.5 text-xs"
                onClick={() => navigator.clipboard?.writeText(logs.join('\n'))}>
                Copy log
              </Button>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-[11px] text-muted-foreground">
          Self-hosted · No cloud · Your data never leaves the plant network
        </p>
      </div>
    </div>
  )
}
