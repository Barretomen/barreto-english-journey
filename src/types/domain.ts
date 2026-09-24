export type AccountRole = 'student' | 'admin'
export type LessonState = 'completed' | 'current' | 'available' | 'locked' | 'checkpoint'
export type ProgressStatus = 'not_started' | 'in_progress' | 'completed'
export type AudioStatus = 'missing' | 'generating' | 'ready' | 'failed'
export type AudioVariant = 'normal' | 'slow'

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
  | 'overview'
  | 'can_do'
  | 'language_focus'
  | 'examples'
  | 'pronunciation'
  | 'practice'
  | 'production'
  | 'assessment'
  | 'visual'
  | 'language_analysis'
  | 'input_response'
  | 'guided_production'
  | 'contrast_explanation'
  | 'matching'
  | 'notice'
  | 'controlled_gap'
  | 'guided_output'
  | 'register_edit'
  | 'cross_text'
  | 'synthesis_microtask'

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
  externalId: string
  levelCode: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
  levelPosition: number
  moduleId: number
  moduleExternalId: string
  moduleTitle: string
  moduleNumber: number
  levelLessonNumber: number
  moduleLessonNumber: number
  globalOrder: number
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
  gradingMode?: 'automatic' | 'subjective'
  demoAnswer?: JsonValue
}

export interface LessonBlock {
  id: number
  type: BlockType
  position: number
  title: string | null
  content: Record<string, JsonValue>
  audio?: {
    normalPath: string | null
    slowPath: string | null
    status: AudioStatus
    required?: boolean
    role?: string | null
    transcript?: string | null
  }
  exercise: Exercise | null
}

export interface LessonDetail {
  id: number
  externalId: string
  levelCode: LessonCatalogItem['levelCode']
  levelLessonNumber: number
  moduleId: number
  moduleExternalId: string
  moduleTitle: string
  moduleNumber: number
  moduleLessonNumber: number
  globalOrder: number
  title: string
  summary: string
  xpReward: number
  isCheckpoint: boolean
  savedPosition?: number
  canDo?: JsonValue[]
  metadata?: Record<string, JsonValue>
  blocks: LessonBlock[]
}

export interface ExerciseFeedback {
  correct: boolean | null
  submitted: boolean
  message: string
  explanation: string
}

export interface LessonCompletion {
  correctAnswers: number
  totalExercises: number
  scorePercent: number
  xpAwarded: number
  nextLessonId?: number | null
  courseCompleted?: boolean
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

export interface AdminAudioLesson {
  lessonId: number
  levelCode: string
  moduleId: number
  moduleTitle: string
  levelLessonNumber: number
  moduleLessonNumber: number
  title: string
  readyCount: number
  missingCount: number
  generatingCount: number
  failedCount: number
  totalCount: number
}

export interface AudioGenerationSummary {
  ready: number
  failed: number
  skipped: number
}

export type AudioGenerationScope =
  | { blockId: number }
  | { lessonId: number }
  | { moduleId: number }
  | { levelCode: string }

export interface ReviewExercise {
  id: number
  externalId: string
  type: string
  position: number
  prompt: string
  instruction: string | null
  content: Record<string, JsonValue>
  gradingMode: 'automatic' | 'subjective'
}

export interface GrammarClinic {
  id: number
  externalId: string
  levelCode: string
  title: string
  focus: JsonValue
  why: string
  examples: JsonValue
  recycleIn: JsonValue
  visualExternalId: string | null
  exercises: ReviewExercise[]
}

export interface DueReview {
  id: number
  lessonId: number
  lessonTitle: string
  levelCode: string
  dueAt: string
  offsetDays: number
}

export interface ReviewResources {
  dueReviews: DueReview[]
  clinics: GrammarClinic[]
}
