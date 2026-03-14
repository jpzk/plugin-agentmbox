/**
 * Get Emails Action
 * Allows the agent to retrieve emails from the mailbox via AgentMBox
 */

import {
  type Action,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  type ActionExample,
} from "@elizaos/core";
import { AgentMBoxService } from "../services/AgentMBoxService";

export const getEmailsAction: Action = {
  name: "GET_EMAILS",
  description: "Retrieve emails from the AgentMBox mailbox. Can filter by read status and limit results.",
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: Record<string, unknown>,
    callback?: HandlerCallback
  ) => {
    const service = runtime.getService<AgentMBoxService>("agentmbox");
    if (!service) {
      throw new Error("AgentMBox service not initialized");
    }

    const limit = (options.limit as number) || 10;
    const offset = (options.offset as number) || 0;
    const emailId = options.emailId as string | undefined;

    try {
      // If emailId is provided, get a specific email
      if (emailId) {
        const emailDetail = await service.getEmail(emailId);

        if (callback) {
          await callback({
            text: `Retrieved email: ${emailDetail.email.subject}`,
            values: {
              email: emailDetail.email,
            },
          });
        }

        return {
          success: true,
          values: {
            email: emailDetail.email,
          },
        };
      }

      // Otherwise, list emails
      const emailList = await service.listEmails(limit, offset);

      // Filter by read status if specified
      let emails = emailList.emails;
      const unreadOnly = options.unreadOnly as boolean;
      if (unreadOnly) {
        emails = emails.filter((email) => !email.isRead);
      }

      if (callback) {
        const preview = emails
          .slice(0, 5)
          .map((e) => `- ${e.subject} from ${e.from[0]?.email}`)
          .join("\n");
        await callback({
          text: `Found ${emails.length} emails:\n${preview}`,
          values: {
            emails: emails,
            total: emailList.emails.length,
            unread: emailList.emails.filter((e) => !e.isRead).length,
          },
        });
      }

      return {
        success: true,
        values: {
          emails: emails,
          total: emailList.emails.length,
          limit: emailList.limit,
          offset: emailList.offset,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to get emails", { error: errorMessage });

      if (callback) {
        await callback({
          text: `Failed to get emails: ${errorMessage}`,
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
        content: "Check my inbox for any new emails",
      },
      {
        name: "assistant",
        content: "Let me check your inbox for new emails.",
      },
    ],
    [
      {
        name: "user",
        content: "Show me the last 5 emails I received",
      },
      {
        name: "assistant",
        content: "I'll retrieve your recent emails.",
      },
    ],
    [
      {
        name: "user",
        content: "Get the details of that email about the meeting",
      },
      {
        name: "assistant",
        content: "Let me fetch that email for you.",
      },
    ],
  ] as ActionExample[][],
};

export default getEmailsAction;
