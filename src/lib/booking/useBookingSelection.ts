import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { DateTimeSelectionProps } from '../../pages/DateTimeSelection.types'
import { DEFAULT_SERVICE, DEFAULT_BARBER } from '../../data/bookingCatalog'
import { demoAvailability, realAvailability } from './availability'
import { createBookingSelection } from './selection'

export function useBookingSelection(props: DateTimeSelectionProps) {
  const callbacks = useRef(props)
  callbacks.current = props
  const [selection] = useState(() => createBookingSelection(
    props.loadAvailability ? realAvailability((date) => callbacks.current.loadAvailability!(date)) : demoAvailability(props.service?.durationMinutes ?? DEFAULT_SERVICE.durationMinutes!),
    { service: props.service ?? DEFAULT_SERVICE, barber: props.barber ?? DEFAULT_BARBER,
      initialDate: props.initialDate, initialTime: props.initialTime,
      onSelectionChange: (choice) => callbacks.current.onSelectionChange?.(choice),
      onConfirm: (review) => callbacks.current.onConfirm?.(review) },
  ))
  useEffect(() => { void selection.reload(); return () => selection.dispose() }, [selection, props.loadAvailability])
  const state = useSyncExternalStore(selection.subscribe, selection.getSnapshot, selection.getSnapshot)
  return { ...state, selection, slots: selection.slots() }
}
