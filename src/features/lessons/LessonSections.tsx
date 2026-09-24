import { useEffect, useState } from 'react'
import { BookOpen, CheckCircle2, ChevronDown, Image, Lightbulb, Mic2, PenLine, Target } from 'lucide-react'
import { LessonAudioPlayer } from '../../components/LessonAudioPlayer'
import { getLessonVisualUrl } from './repository'
import { setLessonCanDoCheck } from './repository'
import { useAsyncResource } from '../../hooks/useAsyncResource'
import type { JsonValue, LessonBlock } from '../../types/domain'

type Content = Record<string, JsonValue>

function text(value: JsonValue | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function list(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : []
}

function strings(value: JsonValue | undefined): string[] {
  return list(value).filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
}

function record(value: JsonValue | undefined): Content {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function flattenReadableValues(value: JsonValue): string[] {
  if (value === null || value === '' || typeof value === 'boolean') return []
  if (typeof value === 'string' || typeof value === 'number') return [String(value)]
  if (Array.isArray(value)) return value.flatMap(flattenReadableValues)
  return Object.values(value).flatMap(flattenReadableValues)
}

function Audio({ block }: { block: LessonBlock }) {
  if (!block.audio?.required) return null
  return <LessonAudioPlayer blockId={block.id} status={block.audio.status ?? 'missing'} />
}

function BulletList({ items, className }: { items: string[]; className?: string }) {
  if (!items.length) return null
  return <ul className={className ?? 'lesson-points'}>{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
}

export function LessonOverview({ block }: { block: LessonBlock }) {
  const [showTranslation, setShowTranslation] = useState(false)
  const goals = strings(block.content.can_do)
  const translatedGoals = strings(block.content.can_do_pt)
  return <article className="lesson-block overview-card">
    <span className="section-kicker"><Target aria-hidden="true" />OBJETIVO</span>
    <h2>{block.title ?? 'O que você vai aprender'}</h2>
    {text(block.content.body) ? <p className="lesson-copy">{text(block.content.body)}</p> : null}
    {goals.length ? <div className="can-do-preview"><strong>Ao final, você poderá:</strong><BulletList items={goals} />{translatedGoals.length ? <><button className="text-toggle" type="button" aria-expanded={showTranslation} onClick={() => setShowTranslation((current) => !current)}>{showTranslation ? 'Ocultar tradução' : 'Ver tradução'}</button>{showTranslation ? <BulletList items={translatedGoals} className="lesson-points lesson-points--translation" /> : null}</> : null}</div> : null}
  </article>
}

export function LessonVisual({ externalId, title }: { externalId: string; title?: string | null }) {
  const { data, error, loading, reload } = useAsyncResource(() => getLessonVisualUrl(externalId), [externalId])
  return <article className="lesson-block visual-card">
    <span className="section-kicker"><Image aria-hidden="true" />APOIO VISUAL</span>
    {title ? <h2>{title}</h2> : null}
    {loading ? <div className="visual-placeholder"><Image aria-hidden="true" />Carregando apoio visual…</div> : null}
    {error || (!loading && !data) ? <div className="visual-placeholder"><Image aria-hidden="true" /><span>O visual não carregou.</span><button type="button" onClick={() => void reload()}>Tentar novamente</button></div> : null}
    {data ? <figure className="lesson-visual"><img src={data.url} alt={data.alt} /><figcaption>{data.alt}</figcaption></figure> : null}
  </article>
}

export function VocabularySection({ block }: { block: LessonBlock }) {
  const items = list(block.content.items).map(record).filter((item) => Object.keys(item).length)
  return <article className="lesson-block vocabulary-card">
    <span className="section-kicker">VOCABULÁRIO</span>
    <h2>{block.title ?? 'Palavras e expressões'}</h2>
    <div className="vocabulary-list">
      {items.map((item, index) => <section className="vocabulary-item" key={`${text(item.term)}-${index}`}>
        <h3>{text(item.term) || text(item.word) || `Item ${index + 1}`}</h3>
        {text(item.translation) || text(item.gloss) ? <p className="vocabulary-translation">{text(item.translation) || text(item.gloss)}</p> : null}
        {text(item.example) ? <p className="vocabulary-example"><span>Exemplo</span>{text(item.example)}</p> : null}
        {text(item.example_translation) ? <p className="vocabulary-example-translation">{text(item.example_translation)}</p> : null}
        <div className="vocabulary-audio-pair">
          {block.audioSegments?.filter((segment) => segment.itemKey === `vocabulary-${index + 1}`).map((segment) => <div key={segment.id}><small>{segment.kind === 'term' ? 'Palavra' : 'Exemplo'}</small><LessonAudioPlayer segmentId={segment.id} status={segment.status} compact /></div>)}
        </div>
      </section>)}
    </div>
    <Audio block={block} />
  </article>
}

export function GrammarSection({ block }: { block: LessonBlock }) {
  const [showTranslation, setShowTranslation] = useState(false)
  const items = strings(block.content.items)
  const translatedItems = strings(block.content.items_pt)
  const rule = text(block.content.explanation) || text(block.content.rule) || text(block.content.body)
  const examples = strings(block.content.examples)
  return <article className="lesson-block grammar-card">
    <span className="section-kicker"><Lightbulb aria-hidden="true" />GRAMÁTICA</span>
    <h2>{block.title ?? 'Como a língua funciona'}</h2>
    {rule ? <p className="lesson-copy">{rule}</p> : null}
    <BulletList items={items} />
    {translatedItems.length ? <><button className="text-toggle" type="button" aria-expanded={showTranslation} onClick={() => setShowTranslation((current) => !current)}>{showTranslation ? 'Ocultar tradução' : 'Ver tradução'}</button>{showTranslation ? <BulletList items={translatedItems} className="lesson-points lesson-points--translation" /> : null}</> : null}
    {examples.length ? <div className="example-stack">{examples.map((example) => <p key={example}>{example}</p>)}</div> : null}
  </article>
}

export function PronunciationSection({ block }: { block: LessonBlock }) {
  const [showTranslation, setShowTranslation] = useState(false)
  const items = strings(block.content.items)
  const translatedItems = strings(block.content.items_pt)
  return <article className="lesson-block speaking-card">
    <Mic2 aria-hidden="true" />
    <div><span className="section-kicker">PRONÚNCIA</span><h2>{block.title ?? 'Ouça e repita'}</h2><div className="pronunciation-list">{items.map((item, index) => <section key={item}><p>{item}</p>{showTranslation && translatedItems[index] ? <p lang="pt-BR" className="pronunciation-translation">{translatedItems[index]}</p> : null}{block.audioSegments?.filter((segment) => segment.itemKey === `pronunciation-${index + 1}`).map((segment) => <LessonAudioPlayer key={segment.id} segmentId={segment.id} status={segment.status} compact />)}</section>)}</div>{translatedItems.length ? <button className="text-toggle text-toggle--dark" type="button" aria-expanded={showTranslation} onClick={() => setShowTranslation((current) => !current)}>{showTranslation ? 'Ocultar tradução' : 'Ver tradução'}</button> : null}<Audio block={block} /></div>
  </article>
}

export function ListeningSection({ block }: { block: LessonBlock }) {
  const [showTranscript, setShowTranscript] = useState(false)
  const [showTranslation, setShowTranslation] = useState(false)
  const transcript = block.audio?.transcript || text(block.content.script)
  const translation = text(block.content.translation) || text(block.content.script_translation)
  return <article className="lesson-block listening-card">
    <span className="section-kicker">LISTENING</span><h2>{block.title ?? 'Escute com atenção'}</h2>
    {text(block.content.task_translation) || text(block.content.task) ? <p className="listening-task"><strong>Sua tarefa:</strong> {text(block.content.task_translation) || text(block.content.task)}</p> : null}
    <Audio block={block} />
    {transcript ? <button className="transcript-toggle" type="button" aria-expanded={showTranscript} onClick={() => setShowTranscript((current) => !current)}><ChevronDown aria-hidden="true" />{showTranscript ? 'Ocultar transcrição' : 'Ver transcrição'}</button> : null}
    {showTranscript ? <div className="transcript"><p>{transcript}</p>{translation ? <><button className="text-toggle" type="button" aria-expanded={showTranslation} onClick={() => setShowTranslation((current) => !current)}>{showTranslation ? 'Ocultar tradução' : 'Ver tradução'}</button>{showTranslation ? <p lang="pt-BR">{translation}</p> : null}</> : null}</div> : null}
  </article>
}

export function ReadingSection({ block }: { block: LessonBlock }) {
  const [showTranslation, setShowTranslation] = useState(false)
  const translation = text(block.content.translation)
  return <article className="lesson-block reading-card"><span className="section-kicker"><BookOpen aria-hidden="true" />LEITURA</span><h2>{block.title ?? 'Leia e observe'}</h2><p className="reading-copy">{text(block.content.body)}</p>{translation ? <><button className="text-toggle" type="button" aria-expanded={showTranslation} onClick={() => setShowTranslation((current) => !current)}>{showTranslation ? 'Ocultar tradução' : 'Ver tradução'}</button>{showTranslation ? <p lang="pt-BR" className="reading-translation">{translation}</p> : null}</> : null}</article>
}

export function ExamplesSection({ block }: { block: LessonBlock }) {
  return <article className="lesson-block examples-card"><span className="section-kicker">EXEMPLOS</span><h2>{block.title ?? 'Veja em contexto'}</h2><div className="example-stack">{strings(block.content.items).map((item) => <p key={item}>{item}</p>)}</div><Audio block={block} /></article>
}

export function PracticeSection({ block }: { block: LessonBlock }) {
  const items = strings(block.content.items)
  return <article className="lesson-block practice-card"><span className="section-kicker">PRÁTICA GUIADA</span><h2>{block.title ?? 'Pratique passo a passo'}</h2><BulletList items={items} /></article>
}

export function SpeakingSection({ block }: { block: LessonBlock }) {
  const prompt = text(block.content.prompt) || text(block.content.body)
  const translatedPrompt = text(block.content.prompt_translation)
  return <article className="lesson-block speaking-card"><Mic2 aria-hidden="true" /><div><span className="section-kicker">SPEAKING</span><h2>{block.title ?? 'Agora fale'}</h2>{translatedPrompt ? <p>{translatedPrompt}</p> : null}{prompt ? <p lang="en">{prompt}</p> : null}<Audio block={block} /></div></article>
}

export function WritingSection({ block }: { block: LessonBlock }) {
  return <article className="lesson-block writing-card"><span className="section-kicker"><PenLine aria-hidden="true" />ESCRITA</span><h2>{block.title ?? 'Agora escreva'}</h2><BulletList items={flattenReadableValues(block.content)} /></article>
}

export function LessonMission({ block }: { block: LessonBlock }) {
  const content = flattenReadableValues(block.content)
  return <article className="lesson-block mission-card"><span className="section-kicker"><Target aria-hidden="true" />MISSÃO</span><h2>{block.title ?? 'Use o que aprendeu'}</h2><BulletList items={content} /></article>
}

export function CanDoChecklist({ block, lessonId, initialChecks = {} }: { block: LessonBlock; lessonId: number; initialChecks?: Record<string, boolean> }) {
  const items = strings(block.content.can_do_pt).length ? strings(block.content.can_do_pt) : strings(block.content.can_do).length ? strings(block.content.can_do) : flattenReadableValues(block.content)
  const [checked, setChecked] = useState<Record<string, boolean>>(initialChecks)
  const [saveError, setSaveError] = useState('')
  useEffect(() => setChecked(initialChecks), [initialChecks])
  async function toggle(index: number, value: boolean) {
    const key = `${block.id}-${index + 1}`
    setChecked((current) => ({ ...current, [key]: value }))
    setSaveError('')
    try { await setLessonCanDoCheck(lessonId, key, value) } catch { setChecked((current) => ({ ...current, [key]: !value })); setSaveError('Não foi possível salvar esta marcação.') }
  }
  return <article className="lesson-block checklist-card"><span className="section-kicker"><CheckCircle2 aria-hidden="true" />EU CONSIGO</span><h2>{block.title ?? 'Confira seu progresso'}</h2><div className="can-do-checklist">{items.map((item, index) => { const key = `${block.id}-${index + 1}`; return <label key={`${index}-${item}`}><input type="checkbox" checked={Boolean(checked[key])} onChange={(event) => void toggle(index, event.target.checked)} /><span>{item}</span></label> })}</div>{saveError ? <p role="alert">{saveError}</p> : null}</article>
}

function LanguageFocusSection({ block }: { block: LessonBlock }) {
  const values = flattenReadableValues(block.content)
  return <article className="lesson-block grammar-card"><span className="section-kicker"><Lightbulb aria-hidden="true" />FOCO NA LÍNGUA</span><h2>{block.title ?? 'Observe o padrão'}</h2><BulletList items={values} /></article>
}

function UnknownSection({ block }: { block: LessonBlock }) {
  if (import.meta.env.DEV) console.warn(`Unknown lesson block type: ${block.type}`, block.id)
  return <article className="lesson-block"><span className="section-kicker">CONTEÚDO</span>{block.title ? <h2>{block.title}</h2> : null}<BulletList items={flattenReadableValues(block.content)} /><Audio block={block} /></article>
}

export function LessonContentBlock({ block, lessonId, canDoChecks }: { block: LessonBlock; lessonId: number; canDoChecks?: Record<string, boolean> | undefined }) {
  switch (block.type) {
    case 'overview': return <LessonOverview block={block} />
    case 'visual': return <LessonVisual externalId={text(block.content.visual_external_id)} title={block.title} />
    case 'vocabulary': return <VocabularySection block={block} />
    case 'grammar': return <GrammarSection block={block} />
    case 'pronunciation': return <PronunciationSection block={block} />
    case 'listening': return <ListeningSection block={block} />
    case 'reading': return <ReadingSection block={block} />
    case 'example': case 'examples': return <ExamplesSection block={block} />
    case 'practice': return <PracticeSection block={block} />
    case 'speaking': return <SpeakingSection block={block} />
    case 'writing': return <WritingSection block={block} />
    case 'production': case 'guided_production': case 'guided_output': return <LessonMission block={block} />
    case 'assessment': case 'can_do': case 'checkpoint': return <CanDoChecklist block={block} lessonId={lessonId} {...(canDoChecks ? { initialChecks: canDoChecks } : {})} />
    case 'language_focus': case 'language_analysis': case 'contrast_explanation': case 'notice': return <LanguageFocusSection block={block} />
    default: return <UnknownSection block={block} />
  }
}
