import { createHash } from 'node:crypto'
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

type JsonRecord = Record<string, unknown>
type LevelCode = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

interface AuditLesson {
  id: string
  level: LevelCode
  moduleId: string
  moduleNumber: number
  moduleLessonNumber: number
  levelLessonNumber: number
  globalOrder: number
  title: string
  goalPresent: boolean
  canDoCount: number
  visualExternalId: string
  visualPresent: boolean
  grammarCount: number
  vocabularyCount: number
  vocabularyTranslationCount: number
  pronunciationCount: number
  listeningPresent: boolean
  speakingPresent: boolean
  assessmentCount: number
  exerciseCount: number
  exercisePromptCount: number
  exerciseIds: string[]
  plannedBlockTypes: string[]
  emptyPlannedBlockCount: number
  audioSourceTexts: string[]
}

interface GoldenFixture {
  id: string
  title: string
  goalPresent: boolean
  visualPresent: boolean
  grammarCount: number
  vocabularyCount: number
  vocabularyTranslationCount: number
  pronunciationCount: number
  listeningPresent: boolean
  exerciseCount: number
  speakingPresent: boolean
  canDoCount: number
}

interface CurriculumAuditManifest {
  schemaVersion: 1
  courseVersion: string
  publicSourceSha256: string
  levelCounts: Record<LevelCode, number>
  grammarClinics: number
  visuals: number
  lessons: AuditLesson[]
  golden: GoldenFixture[]
}

const LEVELS: LevelCode[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const EXPECTED_LEVEL_COUNTS: Record<LevelCode, number> = { A1: 48, A2: 48, B1: 60, B2: 60, C1: 72, C2: 72 }
const GOLDEN_TITLES: Record<string, string> = {
  'A1-01': 'Hello and Goodbye',
  'A1-24': 'Checkpoint — My Neighbourhood',
  'A1-48': 'A1 Final Mission',
  'A2-01-01': "Yesterday's Story",
  'B1-01-01': 'Usually vs Right Now',
  'B2-01-01': 'See the Whole Timeline',
  'C1-01-01': 'Time as Perspective',
  'C2-01-01': 'Nearly the Same Is Not the Same',
}
const fixturePath = path.resolve('scripts', 'fixtures', 'curriculum-audit-manifest.json')

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function list<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function nonEmptyCount(value: unknown): number {
  return list(value).filter((item) => typeof item === 'string' ? Boolean(item.trim()) : Object.keys(record(item)).length > 0).length
}

function sourceAudioTexts(level: LevelCode, lesson: JsonRecord): string[] {
  if (level === 'A1') {
    return [
      ...list<string>(lesson.pronunciation),
      text(record(lesson.listening).script),
      text(lesson.speaking),
    ].filter(Boolean)
  }
  const focus = record(lesson.language_focus)
  const input = record(lesson.input)
  const production = record(lesson.production)
  return [
    ...list<string>(focus.pronunciation),
    text(input.listening_script),
    ...list<string>(lesson.examples),
    text(production.speaking),
  ].filter(Boolean)
}

function plannedBlocks(level: LevelCode, lesson: JsonRecord): Array<{ type: string; meaningful: boolean }> {
  if (level === 'A1') {
    const vocabulary = list(lesson.vocabulary)
    return [
      { type: 'overview', meaningful: Boolean(text(lesson.goal)) && nonEmptyCount(lesson.can_do) > 0 },
      { type: 'visual', meaningful: nonEmptyCount(lesson.visuals) > 0 },
      { type: 'grammar', meaningful: nonEmptyCount(lesson.grammar) > 0 },
      ...(vocabulary.length ? [{ type: 'vocabulary', meaningful: nonEmptyCount(vocabulary) > 0 }] : []),
      { type: 'pronunciation', meaningful: nonEmptyCount(lesson.pronunciation) > 0 },
      { type: 'listening', meaningful: Boolean(text(record(lesson.listening).script)) },
      ...list<JsonRecord>(lesson.exercises).map((exercise) => ({ type: text(exercise.type), meaningful: Boolean(text(exercise.id)) && Boolean(text(exercise.prompt)) })),
      { type: 'speaking', meaningful: Boolean(text(lesson.speaking)) },
      { type: 'assessment', meaningful: nonEmptyCount(lesson.can_do) > 0 },
    ]
  }

  const focus = record(lesson.language_focus)
  const input = record(lesson.input)
  const production = record(lesson.production)
  const assessment = record(lesson.assessment)
  const inputBlocks = ['anchor_text', 'secondary_text', 'extended_reading', 'supplementary_source']
    .filter((key) => text(input[key]))
    .map(() => ({ type: 'reading', meaningful: true }))
  return [
    { type: 'overview', meaningful: Boolean(text(lesson.goal)) && nonEmptyCount(lesson.can_do) > 0 },
    { type: 'visual', meaningful: nonEmptyCount(lesson.visuals) > 0 },
    { type: 'language_focus', meaningful: nonEmptyCount(focus.grammar) > 0 && nonEmptyCount(focus.functions) > 0 },
    ...inputBlocks,
    { type: 'listening', meaningful: Boolean(text(input.listening_script)) },
    { type: 'examples', meaningful: nonEmptyCount(lesson.examples) > 0 },
    { type: 'practice', meaningful: nonEmptyCount(lesson.practice) > 0 },
    ...list<JsonRecord>(lesson.implementation_exercises).map((exercise) => ({ type: text(exercise.type), meaningful: Boolean(text(exercise.id)) && Boolean(text(exercise.prompt)) })),
    { type: 'production', meaningful: Boolean(text(production.speaking) || text(production.writing)) },
    { type: 'assessment', meaningful: nonEmptyCount(assessment.success_criteria) > 0 },
  ]
}

async function buildManifest(packageRoot: string): Promise<CurriculumAuditManifest> {
  const masterFile = path.join(packageRoot, 'codex_handoff', 'course_master_public.json')
  const publicSource = await readFile(masterFile, 'utf8')
  const master = JSON.parse(publicSource) as { version: string; levels: JsonRecord[] }
  const clinics = JSON.parse(await readFile(path.join(packageRoot, 'codex_handoff', 'grammar_clinics.json'), 'utf8')) as unknown[]
  const visualNames = new Set((await readdir(path.join(packageRoot, 'visuals'))).filter((file) => file.toLowerCase().endsWith('.svg')).map((file) => path.parse(file).name.toLowerCase()))
  const levelCounts = Object.fromEntries(LEVELS.map((level) => [level, 0])) as Record<LevelCode, number>
  const lessons: AuditLesson[] = []
  let globalOrder = 0

  for (const rawLevel of master.levels) {
    const level = (text(rawLevel.cefr_level) || text(rawLevel.level)) as LevelCode
    assert(LEVELS.includes(level), `Unknown level: ${level || '(empty)'}.`)
    let levelLessonNumber = 0
    const modules = list<JsonRecord>(rawLevel.modules)
    for (let moduleIndex = 0; moduleIndex < modules.length; moduleIndex += 1) {
      const module = modules[moduleIndex]
      const moduleId = text(module.id)
      assert(moduleId, `${level}: module ${moduleIndex + 1} has no stable id.`)
      const moduleLessons = list<JsonRecord>(module.lessons)
      for (let moduleLessonIndex = 0; moduleLessonIndex < moduleLessons.length; moduleLessonIndex += 1) {
        const lesson = moduleLessons[moduleLessonIndex]
        globalOrder += 1
        levelLessonNumber += 1
        levelCounts[level] += 1
        const id = text(lesson.id)
        const focus = record(lesson.language_focus)
        const vocabulary = level === 'A1' ? list<JsonRecord>(lesson.vocabulary) : list<JsonRecord>(focus.lexis)
        const exercises = level === 'A1' ? list<JsonRecord>(lesson.exercises) : list<JsonRecord>(lesson.implementation_exercises)
        const visualExternalId = id
        const blocks = plannedBlocks(level, lesson)
        const assessmentCount = level === 'A1' ? nonEmptyCount(lesson.can_do) : nonEmptyCount(record(lesson.assessment).success_criteria)
        lessons.push({
          id,
          level,
          moduleId,
          moduleNumber: moduleIndex + 1,
          moduleLessonNumber: moduleLessonIndex + 1,
          levelLessonNumber,
          globalOrder,
          title: text(lesson.title),
          goalPresent: Boolean(text(lesson.goal)),
          canDoCount: nonEmptyCount(lesson.can_do),
          visualExternalId,
          visualPresent: Boolean(visualExternalId) && visualNames.has(visualExternalId.toLowerCase()),
          grammarCount: level === 'A1' ? nonEmptyCount(lesson.grammar) : nonEmptyCount(focus.grammar),
          vocabularyCount: nonEmptyCount(vocabulary),
          vocabularyTranslationCount: vocabulary.filter((item) => Boolean(text(item.translation) || text(item.gloss))).length,
          pronunciationCount: level === 'A1' ? nonEmptyCount(lesson.pronunciation) : nonEmptyCount(focus.pronunciation),
          listeningPresent: level === 'A1' ? Boolean(text(record(lesson.listening).script)) : Boolean(text(record(lesson.input).listening_script)),
          speakingPresent: level === 'A1' ? Boolean(text(lesson.speaking)) : Boolean(text(record(lesson.production).speaking)),
          assessmentCount,
          exerciseCount: exercises.length,
          exercisePromptCount: exercises.filter((exercise) => Boolean(text(exercise.prompt))).length,
          exerciseIds: exercises.map((exercise) => text(exercise.id)),
          plannedBlockTypes: blocks.map((block) => block.type),
          emptyPlannedBlockCount: blocks.filter((block) => !block.meaningful).length,
          audioSourceTexts: sourceAudioTexts(level, lesson),
        })
      }
    }
  }

  const golden = Object.entries(GOLDEN_TITLES).map(([id, expectedTitle]) => {
    const lesson = lessons.find((item) => item.id === id)
    assert(lesson, `Golden lesson ${id} is missing.`)
    assert(lesson.title === expectedTitle, `${id}: expected title “${expectedTitle}”, received “${lesson.title}”.`)
    return {
      id: lesson.id,
      title: lesson.title,
      goalPresent: lesson.goalPresent,
      visualPresent: lesson.visualPresent,
      grammarCount: lesson.grammarCount,
      vocabularyCount: lesson.vocabularyCount,
      vocabularyTranslationCount: lesson.vocabularyTranslationCount,
      pronunciationCount: lesson.pronunciationCount,
      listeningPresent: lesson.listeningPresent,
      exerciseCount: lesson.exerciseCount,
      speakingPresent: lesson.speakingPresent,
      canDoCount: lesson.canDoCount,
    }
  })

  return {
    schemaVersion: 1,
    courseVersion: master.version,
    publicSourceSha256: createHash('sha256').update(publicSource).digest('hex'),
    levelCounts,
    grammarClinics: clinics.length,
    visuals: visualNames.size,
    lessons,
    golden,
  }
}

function validateManifest(manifest: CurriculumAuditManifest): void {
  assert(manifest.schemaVersion === 1, 'Unsupported audit fixture schema.')
  assert(manifest.lessons.length === 360, `Expected 360 lessons, received ${manifest.lessons.length}.`)
  assert(manifest.grammarClinics === 41, `Expected 41 grammar clinics, received ${manifest.grammarClinics}.`)
  assert(manifest.visuals === 401, `Expected 401 visuals, received ${manifest.visuals}.`)
  for (const level of LEVELS) {
    assert(manifest.levelCounts[level] === EXPECTED_LEVEL_COUNTS[level], `${level}: expected ${EXPECTED_LEVEL_COUNTS[level]}, received ${manifest.levelCounts[level]}.`)
  }

  const lessonIds = new Set<string>()
  const exerciseIds = new Set<string>()
  for (let index = 0; index < manifest.lessons.length; index += 1) {
    const lesson = manifest.lessons[index]
    assert(Boolean(lesson.id) && !lessonIds.has(lesson.id), `${lesson.id || `lesson ${index + 1}`}: missing or duplicate stable lesson id.`)
    lessonIds.add(lesson.id)
    assert(lesson.globalOrder === index + 1, `${lesson.id}: invalid global order.`)
    assert(lesson.levelLessonNumber > 0 && lesson.moduleLessonNumber > 0 && lesson.moduleNumber > 0, `${lesson.id}: invalid learner-facing numbering.`)
    assert(Boolean(lesson.title) && lesson.goalPresent && lesson.canDoCount > 0, `${lesson.id}: missing title, goal or can-do content.`)
    assert(lesson.visualPresent, `${lesson.id}: visual reference does not resolve to an SVG.`)
    assert(lesson.grammarCount > 0, `${lesson.id}: grammar/language focus is empty.`)
    assert(lesson.pronunciationCount > 0, `${lesson.id}: pronunciation content is empty.`)
    assert(lesson.listeningPresent, `${lesson.id}: listening content is empty.`)
    assert(lesson.speakingPresent, `${lesson.id}: speaking/production content is empty.`)
    assert(lesson.assessmentCount > 0, `${lesson.id}: assessment/can-do content is empty.`)
    assert(lesson.exerciseCount > 0 && lesson.exercisePromptCount === lesson.exerciseCount, `${lesson.id}: exercises or prompts are empty.`)
    assert(lesson.emptyPlannedBlockCount === 0, `${lesson.id}: importer would create an empty block.`)
    assert(lesson.audioSourceTexts.length > 0 && lesson.audioSourceTexts.every(Boolean), `${lesson.id}: required audio has no usable source text.`)
    for (const exerciseId of lesson.exerciseIds) {
      assert(Boolean(exerciseId) && !exerciseIds.has(exerciseId), `${lesson.id}: missing or duplicate stable exercise id ${exerciseId || '(empty)'}.`)
      exerciseIds.add(exerciseId)
    }
  }

  assert(exerciseIds.size === 1752, `Expected 1752 stable exercises, received ${exerciseIds.size}.`)
  for (const golden of manifest.golden) {
    assert(golden.goalPresent && golden.visualPresent && golden.grammarCount > 0 && golden.pronunciationCount > 0 && golden.listeningPresent && golden.exerciseCount > 0 && golden.speakingPresent && golden.canDoCount > 0, `${golden.id}: golden semantic fixture is incomplete.`)
  }
  const first = manifest.golden.find((lesson) => lesson.id === 'A1-01')
  assert(first?.title === 'Hello and Goodbye', 'A1-01 golden title changed.')
  assert(first.vocabularyCount === 8 && first.vocabularyTranslationCount === 8, 'A1-01 vocabulary or Portuguese meanings are incomplete.')
}

async function exists(target: string): Promise<boolean> {
  try { await access(target); return true } catch { return false }
}

async function main() {
  const writeFixture = process.argv.includes('--write-fixture')
  const packageArgument = process.argv.slice(2).find((argument) => argument !== '--write-fixture')
  const packageRoot = path.resolve(packageArgument ?? process.env.CURRICULUM_PACKAGE_PATH ?? '')
  const hasSource = Boolean(packageArgument || process.env.CURRICULUM_PACKAGE_PATH)
    && await exists(path.join(packageRoot, 'codex_handoff', 'course_master_public.json'))
  const manifest = hasSource
    ? await buildManifest(packageRoot)
    : JSON.parse(await readFile(fixturePath, 'utf8')) as CurriculumAuditManifest

  validateManifest(manifest)
  if (writeFixture) {
    assert(hasSource, '--write-fixture requires an extracted curriculum package path.')
    await mkdir(path.dirname(fixturePath), { recursive: true })
    await writeFile(fixturePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  }
  console.log('Curriculum content audit passed.', {
    courseVersion: manifest.courseVersion,
    lessons: manifest.lessons.length,
    levelCounts: manifest.levelCounts,
    grammarClinics: manifest.grammarClinics,
    visuals: manifest.visuals,
    exercises: manifest.lessons.reduce((total, lesson) => total + lesson.exerciseCount, 0),
    goldenFixtures: manifest.golden.map((lesson) => lesson.id),
    source: hasSource ? 'extracted package' : 'committed sanitized fixture',
  })
}

main().catch((reason) => {
  console.error(reason instanceof Error ? reason.message : reason)
  process.exitCode = 1
})
