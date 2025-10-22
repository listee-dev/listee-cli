# listee-cli

Official command-line interface for Listee — manage authentication, categories, and tasks directly from your terminal. The MVP focuses on Supabase email/password flows (`signup`, `login`, `logout`, `status`).

## Requirements
- Bun 1.2.22 (`bun --version`)
- Node.js 20+ (runtime for the compiled CLI)
- Supabase project credentials (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)

## Installation
```bash
bun install
```

## Configuration
Create a `.env` file or export environment variables before running commands:
```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
export LISTEE_API_URL="https://api.your-listee-instance.dev"
# optional: override the Keytar service name
export LISTEE_CLI_KEYCHAIN_SERVICE="listee-cli"
# optional: choose bearer header value ("user-id" for local API mocks, "access-token" for real JWT)
export LISTEE_API_AUTH_BEARER_MODE="user-id"
```
Never commit secrets; the repo defaults to reading from the process environment.

## Usage
After building, invoke the CLI via the symlink Bun creates or by running the compiled output.

```bash
bun run build
bun run dev              # rebuilds then runs node dist/index.js
listee auth signup --email you@example.com
listee auth login --email you@example.com
listee auth status
listee auth logout
listee categories list [--email you@example.com]
listee categories show <categoryId> [--email you@example.com]
listee categories create --name "Inbox" [--email you@example.com]
listee tasks list --category <categoryId> [--email you@example.com]
listee tasks create --category <categoryId> --name "Task title" [--description "..."] [--checked] [--email you@example.com]
listee tasks show <taskId> [--email you@example.com]
```

`listee auth signup` starts a temporary local callback server. Leave the command running, open the confirmation email, and the CLI will finish automatically once the browser redirects back to the loopback URL.

## Scripts
| Command | Description |
| --- | --- |
| `bun run build` | Compile TypeScript to `dist/` using project references. |
| `bun run dev` | Rebuild and run the CLI for local smoke testing. |
| `bun run lint` | Execute Biome (`biome.json`) in CI mode for consistent styles. |
| `bun test` | Run Bun’s built-in test runner. |

## Project Layout
```
src/
  index.ts          # CLI entrypoint (Commander wiring)
  commands/auth.ts  # Auth subcommands
  commands/categories.ts
  commands/tasks.ts
  services/auth-service.ts
  services/api-client.ts
  services/category-api.ts
  services/task-api.ts
AGENTS.md           # Agent-specific automation guidelines
```

## Contributing
Human contributors should follow this README plus upcoming `CONTRIBUTING.md`. Automated coding agents must read [`AGENTS.md`](AGENTS.md) for execution boundaries, tool usage, and reporting format. Align commit messages with Conventional Commits (e.g., `feat(auth): add refresh token guard`).

## Roadmap
- Integrate shared packages from `listee-libs` once published to npm
- Extend task and category management commands
- Add device code flow support and cohesive CI via `listee-ci`
