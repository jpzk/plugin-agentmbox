import {
  pgSchema,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
  boolean,
} from "drizzle-orm/pg-core";

/**
 * AgentMBox custom schema for isolation
 * Tables will be created in the "agentmbox" schema
 */
const agentmbox = pgSchema("agentmbox");

/**
 * AgentMBox Credentials Table
 * Stores API credentials per agent - survives restarts
 */
export const credentialsTable = agentmbox.table(
  "agentmbox_credentials",
  {
    // Agent ID to scope credentials per agent
    agentId: uuid("agent_id").notNull(),

    // API key for AgentMBox API
    apiKey: varchar("api_key", { length: 255 }).notNull(),

    // Mailbox address (e.g., myagent@agentmbox.com)
    mailbox: varchar("mailbox", { length: 255 }).notNull(),

    // Solana address used for payment
    solanaAddress: varchar("solana_address", { length: 255 }),

    // Payment status
    isPaid: boolean("is_paid").default(false).notNull(),

    // When the subscription expires
    paidUntil: timestamp("paid_until"),

    // API key metadata
    apiKeyCreatedAt: timestamp("api_key_created_at"),
    apiKeyName: varchar("api_key_name", { length: 255 }),

    // Owner account email (for notifications, not the mailbox)
    ownerEmail: varchar("owner_email", { length: 255 }),

    // Source identifier (e.g., character ID or source name)
    sourceId: varchar("source_id", { length: 255 }),

    // Onboarding state for resume capability
    onboardingState: jsonb("onboarding_state"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // Index for fast agent lookups
    index("idx_agentmbox_credentials_agent_id").on(table.agentId),
    // Index for mailbox lookups
    index("idx_agentmbox_credentials_mailbox").on(table.mailbox),
  ],
);

/**
 * AgentMBox Emails Table
 * Stores email metadata for quick access
 */
export const emailsTable = agentmbox.table(
  "agentmbox_emails",
  {
    // Link to credentials
    credentialId: uuid("credential_id").notNull(),

    // Email ID from AgentMBox API
    emailId: varchar("email_id", { length: 100 }).notNull(),

    // Email fields
    from: jsonb("from").notNull(),
    to: jsonb("to").notNull(),
    cc: jsonb("cc"),
    subject: text("subject").notNull(),
    preview: text("preview"),
    textBody: text("text_body"),
    htmlBody: text("html_body"),

    // Metadata
    isRead: boolean("is_read").default(false).notNull(),
    hasAttachment: boolean("has_attachment").default(false).notNull(),

    // Source identifier (e.g., character ID or source name)
    sourceId: varchar("source_id", { length: 255 }),

    // When received
    receivedAt: timestamp("received_at").notNull(),

    // When we processed it
    processedAt: timestamp("processed_at").defaultNow().notNull(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Index for fetching unread emails
    index("idx_agentmbox_emails_credential_unread").on(
      table.credentialId,
      table.isRead,
    ),
    // Index for chronological ordering
    index("idx_agentmbox_emails_received").on(
      table.credentialId,
      table.receivedAt,
    ),
  ],
);

/**
 * Export all tables for the plugin
 */
export const agentMBoxSchema = {
  credentialsTable,
  emailsTable,
};

// Type exports for TypeScript
export type Credential = typeof credentialsTable.$inferSelect;
export type NewCredential = typeof credentialsTable.$inferInsert;
export type Email = typeof emailsTable.$inferSelect;
export type NewEmail = typeof emailsTable.$inferInsert;
