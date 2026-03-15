/**
 * Email Provider
 * Provides email context to the agent using cached data from the polling service
 * NEVER makes API calls - only reads from the last polled emails
 */

import {
  type Provider,
  type IAgentRuntime,
  type Memory,
  type State,
  type ProviderResult,
} from "@elizaos/core";
import { AgentMBoxService } from "../services/AgentMBoxService";

export const emailProvider: Provider = {
  name: "email",
  description:
    "Provides email context from AgentMBox - reads from cached polling data only, never makes API calls",
  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> => {
    try {
      const service = runtime.getService<AgentMBoxService>("agentmbox");
      if (!service) {
        return {
          text: "Email service not initialized",
          values: {
            available: false,
          },
        };
      }

      // Get email stats from the polling cache - NO API call
      const stats = service.getEmailStats();
      const emails = service.getCachedEmailsSync(10);

      // If no emails have been polled yet
      if (emails.length === 0) {
        return {
          text: "Email service is running but no emails have been received yet. The agent will be notified when new emails arrive.",
          values: {
            available: true,
            unreadCount: 0,
            totalEmails: 0,
            recentEmails: [],
            cacheStatus: "empty",
          },
        };
      }

      // Format recent emails for context
      const recentEmailsText = emails
        .slice(0, 5)
        .map(
          (email) =>
            `- From: ${email.from[0]?.name || email.from[0]?.email || "Unknown"} | Subject: ${email.subject}${
              !email.isRead ? " [UNREAD]" : ""
            }`,
        )
        .join("\n");

      const lastPollTime = stats.lastPollTime
        ? new Date(stats.lastPollTime).toLocaleTimeString()
        : "unknown";

      return {
        text: `Email Status: ${stats.unreadCount} unread of ${stats.totalCount} total (last poll: ${lastPollTime})${
          emails.length > 0
            ? `\n\nRecent Emails:\n${recentEmailsText}`
            : "\n\nNo recent emails."
        }`,
        values: {
          available: true,
          unreadCount: stats.unreadCount,
          totalEmails: stats.totalCount,
          lastPollTime: stats.lastPollTime,
          recentEmails: emails.slice(0, 5).map((e) => ({
            id: e.id,
            from: e.from[0],
            subject: e.subject,
            preview: e.preview,
            isRead: e.isRead,
            receivedAt: e.receivedAt,
          })),
          cacheStatus: stats.cached ? "fresh" : "stale",
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        text: `Email service error: ${errorMessage}`,
        values: {
          available: false,
          error: errorMessage,
        },
      };
    }
  },
};

export default emailProvider;
