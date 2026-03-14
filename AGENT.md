# AgentMBox Plugin for ElizaOS

## Project Overview

This is an ElizaOS plugin that enables AI agents to send and receive emails via the AgentMBox API. When first started, the agent automatically onboard itself by:
1. Creating an AgentMBox account using the agent's Solana wallet
2. Paying 5 USDC on Solana from the agent's own wallet
3. Creating a mailbox for receiving emails
4. Configuring everything needed for email operations

No environment variables or manual setup required - the agent handles it all autonomously.

**Location:** `/home/izzy/git/agentmbox_elizaos/plugin-agentmbox`

## Project Structure

```
plugin-agentmbox/
├── src/
│   ├── index.ts              # Main plugin entry point
│   ├── actions/
│   │   ├── sendEmail.ts      # SEND_EMAIL action
│   │   └── getEmails.ts      # GET_EMAILS action
│   ├── providers/
│   │   └── emailProvider.ts  # Email context provider
│   ├── services/
│   │   ├── AgentMBoxService.ts           # Main email service
│   │   └── AgentMBoxOnboardingService.ts  # Autonomous onboarding
│   └── types/
│       └── index.ts          # TypeScript type definitions
├── dist/                     # Compiled output
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

## Key Technologies

- **ElizaOS Core** - Agent framework
- **Solana Web3.js** - Blockchain interactions
- **Solana SPL Token** - USDC payment handling
- **bs58** - Base58 encoding for addresses

## Available Actions

### SEND_EMAIL

Sends an email to any recipient.

**Parameters:**
- `to` (string) - Recipient email address
- `subject` (string) - Email subject
- `text` (string) - Plain text body
- `html` (string, optional) - HTML body

### GET_EMAILS

Retrieves emails from the mailbox.

**Parameters:**
- `limit` (number, optional) - Number of emails (default: 10)
- `offset` (number, optional) - Pagination offset
- `unreadOnly` (boolean, optional) - Filter to unread only
- `emailId` (string, optional) - Get specific email by ID

## Available Services

### AgentMBoxService

Main service for email operations:

```typescript
service.listEmails(limit, offset);
service.getEmail(emailId);
service.sendEmail({ from, to, subject, text, html });
service.deleteEmail(emailId);
service.listMailboxes();
service.createMailbox({ localPart, displayName });
service.deleteMailbox(mailboxId);
service.getPaymentStatus();
service.checkPayment();
service.listDomains();
service.addDomain(domain);
service.verifyDomain(domainId);
```

### AgentMBoxOnboardingService

Handles autonomous self-onboarding using the agent's Solana wallet:

1. Creates an AgentMBox account linked to the agent's wallet
2. Processes payment of 5 USDC on Solana (from agent's wallet)
3. Creates a unique mailbox (e.g., `0x1234...@agentmbox.com`)
4. Stores API key in agent settings for future use

The agent pays for its own mailbox subscription - no external payment required.

## Environment Variables

None required by default - the plugin handles autonomous onboarding via the agent's Solana wallet. Optional variables for importing existing setups:

| Variable | Required | Description |
|----------|----------|-------------|
| `AGENTMBOX_API_KEY` | No | Existing API key (starts with `ai_`) - only needed to import an existing mailbox |
| `AGENTMBOX_MAILBOX` | No | Existing mailbox address to use |
| `AGENTMBOX_BASE_URL` | No | Custom API URL (default: `https://agentmbox.com/api/v1`) |
| `AGENTMBOX_SKIP_ONBOARDING` | No | Set to `true` to skip autonomous onboarding |

> **Note:** After autonomous onboarding completes, the API key and mailbox are automatically saved to the agent's runtime settings. On subsequent restarts, the agent will use these saved credentials instead of re-running onboarding.

## Build Commands

```bash
# Install dependencies
bun install

# Build the plugin
bun run build

# Watch mode for development
bun run dev

# Run tests
bun test
```

## API Endpoints Used

- `POST /api/v1/auth/signup` - Create new AgentMBox account
- `POST /api/v1/mail/send` - Send email
- `GET /api/v1/mail` - List emails
- `GET /api/v1/mail/{id}` - Get specific email
- `DELETE /api/v1/mail/{id}` - Delete email
- `POST /api/v1/mailboxes` - Create mailbox
- `GET /api/v1/mailboxes` - List mailboxes
- `DELETE /api/v1/mailboxes/{id}` - Delete mailbox
- `POST /api/v1/keys` - Create API key
- `GET /api/v1/payment` - Get payment status
- `POST /api/v1/payment/check` - Check payment status

## Extension Points

To extend this plugin:

1. **Add new actions** - Create files in `src/actions/`
2. **Add new providers** - Create files in `src/providers/`
3. **Add new services** - Create files in `src/services/`
4. **Add types** - Extend `src/types/index.ts`

## Common Tasks

### Adding a New Action

1. Create action file in `src/actions/`
2. Define action using `defineAction()` from `@elizaos/core`
3. Export the action
4. Add to `actions` array in `src/index.ts`

### Adding a New Service

1. Create service file in `src/services/`
2. Extend `Service` class from `@elizaos/core`
3. Implement required methods
4. Add to `services` array in `src/index.ts`

### Testing

Run tests with:
```bash
bun test
```
