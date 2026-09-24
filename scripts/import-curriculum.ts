import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { requireTtsText } from '../supabase/functions/_shared/ttsText'

type JsonRecord = Record<string, unknown>
type CurriculumLesson = JsonRecord & { id: string; title: string }
type CurriculumModule = JsonRecord & { id: string; title: string; lessons: CurriculumLesson[] }
type CurriculumLevel = JsonRecord & { modules: CurriculumModule[] }

interface BlockInput {
  external_id: string
  block_type: string
  position: number
  title: string | null
  content: JsonRecord
  audio_required: boolean
  audio_role: string | null
  transcript: string | null
  metadata: JsonRecord
  audio_segments?: AudioSegmentInput[]
  exercise?: ExerciseInput
}

interface AudioSegmentInput {
  external_id: string
  item_key: string
  segment_kind: 'term' | 'example' | 'pronunciation' | 'listening' | 'speaking'
  position: number
  speech_text: string
}

interface ExerciseInput {
  external_id: string
  exercise_type: string
  prompt: string
  instruction: string | null
  content: JsonRecord
  grading_mode: 'automatic' | 'subjective'
  options?: Array<{ label: string; value: string; position: number }>
}

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
const EXPECTED_LESSONS: Record<string, number> = { A1: 48, A2: 48, B1: 60, B2: 60, C1: 72, C2: 72 }
const AUTOMATIC_TYPES = new Set(['multiple_choice', 'fill_blank', 'reorder_words', 'true_false'])

const A1_01_PT = {
  canDo: [
    'Consigo cumprimentar alguém.',
    'Consigo escolher uma saudação de acordo com o horário.',
    'Consigo me despedir com educação.',
  ],
  grammarExplanation: 'Em inglês, estas saudações são expressões fixas. Use “Good morning” pela manhã, “Good afternoon” à tarde e “Good evening” ao encontrar alguém à noite. “Good night” normalmente é uma despedida.',
  grammarExamples: ['Good morning, Ana.', 'Good evening. Welcome!', 'Good night. See you tomorrow.'],
  pronunciation: [
    'Perceba a sílaba forte em GOOD MORning e good EVEning.',
    'Repita as saudações curtas sem acrescentar uma vogal no final.',
  ],
  listeningTask: 'Quem diz “Good morning” primeiro?',
  listeningTranslation: '— Bom dia! Eu sou Sarah. Prazer em conhecer você. — Oi, Sarah! Eu sou Daniel. Prazer em conhecer você também. — Tchau, Daniel. — Tchau!',
  speaking: 'Diga três saudações em voz alta: uma para a manhã, uma para a tarde e uma para a noite.',
  exampleTranslations: [
    'Olá! Prazer em conhecer você.', 'Oi, Ana!', 'Bom dia, Sr. Brown.',
    'Boa tarde, pessoal.', 'Boa noite. Bem-vindo(a)!', 'Tchau! Vejo você amanhã.',
    'Boa noite. Durma bem.', 'Obrigado(a) pela ajuda.',
  ],
  exercises: {
    'A1-01-E01': { prompt_translation: 'São 9h. O que você diz?', option_translations: { morning: 'Bom dia', evening: 'Boa noite ao encontrar alguém', night: 'Boa noite ao se despedir' } },
    'A1-01-E02': { prompt_translation: 'Você está indo embora no fim da noite. O que soa natural?', option_translations: { good_night: 'Boa noite ao se despedir', afternoon: 'Boa tarde', hello: 'Olá' } },
    'A1-01-E03': { prompt_translation: '_____! Prazer em conhecer você.', hint_translation: 'Uma saudação básica.' },
    'A1-01-E04': { prompt_translation: '“Good evening” é usado quando você encontra alguém à noite.' },
  } as Record<string, JsonRecord>,
} as const

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}. Set it only in the local shell used for this import.`)
  return value
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T
}

async function countRows(client: SupabaseClient, table: string, filters?: (query: any) => any): Promise<number> {
  let query: any = client.from(table).select('*', { count: 'exact', head: true })
  if (filters) query = filters(query)
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}

function addBlock(blocks: BlockInput[], lessonId: string, block: Omit<BlockInput, 'external_id' | 'position'>, key: string, position?: number) {
  blocks.push({ ...block, external_id: `${lessonId}-B-${slug(key)}`, position: position ?? blocks.length + 1 })
}

function exerciseBlock(lessonId: string, exercise: JsonRecord): Omit<BlockInput, 'external_id' | 'position'> {
  const externalId = text(exercise.id)
  if (!externalId) throw new Error(`Exercise without stable id in ${lessonId}.`)
  const type = text(exercise.type) || 'guided_production'
  const prompt = text(exercise.prompt)
  const instruction = text(exercise.instruction) || null
  const rawOptions = asArray<JsonRecord>(exercise.options)
  const content = { ...exercise }
  delete content.id
  delete content.type
  delete content.prompt
  delete content.instruction
  delete content.options
  return {
    block_type: type,
    title: null,
    content,
    audio_required: false,
    audio_role: null,
    transcript: null,
    metadata: {},
    exercise: {
      external_id: externalId,
      exercise_type: type,
      prompt,
      instruction,
      content,
      grading_mode: AUTOMATIC_TYPES.has(type) ? 'automatic' : 'subjective',
      options: rawOptions.map((option, index) => ({
        label: text(option.label), value: text(option.value), position: index + 1,
      })),
    },
  }
}

function blocksForA1(lesson: CurriculumLesson, visualExternalId: string): BlockInput[] {
  const blocks: BlockInput[] = []
  const isGolden = lesson.id === 'A1-01'
  const vocabulary = asArray<JsonRecord>(lesson.vocabulary).map((item, index) => isGolden
    ? { ...item, example_translation: A1_01_PT.exampleTranslations[index] ?? '' }
    : item)
  addBlock(blocks, lesson.id, {
    block_type: 'overview', title: 'Objetivo da lição',
    content: { body: lesson.goal, can_do: lesson.can_do, ...(isGolden ? { can_do_pt: A1_01_PT.canDo } : {}) },
    audio_required: false, audio_role: null, transcript: null, metadata: {},
  }, 'overview', 1)
  addBlock(blocks, lesson.id, {
    block_type: 'visual', title: 'Apoio visual',
    content: { visual_external_id: visualExternalId, source_visuals: lesson.visuals },
    audio_required: false, audio_role: null, transcript: null, metadata: {},
  }, 'visual', 2)
  addBlock(blocks, lesson.id, {
    block_type: 'grammar', title: 'Gramática', content: {
      items: lesson.grammar,
      ...(isGolden ? { explanation: A1_01_PT.grammarExplanation, examples: A1_01_PT.grammarExamples } : {}),
    },
    audio_required: false, audio_role: null, transcript: null, metadata: {},
  }, 'grammar', isGolden ? 5 : 3)
  if (vocabulary.length) addBlock(blocks, lesson.id, {
    block_type: 'vocabulary', title: 'Vocabulário', content: { items: vocabulary },
    audio_required: false, audio_role: null, transcript: null, metadata: {},
    audio_segments: vocabulary.flatMap((item, index) => {
      const term = text(item.term)
      const example = text(item.example)
      return [
        ...(term ? [{ external_id: `${lesson.id}-AUDIO-VOCAB-${index + 1}-TERM`, item_key: `vocabulary-${index + 1}`, segment_kind: 'term' as const, position: index * 2 + 1, speech_text: term }] : []),
        ...(example ? [{ external_id: `${lesson.id}-AUDIO-VOCAB-${index + 1}-EXAMPLE`, item_key: `vocabulary-${index + 1}`, segment_kind: 'example' as const, position: index * 2 + 2, speech_text: example }] : []),
      ]
    }),
  }, 'vocabulary', isGolden ? 3 : 4)
  const pronunciation = asArray<string>(lesson.pronunciation)
  addBlock(blocks, lesson.id, {
    block_type: 'pronunciation', title: 'Pronúncia', content: { items: pronunciation, ...(isGolden ? { items_pt: A1_01_PT.pronunciation } : {}) },
    audio_required: true, audio_role: 'pronunciation', transcript: pronunciation.join(' '), metadata: {},
    audio_segments: pronunciation.map((item, index) => ({
      external_id: `${lesson.id}-AUDIO-PRON-${index + 1}`, item_key: `pronunciation-${index + 1}`,
      segment_kind: 'pronunciation', position: index + 1, speech_text: item,
    })),
  }, 'pronunciation', isGolden ? 7 : 5)
  const listening = asRecord(lesson.listening)
  addBlock(blocks, lesson.id, {
    block_type: 'listening', title: 'Listening', content: {
      ...listening,
      ...(isGolden ? { task_translation: A1_01_PT.listeningTask, script_translation: A1_01_PT.listeningTranslation } : {}),
    },
    audio_required: true, audio_role: 'listening', transcript: text(listening.script), metadata: {},
  }, 'listening', isGolden ? 9 : 6)
  const exercises = asArray<JsonRecord>(lesson.exercises)
  for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex += 1) {
    const sourceExercise = exercises[exerciseIndex]
    const exercise = isGolden
      ? { ...sourceExercise, ...(A1_01_PT.exercises[text(sourceExercise.id)] ?? {}) }
      : sourceExercise
    const goldenPositions = [4, 6, 8, 10]
    addBlock(blocks, lesson.id, exerciseBlock(lesson.id, exercise), `exercise-${text(exercise.id)}`, isGolden ? goldenPositions[exerciseIndex] : 7 + exerciseIndex)
  }
  addBlock(blocks, lesson.id, {
    block_type: 'speaking', title: 'Speaking', content: { prompt: lesson.speaking, ...(isGolden ? { prompt_translation: A1_01_PT.speaking } : {}) },
    audio_required: true, audio_role: 'speaking_prompt', transcript: text(lesson.speaking), metadata: {},
  }, 'speaking', 7 + exercises.length)
  addBlock(blocks, lesson.id, {
    block_type: 'assessment', title: 'Eu consigo', content: { can_do: lesson.can_do, ...(isGolden ? { can_do_pt: A1_01_PT.canDo } : {}) },
    audio_required: false, audio_role: null, transcript: null, metadata: {},
  }, 'assessment', 8 + exercises.length)
  return blocks
}

function blocksForAdvanced(lesson: CurriculumLesson, visualExternalId: string): BlockInput[] {
  const blocks: BlockInput[] = []
  addBlock(blocks, lesson.id, {
    block_type: 'overview', title: 'Lesson goal',
    content: { body: lesson.goal, can_do: lesson.can_do, role: lesson.role, recycles: lesson.recycles },
    audio_required: false, audio_role: null, transcript: null, metadata: {},
  }, 'overview')
  addBlock(blocks, lesson.id, {
    block_type: 'visual', title: 'Visual guide',
    content: { visual_external_id: visualExternalId, source_visuals: lesson.visuals, visual_brief: lesson.visual_brief },
    audio_required: false, audio_role: null, transcript: null, metadata: {},
  }, 'visual')
  addBlock(blocks, lesson.id, {
    block_type: 'language_focus', title: 'Language focus', content: asRecord(lesson.language_focus),
    audio_required: false, audio_role: null, transcript: null, metadata: {},
  }, 'language-focus')
  const input = asRecord(lesson.input)
  for (const [key, title] of [['anchor_text', 'Core input'], ['secondary_text', 'Second input'], ['extended_reading', 'Extended reading'], ['supplementary_source', 'Supplementary source']] as const) {
    if (text(input[key])) addBlock(blocks, lesson.id, {
      block_type: 'reading', title, content: { body: input[key], source: key, recommended_input_length_words: input.recommended_input_length_words },
      audio_required: false, audio_role: null, transcript: null, metadata: {},
    }, key)
  }
  if (text(input.listening_script)) addBlock(blocks, lesson.id, {
    block_type: 'listening', title: 'Listening', content: { script: input.listening_script },
    audio_required: true, audio_role: 'listening', transcript: text(input.listening_script), metadata: {},
  }, 'listening')
  const examples = asArray<string>(lesson.examples)
  addBlock(blocks, lesson.id, {
    block_type: 'examples', title: 'Examples', content: { items: examples },
    audio_required: true, audio_role: 'examples', transcript: examples.join(' '), metadata: {},
  }, 'examples')
  addBlock(blocks, lesson.id, {
    block_type: 'practice', title: 'Practice sequence', content: { items: lesson.practice },
    audio_required: false, audio_role: null, transcript: null, metadata: {},
  }, 'practice')
  for (const exercise of asArray<JsonRecord>(lesson.implementation_exercises)) {
    addBlock(blocks, lesson.id, exerciseBlock(lesson.id, exercise), `exercise-${text(exercise.id)}`)
  }
  addBlock(blocks, lesson.id, {
    block_type: 'production', title: 'Production', content: asRecord(lesson.production),
    audio_required: false, audio_role: null, transcript: null, metadata: {},
  }, 'production')
  addBlock(blocks, lesson.id, {
    block_type: 'assessment', title: 'Success criteria', content: asRecord(lesson.assessment),
    audio_required: false, audio_role: null, transcript: null, metadata: {},
  }, 'assessment')
  return blocks
}

async function upsertLessonContent(client: SupabaseClient, lessonDbId: number, lessonExternalId: string, blocks: BlockInput[]) {
  const blockRows = blocks.map((block) => ({
    external_id: block.external_id, block_type: block.block_type, position: block.position,
    title: block.title, content: block.content, audio_required: block.audio_required,
    audio_role: block.audio_role, transcript: block.transcript, metadata: block.metadata,
    lesson_id: lessonDbId,
  }))
  const { data: savedBlocks, error: blockError } = await client
    .from('lesson_blocks').upsert(blockRows, { onConflict: 'external_id' }).select('id, external_id')
  if (blockError) throw blockError
  const blockIds = new Map((savedBlocks ?? []).map((row) => [row.external_id as string, Number(row.id)]))

  const desiredBlockIds = new Set(blocks.map((block) => block.external_id))
  const { data: existingBlocks, error: existingBlocksError } = await client
    .from('lesson_blocks')
    .select('id, external_id, exercises(id)')
    .eq('lesson_id', lessonDbId)
  if (existingBlocksError) throw existingBlocksError
  const staleBlocks = (existingBlocks ?? []).filter((block) =>
    String(block.external_id ?? '').startsWith(`${lessonExternalId}-B-`)
    && !desiredBlockIds.has(String(block.external_id)),
  )
  const unsafeStaleBlock = staleBlocks.find((block) => asArray(block.exercises).length > 0)
  if (unsafeStaleBlock) {
    throw new Error(`Refusing to delete stale exercise block with history: ${unsafeStaleBlock.external_id}`)
  }
  if (staleBlocks.length) {
    const { error: staleDeleteError } = await client.from('lesson_blocks').delete().in('id', staleBlocks.map((block) => block.id))
    if (staleDeleteError) throw staleDeleteError
  }

  for (const block of blocks) {
    const blockId = blockIds.get(block.external_id)
    if (!blockId) throw new Error(`Missing block id after upsert: ${block.external_id}`)
    const segments = block.audio_segments ?? []
    if (segments.length) {
      const { error: segmentError } = await client.from('lesson_audio_segments').upsert(
        segments.map((segment) => ({
          ...segment,
          lesson_block_id: blockId,
          normalized_text: requireTtsText(segment.speech_text),
          metadata: {},
        })),
        { onConflict: 'external_id' },
      )
      if (segmentError) throw segmentError
    }
  }

  for (const block of blocks) {
    if (!block.exercise) continue
    const blockId = blockIds.get(block.external_id)
    if (!blockId) throw new Error(`Missing block id after upsert: ${block.external_id}`)
    const exercise = block.exercise
    const { data: savedExercise, error: exerciseError } = await client.from('exercises').upsert({
      lesson_block_id: blockId,
      external_id: exercise.external_id,
      exercise_type: exercise.exercise_type,
      prompt: exercise.prompt,
      instruction: exercise.instruction,
      content: exercise.content,
      grading_mode: exercise.grading_mode,
      feedback_correct: 'Muito bem. Continue avançando.',
      feedback_incorrect: 'Revise o conteúdo desta etapa e tente novamente.',
      metadata: {},
    }, { onConflict: 'external_id' }).select('id').single()
    if (exerciseError) throw exerciseError
    const options = exercise.options ?? []
    if (options.length) {
      const { error: optionError } = await client.from('exercise_options').upsert(
        options.map((option) => ({ ...option, exercise_id: savedExercise.id })),
        { onConflict: 'exercise_id,position' },
      )
      if (optionError) throw optionError
    }
  }
}

async function main() {
  const packageRoot = path.resolve(process.argv[2] ?? '')
  if (!process.argv[2]) throw new Error('Usage: npm run curriculum:import -- <extracted-package-path>')
  const url = requiredEnv('SUPABASE_URL')
  const serviceRole = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (/^VITE_/i.test('SUPABASE_SERVICE_ROLE_KEY')) throw new Error('Service role must never use a VITE_ variable.')
  const client = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })

  const qa = await readJson<JsonRecord>(path.join(packageRoot, 'audit', 'qa_report.json'))
  if (asArray(qa.errors).length) throw new Error(`Package QA contains ${asArray(qa.errors).length} error(s).`)
  const master = await readJson<{ version: string; levels: CurriculumLevel[] }>(path.join(packageRoot, 'codex_handoff', 'course_master_public.json'))
  const clinics = await readJson<JsonRecord[]>(path.join(packageRoot, 'codex_handoff', 'grammar_clinics.json'))
  const rubrics = await readJson<JsonRecord>(path.join(packageRoot, 'codex_handoff', 'assessment_rubrics.json'))
  const answerKeys = await readJson<Record<string, JsonRecord>>(path.join(packageRoot, 'private_answers', 'answer_key.json'))
  const visualDir = path.join(packageRoot, 'visuals')
  const visualFiles = (await readdir(visualDir)).filter((file) => file.toLowerCase().endsWith('.svg')).sort()

  const levelMap = new Map(master.levels.map((level) => [text(level.cefr_level) || text(level.level), level]))
  for (const code of LEVELS) {
    const count = levelMap.get(code)?.modules.flatMap((module) => module.lessons).length ?? 0
    if (count !== EXPECTED_LESSONS[code]) throw new Error(`${code}: expected ${EXPECTED_LESSONS[code]} lessons, found ${count}.`)
  }
  const allLessons = master.levels.flatMap((level) => level.modules.flatMap((module) => module.lessons))
  if (allLessons.length !== 360 || clinics.length !== 41 || visualFiles.length !== 401 || Object.keys(answerKeys).length !== 1875) {
    throw new Error('Package counts differ from the validated handoff (360 lessons, 41 clinics, 401 visuals, 1875 private keys).')
  }

  const before = {
    progress: await countRows(client, 'lesson_progress'),
    attempts: await countRows(client, 'exercise_attempts'),
    xp: await countRows(client, 'xp_events'),
  }

  let moduleOrder = 0
  let globalOrder = 0
  const lessonIds = new Map<string, number>()
  const lessonVisuals = new Map<string, { externalId: string; alt: string }>()
  const fileByStem = new Map(visualFiles.map((file) => [path.parse(file).name.toLowerCase(), file]))

  for (const code of LEVELS) {
    const level = levelMap.get(code)!
    let levelLessonNumber = 0
    for (let moduleIndex = 0; moduleIndex < level.modules.length; moduleIndex += 1) {
      const module = level.modules[moduleIndex]
      moduleOrder += 1
      const { data: savedModule, error: moduleError } = await client.from('modules').upsert({
        external_id: module.id,
        level_code: code,
        title: module.title,
        theme: text(module.theme) || null,
        description: text(module.practice_prompt) || null,
        position: 100 + moduleOrder,
        level_module_number: moduleIndex + 1,
        metadata: Object.fromEntries(Object.entries(module).filter(([key]) => !['lessons', 'id', 'title', 'theme'].includes(key))),
      }, { onConflict: 'external_id' }).select('id').single()
      if (moduleError) throw moduleError

      for (let moduleLessonIndex = 0; moduleLessonIndex < module.lessons.length; moduleLessonIndex += 1) {
        const lesson = module.lessons[moduleLessonIndex]
        globalOrder += 1
        levelLessonNumber += 1
        const assessment = asRecord(lesson.assessment)
        const { data: savedLesson, error: lessonError } = await client.from('lessons').upsert({
          external_id: lesson.id,
          module_id: savedModule.id,
          lesson_number: 1000 + globalOrder,
          level_lesson_number: levelLessonNumber,
          module_lesson_number: moduleLessonIndex + 1,
          global_order: globalOrder,
          position: 1000 + globalOrder,
          title: lesson.title,
          summary: text(lesson.goal),
          xp_reward: assessment.checkpoint ? 100 : 50,
          is_checkpoint: Boolean(assessment.checkpoint),
          lesson_role: text(lesson.role) || null,
          can_do: asArray(lesson.can_do),
          metadata: { goal: lesson.goal, recycles: lesson.recycles },
          course_version: master.version,
          is_legacy: false,
          published: true,
        }, { onConflict: 'external_id' }).select('id').single()
        if (lessonError) throw lessonError
        lessonIds.set(lesson.id, Number(savedLesson.id))

        const visualFile = fileByStem.get(lesson.id.toLowerCase())
        if (!visualFile) throw new Error(`No lesson SVG found for ${lesson.id}.`)
        const visualExternalId = path.parse(visualFile).name
        const brief = asRecord(lesson.visual_brief)
        lessonVisuals.set(lesson.id, {
          externalId: visualExternalId,
          alt: text(brief.purpose) || `Apoio visual da lição ${lesson.title}`,
        })
        const blocks = code === 'A1'
          ? blocksForA1(lesson, visualExternalId)
          : blocksForAdvanced(lesson, visualExternalId)
        await upsertLessonContent(client, Number(savedLesson.id), lesson.id, blocks)
      }
    }
    console.log(`Imported ${code}: ${levelLessonNumber} lessons.`)
  }

  for (const [code, rubric] of Object.entries(rubrics)) {
    const { error } = await client.from('assessment_rubrics').upsert({ level_code: code, rubric }, { onConflict: 'level_code' })
    if (error) throw error
  }

  for (let index = 0; index < clinics.length; index += 1) {
    const clinic = clinics[index]
    const externalId = text(clinic.id)
    const { data: savedClinic, error: clinicError } = await client.from('grammar_clinics').upsert({
      external_id: externalId,
      level_code: text(clinic.level),
      title: text(clinic.title),
      focus: clinic.focus,
      why_text: text(clinic.why),
      examples: clinic.examples,
      recycle_in: clinic.recycle_in,
      visual_external_id: path.parse(text(clinic.visual)).name,
      position: index + 1,
      published: true,
      metadata: {},
    }, { onConflict: 'external_id' }).select('id').single()
    if (clinicError) throw clinicError
    const clinicExercises = asArray<JsonRecord>(clinic.exercises)
    for (let exerciseIndex = 0; exerciseIndex < clinicExercises.length; exerciseIndex += 1) {
      const exercise = clinicExercises[exerciseIndex]
      const content = { ...exercise }
      delete content.id
      delete content.type
      delete content.prompt
      delete content.instruction
      const type = text(exercise.type)
      const { error } = await client.from('grammar_clinic_exercises').upsert({
        clinic_id: savedClinic.id,
        external_id: text(exercise.id),
        exercise_type: type,
        position: exerciseIndex + 1,
        prompt: text(exercise.prompt),
        instruction: text(exercise.instruction) || null,
        content,
        grading_mode: AUTOMATIC_TYPES.has(type) ? 'automatic' : 'subjective',
      }, { onConflict: 'external_id' })
      if (error) throw error
    }
  }

  for (const file of visualFiles) {
    const stem = path.parse(file).name
    const lessonEntry = [...lessonVisuals.entries()].find(([, visual]) => visual.externalId.toLowerCase() === stem.toLowerCase())
    const clinic = clinics.find((item) => path.parse(text(item.visual)).name.toLowerCase() === stem.toLowerCase())
    if (!lessonEntry && !clinic) throw new Error(`Orphan visual in package: ${file}`)
    const storagePath = `curriculum/${stem}.svg`
    const bytes = await readFile(path.join(visualDir, file))
    const { error: uploadError } = await client.storage.from('lesson-visuals').upload(storagePath, bytes, {
      contentType: 'image/svg+xml', cacheControl: '3600', upsert: true,
    })
    if (uploadError) throw uploadError
    const lessonId = lessonEntry ? lessonIds.get(lessonEntry[0]) : null
    const alt = lessonEntry ? lessonEntry[1].alt : `Apoio visual: ${text(clinic?.title)}`
    const { error: assetError } = await client.from('lesson_assets').upsert({
      external_id: stem,
      lesson_id: lessonId ?? null,
      grammar_clinic_external_id: clinic ? text(clinic.id) : null,
      storage_path: storagePath,
      media_type: 'image/svg+xml',
      alt_text: alt,
      metadata: {},
    }, { onConflict: 'external_id' })
    if (assetError) throw assetError
  }

  const answerEntries = Object.entries(answerKeys)
  let importedAnswers = 0
  for (let index = 0; index < answerEntries.length; index += 100) {
    const batch = Object.fromEntries(answerEntries.slice(index, index + 100))
    const { data, error } = await client.rpc('import_private_answer_keys', { p_entries: batch })
    if (error) throw error
    importedAnswers += Number(data)
  }

  const { error: archiveError } = await client.from('lessons').update({ published: false }).eq('is_legacy', true)
  if (archiveError) throw archiveError
  const { data: firstLesson, error: firstError } = await client.from('lessons')
    .select('id').eq('is_legacy', false).eq('global_order', 1).single()
  if (firstError) throw firstError
  const { data: students, error: studentError } = await client.from('profiles').select('id').eq('role', 'student')
  if (studentError) throw studentError
  if (students?.length) {
    const { error: accessError } = await client.from('student_lesson_access').upsert(
      students.map((student) => ({ student_id: student.id, lesson_id: firstLesson.id, unlocked: true })),
      { onConflict: 'student_id,lesson_id' },
    )
    if (accessError) throw accessError
  }

  const after = {
    progress: await countRows(client, 'lesson_progress'),
    attempts: await countRows(client, 'exercise_attempts'),
    xp: await countRows(client, 'xp_events'),
    lessons: await countRows(client, 'lessons', (query) => query.eq('is_legacy', false)),
    exercises: await countRows(client, 'exercises', (query) => query.not('external_id', 'is', null)),
    clinics: await countRows(client, 'grammar_clinics'),
    clinicExercises: await countRows(client, 'grammar_clinic_exercises'),
    assets: await countRows(client, 'lesson_assets'),
  }
  if (after.progress !== before.progress || after.attempts !== before.attempts || after.xp !== before.xp) {
    throw new Error('Student progress, attempts or XP changed during content import.')
  }
  if (after.lessons !== 360 || after.exercises !== 1752 || after.clinics !== 41 || after.clinicExercises !== 123 || after.assets !== 401 || importedAnswers !== 1875) {
    throw new Error(`Validation failed: ${JSON.stringify({ ...after, importedAnswers })}`)
  }
  console.log('Curriculum import complete.', {
    lessons: after.lessons,
    exercises: after.exercises,
    grammarClinics: after.clinics,
    clinicExercises: after.clinicExercises,
    visualAssets: after.assets,
    privateAnswers: importedAnswers,
    preserved: before,
  })
}

main().catch((reason) => {
  console.error(reason instanceof Error ? reason.message : reason)
  process.exitCode = 1
})
