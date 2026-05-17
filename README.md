# GPI — Gestão de Processos de Investigação

Plataforma web para gestão de inquéritos criminais. Construída em Next.js 16 + Prisma + PostgreSQL.

---

## Instalação rápida (Docker)

Único pré-requisito: **Docker** (Docker Desktop em Windows/macOS, Docker Engine em Linux) + **Git**.

### Windows (PowerShell)

```powershell
iwr -useb https://raw.githubusercontent.com/miguelsilv6/gestao-projetos/main/scripts/install.ps1 | iex
```

### Linux / macOS (bash)

```bash
curl -fsSL https://raw.githubusercontent.com/miguelsilv6/gestao-projetos/main/scripts/install.sh | bash
```

O script:
1. Verifica que tens Docker a correr (em Windows, inicia o Docker Desktop se preciso)
2. Clona o repo para `~/gpi` (ou `%USERPROFILE%\gpi` em Windows)
3. Gera um `.env` com secrets aleatórios (NextAuth, password do Postgres, cron secret)
4. Detecta um porto livre a partir do 3000
5. Faz `docker compose -f docker-compose.prod.yml up -d --build`
6. Espera pela aplicação ficar saudável e abre o browser

No fim, login default:
```
admin@gpi.pt / Admin123!
```

**Muda a password depois do primeiro login** em Perfil.

### Instalação manual (alternativa)

```bash
git clone https://github.com/miguelsilv6/gestao-projetos.git
cd gestao-projetos
./scripts/install.sh           # ou .\scripts\install.ps1 em Windows
```

---

## Comandos úteis

A partir do diretório de instalação (`~/gpi` ou `%USERPROFILE%\gpi`):

| Acção | Linux/macOS | Windows |
|---|---|---|
| Ver logs em tempo real | `docker compose -f docker-compose.prod.yml logs -f` | idem |
| Parar | `docker compose -f docker-compose.prod.yml stop` | idem |
| Reiniciar | `docker compose -f docker-compose.prod.yml restart` | idem |
| Atualizar | `./scripts/update.sh` | `.\scripts\update.ps1` |
| Desinstalar | `./scripts/uninstall.sh` | `.\scripts\uninstall.ps1` |

Os dados (BD + backups) ficam em **volumes Docker nomeados** e persistem entre arranques. O `uninstall` pergunta se queres apagá-los.

---

## Desenvolvimento local

```bash
git clone https://github.com/miguelsilv6/gestao-projetos.git
cd gestao-projetos
cp .env.example .env
# Edita .env: DATABASE_URL para a tua BD local
npm install
npx prisma db push
npx tsx prisma/seed.ts
npm run dev
```

Ou usa o `docker-compose.yml` (dev — inclui MailHog).

---

## Arquitectura

- **Next.js 16** (App Router, TypeScript, output: standalone)
- **PostgreSQL 16** via Prisma 7 + `@prisma/adapter-pg`
- **NextAuth v5** com Credentials provider + JWT
- **Worker separado** para cron jobs (deadlines + backups)
- **RBAC** em três camadas: middleware Edge, server guards, UI

Stack completa em [package.json](package.json).

---

## Credenciais default (após seed)

| Email | Role | Password |
|---|---|---|
| `admin@gpi.pt` | ADMINISTRACAO (chefe supremo) | `Admin123!` |
| `coordenador@gpi.pt` | COORDENADOR | `Admin123!` |
| `chefe@gpi.pt` | INSPETOR_CHEFE | `Admin123!` |
| `inspetor@gpi.pt` | INSPETOR | `Admin123!` |
| `estatistica@gpi.pt` | ESTATISTICA | `Admin123!` |

> **Importante**: muda estas passwords antes de pôr em produção. A password do `admin@gpi.pt` é particularmente sensível — é a única conta protegida contra desactivação acidental.

---

## Resolução de problemas

**"Docker daemon não está a correr"** → Abre o Docker Desktop e espera que o ícone fique estável.

**"Porto 3000 ocupado"** → O script tenta 3001, 3002... e escreve a porta usada em `.env` (`HOST_PORT=...`).

**"git pull falha durante update"** → Tens alterações locais. `git stash` ou clona de novo num diretório limpo.

**"Schema diverge"** → O entrypoint corre `prisma db push --accept-data-loss` ao arrancar; idempotente.

**Aceder a partir de outras máquinas na rede** → O compose faz bind a `127.0.0.1` por defeito. Para expor à LAN, edita `docker-compose.prod.yml` removendo `127.0.0.1:`.

---

## Licença

Projecto privado / interno. Sem licença pública atribuída.
