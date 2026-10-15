import React from "react"
import { cn } from "@/lib/utils"
import { navigation } from "./navigation"

export default function StyleguideLayout({
  children,
  pathname = "/styleguide",
}: {
  children: React.ReactNode
  pathname?: string
}) {
  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans">
      {/* Sidebar - Fixed */}
      <aside className="w-64 border-r border-border bg-card p-6 flex flex-col gap-6 fixed top-0 left-0 h-screen overflow-y-auto z-30">
        <div>
          <a className="text-xl font-bold tracking-tight text-primary flex items-center gap-2" href="/styleguide">
            <span className="w-3 h-3 rounded-full bg-primary" />
            Design System
          </a>
          <p className="text-xs text-muted-foreground mt-1">NA Barbearia · Vibrant Blue</p>
        </div>

        <nav className="flex flex-col gap-6">
          {navigation.map((section) => (
            <div key={section.title}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {section.title}
              </h3>
              <ul className="flex flex-col gap-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <li key={item.href}>
                      <a
                        href={item.href}
                        className={cn(
                          "block px-3 py-2 rounded-xl text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "hover:bg-muted text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {item.name}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <a href="/" className="hover:text-primary transition-colors">
            ← Voltar ao App
          </a>
          <span className="font-semibold text-primary">v1.0</span>
        </div>
      </aside>

      {/* Main content - offset by sidebar width */}
      <main className="flex-1 ml-64 overflow-auto min-h-screen">
        {children}
      </main>
    </div>
  )
}
