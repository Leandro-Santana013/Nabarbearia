import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Sun,
  Moon,
  CheckCircle2,
  AlertTriangle,
  Info,
  XCircle,
  Scissors,
  Calendar,
  Clock,
  Sparkles,
  ArrowRight,
  Plus
} from "lucide-react"

export default function StyleguidePage() {
  const [isDark, setIsDark] = useState(false)
  const [selectedRadio, setSelectedRadio] = useState("option-1")

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }, [isDark])

  const primaryScale = [
    { step: "50", hex: "#F0F8FF", textColor: "#001F33" },
    { step: "100", hex: "#CCE8FF", textColor: "#001F33" },
    { step: "200", hex: "#99D2FF", textColor: "#001F33" },
    { step: "300", hex: "#66BCFF", textColor: "#001F33" },
    { step: "400", hex: "#33A6FF", textColor: "#FFFFFF" },
    { step: "500", hex: "#0099FF", textColor: "#FFFFFF", isBrand: true },
    { step: "600", hex: "#007ACC", textColor: "#FFFFFF" },
    { step: "700", hex: "#005C99", textColor: "#FFFFFF" },
    { step: "800", hex: "#003D66", textColor: "#FFFFFF" },
    { step: "900", hex: "#001F33", textColor: "#FFFFFF" },
  ]

  const greyScale = [
    { step: "50", hex: "#F9F9FA", textColor: "#111111" },
    { step: "100", hex: "#F4F4F6", textColor: "#111111", desc: "Background Light" },
    { step: "200", hex: "#E4E4E7", textColor: "#111111", desc: "Border / Input" },
    { step: "300", hex: "#D4D4D8", textColor: "#111111" },
    { step: "400", hex: "#A1A1AA", textColor: "#111111" },
    { step: "500", hex: "#71717A", textColor: "#FFFFFF", desc: "Muted Text" },
    { step: "600", hex: "#52525B", textColor: "#FFFFFF" },
    { step: "700", hex: "#3F3F46", textColor: "#FFFFFF" },
    { step: "800", hex: "#27272A", textColor: "#FFFFFF", desc: "Dark Surface" },
    { step: "900", hex: "#18181B", textColor: "#FFFFFF" },
    { step: "950", hex: "#121214", textColor: "#FFFFFF", desc: "Background Dark" },
  ]

  const semanticTokens = [
    { name: "Success", hex: "#22C55E", varName: "--success", icon: CheckCircle2, text: "Ações concluídas e confirmações" },
    { name: "Warning", hex: "#F59E0B", varName: "--warning", icon: AlertTriangle, text: "Alertas de atenção e pendências" },
    { name: "Destructive / Error", hex: "#EF4444", varName: "--destructive", icon: XCircle, text: "Cancelamentos e exclusões" },
    { name: "Info", hex: "#3B82F6", varName: "--info", icon: Info, text: "Orientações e avisos contextuais" },
  ]

  const borderRadiusExamples = [
    { name: "sm (0.5rem / 8px)", className: "rounded-sm", px: "8px" },
    { name: "md (0.75rem / 12px)", className: "rounded-md", px: "12px" },
    { name: "lg / base (1rem / 16px)", className: "rounded-lg border-2 border-primary", px: "16px", highlight: "Brand Default" },
    { name: "xl (1.25rem / 20px)", className: "rounded-xl", px: "20px" },
    { name: "2xl (1.5rem / 24px)", className: "rounded-2xl", px: "24px", highlight: "Cards de Barber" },
    { name: "3xl (2rem / 32px)", className: "rounded-3xl", px: "32px", highlight: "Modais e Banners" },
    { name: "full (Pílulas)", className: "rounded-full", px: "9999px", highlight: "Navegação Flutuante" },
  ]

  return (
    <div className="p-8 lg:p-12 max-w-6xl mx-auto space-y-14">
      {/* Top Banner / Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-8 border-b border-border">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            Prompt 1 · Design System Setup
          </div>
          <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground font-sans">
            Design Tokens & Styleguide
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl text-base">
            Identidade visual contemporânea para o ecossistema <strong>NA Barbearia</strong>. Cantos arredondados (2xl/3xl),
            tipografia <strong>Plus Jakarta Sans</strong>, alto contraste e a cor primária <strong>Vibrant Blue (#0099FF)</strong>.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => setIsDark(!isDark)}
          className="rounded-full px-5 py-2.5 flex items-center gap-2.5 shadow-sm border-border bg-card hover:bg-muted text-foreground"
        >
          {isDark ? (
            <>
              <Sun className="w-4 h-4 text-warning" />
              <span>Tema Claro</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-primary" />
              <span>Tema Escuro</span>
            </>
          )}
        </Button>
      </div>

      {/* 1. Core Brand Colors */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">1. Identidade e Cores Principais</h2>
          <p className="text-sm text-muted-foreground">Tokens base configurados com CSS variables e mapeados no Tailwind CSS v4.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-3">
            <div className="h-20 rounded-xl bg-primary flex items-end p-2.5 shadow-inner">
              <span className="text-xs font-bold text-primary-foreground">#0099FF</span>
            </div>
            <div>
              <p className="font-semibold text-sm">--primary</p>
              <p className="text-xs text-muted-foreground">Vibrant Blue (Marca)</p>
            </div>
          </div>

          <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-3">
            <div className="h-20 rounded-xl bg-background border border-border flex items-end p-2.5">
              <span className="text-xs font-bold text-foreground">#F4F4F6 / #121214</span>
            </div>
            <div>
              <p className="font-semibold text-sm">--background</p>
              <p className="text-xs text-muted-foreground">Superfície base</p>
            </div>
          </div>

          <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-3">
            <div className="h-20 rounded-xl bg-card border border-border flex items-end p-2.5">
              <span className="text-xs font-bold text-card-foreground">#FFFFFF / #1A1A1E</span>
            </div>
            <div>
              <p className="font-semibold text-sm">--card</p>
              <p className="text-xs text-muted-foreground">Cards elevados</p>
            </div>
          </div>

          <div className="bg-card border border-border p-4 rounded-2xl shadow-sm space-y-3">
            <div className="h-20 rounded-xl bg-accent border border-border/50 flex items-end p-2.5">
              <span className="text-xs font-bold text-accent-foreground">#E0F2FE</span>
            </div>
            <div>
              <p className="font-semibold text-sm">--accent</p>
              <p className="text-xs text-muted-foreground">Destaques suaves</p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Color Scales */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">2. Escalas Cromáticas</h2>
          <p className="text-sm text-muted-foreground">Geração harmônica baseada em teoria das cores para primária e neutros.</p>
        </div>

        {/* Primary Scale */}
        <div className="bg-card border border-border p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-foreground">Escala Primária (Brand Blue · 50 a 900)</h3>
            <Badge variant="outline" className="rounded-full">--primary</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
            {primaryScale.map((color) => (
              <div
                key={color.step}
                className="rounded-xl p-3 flex flex-col justify-between h-24 border border-black/5 transition-transform hover:scale-105"
                style={{ backgroundColor: color.hex, color: color.textColor }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">{color.step}</span>
                  {color.isBrand && <span className="text-[10px] uppercase font-extrabold tracking-wider bg-white/20 px-1 rounded">Base</span>}
                </div>
                <span className="text-[11px] font-mono font-medium">{color.hex}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Grey Scale */}
        <div className="bg-card border border-border p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-foreground">Escala de Cinzas (Neutros · 50 a 950)</h3>
            <Badge variant="outline" className="rounded-full">--muted / --foreground</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-11 gap-2">
            {greyScale.map((color) => (
              <div
                key={color.step}
                className="rounded-xl p-3 flex flex-col justify-between h-24 border border-black/5 transition-transform hover:scale-105"
                style={{ backgroundColor: color.hex, color: color.textColor }}
              >
                <span className="text-xs font-bold">{color.step}</span>
                <span className="text-[10px] font-mono">{color.hex}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Semantic Colors */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">3. Cores Semânticas de Sistema</h2>
          <p className="text-sm text-muted-foreground">Cores de status com taxa de contraste &gt; 4.5:1 para conformidade WCAG.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {semanticTokens.map((sem) => {
            const IconComp = sem.icon
            return (
              <div key={sem.name} className="bg-card border border-border p-5 rounded-2xl shadow-sm flex items-start gap-4">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: sem.hex + "20", color: sem.hex }}
                >
                  <IconComp className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-foreground">{sem.name}</h4>
                  </div>
                  <span className="text-xs font-mono font-semibold" style={{ color: sem.hex }}>{sem.hex}</span>
                  <p className="text-xs text-muted-foreground mt-1">{sem.text}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 4. Typography */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">4. Tipografia (Plus Jakarta Sans)</h2>
          <p className="text-sm text-muted-foreground">Família sem serifa moderna, desenhada para clareza e alta legibilidade em telas.</p>
        </div>

        <div className="bg-card border border-border p-6 lg:p-8 rounded-3xl space-y-6">
          <div className="space-y-2 border-b border-border pb-5">
            <span className="text-xs font-mono text-muted-foreground uppercase">Heading 1 · 36px / Bold (700)</span>
            <h1 className="text-4xl font-extrabold tracking-tight">O melhor corte para a sua melhor versão</h1>
          </div>

          <div className="space-y-2 border-b border-border pb-5">
            <span className="text-xs font-mono text-muted-foreground uppercase">Heading 2 · 28px / Bold (700)</span>
            <h2 className="text-3xl font-bold tracking-tight">Profissionais premiados em Santos/SP</h2>
          </div>

          <div className="space-y-2 border-b border-border pb-5">
            <span className="text-xs font-mono text-muted-foreground uppercase">Heading 3 · 22px / SemiBold (600)</span>
            <h3 className="text-2xl font-semibold tracking-tight">Agendamento rápido sem filas ou espera</h3>
          </div>

          <div className="space-y-2 border-b border-border pb-5">
            <span className="text-xs font-mono text-muted-foreground uppercase">Body Text · 16px / Regular (400)</span>
            <p className="text-base text-muted-foreground leading-relaxed">
              Descubra a praticidade de reservar horários exclusivos com nossos especialistas. Escolha o serviço, selecione o profissional de sua preferência e confirme em segundos.
            </p>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-mono text-muted-foreground uppercase">Caption / Small · 13px / Medium (500)</span>
            <p className="text-xs text-muted-foreground">
              * Horários sujeitos a confirmação imediata via WhatsApp e painel do cliente.
            </p>
          </div>
        </div>
      </section>

      {/* 5. Border Radius & Shadows */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">5. Raios de Borda e Sombras</h2>
          <p className="text-sm text-muted-foreground">
            A estética de referência utiliza cantos generosamente arredondados (16px a 32px e pílulas) com sombras difusas.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Border Radius */}
          <div className="bg-card border border-border p-6 rounded-3xl space-y-4">
            <h3 className="font-bold text-base text-foreground">Border Radius Rhythm</h3>
            <div className="space-y-3">
              {borderRadiusExamples.map((item) => (
                <div key={item.name} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 bg-primary/20 border border-primary/40 flex items-center justify-center text-xs font-bold text-primary ${item.className}`}>
                      R
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.name}</p>
                      {item.highlight && <span className="text-[11px] text-primary font-medium">{item.highlight}</span>}
                    </div>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">{item.px}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Shadows */}
          <div className="bg-card border border-border p-6 rounded-3xl space-y-4">
            <h3 className="font-bold text-base text-foreground">Floating Shadows</h3>
            <div className="grid grid-cols-1 gap-4 pt-2">
              <div className="bg-card p-5 rounded-2xl shadow-sm border border-border/80">
                <span className="text-xs font-mono font-semibold text-muted-foreground">shadow-sm</span>
                <p className="text-sm font-medium mt-1">Superfície sutil de cartões estáticos</p>
              </div>

              <div className="bg-card p-5 rounded-2xl shadow-md border border-border/40">
                <span className="text-xs font-mono font-semibold text-muted-foreground">shadow-md</span>
                <p className="text-sm font-medium mt-1">Cards interativos e dropdowns</p>
              </div>

              <div className="bg-card p-5 rounded-3xl shadow-xl border border-primary/10">
                <span className="text-xs font-mono font-semibold text-primary">shadow-xl (Floating Elements)</span>
                <p className="text-sm font-medium mt-1">Navegação inferior flutuante &amp; Modais</p>
              </div>

              <div className="bg-primary/5 p-5 rounded-3xl shadow-2xl border border-primary/20">
                <span className="text-xs font-mono font-semibold text-primary">shadow-2xl diffuse</span>
                <p className="text-sm font-medium mt-1">Banner em destaque de agendamento</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Demo Components Showcase */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">6. Componentes shadcn/ui em Ação</h2>
          <p className="text-sm text-muted-foreground">
            Instalados e estilizados com os novos tokens (Button, Card, Badge, Alert, RadioGroup).
          </p>
        </div>

        {/* Buttons & Badges */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-3xl border-border">
            <CardHeader>
              <CardTitle>Botões e Variantes</CardTitle>
              <CardDescription>Com suporte à cor de marca Vibrant Blue e cantos arredondados.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button className="rounded-xl">Primary (#0099FF)</Button>
              <Button variant="secondary" className="rounded-xl">Secondary</Button>
              <Button variant="outline" className="rounded-xl">Outline</Button>
              <Button variant="destructive" className="rounded-xl">Destructive</Button>
              <Button variant="ghost" className="rounded-xl">Ghost</Button>
              <Button size="sm" className="rounded-xl">Small</Button>
              <Button size="lg" className="rounded-2xl px-6">
                Agendar Horário <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border">
            <CardHeader>
              <CardTitle>Badges &amp; Pílulas de Categoria</CardTitle>
              <CardDescription>Estilo de seleção baseado na tela inicial de referência.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge className="rounded-full px-3 py-1 bg-primary text-primary-foreground">Corte Masculino</Badge>
                <Badge variant="secondary" className="rounded-full px-3 py-1">Barba Terapia</Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1">Coloração</Badge>
                <Badge variant="destructive" className="rounded-full px-3 py-1">Esgotado</Badge>
              </div>

              <div className="p-4 bg-muted/40 rounded-2xl">
                <p className="text-xs font-medium text-muted-foreground mb-2">Simulação de filtro de serviços:</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <span className="px-4 py-2 bg-primary text-primary-foreground font-semibold text-xs rounded-full cursor-pointer shadow-sm">
                    Hairdressing
                  </span>
                  <span className="px-4 py-2 bg-card text-muted-foreground border border-border font-medium text-xs rounded-full cursor-pointer hover:bg-muted">
                    Hair Color
                  </span>
                  <span className="px-4 py-2 bg-card text-muted-foreground border border-border font-medium text-xs rounded-full cursor-pointer hover:bg-muted">
                    Oil Treatment
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Alerts & Radio Group */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="rounded-3xl border-border">
            <CardHeader>
              <CardTitle>Alertas de Sistema</CardTitle>
              <CardDescription>Mensagens de feedback contextual para agendamentos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="rounded-2xl border-primary/20 bg-accent/40 text-foreground">
                <Info className="h-4 w-4 text-primary" />
                <AlertTitle className="font-bold">Agendamento em Santos/SP</AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground">
                  Selecione com antecedência os sábados e vésperas de feriado.
                </AlertDescription>
              </Alert>

              <Alert variant="destructive" className="rounded-2xl">
                <XCircle className="h-4 w-4" />
                <AlertTitle className="font-bold">Horário Indisponível</AlertTitle>
                <AlertDescription className="text-xs">
                  O barbeiro selecionado já possui um cliente às 11:30.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border">
            <CardHeader>
              <CardTitle>Seleção via Radio Group</CardTitle>
              <CardDescription>Para opções como pagamento, unidade ou serviço.</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup value={selectedRadio} onValueChange={setSelectedRadio} className="space-y-3">
                <div className={`flex items-center justify-between p-3.5 rounded-2xl border transition-colors cursor-pointer ${selectedRadio === "option-1" ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="option-1" id="r1" />
                    <label htmlFor="r1" className="text-sm font-semibold cursor-pointer">
                      Pagamento no Local (Cartão / PIX / Dinheiro)
                    </label>
                  </div>
                  <Badge variant="outline" className="rounded-full text-[10px]">Sem taxa</Badge>
                </div>

                <div className={`flex items-center justify-between p-3.5 rounded-2xl border transition-colors cursor-pointer ${selectedRadio === "option-2" ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                  <div className="flex items-center space-x-3">
                    <RadioGroupItem value="option-2" id="r2" />
                    <label htmlFor="r2" className="text-sm font-semibold cursor-pointer">
                      PIX Antecipado com 5% de Desconto
                    </label>
                  </div>
                  <Badge className="rounded-full text-[10px] bg-primary text-primary-foreground">-5% OFF</Badge>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>
        </div>

        {/* 7. Reference UI Recreation (Barber App Sample) */}
        <div className="bg-card border border-border p-8 rounded-3xl shadow-lg space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <Badge className="bg-primary/20 text-primary border-primary/30 rounded-full mb-2">UI Reference Adaptation</Badge>
              <h3 className="text-xl font-bold tracking-tight">Composição da Barbearia (Vibrant Blue)</h3>
              <p className="text-sm text-muted-foreground">
                Demonstração de como os tokens traduzem a referência com cantos arredondados e navegação flutuante.
              </p>
            </div>
            <Button className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
              <Scissors className="w-4 h-4 mr-2" /> Agendar Agora
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            {/* Promo Card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-neutral-900 to-neutral-800 text-white p-6 shadow-xl flex flex-col justify-between h-64">
              <div className="space-y-1">
                <span className="text-xs uppercase font-extrabold tracking-wider text-primary">Oferta Especial</span>
                <h4 className="text-2xl font-black leading-tight">Ganhe 20% OFF no seu Próximo Corte!</h4>
              </div>
              <div>
                <Button className="rounded-full bg-primary hover:bg-primary/90 text-white font-bold px-5 text-xs shadow-md">
                  Garantir Desconto
                </Button>
              </div>
            </div>

            {/* Barber Card */}
            <div className="bg-background border border-border rounded-3xl p-4 shadow-md flex flex-col justify-between">
              <div className="w-full h-36 rounded-2xl bg-gradient-to-br from-primary/30 to-accent flex items-center justify-center text-primary relative overflow-hidden">
                <Scissors className="w-12 h-12 opacity-80" />
                <span className="absolute bottom-2 right-2 px-2.5 py-1 bg-card/90 backdrop-blur rounded-full text-[11px] font-bold text-foreground">
                  ⭐ 4.9 (128)
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <h5 className="font-bold text-base text-foreground">David Marcomin</h5>
                  <p className="text-xs text-muted-foreground">Master Barber · Fade &amp; Barba</p>
                  <p className="text-sm font-extrabold text-primary mt-1">R$ 55,00</p>
                </div>
                <button className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-md hover:scale-105 transition-transform">
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Schedule Pill Picker */}
            <div className="bg-background border border-border rounded-3xl p-5 shadow-md flex flex-col justify-between">
              <div>
                <h5 className="font-bold text-base text-foreground mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  Horários Disponíveis
                </h5>
                <div className="grid grid-cols-3 gap-2">
                  <span className="py-2 text-center text-xs font-semibold rounded-2xl bg-muted text-muted-foreground">10:00</span>
                  <span className="py-2 text-center text-xs font-bold rounded-2xl bg-primary text-primary-foreground shadow-sm">11:30</span>
                  <span className="py-2 text-center text-xs font-semibold rounded-2xl bg-muted text-muted-foreground">14:00</span>
                  <span className="py-2 text-center text-xs font-semibold rounded-2xl bg-muted text-muted-foreground">15:30</span>
                  <span className="py-2 text-center text-xs font-semibold rounded-2xl bg-muted text-muted-foreground">17:00</span>
                  <span className="py-2 text-center text-xs font-semibold rounded-2xl bg-muted text-muted-foreground">18:30</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Duração: 45 min</span>
                <span className="font-bold text-primary">Disponível Hoje</span>
              </div>
            </div>
          </div>

          {/* Floating Navigation Preview */}
          <div className="pt-4 flex justify-center">
            <div className="bg-neutral-900 text-white px-5 py-3 rounded-full flex items-center gap-4 shadow-2xl border border-white/10">
              <span className="px-4 py-1.5 rounded-full bg-primary text-white text-xs font-bold flex items-center gap-1.5 shadow-md">
                Início
              </span>
              <span className="text-xs text-neutral-400 font-medium hover:text-white cursor-pointer px-2">Agendar</span>
              <span className="text-xs text-neutral-400 font-medium hover:text-white cursor-pointer px-2">Barbeiros</span>
              <span className="text-xs text-neutral-400 font-medium hover:text-white cursor-pointer px-2">Perfil</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
