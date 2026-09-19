"use client"

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useLocation, Link } from "react-router-dom"
import { cn } from "@/lib/utils"

interface NavItem {
  name: string
  url: string
  /** Section-Akzentfarbe (hex) — färbt den aktiven Zustand */
  color?: string
}

interface TubelightNavBarProps {
  items: NavItem[]
  className?: string
}

/** Weich mit einem Hauch Ueberschwingen, wie die Uebergaenge in iOS. */
const SLIDE_EASING = "cubic-bezier(0.34, 1.32, 0.64, 1)"

export function TubelightNavBar({ items, className }: TubelightNavBarProps) {
  const location = useLocation()
  const currentPath = location.pathname

  const getActiveTab = () => {
    const exactMatch = items.find(item => item.url === currentPath)
    if (exactMatch) return exactMatch.name
    const partialMatch = items.find(item =>
      item.url !== "/" && currentPath.startsWith(item.url)
    )
    if (partialMatch) return partialMatch.name
    if (currentPath === "/") {
      const homeItem = items.find(item => item.url === "/")
      return homeItem?.name || items[0]?.name
    }
    return null
  }

  const activeTab = getActiveTab()

  const listRef = useRef<HTMLDivElement>(null)
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>())
  const [hovered, setHovered] = useState<string | null>(null)
  // Die Pille wandert zum ueberfahrenen Punkt und kehrt danach zum aktiven zurueck.
  const shownTab = hovered ?? activeTab
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  const [animate, setAnimate] = useState(false)

  const measure = useCallback(() => {
    if (!shownTab) {
      setPill(null)
      return
    }
    const el = linkRefs.current.get(shownTab)
    const list = listRef.current
    if (!el || !list) return
    setPill({
      left: el.offsetLeft,
      width: el.offsetWidth,
    })
  }, [shownTab])

  // Vor dem ersten Bild messen, damit die Pille nicht von links hereinspringt.
  useLayoutEffect(() => {
    measure()
  }, [measure])

  // Erst ab dem zweiten Zustand animieren.
  useEffect(() => {
    if (pill && !animate) {
      const id = requestAnimationFrame(() => setAnimate(true))
      return () => cancelAnimationFrame(id)
    }
  }, [pill, animate])

  useEffect(() => {
    const list = listRef.current
    if (!list || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => measure())
    observer.observe(list)
    return () => observer.disconnect()
  }, [measure])

  // Schriften kommen nach dem ersten Bild an und aendern die Breiten.
  useEffect(() => {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    fonts?.ready.then(() => measure())
  }, [measure])

  const activeColor = items.find(item => item.name === shownTab)?.color

  return (
    <div
      ref={listRef}
      onMouseLeave={() => setHovered(null)}
      className={cn(
        "relative flex items-center gap-1 rounded-full px-2 py-1.5",
        "border border-white/[0.07] bg-white/[0.04]",
        className
      )}
    >
      {/* Gleitende Glas-Pille hinter dem aktiven Punkt */}
      {pill && (
        <span
          aria-hidden="true"
          className="p2g-nav-pill absolute top-1.5 bottom-1.5 left-0 rounded-full"
          style={{
            transform: `translateX(${pill.left}px)`,
            width: `${pill.width}px`,
            transition: animate
              ? `transform 300ms ${SLIDE_EASING}, width 300ms ${SLIDE_EASING}`
              : "none",
            ...(activeColor
              ? ({ "--pill-accent": activeColor } as React.CSSProperties)
              : null),
          }}
        />
      )}

      {items.map((item) => {
        const isActive = activeTab === item.name

        return (
          <Link
            key={item.name}
            ref={(node) => {
              if (node) linkRefs.current.set(item.name, node)
              else linkRefs.current.delete(item.name)
            }}
            to={item.url}
            onMouseEnter={() => setHovered(item.name)}
            onFocus={() => setHovered(item.name)}
            onBlur={() => setHovered(null)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative z-10 cursor-pointer rounded-full px-4 py-2 text-sm font-medium",
              "transition-colors duration-150",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            style={isActive && item.color ? { color: item.color } : undefined}
          >
            {item.name}
          </Link>
        )
      })}
    </div>
  )
}
