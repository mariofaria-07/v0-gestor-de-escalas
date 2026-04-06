"use client"

import { useState, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"

interface AutocompleteInputProps {
  value: string
  onChange: (val: string) => void
  options: string[]
  placeholder?: string
  className?: string
  onEnter?: () => void
}

export function AutocompleteInput({ 
  value, 
  onChange, 
  options, 
  placeholder,
  className,
  onEnter
}: AutocompleteInputProps) {
  const [show, setShow] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShow(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filtered = options.filter(o => o.toLowerCase().includes(value.toLowerCase()) && o !== value)

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <Input 
        placeholder={placeholder} 
        value={value} 
        onChange={e => { onChange(e.target.value); setShow(true); }}
        onFocus={() => setShow(true)}
        onKeyDown={e => {
          if (e.key === 'Enter' && onEnter) {
            onEnter()
            setShow(false)
          }
        }}
        className={className}
      />
      {show && filtered.length > 0 && (
        <ul className="absolute z-50 w-full bg-background border border-border rounded-md shadow-lg max-h-60 overflow-auto mt-1">
          {filtered.map(opt => (
            <li 
              key={opt} 
              className="px-3 py-2 text-sm hover:bg-secondary cursor-pointer" 
              onMouseDown={(e) => { 
                e.preventDefault(); // Prevent input blur
                onChange(opt); 
                setShow(false); 
              }}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
