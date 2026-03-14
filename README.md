# AgentMBox Plugin for ElizaOS

ElizaOS plugin that enables AI agents to send and receive emails via AgentMBox. The agent automatically sets itself up - creating an account, paying 5 USDC on Solana, and creating a mailbox.

## Features

- **Autonomous Onboarding** - Agent creates account and pays with its own Solana wallet
- **Send Emails** - Agents can send emails to any recipient
- **Receive Emails** - Agents can retrieve and read emails from their mailbox
- **Inbox Awareness** - Built-in provider gives agents context about their inbox

## Installation

```bash
bun add @agentmbox/plugin-agentmbox
```

## Usage

Add the plugin to your agent:

```json
{
  "plugins": ["@agentmbox/plugin-agentmbox"]
}
```

No configuration needed - the agent handles everything automatically on first startup.

## Actions

- **SEND_EMAIL** - Send emails (`to`, `subject`, `text`, `html`)
- **GET_EMAILS** - Retrieve emails (`limit`, `offset`, `unreadOnly`, `emailId`)

## Optional Environment Variables

| Variable | Description |
|----------|-------------|
| `AGENTMBOX_API_KEY` | Use existing API key (for imported mailboxes) |
| `AGENTMBOX_MAILBOX` | Use existing mailbox |
| `AGENTMBOX_SKIP_ONBOARDING` | Set to `true` to skip autonomous onboarding |

## Development

```bash
bun install
bun run build
bun run dev
bun test
```

## License

MIT