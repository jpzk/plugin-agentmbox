import { describe, it, expect, beforeEach, mock } from "bun:test";
import { emailProvider } from "../providers/emailProvider";
import { createMockRuntime, createMockMessage, createMockState, mockEmails } from "./test-utils";
import type { IAgentRuntime, Memory, State } from "@elizaos/core";

describe("emailProvider", () => {
  let mockRuntime: ReturnType<typeof createMockRuntime>;
  let mockMessage: Memory;
  let mockState: State;

  beforeEach(() => {
    mockRuntime = createMockRuntime({
      settings: {
        AGENTMBOX_API_KEY: "ai_test123456789",
        AGENTMBOX_MAILBOX: "test@agentmbox.com",
      },
    });
    mockMessage = createMockMessage();
    mockState = createMockState();
  });

  describe("get", () => {
    it("should return not available when service is null", async () => {
      mockRuntime.getService = mock(() => null);

      const result = await emailProvider.get(
        mockRuntime as unknown as IAgentRuntime,
        mockMessage,
        mockState
      );

      expect(result.values?.available).toBe(false);
      expect(result.text).toContain("not initialized");
    });

    it("should return empty state when no emails cached yet", async () => {
      const mockService = {
        getEmailStats: mock(() => ({
          unreadCount: 0,
          totalCount: 0,
          lastPollTime: 0,
        })),
        getCachedEmailsSync: mock(() => []),
      };
      mockRuntime.getService = mock(() => mockService);

      const result = await emailProvider.get(
        mockRuntime as unknown as IAgentRuntime,
        mockMessage,
        mockState
      );

      expect(result.values?.available).toBe(true);
      expect(result.values?.unreadCount).toBe(0);
      expect(result.values?.totalEmails).toBe(0);
      expect(result.values?.cacheStatus).toBe("empty");
      expect(result.text).toContain("no emails have been received yet");
    });

    it("should return email context from cached data", async () => {
      const mockService = {
        getEmailStats: mock(() => ({
          unreadCount: 2,
          totalCount: 3,
          lastPollTime: Date.now(),
        })),
        getCachedEmailsSync: mock(() => mockEmails),
      };
      mockRuntime.getService = mock(() => mockService);

      const result = await emailProvider.get(
        mockRuntime as unknown as IAgentRuntime,
        mockMessage,
        mockState
      );

      expect(result.values?.available).toBe(true);
      expect(result.values?.unreadCount).toBe(2);
      expect(result.values?.totalEmails).toBe(3);
      expect(result.values?.recentEmails).toBeDefined();
      // Only 3 mock emails exist
      expect(result.values?.recentEmails?.length).toBe(3);
      expect(result.text).toContain("unread");
      expect(result.text).toContain("Recent Emails");
    });

    it("should include last poll time in output", async () => {
      const pollTime = new Date("2024-01-15T10:00:00Z").getTime();
      const mockService = {
        getEmailStats: mock(() => ({
          unreadCount: 1,
          totalCount: 1,
          lastPollTime: pollTime,
        })),
        getCachedEmailsSync: mock(() => [mockEmails[0]]),
      };
      mockRuntime.getService = mock(() => mockService);

      const result = await emailProvider.get(
        mockRuntime as unknown as IAgentRuntime,
        mockMessage,
        mockState
      );

      expect(result.values?.lastPollTime).toBe(pollTime);
      expect(result.text).toContain("last poll:");
    });

    it("should format recent emails with read status", async () => {
      const mockService = {
        getEmailStats: mock(() => ({
          unreadCount: 1,
          totalCount: 2,
          lastPollTime: Date.now(),
        })),
        getCachedEmailsSync: mock(() => mockEmails),
      };
      mockRuntime.getService = mock(() => mockService);

      const result = await emailProvider.get(
        mockRuntime as unknown as IAgentRuntime,
        mockMessage,
        mockState
      );

      expect(result.text).toContain("[UNREAD]");
    });

    it("should handle service errors gracefully", async () => {
      mockRuntime.getService = mock(() => {
        throw new Error("Service unavailable");
      });

      const result = await emailProvider.get(
        mockRuntime as unknown as IAgentRuntime,
        mockMessage,
        mockState
      );

      expect(result.values?.available).toBe(false);
      expect(result.values?.error).toBeDefined();
      expect(result.text).toContain("error");
    });

    it("should not make API calls (read from cache only)", async () => {
      const mockService = {
        getEmailStats: mock(() => ({
          unreadCount: 1,
          totalCount: 1,
          lastPollTime: Date.now(),
        })),
        getCachedEmailsSync: mock(() => [mockEmails[0]]),
      };
      mockRuntime.getService = mock(() => mockService);

      await emailProvider.get(mockRuntime as unknown as IAgentRuntime, mockMessage, mockState);
      await emailProvider.get(mockRuntime as unknown as IAgentRuntime, mockMessage, mockState);
      await emailProvider.get(mockRuntime as unknown as IAgentRuntime, mockMessage, mockState);

      expect(mockService.getCachedEmailsSync).toHaveBeenCalledTimes(3);
      expect(mockService.getEmailStats).toHaveBeenCalledTimes(3);
    });
  });

  describe("provider structure", () => {
    it("should have required fields", () => {
      expect(emailProvider.name).toBe("email");
      expect(emailProvider.description).toBeDefined();
      expect(typeof emailProvider.get).toBe("function");
    });
  });
});

