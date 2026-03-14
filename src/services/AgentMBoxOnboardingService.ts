/**
 * AgentMBox Onboarding Service
 * Handles autonomous account creation and setup for AgentMBox
 * The agent pays for its own subscription using its Solana wallet
 */

import { Service, type IAgentRuntime, logger } from "@elizaos/core";
import {
  type PaymentStatus,
  type PaymentCheckResponse,
  type ApiKeyResponse,
  type Mailbox,
} from "../types";

export interface OnboardingStatus {
  stage:
    | "pending"
    | "account_created"
    | "api_key_created"
    | "awaiting_payment"
    | "paid"
    | "mailbox_created"
    | "complete"
    | "error";
  paymentAddress?: string;
  mailbox?: string;
  error?: string;
}

export class AgentMBoxOnboardingService extends Service {
  private apiKey: string = "";
  private mailbox: string | undefined;
  private baseUrl: string = "https://agentmbox.com/api/v1";
  private cfg: {
    ownerEmail: string;
    password: string;
    mailboxLocalPart: string;
  } | null = null;
  private status: OnboardingStatus = { stage: "pending" };

  static serviceName = "agentmbox-onboarding" as const;
  static serviceType = "EMAIL" as const;

  constructor(runtime?: IAgentRuntime) {
    super(runtime!);
  }

  get serviceName(): string {
    return AgentMBoxOnboardingService.serviceName;
  }

  get capabilityDescription(): string {
    return "AgentMBox autonomous onboarding - creates account, pays for subscription, sets up mailbox";
  }

  getApiKey(): string {
    return this.apiKey;
  }

  getMailbox(): string | undefined {
    return this.mailbox;
  }

  private generatePassword(length: number = 32): string {
    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
      password += chars[array[i] % chars.length];
    }
    return password;
  }

  private async getAgentWallet(): Promise<{
    publicKey: string;
    privateKey: Uint8Array;
  } | null> {
    if (!this.runtime) return null;

    try {
      const privateKeyBase58 = String(
        this.runtime.getSetting("SOLANA_PRIVATE_KEY") || "",
      );
      if (privateKeyBase58) {
        const { default: bs58 } = await import("bs58");
        const { Keypair } = await import("@solana/web3.js");
        const privateKey = bs58.decode(privateKeyBase58);
        const keypair = Keypair.fromSecretKey(privateKey);
        return {
          publicKey: keypair.publicKey.toBase58(),
          privateKey,
        };
      }

      const walletService = await this.runtime.getService("wallet");
      if (walletService) {
        const keypair = await (walletService as any).getKeypair?.();
        if (keypair) {
          return {
            publicKey: keypair.publicKey.toBase58(),
            privateKey: keypair.secretKey,
          };
        }
      }
    } catch (error) {
      logger.warn("Could not get agent wallet");
    }

    return null;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    const response = await fetch(url, { ...options, headers });
    const data = await response.json();

    if (!response.ok) {
      const error = (data as { error?: string }).error || `${response.status}`;
      throw new Error(error);
    }

    return data as T;
  }

  private async authenticatedRequest<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error("API key not set");
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
      const error = (data as { error?: string }).error || `${response.status}`;
      throw new Error(error);
    }

    return data as T;
  }

  async startOnboarding(runtime: IAgentRuntime): Promise<OnboardingStatus> {
    this.runtime = runtime;

    const existingApiKey = String(
      runtime.getSetting("AGENTMBOX_API_KEY") || "",
    );
    if (existingApiKey && existingApiKey.startsWith("ai_")) {
      this.apiKey = existingApiKey;
      return await this.checkExistingSetup();
    }

    const agentName =
      runtime.character?.name?.toLowerCase().replace(/\s+/g, "-") || "agent";
    const mailboxSetting = String(
      runtime.getSetting("AGENTMBOX_MAILBOX") || "",
    );
    this.cfg = {
      ownerEmail:
        String(runtime.getSetting("AGENTMBOX_OWNER_EMAIL")) ||
        `agent-${agentName}@owner.local`,
      password: this.generatePassword(32),
      mailboxLocalPart: mailboxSetting
        ? mailboxSetting.split("@")[0]
        : agentName,
    };

    try {
      // Step 1: Create account
      await this.createAccount();
      this.status = { stage: "account_created" };
      logger.info("AgentMBox account created");

      // Step 2: Create API key
      const apiKeyResponse = await this.createApiKey(agentName);
      this.apiKey = apiKeyResponse.key;
      this.status = { stage: "api_key_created" };
      logger.info("AgentMBox API key created");

      // Step 3: Get payment address
      const payment = await this.getPaymentStatus();
      this.status = {
        stage: "awaiting_payment",
        paymentAddress: payment.solanaAddress,
      };
      logger.info("Payment address: " + payment.solanaAddress);

      // Step 4: Pay for subscription
      await this.payForSubscription(payment.solanaAddress, runtime);
      this.status = { stage: "paid" };
      logger.info("Payment completed");

      // Step 5: Create mailbox
      const mailbox = await this.createMailbox(this.cfg!.mailboxLocalPart);
      this.mailbox = mailbox.address;
      this.status = {
        stage: "complete",
        mailbox: mailbox.address,
      };
      logger.info("Mailbox created: " + mailbox.address);

      return this.status;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error("AgentMBox onboarding failed: " + errorMsg);
      this.status = { stage: "error", error: errorMsg };
      throw error;
    }
  }

  private async checkExistingSetup(): Promise<OnboardingStatus> {
    try {
      const payment = await this.getPaymentStatus();

      if (payment.paid) {
        const mailbox = await this.getOrCreateMailbox();
        this.status = mailbox
          ? { stage: "complete", mailbox: mailbox.address }
          : { stage: "paid" };
      } else {
        const wallet = await this.getAgentWallet();
        if (wallet && this.runtime) {
          await this.payForSubscription(payment.solanaAddress, this.runtime);
          this.status = { stage: "paid" };
          const mailbox = await this.getOrCreateMailbox();
          if (mailbox) {
            this.status = { stage: "complete", mailbox: mailbox.address };
          }
        } else {
          this.status = {
            stage: "awaiting_payment",
            paymentAddress: payment.solanaAddress,
          };
        }
      }
    } catch (error) {
      logger.warn("Could not check existing setup");
      this.status = { stage: "pending" };
    }

    return this.status;
  }

  private async payForSubscription(
    paymentAddress: string,
    runtime: IAgentRuntime,
  ): Promise<void> {
    const wallet = await this.getAgentWallet();

    if (!wallet) {
      logger.warn("No agent wallet found, waiting for manual payment");
      await this.waitForPayment();
      return;
    }

    logger.info("Using agent wallet to pay for subscription");

    try {
      const { Connection, Keypair } = await import("@solana/web3.js");
      const { transfer, getOrCreateAssociatedTokenAccount } =
        await import("@solana/spl-token");

      const connection = new Connection("https://api.mainnet-beta.solana.com");
      const signer = Keypair.fromSecretKey(wallet.privateKey);

      const usdcMintStr = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGZwyTDt1v";
      const { PublicKey } = await import("@solana/web3.js");
      const usdcMint = new PublicKey(usdcMintStr);
      const toPublicKey = new PublicKey(paymentAddress);

      const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        signer,
        usdcMint,
        signer.publicKey,
      );

      const toTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        signer,
        usdcMint,
        toPublicKey,
      );

      const amount = 5_000_000;

      await transfer(
        connection,
        signer,
        fromTokenAccount.address,
        toTokenAccount.address,
        signer.publicKey,
        amount,
      );

      logger.info("USDC transfer complete");
      await this.waitForPayment();
    } catch (error) {
      logger.error("Failed to transfer USDC, waiting for manual payment");
      await this.waitForPayment();
    }
  }

  async stop(): Promise<void> {
    logger.info("AgentMBox onboarding service stopped");
  }

  private async createAccount(): Promise<void> {
    if (!this.cfg) throw new Error("Config not set");

    const response = await this.request<{ id: string }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        email: this.cfg.ownerEmail,
        password: this.cfg.password,
      }),
    });

    logger.info("Account created: " + response.id);
  }

  private async createApiKey(name: string): Promise<ApiKeyResponse> {
    const response = await this.request<ApiKeyResponse>("/keys", {
      method: "POST",
      body: JSON.stringify({ name }),
    });

    logger.info("API key created: " + response.key.substring(0, 12) + "...");
    return response;
  }

  private async getPaymentStatus(): Promise<PaymentStatus> {
    return this.authenticatedRequest<PaymentStatus>("/payment");
  }

  private async waitForPayment(
    maxAttempts: number = 60,
    intervalMs: number = 5000,
  ): Promise<PaymentCheckResponse> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.authenticatedRequest<PaymentCheckResponse>(
          "/payment/check",
          {
            method: "POST",
          },
        );

        if (result.paid) {
          return result;
        }

        logger.info(
          "Waiting for payment... (" + attempt + "/" + maxAttempts + ")",
        );
      } catch (e) {
        logger.warn(
          "Payment check failed: " +
            (e instanceof Error ? e.message : "unknown"),
        );
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    throw new Error("Payment not received after " + maxAttempts + " attempts");
  }

  private async createMailbox(localPart: string): Promise<Mailbox> {
    const response = await this.authenticatedRequest<{ mailbox: Mailbox }>(
      "/mailboxes",
      {
        method: "POST",
        body: JSON.stringify({
          localPart,
          displayName: this.cfg?.mailboxLocalPart || "Agent Mailbox",
        }),
      },
    );

    return response.mailbox;
  }

  async getOrCreateMailbox(): Promise<Mailbox | null> {
    try {
      const response = await this.authenticatedRequest<{
        mailboxes: Mailbox[];
      }>("/mailboxes");

      if (response.mailboxes.length > 0) {
        return response.mailboxes[0];
      }

      if (this.cfg?.mailboxLocalPart) {
        return await this.createMailbox(this.cfg.mailboxLocalPart);
      }

      return null;
    } catch (error) {
      logger.error("Failed to get/create mailbox");
      return null;
    }
  }

  getStatus(): OnboardingStatus {
    return this.status;
  }

  async getPaymentAddress(): Promise<string | null> {
    if (this.status.paymentAddress) {
      return this.status.paymentAddress;
    }

    try {
      const payment = await this.getPaymentStatus();
      return payment.solanaAddress;
    } catch {
      return null;
    }
  }

  isOnboardingComplete(): boolean {
    return this.status.stage === "complete";
  }
}

export default AgentMBoxOnboardingService;
