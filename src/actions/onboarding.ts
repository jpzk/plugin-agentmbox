/**
 * Onboarding Action
 * Multi-step onboarding workflow with callbacks for progress updates
 * Step 1: Create account
 * Step 2: Create API key
 * Step 3: Get payment address
 * Step 4: Pay for subscription (or request manual payment)
 * Step 5: Confirm payment
 * Step 6: Create mailbox
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
import { eq } from "drizzle-orm";
import { credentialsTable } from "../types/schema";

const BASE_URL = "https://agentmbox.com/api/v1";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGZwyTDt1v";
const PAYMENT_AMOUNT = 5_000_000; // 5 USDC in lamports

const SETTINGS = {
  API_KEY: "AGENTMBOX_API_KEY",
  MAILBOX: "AGENTMBOX_MAILBOX",
  ONBOARDING_STATE: "AGENTMBOX_ONBOARDING_STATE",
  SOLANA_PRIVATE_KEY: "SOLANA_PRIVATE_KEY",
};

const STEPS = [
  { num: 1, name: "account", description: "Creating account" },
  { num: 2, name: "api_key", description: "Creating API key" },
  { num: 3, name: "payment_address", description: "Getting payment address" },
  { num: 4, name: "payment", description: "Processing payment" },
  { num: 5, name: "confirmation", description: "Confirming payment" },
  { num: 6, name: "mailbox", description: "Creating mailbox" },
];

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

interface OnboardingState {
  stage: string;
  ownerEmail: string;
  password: string;
  sessionCookie?: string;
  apiKey?: string;
  paymentAddress?: string;
  agentName: string;
}

async function getOnboardingState(
  runtime: IAgentRuntime,
): Promise<OnboardingState | null> {
  // First check runtime settings (in-memory)
  const stateJson = runtime.getSetting(SETTINGS.ONBOARDING_STATE) as
    | string
    | null;
  if (stateJson) {
    try {
      return JSON.parse(stateJson) as OnboardingState;
    } catch {
      // Invalid JSON, continue to check database
    }
  }

  // Fall back to database for persistence across restarts
  try {
    const db = (runtime as any).databaseAdapter?.db;
    if (db) {
      const result = await db
        .select({ onboardingState: credentialsTable.onboardingState })
        .from(credentialsTable)
        .where(eq(credentialsTable.agentId, runtime.agentId))
        .limit(1);

      if (result && result[0]?.onboardingState) {
        const dbState = result[0].onboardingState as string;
        // Sync to runtime for next time
        runtime.setSetting(SETTINGS.ONBOARDING_STATE, dbState);
        return JSON.parse(dbState) as OnboardingState;
      }
    }
  } catch (error) {
    logger.warn("Failed to load onboarding state from database:", error);
  }

  return null;
}

function saveOnboardingState(runtime: IAgentRuntime, state: OnboardingState) {
  // Save to runtime settings (in-memory)
  runtime.setSetting(SETTINGS.ONBOARDING_STATE, JSON.stringify(state));

  // Also save to database for persistence across restarts
  try {
    const db = (runtime as any).databaseAdapter?.db;
    if (db) {
      const stateJson = JSON.stringify(state);
      db.insert(credentialsTable)
        .values({
          agentId: runtime.agentId,
          apiKey: "",
          mailbox: "",
          onboardingState: stateJson,
        })
        .onConflictDoUpdate({
          target: credentialsTable.agentId,
          set: {
            onboardingState: stateJson,
            updatedAt: new Date(),
          },
        })
        .then(() => {
          logger.info("Onboarding state saved to database");
        })
        .catch((dbError: any) => {
          logger.warn("Failed to save onboarding state to database:", dbError);
        });
    }
  } catch (error) {
    logger.warn("Failed to save onboarding state to database:", error);
  }
}

function clearOnboardingState(runtime: IAgentRuntime) {
  runtime.setSetting(SETTINGS.ONBOARDING_STATE, "");

  // Also clear from database
  try {
    const db = (runtime as any).databaseAdapter?.db;
    if (db) {
      db.update(credentialsTable)
        .set({ onboardingState: null, updatedAt: new Date() })
        .where(eq(credentialsTable.agentId, runtime.agentId))
        .catch(() => {
          // Ignore - row may not exist yet
        });
    }
  } catch (error) {
    // Ignore - row may not exist yet
  }
}

async function getAgentWallet(runtime: IAgentRuntime) {
  try {
    const privateKeyBase58 = String(
      (runtime.getSetting(SETTINGS.SOLANA_PRIVATE_KEY) as string | null) || "",
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

async function sendCallback(
  callback: HandlerCallback | undefined,
  step: number,
  totalSteps: number,
  stepName: string,
  description: string,
  status: "starting" | "complete" | "waiting" | "error",
  data?: Record<string, any>,
) {
  if (!callback) return;

  const emojis: Record<string, string> = {
    starting: "⏳",
    complete: "✅",
    waiting: "⚠️",
    error: "❌",
  };

  const emoji = emojis[status] || "📋";

  await callback({
    text: `${emoji} Step ${step}/${totalSteps}: ${description}${status === "waiting" ? " - Manual action required" : ""}`,
    values: {
      step,
      totalSteps,
      stepName,
      status,
      ...data,
    },
  });
}

export const onboardingAction: Action = {
  name: "AGENTMBOX_ONBOARDING",
  description:
    "Set up AgentMBox email - multi-step onboarding with progress callbacks. Creates account, gets API key, processes payment, creates mailbox.",

  handler: async (runtime, message, _state, _options, callback) => {
    // Check if already onboarded
    const existingApiKey = runtime.getSetting(SETTINGS.API_KEY) as
      | string
      | null;
    const existingMailbox = runtime.getSetting(SETTINGS.MAILBOX) as
      | string
      | null;

    if (existingApiKey && existingMailbox) {
      await sendCallback(
        callback,
        6,
        6,
        "complete",
        "Already onboarded",
        "complete",
        { mailbox: existingMailbox },
      );
      return { success: true, mailbox: existingMailbox };
    }

    const savedState = await getOnboardingState(runtime);
    const resumeMode =
      savedState?.stage &&
      savedState.stage !== "complete" &&
      savedState.stage !== "error";

    const agentName =
      runtime.character?.name?.toLowerCase().replace(/\s+/g, "-") || "agent";
    let ownerEmail = "";
    let password = "";
    let sessionCookie = "";
    let apiKey = "";
    let paymentAddress: string = "";
    let mailboxAddress = "";

    try {
      // ===== STEP 1: Create Account =====
      await sendCallback(
        callback,
        1,
        6,
        "account",
        "Creating account",
        "starting",
      );

      if (resumeMode && savedState?.ownerEmail && savedState?.password) {
        ownerEmail = savedState.ownerEmail;
        password = savedState.password;
        sessionCookie = savedState.sessionCookie || "";
        await sendCallback(
          callback,
          1,
          6,
          "account",
          "Resuming account",
          "complete",
          { email: ownerEmail },
        );
      } else {
        const randomNum = Math.floor(Math.random() * 10000000);
        ownerEmail = `agent-${agentName}-${randomNum}@example.com`;
        password = generatePassword(32);

        const signupResponse = await fetch(`${BASE_URL}/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: ownerEmail, password }),
        });

        if (!signupResponse.ok) {
          const error = (await signupResponse.json()) as { error: string };
          throw new Error(`Account creation failed: ${error.error}`);
        }

        const setCookieHeader = signupResponse.headers.get("set-cookie") || "";
        sessionCookie = setCookieHeader.split(";")[0];

        saveOnboardingState(runtime, {
          stage: "account_created",
          ownerEmail,
          password,
          sessionCookie,
          agentName,
        });

        await sendCallback(
          callback,
          1,
          6,
          "account",
          "Account created",
          "complete",
          { email: ownerEmail },
        );
      }

      // ===== STEP 2: Create API Key =====
      await sendCallback(
        callback,
        2,
        6,
        "api_key",
        "Creating API key",
        "starting",
      );

      if (resumeMode && savedState?.apiKey) {
        apiKey = savedState.apiKey;
        await sendCallback(
          callback,
          2,
          6,
          "api_key",
          "Resuming with existing API key",
          "complete",
        );
      } else {
        const keyResponse = await fetch(`${BASE_URL}/keys`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookie,
          },
          body: JSON.stringify({ name: `${agentName}-key` }),
        });

        if (!keyResponse.ok) {
          const error = (await keyResponse.json()) as { error: string };
          throw new Error(`API key creation failed: ${error.error}`);
        }

        const keyData = (await keyResponse.json()) as {
          key: string;
          keyPrefix: string;
        };
        apiKey = keyData.key;

        saveOnboardingState(runtime, {
          stage: "api_key_created",
          ownerEmail,
          password,
          sessionCookie,
          apiKey,
          agentName,
        });

        await sendCallback(
          callback,
          2,
          6,
          "api_key",
          "API key created",
          "complete",
          { keyPrefix: keyData.keyPrefix },
        );
      }

      // ===== STEP 3: Get Payment Address =====
      await sendCallback(
        callback,
        3,
        6,
        "payment_address",
        "Getting payment address",
        "starting",
      );

      if (resumeMode && savedState?.paymentAddress) {
        paymentAddress = savedState.paymentAddress as string;
      } else {
        const paymentResponse = await fetch(`${BASE_URL}/payment`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (!paymentResponse.ok) {
          const error = (await paymentResponse.json()) as { error: string };
          throw new Error(`Payment address failed: ${error.error}`);
        }

        const paymentData = (await paymentResponse.json()) as {
          solanaAddress: string;
        };
        paymentAddress = paymentData.solanaAddress;

        saveOnboardingState(runtime, {
          stage: "awaiting_payment",
          ownerEmail,
          password,
          sessionCookie,
          apiKey,
          paymentAddress,
          agentName,
        });
      }

      // Callback: Payment required
      await sendCallback(
        callback,
        3,
        6,
        "payment_address",
        "Payment address obtained",
        "waiting",
        { paymentAddress },
      );

      // ===== STEP 4: Process Payment =====
      await sendCallback(
        callback,
        4,
        6,
        "payment",
        "Processing payment",
        "starting",
      );

      const wallet = await getAgentWallet(runtime);

      if (!wallet) {
        await sendCallback(
          callback,
          4,
          6,
          "payment",
          "Manual payment required",
          "waiting",
          { paymentAddress, instruction: "Send 5 USDC to " + paymentAddress },
        );

        return {
          success: false,
          stage: "awaiting_payment",
          paymentAddress,
          message: "Please send 5 USDC to: " + paymentAddress,
        };
      }

      // Auto-pay with wallet
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

        await sendCallback(
          callback,
          4,
          6,
          "payment",
          "Payment sent",
          "complete",
        );
      } catch (transferError) {
        logger.error("USDC transfer failed:", transferError);

        await sendCallback(
          callback,
          4,
          6,
          "payment",
          "Payment failed",
          "error",
          { errorMessage: "Transfer failed - manual payment needed" },
        );

        return {
          success: false,
          stage: "awaiting_payment",
          paymentAddress,
          message: "Payment failed. Please send 5 USDC to: " + paymentAddress,
        };
      }

      // ===== STEP 5: Confirm Payment =====
      await sendCallback(
        callback,
        5,
        6,
        "confirmation",
        "Confirming payment",
        "starting",
      );

      let paid = false;
      for (let i = 0; i < 12 && !paid; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));

        try {
          const checkResponse = await fetch(`${BASE_URL}/payment/check`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          const checkData = (await checkResponse.json()) as { paid: boolean };
          paid = checkData.paid;

          if (paid) {
            await sendCallback(
              callback,
              5,
              6,
              "confirmation",
              "Payment confirmed",
              "complete",
            );
          }
        } catch {
          // Continue polling
        }
      }

      if (!paid) {
        throw new Error("Payment not confirmed after 60 seconds");
      }

      // ===== STEP 6: Create Mailbox =====
      await sendCallback(
        callback,
        6,
        6,
        "mailbox",
        "Creating mailbox",
        "starting",
      );

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
        const error = (await mailboxResponse.json()) as { error: string };
        throw new Error(`Mailbox creation failed: ${error.error}`);
      }

      const mailboxData = (await mailboxResponse.json()) as {
        mailbox: { address: string };
      };
      mailboxAddress = mailboxData.mailbox.address;

      // Save credentials
      runtime.setSetting(SETTINGS.API_KEY, apiKey);
      runtime.setSetting(SETTINGS.MAILBOX, mailboxAddress);

      // Save to database
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
              paidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
        }
      } catch (dbError) {
        logger.warn("Failed to save credentials to database:", dbError);
      }

      clearOnboardingState(runtime);

      await sendCallback(
        callback,
        6,
        6,
        "mailbox",
        "Mailbox created",
        "complete",
        { mailbox: mailboxAddress },
      );

      return { success: true, mailbox: mailboxAddress };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Onboarding failed:", errorMessage);

      await sendCallback(
        callback,
        0,
        6,
        "error",
        "Onboarding failed",
        "error",
        { errorMessage },
      );

      return { success: false, error: errorMessage };
    }
  },

  validate: async () => true,

  examples: [
    [
      {
        name: "user",
        content: { text: "Set up email for this agent" } as any,
      },
      {
        name: "assistant",
        content: {
          text: "I will set up AgentMBox email - this takes a few steps: account creation, API key, payment, and mailbox setup.",
        } as any,
      },
    ],
    [
      {
        name: "user",
        content: { text: "Configure email service" } as any,
      },
      {
        name: "assistant",
        content: { text: "Starting the onboarding workflow now." } as any,
      },
    ],
    [
      {
        name: "user",
        content: { text: "Create an email mailbox" } as any,
      },
      {
        name: "assistant",
        content: {
          text: "I will create your mailbox and handle the 5 USDC payment.",
        } as any,
      },
    ],
  ] as ActionExample[][],
};

export default onboardingAction;
