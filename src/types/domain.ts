export type AccountRole = 'student' | 'admin'
export type LessonState = 'completed' | 'current' | 'available' | 'locked' | 'checkpoint'
export type ProgressStatus = 'not_started' | 'in_progress' | 'completed'

export type BlockType =
  | 'text'
  | 'vocabulary'
  | 'grammar'
  | 'example'
  | 'multiple_choice'
  | 'fill_blank'
  | 'reorder_words'
  | 'true_false'
  | 'listening'
  | 'speaking'
  | 'reading'
  | 'writing'
  | 'checkpoint'

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export interface Profile {
  id: string
  username: string
  displayName: string
  role: AccountRole
  currentLevel: string
}

export interface LessonCatalogItem {
  id: number
  levelCode: 'A1' | 'A2'
  moduleTitle: string
  weekNumber: number | null
  title: string
  summary: string
  state: LessonState
  isCheckpoint: boolean
  progressPercent: number
}

export interface DashboardData {
  profile: Profile
  level: string
  progressPercent: number
  xp: number
  streak: number
  completedLessons: number
  totalPublishedLessons: number
  currentLesson: LessonCatalogItem | null
  journey: LessonCatalogItem[]
}

export interface ExerciseOption {
  id: number
  label: string
  value: string
}

export interface Exercise {
  id: number
  type: BlockType
  prompt: string
  instruction: string | null
  content: Record<string, JsonValue>
  options: ExerciseOption[]
  feedbackCorrect: string
  feedbackIncorrect: string
  demoAnswer?: JsonValue
}

export interface LessonBlock {
  id: number
  type: BlockType
  position: number
  title: string | null
  content: Record<string, JsonValue>
  exercise: Exercise | null
}

export interface LessonDetail {
  id: number
  levelCode: string
  lessonNumber: number
  title: string
  summary: string
  xpReward: number
  isCheckpoint: boolean
  blocks: LessonBlock[]
}

export interface ExerciseFeedback {
  correct: boolean
  message: string
  explanation: string
}

export interface LessonCompletion {
  correctAnswers: number
  totalExercises: number
  scorePercent: number
  xpAwarded: number
}

export interface AdminStudent {
  id: string
  displayName: string
  username: string
  level: string
  progressPercent: number
  accuracyPercent: number
  xp: number
  lastActivity: string | null
  completedLessons: number
}
