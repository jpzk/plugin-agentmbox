import { Service, type IAgentRuntime, logger } from "@elizaos/core";
import {
  type AgentMBoxConfig,
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

export class AgentMBoxService extends Service {
  private apiKey: string = "";
  private mailbox: string | undefined;
  private baseUrl: string = "https://agentmbox.com/api/v1";

  static serviceName = "agentmbox" as const;
  static serviceType = "agentmbox" as const;

  constructor(runtime?: IAgentRuntime) {
    super(runtime!);
  }

  get serviceName(): string {
    return AgentMBoxService.serviceName;
  }

  get capabilityDescription(): string {
    return "AgentMBox email service - allows sending and receiving emails";
  }

  async initialize(runtime: IAgentRuntime): Promise<void> {
    const apiKey = String(runtime.getSetting("AGENTMBOX_API_KEY") || "");
    const mailbox = String(runtime.getSetting("AGENTMBOX_MAILBOX") || "");
    const baseUrl = String(runtime.getSetting("AGENTMBOX_BASE_URL") || "");

    // API key will be set by onboarding if not provided
    // The service will work once onboarding completes
    if (apiKey && !apiKey.startsWith("ai_")) {
      logger.warn("AgentMBox API key should start with 'ai_'");
    }

    const agentName =
      runtime.character?.name?.toLowerCase().replace(/\s+/g, "-") || "agent";
    const defaultMailbox = mailbox || `${agentName}@agentmbox.com`;

    this.apiKey = apiKey;
    this.mailbox = defaultMailbox;
    this.baseUrl = baseUrl || "https://agentmbox.com/api/v1";
    this.runtime = runtime;

    if (!this.apiKey.startsWith("ai_")) {
      logger.warn("AgentMBox API key should start with 'ai_'");
    }

    logger.info("AgentMBox service initialized for: " + this.mailbox);
  }

  async stop(): Promise<void> {
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
}

export default AgentMBoxService;
