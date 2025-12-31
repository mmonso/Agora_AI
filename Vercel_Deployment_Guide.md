# Guia de Deploy no Vercel - Agora AI

Este guia explica como colocar seu projeto online usando o Vercel.

## 1. Preparação do Projeto
Certifique-se de que os seguintes arquivos foram atualizados (já fizemos isso para você):
- `supabase_schema.sql`: Use este arquivo para criar as tabelas no seu painel do Supabase.
- `.env.example`: Modelo de como as variáveis de ambiente devem ser configuradas.

## 2. Deploy via GitHub (Recomendado)
A forma mais fácil de fazer deploy é conectando seu repositório Git ao Vercel.

1. Suba seu código para um repositório no GitHub, GitLab ou Bitbucket.
2. Acesse [vercel.com](https://vercel.com) e clique em **"Add New" > "Project"**.
3. Importe o repositório do seu projeto.
4. Na seção **"Environment Variables"**, adicione as seguintes chaves (copie os valores do seu `.env.local`):
   - `VITE_GEMINI_API_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Clique em **"Deploy"**.

## 3. Deploy via CLI
Se preferir usar o terminal:
1. Instale o Vercel CLI: `npm i -g vercel`
2. Rode `vercel` na raiz do projeto e siga as instruções.
3. Adicione as variáveis de ambiente quando solicitado ou pelo painel do Vercel depois.

## Dicas Importantes
- O Vercel detectará automaticamente que é um projeto **Vite**. O comando de build será `npm run build` e a pasta de saída será `dist`.
- Se você fizer alterações no banco de dados do Supabase, elas serão refletidas imediatamente no app (desde que as tabelas existam).
- Se esquecer de alguma variável de ambiente, o app dará erro ao abrir. Basta adicionar no painel do Vercel e fazer um novo "Redeploy".
