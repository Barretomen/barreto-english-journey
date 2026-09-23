import { describe, expect, it } from 'vitest'
import { calculateLessonXP, calculateProgress, evaluateAnswer } from './logic'

describe('lesson logic', () => {
  it('normalizes answers and accepts alternatives', () => {
    expect(evaluateAnswer('  BYE ', ['bye', 'goodbye'])).toBe(true)
  })

  it('keeps progress inside zero and one hundred', () => {
    expect(calculateProgress(2, 4)).toBe(50)
    expect(calculateProgress(5, 4)).toBe(100)
    expect(calculateProgress(1, 0)).toBe(0)
  })

  it('adds perfect and checkpoint bonuses', () => {
    expect(calculateLessonXP(3, 3, 50, true)).toEqual({ correctAnswers: 3, totalExercises: 3, scorePercent: 100, xpAwarded: 120 })
  })
})
