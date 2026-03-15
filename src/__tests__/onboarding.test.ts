import { describe, it, expect, mock } from "bun:test";
import type { IAgentRuntime, Memory, UUID, State } from "@elizaos/core";
import { onboardingAction } from "../actions/onboarding";

function generateId(): UUID {
  return crypto.randomUUID() as UUID;
}

describe("Onboarding Action", () => {
  describe("validate", () => {
    it("should always validate", async () => {
      const runtime = {} as IAgentRuntime;
      const message = {} as Memory;
      const state = {} as State;
      const isValid = await onboardingAction.validate(runtime, message, state);
      expect(isValid).toBe(true);
    });
  });

  describe("handler structure", () => {
    it("should have required fields", () => {
      expect(onboardingAction.name).toBe("AGENTMBOX_ONBOARDING");
      expect(onboardingAction.description).toBeDefined();
      expect(typeof onboardingAction.handler).toBe("function");
      expect(typeof onboardingAction.validate).toBe("function");
    });
  });

  describe("examples", () => {
    it("should have valid example structure", () => {
      expect(onboardingAction.examples).toBeDefined();
      expect(Array.isArray(onboardingAction.examples)).toBe(true);

      for (const example of onboardingAction.examples!) {
        expect(Array.isArray(example)).toBe(true);
        for (const msg of example) {
          expect(msg).toHaveProperty("name");
          expect(msg).toHaveProperty("content");
        }
      }
    });
  });

  describe("already onboarded detection", () => {
    it("should return success when API key and mailbox already exist", async () => {
      const runtime = {
        getSetting: (key: string) => {
          if (key === "AGENTMBOX_API_KEY") return "ai_existing_key";
          if (key === "AGENTMBOX_MAILBOX") return "test@agentmbox.com";
          return null;
        },
      } as unknown as IAgentRuntime;

      const message = {
        id: generateId(),
        entityId: generateId(),
        roomId: generateId(),
        content: { text: "Set up email" },
      } as Memory;

      const state = { values: {}, data: {}, text: "" } as State;

      const result = await onboardingAction.handler(
        runtime,
        message,
        state,
        {},
      );

      expect(result.success).toBe(true);
      expect(result.mailbox).toBe("test@agentmbox.com");
    });
  });

  describe("new onboarding flow", () => {
    it("should attempt to create account when no existing credentials", async () => {
      let savedState = false;

      const runtime = {
        agentId: generateId(),
        character: {
          name: "TestAgent",
          bio: "Test agent",
          id: generateId(),
        },
        getSetting: (key: string) => {
          if (key === "AGENTMBOX_API_KEY") return "";
          if (key === "AGENTMBOX_MAILBOX") return "";
          return null;
        },
        setSetting: mock((key: string, value: string) => {
          if (key === "AGENTMBOX_ONBOARDING_STATE") {
            savedState = true;
          }
        }),
      } as unknown as IAgentRuntime;

      const message = {
        id: generateId(),
        entityId: generateId(),
        roomId: generateId(),
        content: { text: "Set up email" },
      } as Memory;

      const state = { values: {}, data: {}, text: "" } as State;

      // This will fail on network but should save state
      try {
        await onboardingAction.handler(runtime, message, state, {});
      } catch {
        // Expected - no real server
      }

      // State should be saved for resume capability
      expect(savedState).toBe(true);
    });
  });
});
