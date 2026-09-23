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
