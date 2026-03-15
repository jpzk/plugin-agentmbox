import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { AgentMBoxService } from "../services/AgentMBoxService";
import { createMockRuntime, mockEmails } from "./test-utils";
import type { IAgentRuntime } from "@elizaos/core";

describe("AgentMBoxService", () => {
  let mockRuntime: ReturnType<typeof createMockRuntime>;
  let service: AgentMBoxService;

  beforeEach(() => {
    mockRuntime = createMockRuntime({
      settings: {
        AGENTMBOX_API_KEY: "ai_test123456789",
        AGENTMBOX_MAILBOX: "test@agentmbox.com",
        AGENTMBOX_BASE_URL: "https://agentmbox.com/api/v1",
      },
    });
  });

  afterEach(async () => {
    if (service) {
      await service.stop();
    }
  });

  describe("initialization", () => {
    it("should initialize with valid settings", async () => {
      service = await AgentMBoxService.start(mockRuntime as unknown as IAgentRuntime);
      expect(service).toBeDefined();
      expect(service.serviceName).toBe("agentmbox");
    });

    it("should use default mailbox if not provided", async () => {
      mockRuntime.getSetting = mock((key: string) => {
        const settings: Record<string, string> = {
          AGENTMBOX_API_KEY: "ai_test123456789",
          AGENTMBOX_BASE_URL: "https://agentmbox.com/api/v1",
        };
        return settings[key];
      });

      service = await AgentMBoxService.start(mockRuntime as unknown as IAgentRuntime);
      expect(service).toBeDefined();
    });

    it("should not start polling without valid API key", async () => {
      mockRuntime.getSetting = mock((key: string) => {
        const settings: Record<string, string> = {
          AGENTMBOX_MAILBOX: "test@agentmbox.com",
        };
        return settings[key];
      });

      service = await AgentMBoxService.start(mockRuntime as unknown as IAgentRuntime);
      expect(service).toBeDefined();
    });
  });

  describe("getEmailStats", () => {
    it("should return correct stats when cache is empty", async () => {
      service = await AgentMBoxService.start(mockRuntime as unknown as IAgentRuntime);
      const stats = service.getEmailStats();
      expect(stats.unreadCount).toBe(0);
      expect(stats.totalCount).toBe(0);
      expect(stats.lastPollTime).toBe(0);
    });

    it("should return correct stats after emails are cached", async () => {
      service = await AgentMBoxService.start(mockRuntime as unknown as IAgentRuntime);
      (service as any).cachedEmails = mockEmails;
      (service as any).cacheTimestamp = Date.now();

      const stats = service.getEmailStats();
      expect(stats.unreadCount).toBe(2);
      expect(stats.totalCount).toBe(3);
      expect(stats.lastPollTime).toBeGreaterThan(0);
    });
  });

  describe("getCachedEmailsSync", () => {
    it("should return empty array when no emails cached", async () => {
      service = await AgentMBoxService.start(mockRuntime as unknown as IAgentRuntime);
      const emails = service.getCachedEmailsSync(10);
      expect(emails).toEqual([]);
    });

    it("should return cached emails without making API calls", async () => {
      service = await AgentMBoxService.start(mockRuntime as unknown as IAgentRuntime);
      (service as any).cachedEmails = mockEmails;
      (service as any).cacheTimestamp = Date.now();

      const emails = service.getCachedEmailsSync(2);
      expect(emails.length).toBe(2);
      expect(emails).toEqual(mockEmails.slice(0, 2));
    });

    it("should respect limit parameter", async () => {
      service = await AgentMBoxService.start(mockRuntime as unknown as IAgentRuntime);
      (service as any).cachedEmails = mockEmails;
      (service as any).cacheTimestamp = Date.now();

      const emails = service.getCachedEmailsSync(2);
      expect(emails.length).toBe(2);
    });
  });

  describe("capabilityDescription", () => {
    it("should return descriptive capability string", async () => {
      service = await AgentMBoxService.start(mockRuntime as unknown as IAgentRuntime);
      expect(service.capabilityDescription).toContain("email");
      expect(service.capabilityDescription).toContain("sending");
      expect(service.capabilityDescription).toContain("receiving");
    });
  });
});

