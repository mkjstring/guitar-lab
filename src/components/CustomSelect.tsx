import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface CustomSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  id?: string
  className?: string
  disabled?: boolean
  showChevron?: boolean
}

export function CustomSelect({ value, onChange, options, id, className = '', disabled = false, showChevron = true }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState<number>(-1)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selectedOption = options.find(o => o.value === value)

  // Position the portal dropdown relative to the trigger
  useLayoutEffect(() => {
    if (!isOpen || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      minWidth: rect.width,
      zIndex: 9999,
    })
  }, [isOpen])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    function handlePointerDown(e: PointerEvent) {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        listRef.current && !listRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  // Scroll focused item into view
  useEffect(() => {
    if (!isOpen || focusedIdx < 0 || !listRef.current) return
    const item = listRef.current.children[focusedIdx] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [focusedIdx, isOpen])

  function open() {
    if (disabled) return
    setIsOpen(true)
    const idx = options.findIndex(o => o.value === value)
    setFocusedIdx(idx >= 0 ? idx : 0)
  }

  function close() {
    setIsOpen(false)
    setFocusedIdx(-1)
  }

  function select(optValue: string) {
    onChange(optValue)
    close()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return
    const enabledIndexes = options.map((o, i) => (!o.disabled ? i : -1)).filter(i => i >= 0)
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        open()
      }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); close(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = enabledIndexes.find(i => i > focusedIdx) ?? enabledIndexes[0]
      setFocusedIdx(next ?? focusedIdx)
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = [...enabledIndexes].reverse().find(i => i < focusedIdx) ?? enabledIndexes[enabledIndexes.length - 1]
      setFocusedIdx(prev ?? focusedIdx)
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const opt = options[focusedIdx]
      if (opt && !opt.disabled) select(opt.value)
    }
  }

  const dropdown = (
    <AnimatePresence>
      {isOpen && (
        <motion.ul
          ref={listRef}
          role="listbox"
          aria-label="Options"
          initial={{ opacity: 0, scaleY: 0.85, y: -6 }}
          animate={{ opacity: 1, scaleY: 1, y: 0 }}
          exit={{ opacity: 0, scaleY: 0.85, y: -6 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          style={{ transformOrigin: 'top center', ...dropdownStyle }}
          className={[
            'bg-[#1e2a3a] border border-border-dim rounded-lg',
            'shadow-[0_8px_24px_rgba(0,0,0,0.4)]',
            'list-none m-0 p-1 max-h-[220px] overflow-y-auto',
          ].join(' ')}
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value
            const isFocused = focusedIdx === i
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled}
                onPointerEnter={() => !opt.disabled && setFocusedIdx(i)}
                onClick={() => !opt.disabled && select(opt.value)}
                className={[
                  'flex items-center justify-between gap-2',
                  'px-3 py-2 rounded-md text-sm cursor-pointer transition-colors duration-100',
                  'select-none',
                  opt.disabled ? 'opacity-40 cursor-not-allowed' : '',
                  isSelected ? 'text-accent-soft' : 'text-text',
                  isFocused && !opt.disabled ? 'bg-[rgba(102,126,234,0.2)]' : '',
                ].filter(Boolean).join(' ')}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="shrink-0"
                  >
                    <path d="M1 6l3.5 3.5L11 2" />
                  </svg>
                )}
              </li>
            )
          })}
        </motion.ul>
      )}
    </AnimatePresence>
  )

  return (
    <div
      ref={containerRef}
      className={`relative inline-block ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger button */}
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => (isOpen ? close() : open())}
        className={[
          'flex items-center gap-2 w-full',
          showChevron ? 'justify-between' : 'justify-center',
          'bg-bg-input border border-border rounded-lg text-text text-sm px-3 py-2',
          'cursor-pointer outline-none transition-colors duration-200',
          'hover:border-accent focus:border-accent',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        ].join(' ')}
      >
        <span className="truncate">{selectedOption?.label ?? ''}</span>
        {showChevron && (
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            className={`shrink-0 text-slate transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          >
            <path d="M2 4l4 4 4-4" />
          </svg>
        )}
      </button>

      {createPortal(dropdown, document.body)}
    </div>
  )
}
