# @agentmbox/plugin-agentmbox

[![Tests](https://github.com/agentmbox/plugin-agentmbox/actions/workflows/test.yml/badge.svg)](https://github.com/agentmbox/plugin-agentmbox/actions/workflows/test.yml)

AgentMBox email integration plugin for ElizaOS - enables AI agents to send and receive emails via the AgentMBox API.

**No configuration needed!** The agent will automatically onboard itself - creating an AgentMBox account, paying 5 USDC on Solana from its own wallet, and setting up a mailbox.

## Features

- **Send Emails**: Agents can send emails to any recipient
- **Receive Emails**: Agents can retrieve and read emails from their mailbox
- **Email Provider**: Built-in provider gives agents awareness of their inbox status
- **Full API Access**: Complete access to AgentMBox mailbox, domain, and payment management

## Installation

```bash
bun add @agentmbox/plugin-agentmbox
```

## Configuration

Add the plugin to your agent's configuration and set the required environment variables:

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AGENTMBOX_API_KEY` | No | Your AgentMBox API key (starts with `ai_`) - only needed if not using autonomous onboarding |
| `AGENTMBOX_MAILBOX` | No | Default mailbox address (e.g., `my-agent@agentmbox.com`) |
| `AGENTMBOX_BASE_URL` | No | Custom API base URL (defaults to `https://agentmbox.com/api/v1`) |

### Character Configuration

```json
{
  "plugins": [
    "@agentmbox/plugin-agentmbox"
  ]
}
```

## Quick Start

### 1. Configure Your Agent (Optional)

The plugin handles autonomous onboarding automatically - it will create an AgentMBox account, pay for subscription using the agent's Solana wallet, and set up a mailbox.

Optional environment variables:

```env
# Only set these if you want to use an existing mailbox
# AGENTMBOX_API_KEY=ai_your_existing_api_key
# AGENTMBOX_MAILBOX=my-existing-mailbox@agentmbox.com

# Skip autonomous onboarding if already set up
# AGENTMBOX_SKIP_ONBOARDING=true
```

### 3. Use in Your Agent

The plugin provides two actions and one provider:

#### Send Email Action (`SEND_EMAIL`)

```typescript
// The agent can send emails by specifying recipient, subject, and body
await runtime.execute({
  action: "SEND_EMAIL",
  parameters: {
    to: "recipient@example.com",
    subject: "Hello from your agent",
    text: "This is the plain text body",
    html: "<p>Or HTML body</p>"
  }
});
```

#### Get Emails Action (`GET_EMAILS`)

```typescript
// Retrieve emails from the mailbox
await runtime.execute({
  action: "GET_EMAILS",
  parameters: {
    limit: 10,      // Number of emails to retrieve (default: 10)
    offset: 0,     // Pagination offset
    unreadOnly: false  // Filter to only unread emails
  }
});

// Get a specific email by ID
await runtime.execute({
  action: "GET_EMAILS",
  parameters: {
    emailId: "M1234"
  }
});
```

#### Email Provider

The email provider automatically provides context about the agent's inbox:

```typescript
// Access via state in actions or handlers
const emailContext = state.email;
// Contains: available, unreadCount, totalEmails, recentEmails[]
```

## AgentMBox Setup Guide

### Creating a Mailbox

```bash
curl -X POST https://agentmbox.com/api/v1/mailboxes \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"localPart": "my-agent"}'
```

### Sending an Email

```bash
curl -X POST https://agentmbox.com/api/v1/mail/send \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "my-agent@agentmbox.com",
    "to": "recipient@example.com",
    "subject": "Hello",
    "text": "Email body"
  }'
```

### Checking Emails

```bash
curl "https://agentmbox.com/api/v1/mail?mailbox=my-agent@agentmbox.com&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## API Reference

### Service Methods

```typescript
const service = runtime.getService<AgentMBoxService>("agentmbox");

// Email operations
service.listEmails(limit, offset);
service.getEmail(emailId);
service.sendEmail({ from, to, subject, text, html });
service.deleteEmail(emailId);

// Mailbox operations
service.listMailboxes();
service.createMailbox({ localPart, displayName });
service.deleteMailbox(mailboxId);

// Payment operations
service.getPaymentStatus();
service.checkPayment();

// Domain operations
service.listDomains();
service.addDomain("example.com");
service.verifyDomain(domainId);
```

## Development

```bash
# Install dependencies
bun install

# Build the plugin
bun run build

# Run tests
bun test

# Watch mode
bun run dev
```

## License

MIT