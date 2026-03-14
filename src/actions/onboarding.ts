/**
 * Onboarding Action
 * Allows the agent to self-onboard with AgentMBox - creates account, pays for subscription, sets up mailbox
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

const BASE_URL = "https://agentmbox.com/api/v1";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGZwyTDt1v";
const PAYMENT_AMOUNT = 5_000_000; // 5 USDC in lamports

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

async function getAgentWallet(runtime: IAgentRuntime) {
  try {
    const privateKeyBase58 = String(
      runtime.getSetting("SOLANA_PRIVATE_KEY") || "",
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
    "Set up AgentMBox email for the agent - creates an account, pays 5 USDC on Solana, and creates a mailbox. The agent needs a Solana wallet with USDC to pay for the subscription.",

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
    _options: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    // Check if already onboarded
    const existingApiKey = runtime.getSetting("AGENTMBOX_API_KEY");
    const existingMailbox = runtime.getSetting("AGENTMBOX_MAILBOX");

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

    let status: OnboardingStatus = { stage: "pending" };
    let apiKey = "";
    let mailboxAddress = "";

    try {
      // Step 1: Create account
      const agentName =
        runtime.character?.name?.toLowerCase().replace(/\s+/g, "-") || "agent";
      const ownerEmail =
        String(runtime.getSetting("AGENTMBOX_OWNER_EMAIL")) ||
        `agent-${agentName}@owner.local`;
      const password = generatePassword(32);

      logger.info("AgentMBox: Creating account...");
      const signupResponse = await fetch(`${BASE_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ownerEmail, password }),
      });

      if (!signupResponse.ok) {
        const error = await signupResponse.json();
        throw new Error(`Account creation failed: ${error.error}`);
      }

      const signupData = await signupResponse.json();
      status = { stage: "account_created" };
      logger.info("AgentMBox: Account created");

      // Step 2: Create API key
      logger.info("AgentMBox: Creating API key...");
      const keyResponse = await fetch(`${BASE_URL}/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${agentName}-key` }),
        credentials: "include",
      });

      if (!keyResponse.ok) {
        const error = await keyResponse.json();
        throw new Error(`API key creation failed: ${error.error}`);
      }

      const keyData = await keyResponse.json();
      apiKey = keyData.key;
      status = { stage: "api_key_created" };
      logger.info("AgentMBox: API key created");

      // Step 3: Get payment address
      logger.info("AgentMBox: Getting payment address...");
      const paymentResponse = await fetch(`${BASE_URL}/payment`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!paymentResponse.ok) {
        const error = await paymentResponse.json();
        throw new Error(`Payment status failed: ${error.error}`);
      }

      const paymentData = await paymentResponse.json();
      status = {
        stage: "awaiting_payment",
        paymentAddress: paymentData.solanaAddress,
      };

      if (callback) {
        await callback({
          text: `Account created! Payment required: Please send 5 USDC to ${paymentData.solanaAddress}`,
          values: {
            success: false,
            stage: "awaiting_payment",
            paymentAddress: paymentData.solanaAddress,
          },
        });
      }

      // Step 4: Pay for subscription (if wallet available)
      const wallet = await getAgentWallet(runtime);

      if (!wallet) {
        const msg = `Payment required! Please send 5 USDC to: ${paymentData.solanaAddress}`;
        logger.warn(msg);
        return {
          success: false,
          stage: "awaiting_payment",
          paymentAddress: paymentData.solanaAddress,
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
        const toPublicKey = new PublicKey(paymentData.solanaAddress);

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
        const msg = `Payment required! Please send 5 USDC to: ${paymentData.solanaAddress}`;
        return {
          success: false,
          stage: "awaiting_payment",
          paymentAddress: paymentData.solanaAddress,
          message: msg,
        };
      }

      // Step 5: Confirm payment
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
            status = { stage: "paid" };
            logger.info("AgentMBox: Payment confirmed");
          }
        } catch {
          // Continue polling
        }
      }

      if (!paid) {
        throw new Error("Payment not confirmed after 60 seconds");
      }

      // Step 6: Create mailbox
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

      // Save credentials to runtime settings
      runtime.setSetting("AGENTMBOX_API_KEY", apiKey, true);
      runtime.setSetting("AGENTMBOX_MAILBOX", mailboxAddress);

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
