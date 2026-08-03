import AsyncStorage from '@react-native-async-storage/async-storage'

const MAX_HISTORY = 12

const storageKey = (userId: string) => `finnest:search-history:${userId}`

export async function getSearchHistory(userId: string): Promise<string[]> {
  if (!userId) return []
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : []
  } catch {
    return []
  }
}

export async function addSearchHistory(userId: string, term: string): Promise<string[]> {
  const cleaned = term.trim()
  if (!userId || !cleaned) return getSearchHistory(userId)

  const existing = await getSearchHistory(userId)
  const next = [
    cleaned,
    ...existing.filter((item) => item.toLowerCase() !== cleaned.toLowerCase()),
  ].slice(0, MAX_HISTORY)

  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next))
  return next
}

export async function removeSearchHistory(userId: string, term: string): Promise<string[]> {
  if (!userId) return []
  const existing = await getSearchHistory(userId)
  const next = existing.filter((item) => item.toLowerCase() !== term.toLowerCase())
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next))
  return next
}
