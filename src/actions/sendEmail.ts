/**
 * Send Email Action
 * Allows the agent to send emails via AgentMBox
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
import { AgentMBoxService } from "../services/AgentMBoxService";

export const sendEmailAction: Action = {
  name: "SEND_EMAIL",
  description: "Send an email to a recipient using AgentMBox email service",
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    const service = runtime.getService<AgentMBoxService>("agentmbox");
    if (!service) {
      throw new Error("AgentMBox service not initialized");
    }

    const { to, subject, text, html } = options;

    if (!to) {
      throw new Error("Missing required field: 'to' (recipient email)");
    }

    if (!subject) {
      throw new Error("Missing required field: 'subject'");
    }

    const from = options.from as string | undefined;

    try {
      const result = await service.sendEmail({
        from,
        to: Array.isArray(to) ? to : to,
        subject,
        text: text as string | undefined,
        html: html as string | undefined,
      });

      if (callback) {
        await callback({
          text: `Email sent successfully to ${to}`,
          values: {
            success: result.success,
            recipient: to,
            subject,
          },
        });
      }

      return {
        success: true,
        values: {
          sentTo: to,
          subject,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to send email", { error: errorMessage });

      if (callback) {
        await callback({
          text: `Failed to send email: ${errorMessage}`,
          values: {
            success: false,
            error: errorMessage,
          },
        });
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
  validate: async (runtime: IAgentRuntime) => {
    try {
      const service = runtime.getService<AgentMBoxService>("agentmbox");
      return !!service;
    } catch {
      return false;
    }
  },
  examples: [
    [
      {
        name: "user",
        content: "Send an email to john@example.com about the project update",
      },
      {
        name: "assistant",
        content: "I'll send that email for you.",
      },
    ],
    [
      {
        name: "user",
        content: "Email the team that the meeting is at 3pm",
      },
      {
        name: "assistant",
        content: "Sending that email now.",
      },
    ],
    [
      {
        name: "user",
        content: "Can you notify alice@example.com that the report is ready?",
      },
      {
        name: "assistant",
        content: "I'll send her an email right away.",
      },
    ],
  ] as ActionExample[][],
};

export default sendEmailAction;
