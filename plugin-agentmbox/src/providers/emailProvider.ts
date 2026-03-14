/**
 * Email Provider
 * Provides email context to the agent, including unread counts and recent emails
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
    description: "Provides email context from AgentMBox including unread counts and recent messages",
    get: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State
    ): Promise<ProviderResult> => {
        try {
            const service = runtime.getService<AgentMBoxService>("agentmbox");
            if (!service) {
                return {
                    text: "Email service not available",
                    values: {
                        available: false,
                    },
                };
            }

            // Get recent emails
            const emailList = await service.listEmails(10, 0);
            const unreadCount = emailList.emails.filter((e) => !e.isRead).length;
            const recentEmails = emailList.emails.slice(0, 5);

            // Format recent emails for context
            const recentEmailsText = recentEmails
                .map(
                    (email) =>
                        `- From: ${email.from[0]?.name || email.from[0]?.email || "Unknown"} | Subject: ${email.subject}${
                            !email.isRead ? " [UNREAD]" : ""
                        }`
                )
                .join("\n");

            return {
                text: `Email Status: ${unreadCount} unread of ${emailList.emails.length} total${
                    recentEmails.length > 0
                        ? `\n\nRecent Emails:\n${recentEmailsText}`
                        : "\n\nNo recent emails."
                }`,
                values: {
                    available: true,
                    unreadCount,
                    totalEmails: emailList.emails.length,
                    recentEmails: recentEmails.map((e) => ({
                        id: e.id,
                        from: e.from[0],
                        subject: e.subject,
                        preview: e.preview,
                        isRead: e.isRead,
                        receivedAt: e.receivedAt,
                    })),
                },
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
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
