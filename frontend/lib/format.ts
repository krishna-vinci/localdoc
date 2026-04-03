function parseBackendTimestamp(value: string): Date {
  const normalizedValue = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`
  return new Date(normalizedValue)
}

export function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = parseBackendTimestamp(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatTimestamp(value: string): string {
  const date = parseBackendTimestamp(value)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  const hour = String(date.getUTCHours()).padStart(2, "0")
  const minute = String(date.getUTCMinutes()).padStart(2, "0")
  const second = String(date.getUTCSeconds()).padStart(2, "0")
  return `${day}/${month}/${year}, ${hour}:${minute}:${second} UTC`
}

export function formatDate(value: string): string {
  const date = parseBackendTimestamp(value)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${day}/${month}/${year}`
}

export function formatRelativeTime(value: string | null | undefined): string {
  const date = parseTimestamp(value)
  if (!date) return "Unknown"

  const diff = date.getTime() - Date.now()
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
  const minutes = Math.round(diff / 60_000)

  if (Math.abs(minutes) < 60) {
    return formatter.format(minutes, "minute")
  }

  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) {
    return formatter.format(hours, "hour")
  }

  const days = Math.round(hours / 24)
  if (Math.abs(days) < 30) {
    return formatter.format(days, "day")
  }

  const months = Math.round(days / 30)
  if (Math.abs(months) < 12) {
    return formatter.format(months, "month")
  }

  const years = Math.round(months / 12)
  return formatter.format(years, "year")
}
