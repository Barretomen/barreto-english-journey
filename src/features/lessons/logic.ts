import type { JsonValue, LessonCatalogItem, LessonCompletion } from '../../types/domain'

function normalized(value: JsonValue): string {
  if (Array.isArray(value)) return value.map(normalized).join(' ').trim().toLocaleLowerCase()
  if (value === null) return ''
  if (typeof value === 'object') return JSON.stringify(value).trim().toLocaleLowerCase()
  return String(value).trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

export function evaluateAnswer(answer: JsonValue, expected: JsonValue): boolean {
  if (Array.isArray(expected)) {
    if (Array.isArray(answer)) return normalized(answer) === normalized(expected)
    return expected.some((candidate) => normalized(candidate) === normalized(answer))
  }
  return normalized(answer) === normalized(expected)
}

export function calculateProgress(completed: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((completed / total) * 100)))
}

export function calculateLessonXP(
  correctAnswers: number,
  totalExercises: number,
  baseReward = 50,
  isCheckpoint = false
): LessonCompletion {
  const safeTotal = Math.max(0, totalExercises)
  const safeCorrect = Math.min(Math.max(0, correctAnswers), safeTotal)
  const scorePercent = calculateProgress(safeCorrect, safeTotal)
  const perfectBonus = safeTotal > 0 && safeCorrect === safeTotal ? 20 : 0
  const checkpointBonus = isCheckpoint ? 50 : 0
  return {
    correctAnswers: safeCorrect,
    totalExercises: safeTotal,
    scorePercent,
    xpAwarded: baseReward + perfectBonus + checkpointBonus
  }
}

export function canOpenLesson(item: LessonCatalogItem): boolean {
  return item.state !== 'locked'
}
