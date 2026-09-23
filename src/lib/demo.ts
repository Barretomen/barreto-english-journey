import type { AdminStudent, DashboardData, LessonCatalogItem, LessonDetail } from '../types/domain'

const journey: LessonCatalogItem[] = [
  { id: 1, levelCode: 'A1', moduleTitle: 'A1.1 · First Steps', weekNumber: 1, title: 'Hello!', summary: 'Cumprimentos para começar conversas.', state: 'current', isCheckpoint: false, progressPercent: 18 },
  { id: 2, levelCode: 'A1', moduleTitle: 'A1.1 · First Steps', weekNumber: 2, title: 'Me and My Family', summary: 'Família e apresentações.', state: 'locked', isCheckpoint: false, progressPercent: 0 },
  { id: 3, levelCode: 'A1', moduleTitle: 'A1.1 · First Steps', weekNumber: 3, title: 'My Everyday Life', summary: 'Rotina, horas e frequência.', state: 'locked', isCheckpoint: false, progressPercent: 0 },
  { id: 4, levelCode: 'A1', moduleTitle: 'A1.1 · First Steps', weekNumber: 4, title: 'Things Around Me', summary: 'Casa, objetos e posições.', state: 'locked', isCheckpoint: false, progressPercent: 0 },
  { id: 5, levelCode: 'A1', moduleTitle: 'A1.1 · First Steps', weekNumber: null, title: 'Checkpoint A1.1', summary: 'Revisão do primeiro ciclo.', state: 'locked', isCheckpoint: true, progressPercent: 0 },
  { id: 6, levelCode: 'A1', moduleTitle: 'A1.2 · Everyday English', weekNumber: 5, title: 'Food & Drinks', summary: 'Pedidos, alimentos e quantidades.', state: 'locked', isCheckpoint: false, progressPercent: 0 },
  { id: 7, levelCode: 'A1', moduleTitle: 'A1.2 · Everyday English', weekNumber: 6, title: 'What Are You Doing?', summary: 'Ações acontecendo agora.', state: 'locked', isCheckpoint: false, progressPercent: 0 },
  { id: 8, levelCode: 'A1', moduleTitle: 'A1.2 · Everyday English', weekNumber: 7, title: 'Can You Help Me?', summary: 'Habilidades, pedidos e direções.', state: 'locked', isCheckpoint: false, progressPercent: 0 },
  { id: 9, levelCode: 'A1', moduleTitle: 'A1.2 · Everyday English', weekNumber: 8, title: 'A1 Final', summary: 'Projeto e checkpoint A1.', state: 'locked', isCheckpoint: true, progressPercent: 0 },
  { id: 10, levelCode: 'A2', moduleTitle: 'A2.1 · Expanding Stories', weekNumber: 9, title: 'The Past', summary: 'Primeiras histórias no passado.', state: 'locked', isCheckpoint: false, progressPercent: 0 },
  { id: 11, levelCode: 'A2', moduleTitle: 'A2.1 · Expanding Stories', weekNumber: 10, title: 'Stories and Experiences', summary: 'Sequência e storytelling.', state: 'locked', isCheckpoint: false, progressPercent: 0 },
  { id: 12, levelCode: 'A2', moduleTitle: 'A2.1 · Expanding Stories', weekNumber: 11, title: 'Plans and the Future', summary: 'Planos, viagens e futuro.', state: 'locked', isCheckpoint: false, progressPercent: 0 },
  { id: 13, levelCode: 'A2', moduleTitle: 'A2.1 · Expanding Stories', weekNumber: 12, title: 'Comparing Things', summary: 'Comparações e superlativos.', state: 'locked', isCheckpoint: false, progressPercent: 0 },
  { id: 14, levelCode: 'A2', moduleTitle: 'A2.1 · Expanding Stories', weekNumber: null, title: 'Checkpoint A2.1', summary: 'Revisão do primeiro ciclo A2.', state: 'locked', isCheckpoint: true, progressPercent: 0 },
  { id: 15, levelCode: 'A2', moduleTitle: 'A2.2 · Real Conversations', weekNumber: 13, title: 'Life Experiences', summary: 'Experiências de vida.', state: 'locked', isCheckpoint: false, progressPercent: 0 },
  { id: 16, levelCode: 'A2', moduleTitle: 'A2.2 · Real Conversations', weekNumber: 14, title: 'Rules, Advice and Obligations', summary: 'Conselhos, regras e obrigações.', state: 'locked', isCheckpoint: false, progressPercent: 0 },
  { id: 17, levelCode: 'A2', moduleTitle: 'A2.2 · Real Conversations', weekNumber: 15, title: 'Real Conversations', summary: 'Restaurante, hotel, aeroporto e trabalho.', state: 'locked', isCheckpoint: false, progressPercent: 0 },
  { id: 18, levelCode: 'A2', moduleTitle: 'A2.2 · Real Conversations', weekNumber: 16, title: 'A2 Final', summary: 'Projeto final e checkpoint A2.', state: 'locked', isCheckpoint: true, progressPercent: 0 }
]

export const demoLesson: LessonDetail = {
  id: 1,
  levelCode: 'A1',
  lessonNumber: 1,
  title: 'Hello!',
  summary: 'Cumprimentos essenciais para começar e encerrar conversas.',
  xpReward: 50,
  isCheckpoint: false,
  blocks: [
    { id: 1, type: 'text', position: 1, title: 'Seu primeiro passo', content: { body: 'Hoje você vai aprender a cumprimentar alguém em diferentes momentos do dia. Escute, repita e use sem pressa.' }, exercise: null },
    { id: 2, type: 'vocabulary', position: 2, title: 'Hello / Hi', content: { term: 'Hello!', translation: 'Olá!', example: 'Hello, my name is Maria.', note: 'Hi é uma alternativa um pouco mais informal.' }, exercise: null },
    { id: 3, type: 'vocabulary', position: 3, title: 'Morning', content: { term: 'Good morning', translation: 'Bom dia', example: 'Good morning, Ana!' }, exercise: null },
    { id: 4, type: 'vocabulary', position: 4, title: 'Later in the day', content: { term: 'Good afternoon', translation: 'Boa tarde', example: 'Good afternoon, Mr. Lee.' }, exercise: null },
    { id: 5, type: 'vocabulary', position: 5, title: 'Evening', content: { term: 'Good evening', translation: 'Boa noite ao chegar', example: 'Good evening. How are you?' }, exercise: null },
    { id: 6, type: 'vocabulary', position: 6, title: 'Ending a conversation', content: { term: 'Goodbye', translation: 'Até logo / tchau', example: 'Goodbye! See you tomorrow.', note: 'Use Good night ao se despedir no fim da noite ou antes de dormir.' }, exercise: null },
    { id: 7, type: 'vocabulary', position: 7, title: 'Being polite', content: { term: 'Thank you', translation: 'Obrigada / obrigado', example: 'Thank you for your help.' }, exercise: null },
    { id: 8, type: 'multiple_choice', position: 8, title: null, content: {}, exercise: { id: 101, type: 'multiple_choice', prompt: 'Você encontra uma pessoa às 9h. O que diz?', instruction: 'Escolha a resposta correta.', content: {}, options: [{ id: 1, label: 'Good morning!', value: 'good_morning' }, { id: 2, label: 'Good evening!', value: 'good_evening' }, { id: 3, label: 'Goodbye!', value: 'goodbye' }], feedbackCorrect: 'Isso mesmo: pela manhã, usamos “Good morning”.', feedbackIncorrect: 'Às 9h ainda é manhã. Use “Good morning”.', demoAnswer: 'good_morning' } },
    { id: 9, type: 'listening', position: 9, title: null, content: {}, audio: { normalPath: null, slowPath: null, status: 'missing' }, exercise: { id: 102, type: 'listening', prompt: 'Qual frase você ouviu?', instruction: 'Ouça em velocidade normal ou reduzida.', content: { speech: 'Good evening. Nice to meet you.' }, options: [{ id: 4, label: 'Good evening. Nice to meet you.', value: 'evening' }, { id: 5, label: 'Good morning. See you tomorrow.', value: 'morning' }], feedbackCorrect: 'Perfeito. “Good evening” é usado ao encontrar alguém à noite.', feedbackIncorrect: 'Escute novamente: a frase começa com “Good evening”.', demoAnswer: 'evening' } },
    { id: 10, type: 'fill_blank', position: 10, title: null, content: {}, exercise: { id: 103, type: 'fill_blank', prompt: 'Good ___! See you tomorrow.', instruction: 'Complete a despedida.', content: { placeholder: 'Digite uma palavra' }, options: [], feedbackCorrect: 'Correto. “Goodbye” encerra a conversa.', feedbackIncorrect: 'Aqui queremos encerrar a conversa. A palavra é “bye”.', demoAnswer: ['bye', 'goodbye'] } },
    { id: 11, type: 'speaking', position: 11, title: null, content: { phrase: 'Hello, my name is Maria.', translation: 'Olá, meu nome é Maria.', disclaimer: 'A prática ajuda a ganhar confiança; esta versão não mede sua pronúncia cientificamente.' }, exercise: null },
    { id: 12, type: 'checkpoint', position: 12, title: 'Pronta para usar', content: { body: 'Você já consegue iniciar uma conversa, escolher um cumprimento para cada horário e se despedir com naturalidade.' }, exercise: null }
  ]
}

export function createDemoDashboard(displayName = 'Maria'): DashboardData {
  return {
    profile: { id: 'demo-student', username: 'maria', displayName, role: 'student', currentLevel: 'A1' },
    level: 'A1',
    progressPercent: 3,
    xp: 20,
    streak: 1,
    completedLessons: 0,
    totalPublishedLessons: journey.length,
    currentLesson: journey[0] ?? null,
    journey
  }
}

export const demoStudents: AdminStudent[] = [
  { id: 'demo-student', displayName: 'Maria', username: 'maria', level: 'A1', progressPercent: 3, accuracyPercent: 80, xp: 20, lastActivity: new Date().toISOString(), completedLessons: 0 }
]

export function getDemoJourney(): LessonCatalogItem[] {
  return journey
}
