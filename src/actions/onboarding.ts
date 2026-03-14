/**
 * Onboarding Action
 * Allows the agent to self-onboard with AgentMBox - creates account, pays for subscription, sets up mailbox
 */

import {
  type Action,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  type ActionExample,
  logger,
} from "@elizaos/core";
import { AgentMBoxOnboardingService } from "../services/AgentMBoxOnboardingService";

export const onboardingAction: Action = {
  name: "AGENTMBOX_ONBOARDING",
  description:
    "Set up AgentMBox email for the agent - creates an account, pays 5 USDC on Solana, and creates a mailbox. The agent needs a Solana wallet with USDC to pay for the subscription.",
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    _options: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    const onboardingService = runtime.getService<AgentMBoxOnboardingService>(
      "agentmbox-onboarding",
    );

    if (!onboardingService) {
      const errorMsg = "AgentMBox onboarding service not initialized";
      logger.error(errorMsg);
      if (callback) {
        await callback({
          text: errorMsg,
          values: { success: false, error: errorMsg },
        });
      }
      return { success: false, error: errorMsg };
    }

    // Check if already onboarded
    if (onboardingService.isOnboardingComplete()) {
      const mailbox = onboardingService.getMailbox();
      const msg = `Already onboarded! Mailbox: ${mailbox}`;
      logger.info(msg);
      if (callback) {
        await callback({
          text: msg,
          values: { success: true, mailbox },
        });
      }
      return { success: true, mailbox };
    }

    try {
      logger.info("Starting AgentMBox onboarding...");
      const status = await onboardingService.startOnboarding(runtime);

      if (callback) {
        await callback({
          text: `Onboarding ${status.stage}: ${
            status.mailbox || status.paymentAddress || status.error || ""
          }`,
          values: {
            success: status.stage === "complete",
            stage: status.stage,
            mailbox: status.mailbox,
            paymentAddress: status.paymentAddress,
            error: status.error,
          },
        });
      }

      if (status.stage === "complete" && status.mailbox) {
        // Save credentials to runtime settings
        const apiKey = onboardingService.getApiKey();
        const mailbox = onboardingService.getMailbox();
        if (apiKey) {
          runtime.setSetting("AGENTMBOX_API_KEY", apiKey, true);
        }
        if (mailbox) {
          runtime.setSetting("AGENTMBOX_MAILBOX", mailbox);
        }
        logger.info("Onboarding complete! Mailbox: " + status.mailbox);
        return { success: true, mailbox: status.mailbox };
      } else if (status.stage === "awaiting_payment" && status.paymentAddress) {
        const msg =
          "Payment required! Please send 5 USDC to: " + status.paymentAddress;
        logger.warn(msg);
        return {
          success: false,
          stage: status.stage,
          paymentAddress: status.paymentAddress,
          message: msg,
        };
      } else if (status.stage === "error") {
        const errorMsg = "Onboarding failed: " + status.error;
        logger.error(errorMsg);
        return { success: false, error: status.error };
      }

      return { success: true, stage: status.stage };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Onboarding failed: " + errorMessage);

      if (callback) {
        await callback({
          text: "Onboarding failed: " + errorMessage,
          values: { success: false, error: errorMessage },
        });
      }

      return { success: false, error: errorMessage };
    }
  },
  validate: async (runtime: IAgentRuntime) => {
    try {
      const service = runtime.getService<AgentMBoxOnboardingService>(
        "agentmbox-onboarding",
      );
      return !!service;
    } catch {
      return false;
    }
  },
  examples: [
    [
      {
        name: "user",
        content: "Set up email for this agent",
      },
      {
        name: "assistant",
        content:
          "I'll set up AgentMBox email for you. This will create an account and pay 5 USDC from the agent's wallet.",
      },
    ],
    [
      {
        name: "user",
        content: "I need to configure the email service",
      },
      {
        name: "assistant",
        content: "Starting the AgentMBox onboarding process now.",
      },
    ],
    [
      {
        name: "user",
        content: "Can you set up a mailbox for receiving emails?",
      },
      {
        name: "assistant",
        content: "On it! I'll create the mailbox and handle the payment.",
      },
    ],
  ] as ActionExample[][],
};

export default onboardingAction;
