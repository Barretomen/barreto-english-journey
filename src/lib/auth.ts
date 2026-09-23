const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/
const INTERNAL_AUTH_DOMAIN = 'login.barretoenglish.app'

export function normalizeUsername(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR')
}

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(normalizeUsername(value))
}

export function usernameToInternalEmail(username: string): string {
  const normalized = normalizeUsername(username)
  if (!isValidUsername(normalized)) {
    throw new Error('Use de 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado.')
  }
  return `${normalized}@${INTERNAL_AUTH_DOMAIN}`
}
