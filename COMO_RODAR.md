# Território de Campo — Como rodar

## 1. Configurar o banco de dados no Supabase

1. Abra o Supabase → seu projeto `territorio-de-campo`
2. No menu esquerdo clique em **SQL Editor**
3. Clique em **New query**
4. Cole todo o conteúdo do arquivo `BANCO_DE_DADOS.sql`
5. Clique em **Run**

## 2. Criar o primeiro usuário Admin

1. No Supabase → menu esquerdo → **Authentication** → **Users**
2. Clique em **Add user** → **Create new user**
3. Preencha email e senha
4. Copie o UUID gerado
5. Volte no SQL Editor e rode:
```sql
INSERT INTO usuarios (id, nome, email, perfil) 
VALUES ('COLE_O_UUID_AQUI', 'Seu Nome', 'seu@email.com', 'admin');
```

## 3. Rodar o projeto localmente

```bash
# Abra a pasta no VS Code
# Abra o terminal (Ctrl + `)
npm install
npm run dev
```

Acesse: http://localhost:3000

## 4. Publicar na Vercel

1. Crie um repositório no GitHub
2. Faça push do projeto
3. Na Vercel → Import Project → selecione o repositório
4. Em **Environment Variables** adicione:
   - `NEXT_PUBLIC_SUPABASE_URL` = sua URL do Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = sua chave anon
5. Clique em Deploy

Pronto! Sistema no ar com link público.
