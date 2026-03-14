/**
 * AgentMBox Plugin for ElizaOS
 * Email integration plugin that enables AI agents to send and receive emails
 * Includes email polling for incoming emails
 */

import type { Plugin } from "@elizaos/core";
import { AgentMBoxService } from "./services/AgentMBoxService";
import { sendEmailAction } from "./actions/sendEmail";
import { getEmailsAction } from "./actions/getEmails";
import { onboardingAction } from "./actions/onboarding";
import { emailProvider } from "./providers/emailProvider";

export const agentMBoxPlugin: Plugin = {
  name: "agentmbox",
  description:
    "AgentMBox email integration plugin for ElizaOS - enables AI agents to send/receive emails with email polling",
  priority: 0,
  config: {
    baseUrl: "https://agentmbox.com/api/v1",
    pollingInterval: 300000, // 5 minutes
  },
  actions: [sendEmailAction, getEmailsAction, onboardingAction],
  providers: [emailProvider],
  services: [AgentMBoxService],
};

export default agentMBoxPlugin;

// Re-export for convenience
export { AgentMBoxService } from "./services/AgentMBoxService";
export * from "./types";
