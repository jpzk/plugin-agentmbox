/**
 * Onboarding Action
 * Allows the agent to self-onboard with AgentMBox - creates account, pays for subscription, sets up mailbox
 * Supports resuming interrupted onboarding flows
 * Credentials are stored in the runtime's database for persistence
 * Based on: https://www.agentmbox.com/llm.txt
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
import { credentialsTable } from "../types/schema";

interface OnboardingStatus {
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

interface OnboardingState {
  stage: OnboardingStatus["stage"];
  ownerEmail?: string;
  password?: string;
  sessionCookie?: string;
  apiKey?: string;
  paymentAddress?: string;
  agentName?: string;
}

const BASE_URL = "https://agentmbox.com/api/v1";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGZwyTDt1v";
const PAYMENT_AMOUNT = 5_000_000; // 5 USDC in lamports

// Settings keys for intermediate state
const SETTINGS = {
  API_KEY: "AGENTMBOX_API_KEY",
  MAILBOX: "AGENTMBOX_MAILBOX",
  ONBOARDING_STATE: "AGENTMBOX_ONBOARDING_STATE",
  SOLANA_PRIVATE_KEY: "SOLANA_PRIVATE_KEY",
};

function generatePassword(length: number = 32): string {
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

function getOnboardingState(runtime: IAgentRuntime): OnboardingState | null {
  const stateJson = runtime.getSetting(SETTINGS.ONBOARDING_STATE);
  if (!stateJson) return null;
  try {
    return JSON.parse(stateJson) as OnboardingState;
  } catch {
    return null;
  }
}

function saveOnboardingState(runtime: IAgentRuntime, state: OnboardingState) {
  runtime.setSetting(SETTINGS.ONBOARDING_STATE, JSON.stringify(state), true);
}

function clearOnboardingState(runtime: IAgentRuntime) {
  runtime.setSetting(SETTINGS.ONBOARDING_STATE, "", true);
}

async function getAgentWallet(runtime: IAgentRuntime) {
  try {
    const privateKeyBase58 = String(
      runtime.getSetting(SETTINGS.SOLANA_PRIVATE_KEY) || "",
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

    const walletService = await runtime.getService("wallet");
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

export const onboardingAction: Action = {
  name: "AGENTMBOX_ONBOARDING",
  description:
    "Set up AgentMBox email for the agent - creates an account, pays 5 USDC on Solana, and creates a mailbox. The agent needs a Solana wallet with USDC to pay for the subscription. Supports resuming interrupted flows.",

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
    _options: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    // Check if already fully onboarded
    const existingApiKey = runtime.getSetting(SETTINGS.API_KEY);
    const existingMailbox = runtime.getSetting(SETTINGS.MAILBOX);

    if (existingApiKey && existingMailbox) {
      const msg = `Already onboarded! Mailbox: ${existingMailbox}`;
      logger.info(msg);
      if (callback) {
        await callback({
          text: msg,
          values: { success: true, mailbox: existingMailbox },
        });
      }
      return { success: true, mailbox: existingMailbox };
    }

    // Try to resume from saved state
    let savedState = getOnboardingState(runtime);
    let resumeMode =
      !!savedState &&
      savedState.stage !== "complete" &&
      savedState.stage !== "error";

    let status: OnboardingStatus = savedState
      ? { stage: savedState.stage }
      : { stage: "pending" };
    let apiKey = savedState?.apiKey || "";
    let mailboxAddress = "";

    const agentName =
      runtime.character?.name?.toLowerCase().replace(/\s+/g, "-") || "agent";

    try {
      // ========== Step 1: Create account (or resume) ==========
      let ownerEmail: string;
      let password: string;
      let sessionCookie: string;

      if (resumeMode && savedState?.ownerEmail && savedState?.password) {
        // Resume: use saved credentials
        ownerEmail = savedState.ownerEmail;
        password = savedState.password;
        sessionCookie = savedState.sessionCookie || "";
        logger.info("AgentMBox: Resuming with saved account:", ownerEmail);
        status = { stage: "account_created" };
      } else {
        // Start fresh: create new account
        const randomNum = Math.floor(Math.random() * 10000000);
        ownerEmail = `agent-${agentName}-${randomNum}@example.com`;
        password = generatePassword(32);

        logger.info("AgentMBox: Creating account...");
        const signupResponse = await fetch(`${BASE_URL}/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: ownerEmail,
            password,
          }),
        });

        if (!signupResponse.ok) {
          const error = await signupResponse.json();
          throw new Error(`Account creation failed: ${error.error}`);
        }

        logger.info("AgentMBox: Account created");

        // Get session cookie
        const setCookieHeader = signupResponse.headers.get("set-cookie") || "";
        sessionCookie = setCookieHeader.split(";")[0];

        // Save state after account creation
        saveOnboardingState(runtime, {
          stage: "account_created",
          ownerEmail,
          password,
          sessionCookie,
          agentName,
        });
        status = { stage: "account_created" };
      }

      // ========== Step 2: Create API key (or resume) ==========
      if (resumeMode && savedState?.apiKey) {
        // Resume: use saved API key
        apiKey = savedState.apiKey;
        logger.info("AgentMBox: Resuming with saved API key");
        status = { stage: "api_key_created" };
      } else {
        // Create new API key
        logger.info("AgentMBox: Creating API key...");
        const keyResponse = await fetch(`${BASE_URL}/keys`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookie,
          },
          body: JSON.stringify({ name: `${agentName}-key` }),
        });

        if (!keyResponse.ok) {
          const error = await keyResponse.json();
          throw new Error(`API key creation failed: ${error.error}`);
        }

        const keyData = await keyResponse.json();
        apiKey = keyData.key;

        // Save state after API key creation
        saveOnboardingState(runtime, {
          stage: "api_key_created",
          ownerEmail,
          password,
          sessionCookie,
          apiKey,
          agentName,
        });
        status = { stage: "api_key_created" };
        logger.info("AgentMBox: API key created");
      }

      // ========== Step 3: Get payment address (or resume) ==========
      let paymentAddress: string;

      if (resumeMode && savedState?.paymentAddress) {
        paymentAddress = savedState.paymentAddress;
        logger.info("AgentMBox: Resuming with saved payment address");
        status = { stage: "awaiting_payment", paymentAddress };
      } else {
        logger.info("AgentMBox: Getting payment address...");
        const paymentResponse = await fetch(`${BASE_URL}/payment`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (!paymentResponse.ok) {
          const error = await paymentResponse.json();
          throw new Error(`Payment status failed: ${error.error}`);
        }

        const paymentData = await paymentResponse.json();
        paymentAddress = paymentData.solanaAddress;

        // Save state after getting payment address
        saveOnboardingState(runtime, {
          stage: "awaiting_payment",
          ownerEmail,
          password,
          sessionCookie,
          apiKey,
          paymentAddress,
          agentName,
        });
        status = { stage: "awaiting_payment", paymentAddress };
        logger.info("AgentMBox: Payment address obtained");
      }

      // Notify about payment requirement
      if (callback) {
        await callback({
          text: `Account ready! Payment required: Please send 5 USDC to ${paymentAddress}`,
          values: {
            success: false,
            stage: "awaiting_payment",
            paymentAddress,
          },
        });
      }

      // ========== Step 4: Pay for subscription (if wallet available) ==========
      const wallet = await getAgentWallet(runtime);

      if (!wallet) {
        const msg = `Payment required! Please send 5 USDC to: ${paymentAddress}`;
        logger.warn(msg);
        return {
          success: false,
          stage: "awaiting_payment",
          paymentAddress,
          message: msg,
        };
      }

      logger.info("AgentMBox: Attempting to pay for subscription...");

      try {
        const { Connection, Keypair, PublicKey } =
          await import("@solana/web3.js");
        const { transfer, getOrCreateAssociatedTokenAccount } =
          await import("@solana/spl-token");

        const connection = new Connection(
          "https://api.mainnet-beta.solana.com",
        );
        const signer = Keypair.fromSecretKey(wallet.privateKey);
        const toPublicKey = new PublicKey(paymentAddress);

        const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          signer,
          new PublicKey(USDC_MINT),
          signer.publicKey,
        );

        const toTokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          signer,
          new PublicKey(USDC_MINT),
          toPublicKey,
        );

        await transfer(
          connection,
          signer,
          fromTokenAccount.address,
          toTokenAccount.address,
          signer.publicKey,
          PAYMENT_AMOUNT,
        );

        logger.info("AgentMBox: USDC transfer complete");
      } catch (transferError) {
        logger.error("USDC transfer failed:", transferError);
        const msg = `Payment required! Please send 5 USDC to: ${paymentAddress}`;
        return {
          success: false,
          stage: "awaiting_payment",
          paymentAddress,
          message: msg,
        };
      }

      // ========== Step 5: Confirm payment ==========
      logger.info("AgentMBox: Checking payment...");
      let paid = false;
      for (let i = 0; i < 12 && !paid; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        try {
          const checkResponse = await fetch(`${BASE_URL}/payment/check`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          const checkData = await checkResponse.json();
          paid = checkData.paid;
          if (paid) {
            status = { stage: "paid", paymentAddress };
            logger.info("AgentMBox: Payment confirmed");
          }
        } catch {
          // Continue polling
        }
      }

      if (!paid) {
        throw new Error("Payment not confirmed after 60 seconds");
      }

      // ========== Step 6: Create mailbox ==========
      logger.info("AgentMBox: Creating mailbox...");
      const mailboxResponse = await fetch(`${BASE_URL}/mailboxes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          localPart: agentName,
          displayName: runtime.character?.name || agentName,
        }),
      });

      if (!mailboxResponse.ok) {
        const error = await mailboxResponse.json();
        throw new Error(`Mailbox creation failed: ${error.error}`);
      }

      const mailboxData = await mailboxResponse.json();
      mailboxAddress = mailboxData.mailbox.address;
      status = {
        stage: "complete",
        mailbox: mailboxAddress,
      };

      logger.info(`AgentMBox: Mailbox created: ${mailboxAddress}`);

      // Save final credentials to runtime settings (backward compat)
      runtime.setSetting(SETTINGS.API_KEY, apiKey, true);
      runtime.setSetting(SETTINGS.MAILBOX, mailboxAddress, true);

      // Also save to database for persistence
      try {
        const db = (runtime as any).databaseAdapter?.db;
        if (db) {
          await db
            .insert(credentialsTable)
            .values({
              agentId: runtime.agentId,
              apiKey,
              mailbox: mailboxAddress,
              solanaAddress: paymentAddress,
              isPaid: true,
              paidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
              ownerEmail,
              apiKeyCreatedAt: new Date(),
              apiKeyName: `${agentName}-key`,
            })
            .onConflictDoUpdate({
              target: credentialsTable.agentId,
              set: {
                apiKey,
                mailbox: mailboxAddress,
                solanaAddress: paymentAddress,
                isPaid: true,
                paidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                ownerEmail,
                updatedAt: new Date(),
              },
            });
          logger.info("AgentMBox: Credentials saved to database");
        }
      } catch (dbError) {
        logger.warn(
          "AgentMBox: Failed to save credentials to database:",
          dbError,
        );
      }

      // Clear onboarding state since we're done
      clearOnboardingState(runtime);

      if (callback) {
        await callback({
          text: `Onboarding complete! Mailbox: ${mailboxAddress}`,
          values: {
            success: true,
            mailbox: mailboxAddress,
          },
        });
      }

      return { success: true, mailbox: mailboxAddress };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("AgentMBox onboarding failed: " + errorMessage);
      status = { stage: "error", error: errorMessage };

      if (callback) {
        await callback({
          text: "Onboarding failed: " + errorMessage,
          values: { success: false, error: errorMessage },
        });
      }

      return { success: false, error: errorMessage };
    }
  },

  validate: async (_runtime: IAgentRuntime) => {
    // Always valid - onboarding can be attempted
    return true;
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
