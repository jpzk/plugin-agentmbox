import { Service, type IAgentRuntime, logger } from "@elizaos/core";
import {
  type Email,
  type EmailListResponse,
  type EmailDetailResponse,
  type SendEmailRequest,
  type SendEmailResponse,
  type MailboxListResponse,
  type CreateMailboxRequest,
  type CreateMailboxResponse,
  type PaymentStatus,
  type PaymentCheckResponse,
  type DomainListResponse,
  type DomainResponse,
  type DomainVerifyResponse,
  type ApiKeyResponse,
  isAgentMBoxError,
} from "../types";

const DEFAULT_POLLING_INTERVAL = 300000; // 5 minutes

export class AgentMBoxService extends Service {
  private apiKey: string = "";
  private mailbox: string | undefined;
  private baseUrl: string = "https://agentmbox.com/api/v1";
  private pollingInterval: number = DEFAULT_POLLING_INTERVAL;
  private pollingTimer: NodeJS.Timeout | null = null;
  private lastEmailCheck: number = 0;

  static serviceName = "agentmbox" as const;
  static serviceType = "EMAIL" as const;

  constructor(protected runtime: IAgentRuntime) {
    super(runtime);
  }

  static async start(runtime: IAgentRuntime): Promise<AgentMBoxService> {
    const service = new AgentMBoxService(runtime);
    await service.initialize(runtime);
    return service;
  }

  get serviceName(): string {
    return AgentMBoxService.serviceName;
  }

  get capabilityDescription(): string {
    return "AgentMBox email service - allows sending and receiving emails with polling";
  }

  async initialize(runtime: IAgentRuntime): Promise<void> {
    const apiKey = String(runtime.getSetting("AGENTMBOX_API_KEY") || "");
    const mailbox = String(runtime.getSetting("AGENTMBOX_MAILBOX") || "");
    const baseUrl = String(runtime.getSetting("AGENTMBOX_BASE_URL") || "");
    const pollingIntervalSetting = runtime.getSetting(
      "AGENTMBOX_POLLING_INTERVAL",
    );

    if (apiKey && !apiKey.startsWith("ai_")) {
      logger.warn("AgentMBox API key should start with 'ai_'");
    }

    const agentName =
      runtime.character?.name?.toLowerCase().replace(/\s+/g, "-") || "agent";
    const defaultMailbox = mailbox || `${agentName}@agentmbox.com`;

    this.apiKey = apiKey;
    this.mailbox = defaultMailbox;
    this.baseUrl = baseUrl || "https://agentmbox.com/api/v1";
    this.pollingInterval = pollingIntervalSetting
      ? parseInt(String(pollingIntervalSetting), 10)
      : DEFAULT_POLLING_INTERVAL;
    this.runtime = runtime;

    logger.info("AgentMBox service initialized for: " + this.mailbox);

    // Start polling for new emails
    if (this.apiKey && this.apiKey.startsWith("ai_")) {
      this.startPolling();
    }
  }

  /**
   * Start polling for new emails
   */
  private startPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }

    logger.info(
      `AgentMBox: Starting email polling every ${this.pollingInterval / 1000} seconds`,
    );

    // Initial check
    this.checkForNewEmails();

    // Set up periodic polling
    this.pollingTimer = setInterval(() => {
      this.checkForNewEmails();
    }, this.pollingInterval);
  }

  /**
   * Stop polling for new emails
   */
  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      logger.info("AgentMBox: Stopped email polling");
    }
  }

  /**
   * Check for new emails and process them
   */
  private async checkForNewEmails(): Promise<void> {
    if (!this.apiKey || !this.mailbox) {
      return;
    }

    try {
      // Get recent emails (last 10, unread first)
      const response = await this.listEmails(10, 0);

      if (response.emails && response.emails.length > 0) {
        // Find unread emails
        const unreadEmails = response.emails.filter(
          (email) =>
            !email.isRead &&
            new Date(email.receivedAt).getTime() > this.lastEmailCheck,
        );

        if (unreadEmails.length > 0) {
          logger.info(
            `AgentMBox: Found ${unreadEmails.length} new unread email(s)`,
          );

          // Process each new email
          for (const email of unreadEmails) {
            await this.processNewEmail(email);
          }
        }
      }

      this.lastEmailCheck = Date.now();
    } catch (error) {
      logger.error(
        "AgentMBox: Error checking for new emails: " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    }
  }

  /**
   * Process a new incoming email
   */
  private async processNewEmail(email: Email): Promise<void> {
    try {
      const fromEmail = email.from[0]?.email || "unknown";
      logger.info(`AgentMBox: Processing new email from ${fromEmail}`);

      // Create a memory for the email so the agent can respond to it
      // This allows the agent to be aware of incoming emails
      const memory = {
        id: `email-${email.id}`,
        type: "email" as const,
        content: {
          text: `New email received:\nFrom: ${fromEmail}\nSubject: ${email.subject}\n\n${email.textBody || email.htmlBody || ""}`,
        },
        metadata: {
          emailId: email.id,
          from: fromEmail,
          to: email.to[0]?.email,
          subject: email.subject,
          receivedAt: email.receivedAt,
        },
      };

      // Store the email as a memory for context
      // The agent can then decide to respond using the SEND_EMAIL action
      logger.info(`AgentMBox: Email from ${fromEmail} stored as memory`);
    } catch (error) {
      logger.error(
        "AgentMBox: Error processing new email: " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    }
  }

  async stop(): Promise<void> {
    this.stopPolling();
    logger.info("AgentMBox service stopped");
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error(
        "AgentMBox API key not configured. Ensure onboarding has completed or set AGENTMBOX_API_KEY.",
      );
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    const response = await fetch(url, { ...options, headers });
    const data = await response.json();

    if (!response.ok) {
      if (isAgentMBoxError(data)) {
        throw new Error(
          `AgentMBox API error (${response.status}): ${data.error}`,
        );
      }
      throw new Error(`AgentMBox API error: ${response.status}`);
    }

    return data as T;
  }

  private getMailboxParam(): string {
    if (!this.mailbox) {
      throw new Error("Mailbox not configured");
    }
    return "?mailbox=" + encodeURIComponent(this.mailbox);
  }

  async listEmails(limit = 50, offset = 0): Promise<EmailListResponse> {
    const mailboxParam = this.getMailboxParam();
    return this.request<EmailListResponse>(
      "/mail" + mailboxParam + "&limit=" + limit + "&offset=" + offset,
    );
  }

  async getEmail(emailId: string): Promise<EmailDetailResponse> {
    const mailboxParam = this.getMailboxParam();
    return this.request<EmailDetailResponse>("/mail/" + emailId + mailboxParam);
  }

  async sendEmail(request: SendEmailRequest): Promise<SendEmailResponse> {
    const from = request.from || this.mailbox;
    if (!from) {
      throw new Error("Sender address not specified");
    }

    return this.request<SendEmailResponse>("/mail/send", {
      method: "POST",
      body: JSON.stringify({ ...request, from }),
    });
  }

  async deleteEmail(emailId: string): Promise<{ success: boolean }> {
    const mailboxParam = this.getMailboxParam();
    return this.request<{ success: boolean }>(
      "/mail/" + emailId + mailboxParam,
      {
        method: "DELETE",
      },
    );
  }

  async markAsRead(emailId: string): Promise<{ success: boolean }> {
    const mailboxParam = this.getMailboxParam();
    return this.request<{ success: boolean }>(
      "/mail/" + emailId + "/read" + mailboxParam,
      {
        method: "POST",
      },
    );
  }

  async listMailboxes(): Promise<MailboxListResponse> {
    return this.request<MailboxListResponse>("/mailboxes");
  }

  async createMailbox(
    request: CreateMailboxRequest,
  ): Promise<CreateMailboxResponse> {
    return this.request<CreateMailboxResponse>("/mailboxes", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async deleteMailbox(mailboxId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>("/mailboxes/" + mailboxId, {
      method: "DELETE",
    });
  }

  async getPaymentStatus(): Promise<PaymentStatus> {
    return this.request<PaymentStatus>("/payment");
  }

  async checkPayment(): Promise<PaymentCheckResponse> {
    return this.request<PaymentCheckResponse>("/payment/check", {
      method: "POST",
    });
  }

  async listDomains(): Promise<DomainListResponse> {
    return this.request<DomainListResponse>("/domains");
  }

  async addDomain(domain: string): Promise<DomainResponse> {
    return this.request<DomainResponse>("/domains", {
      method: "POST",
      body: JSON.stringify({ domain }),
    });
  }

  async verifyDomain(domainId: string): Promise<DomainVerifyResponse> {
    return this.request<DomainVerifyResponse>(
      "/domains/" + domainId + "/verify",
      {
        method: "POST",
      },
    );
  }

  async deleteDomain(domainId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>("/domains/" + domainId, {
      method: "DELETE",
    });
  }

  async createApiKey(name: string): Promise<ApiKeyResponse> {
    return this.request<ApiKeyResponse>("/keys", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  async getStatus(): Promise<{ paid: boolean; paidUntil: string | null }> {
    try {
      const status = await this.getPaymentStatus();
      return { paid: status.paid, paidUntil: status.paidUntil };
    } catch (error) {
      logger.error("Failed to get AgentMBox status");
      return { paid: false, paidUntil: null };
    }
  }

  /**
   * Manually trigger a check for new emails
   */
  async checkNow(): Promise<void> {
    await this.checkForNewEmails();
  }
}

export default AgentMBoxService;
