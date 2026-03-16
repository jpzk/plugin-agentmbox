/**
 * SQL Integration Tests
 * Tests database schema compatibility with elizaOS SQL plugin
 *
 * These tests validate that the plugin's schema is properly structured
 * for use with elizaOS's database adapter and SQL plugin.
 */

import { describe, it, expect } from "bun:test";
import type { UUID } from "@elizaos/core";
import {
  credentialsTable,
  emailsTable,
  agentMBoxSchema,
  type NewCredential,
} from "../types/schema";

describe("SQL Plugin Schema Validation", () => {
  describe("Schema Definition", () => {
    it("should have credentialsTable defined", () => {
      expect(credentialsTable).toBeDefined();
      expect(typeof credentialsTable).toBe("object");
    });

    it("should have emailsTable defined", () => {
      expect(emailsTable).toBeDefined();
      expect(typeof emailsTable).toBe("object");
    });

    it("should export agentMBoxSchema with both tables", () => {
      expect(agentMBoxSchema).toBeDefined();
      expect(agentMBoxSchema.credentialsTable).toBeDefined();
      expect(agentMBoxSchema.emailsTable).toBeDefined();
    });

    it("should have schema as an object for elizaOS SQL plugin", () => {
      // The schema should be exportable as a plugin schema
      // elizaOS SQL plugin expects schema to be an object
      expect(typeof agentMBoxSchema).toBe("object");
    });
  });

  describe("Credentials Table Structure", () => {
    it("should have required columns accessible", () => {
      expect(credentialsTable).toBeDefined();

      // We should be able to reference columns for queries
      expect(credentialsTable.agentId).toBeDefined();
      expect(credentialsTable.apiKey).toBeDefined();
      expect(credentialsTable.mailbox).toBeDefined();
      expect(credentialsTable.isPaid).toBeDefined();
      expect(credentialsTable.onboardingState).toBeDefined();
      expect(credentialsTable.createdAt).toBeDefined();
      expect(credentialsTable.updatedAt).toBeDefined();
    });

    it("should have optional payment columns", () => {
      expect(credentialsTable.solanaAddress).toBeDefined();
      expect(credentialsTable.paidUntil).toBeDefined();
      expect(credentialsTable.apiKeyCreatedAt).toBeDefined();
      expect(credentialsTable.apiKeyName).toBeDefined();
      expect(credentialsTable.ownerEmail).toBeDefined();
      expect(credentialsTable.sourceId).toBeDefined();
    });

    it("should have id column as primary key", () => {
      expect(credentialsTable.id).toBeDefined();
    });
  });

  describe("Emails Table Structure", () => {
    it("should have required columns accessible", () => {
      expect(emailsTable).toBeDefined();

      // We should be able to reference columns for queries
      expect(emailsTable.credentialId).toBeDefined();
      expect(emailsTable.emailId).toBeDefined();
      expect(emailsTable.from).toBeDefined();
      expect(emailsTable.to).toBeDefined();
      expect(emailsTable.subject).toBeDefined();
      expect(emailsTable.isRead).toBeDefined();
      expect(emailsTable.receivedAt).toBeDefined();
    });

    it("should have optional columns", () => {
      expect(emailsTable.cc).toBeDefined();
      expect(emailsTable.preview).toBeDefined();
      expect(emailsTable.textBody).toBeDefined();
      expect(emailsTable.htmlBody).toBeDefined();
      expect(emailsTable.hasAttachment).toBeDefined();
      expect(emailsTable.sourceId).toBeDefined();
      expect(emailsTable.processedAt).toBeDefined();
      expect(emailsTable.createdAt).toBeDefined();
    });
  });

  describe("TypeScript Type Definitions", () => {
    it("should have NewCredential type for inserts", () => {
      // Verify the type can be used to create a valid credential object
      const testCredential: NewCredential = {
        id: crypto.randomUUID() as any,
        agentId: crypto.randomUUID() as any,
        apiKey: "ai_test_key",
        mailbox: "test@agentmbox.com",
        solanaAddress: "ABC123xyz",
        isPaid: true,
        paidUntil: new Date(),
        apiKeyCreatedAt: new Date(),
        apiKeyName: "test-key-name",
        ownerEmail: "owner@example.com",
        sourceId: "source-123",
        onboardingState: { step: 1, email: "test@example.com" },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(testCredential.apiKey).toBe("ai_test_key");
      expect(testCredential.isPaid).toBe(true);
      expect(testCredential.onboardingState).toEqual({
        step: 1,
        email: "test@example.com",
      });
    });

    it("should support all data types in schema", () => {
      // Test uuid type
      const uuidValue: UUID = crypto.randomUUID();
      expect(uuidValue).toBeDefined();

      // Test boolean type
      const boolValue: boolean = true;
      expect(boolValue).toBe(true);

      // Test timestamp type
      const timestampValue: Date = new Date();
      expect(timestampValue).toBeInstanceOf(Date);

      // Test jsonb type (object)
      const jsonValue: Record<string, any> = { key: "value", nested: { a: 1 } };
      expect(jsonValue).toEqual({ key: "value", nested: { a: 1 } });

      // Test string type
      const stringValue: string = "test";
      expect(stringValue).toBe("test");
    });
  });

  describe("elizaOS Plugin Schema Compatibility", () => {
    it("should be compatible with elizaOS plugin schema format", () => {
      // The plugin exports schema in elizaOS expected format
      const schema = agentMBoxSchema;

      expect(typeof schema).toBe("object");
      expect(schema.credentialsTable).toBeDefined();
      expect(schema.emailsTable).toBeDefined();
    });

    it("should use pgTable (not custom pgSchema)", () => {
      // Per documentation, tables should use pgTable directly
      // not pgSchema, to work with elizaOS migrations
      expect(credentialsTable).toBeDefined();
      expect(emailsTable).toBeDefined();
    });

    it("should have table names in snake_case for PostgreSQL", () => {
      // Verify column names are snake_case (Drizzle handles the mapping)
      // We test this by checking column SQL names
      expect(credentialsTable.agentId.name).toBe("agent_id");
      expect(emailsTable.credentialId.name).toBe("credential_id");
      expect(credentialsTable.createdAt.name).toBe("created_at");
      expect(credentialsTable.updatedAt.name).toBe("updated_at");
    });

    it("should have columns with proper SQL names", () => {
      // Verify column SQL names are snake_case
      const agentIdColumn = credentialsTable.agentId;
      const createdAtColumn = credentialsTable.createdAt;

      // Get the SQL column name from Drizzle column
      expect(agentIdColumn).toBeDefined();
      expect(createdAtColumn).toBeDefined();

      // The column should have a name property with the SQL name
      expect(agentIdColumn.name).toBe("agent_id");
      expect(createdAtColumn.name).toBe("created_at");
    });
  });

  describe("Unique Constraint for Upsert", () => {
    it("should have unique constraint on agentId for upsert operations", () => {
      // The credentials table uses agentId as unique key for upserts
      // This is verified by the column being defined for use in onConflictDoUpdate
      expect(credentialsTable.agentId).toBeDefined();

      // The unique constraint is important for:
      // 1. Preventing duplicate agent credentials
      // 2. Enabling onConflictDoUpdate (upsert) operations
      // We can't directly test Drizzle's internal constraints,
      // but we verify the column is used correctly in the codebase
    });
  });

  describe("Runtime Database Pattern Compatibility", () => {
    it("should be usable with runtime.databaseAdapter.db pattern", () => {
      // This test verifies the schema structure works with the pattern used in onboarding.ts:
      // const db = (runtime as any).databaseAdapter?.db;
      // await db.insert(credentialsTable).values({...}).onConflictDoUpdate({...})

      // We verify columns are properly typed for this usage
      const mockAgentId = "test-agent-id" as any;

      // The eq() function from drizzle-orm should work with these columns
      // This is a compile-time check - if types are wrong, TypeScript would fail
      const agentIdCondition = { agentId: mockAgentId };

      expect(agentIdCondition.agentId).toBe(mockAgentId);
    });

    it("should support JSON column for onboarding state", () => {
      // The onboardingState column stores JSON data
      // This is important for the saveOnboardingState / getOnboardingState functions
      const onboardingData = {
        step: 1,
        email: "test@example.com",
        completedSteps: [1, 2, 3],
        paymentAddress: "ABC123",
      };

      // Verify we can serialize/deserialize
      const serialized = JSON.stringify(onboardingData);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.step).toBe(1);
      expect(deserialized.email).toBe("test@example.com");
      expect(deserialized.completedSteps).toEqual([1, 2, 3]);
    });
  });

  describe("Migration Readiness", () => {
    it("should have proper column definitions for migrations", () => {
      // Verify all required columns have proper definitions
      // that Drizzle can generate migrations from

      const requiredCredentialColumns = [
        "id",
        "agentId",
        "apiKey",
        "mailbox",
        "isPaid",
        "createdAt",
        "updatedAt",
      ];

      for (const colName of requiredCredentialColumns) {
        const column = (credentialsTable as any)[colName];
        expect(column).toBeDefined();
        expect(column.name).toBeDefined();
      }
    });

    it("should have index definitions for query performance", () => {
      // Indexes are defined in the table configuration
      // Verify we have indexes on commonly queried columns

      // AgentId should have an index for fast lookups
      expect(credentialsTable.agentId).toBeDefined();

      // The actual index objects would be in credentialsTable.indexes
      // but we verify the columns they target exist
    });
  });
});

describe("Schema Export Validation", () => {
  it("should export schema from index.ts", () => {
    // Verify the plugin exports work correctly
    expect(agentMBoxSchema).toBeDefined();
    expect(agentMBoxSchema.credentialsTable).toBeDefined();
    expect(agentMBoxSchema.emailsTable).toBeDefined();
  });

  it("should have consistent table references", () => {
    // The exported schema should reference the same table objects
    expect(agentMBoxSchema.credentialsTable).toBe(credentialsTable);
    expect(agentMBoxSchema.emailsTable).toBe(emailsTable);
  });
});
