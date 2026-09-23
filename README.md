# Barreto English Journey

Plataforma progressiva de estudos de inglês com React, TypeScript, Vite e integração opcional ao Supabase.

## Desenvolvimento

```bash
npm install
npm run dev
```

Sem variáveis do Supabase, o site oferece um modo de demonstração local. Para conectar autenticação e progresso reais, copie `.env.example` para `.env` e preencha apenas a URL e a chave pública/publishable do projeto.

## GitHub Pages

O workflow em `.github/workflows/deploy-pages.yml` valida e publica a aplicação automaticamente a cada push na branch `main`.

## Azure Text-to-Speech

O áudio das lições é gerado no servidor com Azure AI Speech, armazenado no bucket privado `lesson-audio` e entregue por URLs assinadas de cinco minutos. O frontend nunca recebe a chave do Azure nem uma chave secreta do Supabase. As versões Normal e Devagar são arquivos MP3 distintos, gerados por SSML; o modo lento não usa `playbackRate`.

A migration `20260923223321_azure_lesson_audio.sql` adiciona os metadados de áudio aos blocos, cria o bucket privado e as funções SQL de administração. O hash SHA-256 inclui texto, voz, locale, velocidades e formato, permitindo reutilizar um áudio já existente sem consumir a API novamente.

### Configurar o Azure

1. No portal do Azure, crie um recurso **Speech** e copie a chave e a região.
2. Configure os secrets somente nas Supabase Edge Functions:

```bash
npx supabase secrets set AZURE_SPEECH_KEY=SUA_CHAVE
npx supabase secrets set AZURE_SPEECH_REGION=SUA_REGIAO
npx supabase secrets set AZURE_SPEECH_VOICE=en-US-JennyNeural
npx supabase secrets set AZURE_SPEECH_LOCALE=en-US
npx supabase secrets set AZURE_SPEECH_SLOW_RATE=-20%
```

`AZURE_SPEECH_VOICE`, `AZURE_SPEECH_LOCALE` e `AZURE_SPEECH_SLOW_RATE` são configuráveis. O formato escolhido é `audio-24khz-48kbitrate-mono-mp3`, adequado para voz educacional em web/mobile sem o tamanho de WAV.

Nunca use prefixo `VITE_` nesses secrets e não os coloque em `.env` do frontend ou no GitHub Pages.

### Aplicar e publicar

```bash
npx supabase db push
npx supabase functions deploy generate-lesson-audio
npx supabase functions deploy get-lesson-audio-url
```

Depois, entre com uma conta admin, abra **Admin → Áudio das lições** e clique em **Gerar ausentes**. A geração aceita um `lessonId` ou `blockId`, busca o texto diretamente no banco e rejeita contas student. Falhas ficam marcadas para nova tentativa.

### Segurança e cache

- O bucket é privado e não possui policy de leitura direta para usuários autenticados.
- `get-lesson-audio-url` valida a sessão e depende da RLS dos blocos antes de assinar o arquivo.
- `generate-lesson-audio` exige perfil `admin` no banco; metadata editável do usuário não participa da autorização.
- URLs assinadas não são adicionadas ao cache do Service Worker.
- Uma trava atômica de dez minutos evita duplo clique e geração concorrente do mesmo bloco.

### Verificação

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Nos testes manuais, confirme que o admin gera áudio Normal/Devagar, que uma student reproduz apenas conteúdo liberado e que a student recebe `403` ao tentar gerar áudio.
