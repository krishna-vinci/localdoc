function parseBackendTimestamp(value: string): Date {
  const normalizedValue = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`
  return new Date(normalizedValue)
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
