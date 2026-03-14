/**
 * AgentMBox Plugin Types
 * TypeScript interfaces for AgentMBox email integration
 */

export interface AgentMBoxConfig {
  /** API key for AgentMBox (starts with ai_) */
  apiKey: string;
  /** Mailbox address (e.g., my-agent@agentmbox.com) */
  mailbox?: string;
  /** Base URL for AgentMBox API (default: https://agentmbox.com/api/v1) */
  baseUrl?: string;
}

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface Email {
  id: string;
  from: EmailAddress[];
  to: EmailAddress[];
  cc?: EmailAddress[] | null;
  subject: string;
  receivedAt: string;
  textBody?: string;
  htmlBody?: string;
  preview?: string;
  hasAttachment: boolean;
  isRead: boolean;
}

export interface EmailListResponse {
  mailbox: string;
  emails: Email[];
  limit: number;
  offset: number;
}

export interface EmailDetailResponse {
  email: Email;
}

export interface SendEmailRequest {
  /** Sender address (must be a mailbox you own) */
  from: string;
  /** Recipient(s) - single email or array */
  to: string | string[];
  /** Email subject line */
  subject: string;
  /** Plain text body */
  text?: string;
  /** HTML body */
  html?: string;
}

export interface SendEmailResponse {
  success: boolean;
}

export interface Mailbox {
  id: string;
  address: string;
  localPart: string;
  domainName: string;
  displayName?: string | null;
  password?: string; // Only shown at creation
  createdAt: string;
}

export interface MailboxListResponse {
  mailboxes: Mailbox[];
}

export interface CreateMailboxRequest {
  localPart: string;
  domainId?: string;
  displayName?: string;
}

export interface CreateMailboxResponse {
  mailbox: Mailbox;
}

export interface PaymentStatus {
  paid: boolean;
  paidUntil: string | null;
  solanaAddress: string;
  usdcPerPeriod: number;
  periodDays: number;
  creditedUsdc: number;
  payments: unknown[];
}

export interface PaymentCheckResponse {
  paid: boolean;
  paidUntil: string;
  newCredits: number;
  balanceUsdc: number;
  creditedUsdc: number;
}

export interface Domain {
  id: string;
  domain: string;
  verified: boolean;
}

export interface DomainDNSRecords {
  verification: { type: string; name: string; value: string };
  mx: { type: string; name: string; value: string; priority: number };
  spf: { type: string; name: string; value: string };
  dkim: { type: string; name: string; value: string };
}

export interface DomainResponse {
  domain: Domain;
  dnsRecords: DomainDNSRecords;
}

export interface DomainVerifyResponse {
  verified: boolean;
  txtVerified: boolean;
  mxVerified: boolean;
  spfVerified: boolean;
  dkimVerified: boolean;
}

export interface DomainListResponse {
  domains: (Domain & { dnsRecords?: DomainDNSRecords })[];
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
}

export interface ApiKeyListResponse {
  keys: ApiKey[];
}

export interface AgentMBoxError {
  error: string;
}

export type AgentMBoxErrorCode = 400 | 401 | 402 | 403 | 404 | 409 | 502;

export function isAgentMBoxError(
  response: unknown,
): response is AgentMBoxError {
  return (
    typeof response === "object" &&
    response !== null &&
    "error" in response &&
    typeof (response as AgentMBoxError).error === "string"
  );
}
