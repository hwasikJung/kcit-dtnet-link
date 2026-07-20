export interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error'
}

let seq = 0

export function useToast() {
  const toasts = useState<ToastItem[]>('toasts', () => [])

  function toast(message: string, type: ToastItem['type'] = 'success') {
    const id = ++seq
    toasts.value.push({ id, message, type })
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, 2500)
  }

  return { toasts, toast }
}
