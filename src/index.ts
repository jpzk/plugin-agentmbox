/**
 * AgentMBox Plugin for ElizaOS
 * Email integration plugin that enables AI agents to send and receive emails
 * Includes autonomous self-onboarding using the agent's Solana wallet
 */

import type { Plugin, IAgentRuntime } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { AgentMBoxService } from "./services/AgentMBoxService";
import { AgentMBoxOnboardingService } from "./services/AgentMBoxOnboardingService";
import { sendEmailAction } from "./actions/sendEmail";
import { getEmailsAction } from "./actions/getEmails";
import { onboardingAction } from "./actions/onboarding";
import { emailProvider } from "./providers/emailProvider";

export const agentMBoxPlugin: Plugin = {
  name: "agentmbox",
  description:
    "AgentMBox email integration plugin for ElizaOS - enables AI agents to send/receive emails with autonomous onboarding",
  priority: 0,
  config: {
    baseUrl: "https://agentmbox.com/api/v1",
  },
  actions: [sendEmailAction, getEmailsAction, onboardingAction],
  providers: [emailProvider],
  services: [AgentMBoxService, AgentMBoxOnboardingService],
  init: async (config: Record<string, string>, runtime: IAgentRuntime) => {
    logger.info("AgentMBox plugin initializing");

    // Check if onboarding is needed
    const existingApiKey = runtime.getSetting("AGENTMBOX_API_KEY");
    const skipOnboarding =
      runtime.getSetting("AGENTMBOX_SKIP_ONBOARDING") === "true";

    if (!existingApiKey && !skipOnboarding) {
      logger.info("Starting AgentMBox autonomous onboarding...");

      try {
        const onboardingService =
          runtime.getService<AgentMBoxOnboardingService>(
            "agentmbox-onboarding",
          );
        if (onboardingService) {
          const status = await onboardingService.startOnboarding(runtime);

          if (status.stage === "complete" && status.mailbox) {
            // Save credentials to runtime settings for persistence
            const apiKey = onboardingService.getApiKey();
            const mailbox = onboardingService.getMailbox();
            if (apiKey) {
              runtime.setSetting("AGENTMBOX_API_KEY", apiKey, true);
            }
            if (mailbox) {
              runtime.setSetting("AGENTMBOX_MAILBOX", mailbox);
            }
            logger.info("Onboarding complete! Mailbox: " + status.mailbox);
          } else if (
            status.stage === "awaiting_payment" &&
            status.paymentAddress
          ) {
            logger.warn(
              "Payment required. Please fund: " + status.paymentAddress,
            );
            logger.info("Required: 5 USDC on Solana + ~0.01 SOL for fees");
          }
        }
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        logger.error("Onboarding failed: " + errorMsg);
      }
    } else if (existingApiKey) {
      logger.info("Using existing AgentMBox configuration");
    } else {
      logger.info("Onboarding skipped per configuration");
    }

    // Initialize main email service (after onboarding has potentially saved credentials)
    const emailService = runtime.getService<AgentMBoxService>("agentmbox");
    if (emailService) {
      try {
        await emailService.initialize(runtime);
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(
          "Failed to initialize AgentMBox email service: " + errorMsg,
        );
        // Don't fail the whole plugin initialization - the service will be unavailable
      }
    }
  },
};

export default agentMBoxPlugin;

// Re-export for convenience
export { AgentMBoxService } from "./services/AgentMBoxService";
export { AgentMBoxOnboardingService } from "./services/AgentMBoxOnboardingService";
export * from "./types";
