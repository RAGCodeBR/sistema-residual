# Hospedagem do Residual na Cloudflare

Endereço gratuito: https://residual.verticedg.workers.dev/

O Worker `residual` serve apenas o aplicativo estático. A conta definitiva é `contato@verticedg.com.br`, com subdomínio aprovado `verticedg`. O `account_id` em `wrangler.jsonc` fixa o destino para impedir publicação acidental na conta provisória.

O banco, o login, os arquivos e as Edge Functions permanecem no mesmo projeto Supabase. A migração não copia nem altera registros do banco.

## Publicar pelo terminal

Use Node.js 22 ou superior, instale as dependências com `npm ci` e autentique a conta correta com `npm run cloudflare:login`. Confira a conta com `npm run cloudflare:whoami`. Neste Mac, os comandos usam o perfil privado separado em `~/.config/residual-cloudflare`, sem substituir a sessão dos demais projetos. Em outros computadores, execute o login antes da primeira publicação.

Configure somente as variáveis públicas no ambiente de build ou em `.env.local`:

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICA
VITE_ISO_STORAGE=supabase
VITE_ENABLE_GOOGLE_AUTH=false
```

```sh
npm run build:cloudflare
node scripts/cloudflare.mjs deploy --dry-run
npm run deploy:cloudflare
```

O build sai em `dist-cloudflare`. `wrangler.jsonc` publica somente essa pasta e atende rotas como `/auth` e `/users` com fallback SPA. A entrada pública `/assinar/` continua separada. Credenciais privadas do Supabase não devem ser adicionadas com prefixo `VITE_` nem publicadas como arquivos estáticos.

`npm run preview:cloudflare` executa o pacote compilado localmente. Para continuar testando o GitHub Pages, use `npm run build:pages`: o build antigo preserva a base `/sistema-residual/`. Não publique versões concorrentes sem combinar a branch e o commit com os demais desenvolvedores.

## Configuração remota do Supabase

No painel do projeto Supabase, em **Authentication → URL Configuration**:

- Site URL: `https://residual.verticedg.workers.dev/`
- Redirect URLs: adicione `https://residual.verticedg.workers.dev/` e `https://residual.verticedg.workers.dev/auth`.
- Durante a transição, mantenha as URLs necessárias do GitHub Pages em `https://vertice-dg.github.io/sistema-residual/` e sua rota `/auth`.

O arquivo `supabase/config.toml` foi alinhado, mas editá-lo NÃO altera automaticamente as configurações do projeto hospedado. Essa etapa remota precisa ser aplicada no painel ou pela API de gerenciamento com uma credencial apropriada. A chave secreta de dados não é um token de gerenciamento da conta.

Login com e-mail e senha usa diretamente a API do Supabase. Redirecionamentos de confirmação, recuperação de senha e OAuth precisam da configuração de URLs acima. Não ative cadastro público ou login Google apenas por causa da migração.

## Publicação automática pelo GitHub

O fluxo escolhido usa **GitHub Actions**, definido em `.github/workflows/deploy-cloudflare.yml`. Alterações enviadas à `main` executam instalação, TypeScript, testes de autenticação e gestão de acessos, build e deploy. A versão publicada é conferida pelo seu identificador. O workflow também permite execução manual pela aba Actions.

No repositório `Vertice-DG/sistema-residual`, em **Settings → Secrets and variables → Actions**, configure:

- **Variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_ISO_STORAGE`, `VITE_ENABLE_GOOGLE_AUTH`.
- **Secrets:** `CLOUDFLARE_API_TOKEN`, criado na conta `contato@verticedg.com.br` e autorizado a editar o Worker `residual`.

O token da Cloudflare só fica disponível na etapa de deploy, depois da instalação e dos testes. `wrangler.jsonc` fixa a conta de destino, e publicações concorrentes são serializadas. A chave privada do Supabase, o token de gerenciamento do Supabase e a chave Android não devem ser cadastrados nesse workflow.

O workflow testa os oito cenários de `client-portal-session` e `client-portal-rules`. A suíte completa atualmente tem dois testes antigos de permissões financeiras que divergem das regras implementadas; essa revisão de negócio deve ser tratada separadamente, sem mudar permissões para liberar a migração.

A integração nativa Workers Builds é uma alternativa ao GitHub Actions. Mantenha um único fluxo de publicação de produção para evitar deploys concorrentes. Pré-visualizações da interface não isolam o Supabase: para testes que alteram dados, configure um projeto Supabase separado.

## Android

O aplicativo é mantido separadamente em `gbmendonca21/residual-mobile`. A versão 1.0.0 aponta para o endereço antigo da RAGCodeBR. A versão 1.0.2 passa a abrir a conta Cloudflare definitiva, incluindo a origem permitida para downloads gerados. Preserve `br.com.residual.app` e a chave de assinatura original para atualizar as instalações.

Compartilhe somente o APK. A chave de assinatura, a senha e os backups privados não devem ser incluídos neste repositório.

## Verificações antes de trocar o acesso dos colaboradores

Confirme a tela de login, o redirecionamento de páginas protegidas, a recarga das rotas, o manifesto PWA e a entrada pública de assinatura. Teste login autorizado, permissões, visualização, upload e download de documentos com uma conta adequada. Publique um novo APK e valide sua instalação por cima da versão anterior.

A versão 1.0.1 e o endereço `residual.hotelrovi-ponto.workers.dev` foram provisórios. Instale a versão 1.0.2 por cima da 1.0.0 ou 1.0.1, sem desinstalar; pode ser necessário autenticar novamente porque o domínio mudou.
