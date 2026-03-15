import { describe, it, expect, beforeEach, mock } from "bun:test";
import { sendEmailAction } from "../actions/sendEmail";
import { getEmailsAction } from "../actions/getEmails";
import { createMockRuntime, createMockMessage, createMockState, mockEmails, createMockEmailListResponse, createMockEmailDetailResponse, createMockSendEmailResponse } from "./test-utils";
import type { IAgentRuntime, Memory, State } from "@elizaos/core";

describe("SEND_EMAIL Action", () => {
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
    mockMessage = createMockMessage({ content: { text: "Send an email to john@example.com" } });
    mockState = createMockState();
  });

  describe("validate", () => {
    it("should validate when service is available", async () => {
      const mockService = {
        sendEmail: async () => createMockSendEmailResponse(),
      };
      mockRuntime.getService = mock((name: string) => {
        if (name === "agentmbox") return mockService;
        return null;
      });

      const isValid = await sendEmailAction.validate(mockRuntime as unknown as IAgentRuntime, mockMessage, mockState);
      expect(isValid).toBe(true);
    });

    it("should not validate when service is not available", async () => {
      mockRuntime.getService = mock(() => null);

      const isValid = await sendEmailAction.validate(mockRuntime as unknown as IAgentRuntime, mockMessage, mockState);
      expect(isValid).toBe(false);
    });
  });

  describe("handler", () => {
    it("should send email successfully", async () => {
      const mockService = {
        sendEmail: mock(async () => createMockSendEmailResponse()),
      };
      mockRuntime.getService = mock((name: string) => {
        if (name === "agentmbox") return mockService;
        return null;
      });

      const callback = mock(async () => {});

      const result = await sendEmailAction.handler(
        mockRuntime as unknown as IAgentRuntime,
        mockMessage,
        mockState,
        {
          to: "john@example.com",
          subject: "Test Email",
          text: "This is a test email",
        },
        callback
      );

      expect(result.success).toBe(true);
      expect(mockService.sendEmail).toHaveBeenCalled();
      expect(callback).toHaveBeenCalled();
    });

    it("should throw error when missing required field to", async () => {
      const mockService = {
        sendEmail: mock(async () => createMockSendEmailResponse()),
      };
      mockRuntime.getService = mock((name: string) => {
        if (name === "agentmbox") return mockService;
        return null;
      });

      await expect(
        sendEmailAction.handler(
          mockRuntime as unknown as IAgentRuntime,
          mockMessage,
          mockState,
          {
            subject: "Test Email",
            text: "This is a test email",
          },
          undefined
        )
      ).rejects.toThrow("Missing required field");
    });

    it("should throw error when missing required field subject", async () => {
      const mockService = {
        sendEmail: mock(async () => createMockSendEmailResponse()),
      };
      mockRuntime.getService = mock((name: string) => {
        if (name === "agentmbox") return mockService;
        return null;
      });

      await expect(
        sendEmailAction.handler(
          mockRuntime as unknown as IAgentRuntime,
          mockMessage,
          mockState,
          {
            to: "john@example.com",
            text: "This is a test email",
          },
          undefined
        )
      ).rejects.toThrow("Missing required field");
    });

    it("should handle service error gracefully", async () => {
      const mockService = {
        sendEmail: mock(async () => {
          throw new Error("API Error: Rate limited");
        }),
      };
      mockRuntime.getService = mock((name: string) => {
        if (name === "agentmbox") return mockService;
        return null;
      });

      const callback = mock(async () => {});

      const result = await sendEmailAction.handler(
        mockRuntime as unknown as IAgentRuntime,
        mockMessage,
        mockState,
        {
          to: "john@example.com",
          subject: "Test Email",
          text: "This is a test email",
        },
        callback
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("API Error: Rate limited");
      expect(callback).toHaveBeenCalled();
    });
  });

  describe("examples", () => {
    it("should have valid example structure", () => {
      expect(sendEmailAction.examples).toBeDefined();
      expect(Array.isArray(sendEmailAction.examples)).toBe(true);

      for (const example of sendEmailAction.examples!) {
        expect(Array.isArray(example)).toBe(true);
        for (const message of example) {
          expect(message).toHaveProperty("name");
          expect(message).toHaveProperty("content");
        }
      }
    });
  });
});

describe("GET_EMAILS Action", () => {
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
    mockMessage = createMockMessage({ content: { text: "Check my inbox" } });
    mockState = createMockState();
  });

  describe("validate", () => {
    it("should validate when service is available", async () => {
      const mockService = {
        listEmails: async () => createMockEmailListResponse(),
      };
      mockRuntime.getService = mock((name: string) => {
        if (name === "agentmbox") return mockService;
        return null;
      });

      const isValid = await getEmailsAction.validate(mockRuntime as unknown as IAgentRuntime, mockMessage, mockState);
      expect(isValid).toBe(true);
    });

    it("should not validate when service is not available", async () => {
      mockRuntime.getService = mock(() => null);

      const isValid = await getEmailsAction.validate(mockRuntime as unknown as IAgentRuntime, mockMessage, mockState);
      expect(isValid).toBe(false);
    });
  });

  describe("handler", () => {
    it("should list emails successfully", async () => {
      const mockService = {
        listEmails: mock(async () => createMockEmailListResponse()),
      };
      mockRuntime.getService = mock((name: string) => {
        if (name === "agentmbox") return mockService;
        return null;
      });

      const callback = mock(async () => {});

      const result = await getEmailsAction.handler(
        mockRuntime as unknown as IAgentRuntime,
        mockMessage,
        mockState,
        { limit: 10, offset: 0 },
        callback
      );

      expect(result.success).toBe(true);
      expect(mockService.listEmails).toHaveBeenCalledWith(10, 0);
      expect(callback).toHaveBeenCalled();
    });

    it("should get specific email by ID", async () => {
      const mockService = {
        getEmail: mock(async () => createMockEmailDetailResponse()),
      };
      mockRuntime.getService = mock((name: string) => {
        if (name === "agentmbox") return mockService;
        return null;
      });

      const callback = mock(async () => {});

      const result = await getEmailsAction.handler(
        mockRuntime as unknown as IAgentRuntime,
        mockMessage,
        mockState,
        { emailId: "email-1" },
        callback
      );

      expect(result.success).toBe(true);
      expect(mockService.getEmail).toHaveBeenCalledWith("email-1");
      expect(callback).toHaveBeenCalled();
    });

    it("should filter by unreadOnly", async () => {
      const mockService = {
        listEmails: mock(async () => createMockEmailListResponse()),
      };
      mockRuntime.getService = mock((name: string) => {
        if (name === "agentmbox") return mockService;
        return null;
      });

      const result = await getEmailsAction.handler(
        mockRuntime as unknown as IAgentRuntime,
        mockMessage,
        mockState,
        { limit: 10, offset: 0, unreadOnly: true },
        undefined
      );

      expect(result.success).toBe(true);
      expect(result.values?.emails?.length).toBe(2);
    });

    it("should handle service error gracefully", async () => {
      const mockService = {
        listEmails: mock(async () => {
          throw new Error("API Error: Connection failed");
        }),
      };
      mockRuntime.getService = mock((name: string) => {
        if (name === "agentmbox") return mockService;
        return null;
      });

      const callback = mock(async () => {});

      const result = await getEmailsAction.handler(
        mockRuntime as unknown as IAgentRuntime,
        mockMessage,
        mockState,
        {},
        callback
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("API Error: Connection failed");
      expect(callback).toHaveBeenCalled();
    });

    it("should use default limit when not provided", async () => {
      const mockService = {
        listEmails: mock(async () => createMockEmailListResponse()),
      };
      mockRuntime.getService = mock((name: string) => {
        if (name === "agentmbox") return mockService;
        return null;
      });

      await getEmailsAction.handler(
        mockRuntime as unknown as IAgentRuntime,
        mockMessage,
        mockState,
        {},
        undefined
      );

      expect(mockService.listEmails).toHaveBeenCalledWith(10, 0);
    });
  });

  describe("examples", () => {
    it("should have valid example structure", () => {
      expect(getEmailsAction.examples).toBeDefined();
      expect(Array.isArray(getEmailsAction.examples)).toBe(true);

      for (const example of getEmailsAction.examples!) {
        expect(Array.isArray(example)).toBe(true);
        for (const message of example) {
          expect(message).toHaveProperty("name");
          expect(message).toHaveProperty("content");
        }
      }
    });
  });
});

