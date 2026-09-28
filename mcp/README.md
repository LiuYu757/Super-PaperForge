# super-paperforge-mcp

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that
lets a local AI client — Claude Desktop, Cursor, Devin, or any MCP-capable
agent — read and edit projects on a Super-PaperForge instance.

It wraps the [external API](../docs/selfhost/EXTERNAL-API.md): snapshots →
changesets → compile → apply. The AI runs on your machine; the server only
receives the resulting, explicitly versioned edits. No prompt content ever
leaves your machine through this path.

## Install & configure

```bash
cd mcp
npm install
```

Point your MCP client at `node /path/to/mcp/server.mjs` with:

| Variable | Required | Meaning |
|---|---|---|
| `PAPERFORGE_URL` | yes | Instance URL, e.g. `https://latex.example.com` (HTTP only on loopback) |
| `PAPERFORGE_TOKEN` | yes | PAT (`pfp_...`) — create under Settings → API tokens, or `POST /api/v1/tokens` |
| `PAPERFORGE_PROJECT_ID` | no | Default project for all tools |
| `PAPERFORGE_TIMEOUT_MS` | no | 1000–120000, default 30000 |

Recommended scopes for a full edit loop: `project:read`, `changeset:write`,
`changeset:apply`, `compile:run`, `artifact:read`. A read-only proofreading
tool needs only `project:read` + `changeset:write`.

Applying changesets additionally requires `ENABLE_EXTERNAL_APPLY=true` on the
server; proposing and compiling candidates works without it.

## Tools

| Tool | Endpoint | Scope |
|---|---|---|
| `paperforge_snapshot` | `POST /snapshots` | `project:read` |
| `paperforge_read_file` | `GET /snapshots/{sid}/files/{fileId}` | `project:read` |
| `paperforge_propose_changeset` | `POST /changesets` | `changeset:write` |
| `paperforge_get_changeset` | `GET /changesets/{cid}` | `project:read` |
| `paperforge_compile` | `POST /compile` | `compile:run` |
| `paperforge_compilation_status` | `GET /compile/{id}/status` | `artifact:read` |
| `paperforge_cancel_compilation` | `POST /compile/{id}/cancel` | `compile:run` |
| `paperforge_download_pdf` | `GET /compile/{id}/pdf` | `artifact:read` |
| `paperforge_apply_changeset` | `POST /changesets/{cid}/apply` | `changeset:apply` |
| `paperforge_revert_changeset` | `POST /changesets/{cid}/revert` | `changeset:write` |

## Example client config (Claude Desktop)

```json
{
  "mcpServers": {
    "paperforge": {
      "command": "node",
      "args": ["/absolute/path/to/Super-PaperForge/mcp/server.mjs"],
      "env": {
        "PAPERFORGE_URL": "https://latex.example.com",
        "PAPERFORGE_TOKEN": "pfp_...",
        "PAPERFORGE_PROJECT_ID": "clx..."
      }
    }
  }
}
```
