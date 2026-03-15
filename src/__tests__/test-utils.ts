import { mock } from "bun:test";
import type {
  IAgentRuntime,
  Memory,
  State,
  Character,
  UUID,
} from "@elizaos/core";

export type MockRuntime = Partial<IAgentRuntime> & {
  agentId: UUID;
  character: Character;
  getSetting: ReturnType<typeof mock>;
  useModel: ReturnType<typeof mock>;
  composeState: ReturnType<typeof mock>;
  createMemory: ReturnType<typeof mock>;
  getMemories: ReturnType<typeof mock>;
  getService: ReturnType<typeof mock>;
  registerService: ReturnType<typeof mock>;
};

export function createMockRuntime(
  overrides?: Partial<MockRuntime> & { settings?: Record<string, string> },
): MockRuntime {
  const settings = overrides?.settings || {};

  return {
    agentId: "test-agent-123" as UUID,
    character: {
      name: "TestAgent",
      bio: "A test agent",
      id: "test-character" as UUID,
      ...overrides?.character,
    },
    getSetting: mock((key: string) => {
      const defaultSettings: Record<string, string> = {
        AGENTMBOX_API_KEY: "ai_test123456789",
        AGENTMBOX_MAILBOX: "test@agentmbox.com",
        AGENTMBOX_BASE_URL: "https://agentmbox.com/api/v1",
        ...settings,
      };
      return defaultSettings[key];
    }),
    useModel: mock(async () => ({
      content: "Mock response from LLM",
      success: true,
    })),
    composeState: mock(async () => ({
      values: { test: "state" },
      data: {},
      text: "Composed state",
    })),
    createMemory: mock(async () => ({ id: "memory-123" })),
    getMemories: mock(async () => []),
    getService: mock(() => null),
    registerService: mock(() => Promise.resolve()),
    ...overrides,
  };
}

export function createMockMessage(overrides?: Partial<Memory>): Memory {
  return {
    id: "msg-123" as UUID,
    entityId: "entity-123" as UUID,
    roomId: "room-123" as UUID,
    content: {
      text: "Test message",
      ...overrides?.content,
    },
    createdAt: Date.now(),
    ...overrides,
  } as Memory;
}

export function createMockState(overrides?: Partial<State>): State {
  return {
    values: {
      test: "value",
      ...overrides?.values,
    },
    data: overrides?.data || {},
    text: overrides?.text || "Test state",
  } as State;
}

export const mockEmails = [
  {
    id: "email-1",
    from: [{ name: "Alice", email: "alice@example.com" }],
    to: [{ email: "test@agentmbox.com" }],
    subject: "Hello from Alice",
    preview: "Hey, just wanted to check in...",
    textBody: "Hey, just wanted to check in about the project.",
    htmlBody: "<p>Hey, just wanted to check in about the project.</p>",
    receivedAt: "2024-01-15T10:00:00Z",
    isRead: false,
    hasAttachment: false,
  },
  {
    id: "email-2",
    from: [{ name: "Bob", email: "bob@example.com" }],
    to: [{ email: "test@agentmbox.com" }],
    subject: "Meeting tomorrow",
    preview: "Lets schedule...",
    textBody: "Lets schedule a meeting for tomorrow.",
    htmlBody: "<p>Lets schedule a meeting for tomorrow.</p>",
    receivedAt: "2024-01-14T15:30:00Z",
    isRead: true,
    hasAttachment: false,
  },
  {
    id: "email-3",
    from: [{ name: "Charlie", email: "charlie@example.com" }],
    to: [{ email: "test@agentmbox.com" }],
    subject: "Project update",
    preview: "The latest updates...",
    textBody: "Here are the latest updates on the project.",
    htmlBody: "<p>Here are the latest updates on the project.</p>",
    receivedAt: "2024-01-13T09:00:00Z",
    isRead: false,
    hasAttachment: true,
  },
];

export function createMockEmailListResponse(emails = mockEmails) {
  return {
    mailbox: "test@agentmbox.com",
    emails,
    limit: 10,
    offset: 0,
  };
}

export function createMockEmailDetailResponse(email = mockEmails[0]) {
  return { email };
}

export function createMockSendEmailResponse() {
  return { success: true };
}

export function createMockPaymentStatusResponse(paid = true) {
  return {
    paid,
    paidUntil: paid ? "2024-02-15T12:00:00Z" : null,
    solanaAddress: "ABC123...xyz",
    usdcPerPeriod: 5,
    periodDays: 30,
    creditedUsdc: paid ? 5 : 0,
    payments: paid ? [{ id: "pay-1", amount: 5, timestamp: "2024-01-15T12:00:00Z" }] : [],
  };
}
