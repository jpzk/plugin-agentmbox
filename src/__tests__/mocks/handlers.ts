// MSW handlers that exactly mirror https://www.agentmbox.com/docs

import { http, HttpResponse } from "msw";

// In-memory state
const state = {
  accounts: new Map<string, { id: string; email: string; solanaAddress: string }>(),
  apiKeys: new Map<string, { id: string; name: string; key: string; keyPrefix: string }>(),
  sessions: new Map<string, { accountId: string }>(),
  paymentStatus: new Map<string, {
    paid: boolean;
    paidUntil: string | null;
    solanaAddress: string;
    usdcPerPeriod: number;
    periodDays: number;
    creditedUsdc: number;
    payments: Array<{ id: string; amount: number; timestamp: string }>;
  }>(),
  mailboxes: new Map<string, {
    id: string;
    address: string;
    localPart: string;
    domainName: string;
    displayName: string | null;
    password?: string;
    createdAt: string;
  }>(),
  emails: new Map<string, Array<{
    id: string;
    from: Array<{ name?: string; email: string }>;
    to: Array<{ email: string }>;
    cc: Array<{ email: string }> | null;
    subject: string;
    textBody?: string;
    htmlBody?: string;
    receivedAt: string;
    preview: string;
    isRead: boolean;
    hasAttachment: boolean;
  }>>(),
};

function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generateSolanaAddress(): string {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnopqrstuvwxyz";
  return Array.from({ length: 44 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function generateKey(): string {
  const chars = "0123456789abcdef";
  return "ai_" + Array.from({ length: 64 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function generatePassword(): string {
  return "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx".replace(/x/g, () =>
    "0123456789abcdef"[Math.floor(Math.random() * 16)]
  );
}

function getApiKey(request: Request): string | null {
  const auth = request.headers.get("Authorization")?.replace("Bearer ", "");
  return auth && state.apiKeys.has(auth) ? auth : null;
}

function getSession(request: Request): string | null {
  const cookie = request.headers.get("Cookie");
  const match = cookie?.match(/session=([^;]+)/);
  return match ? match[1] : null;
}

export const handlers = [
  // POST /api/v1/auth/signup
  http.post("https://agentmbox.com/api/v1/auth/signup", async ({ request }) => {
    const body = await request.json() as { email: string; password: string };
    const { email, password } = body;

    if (!email || !password) {
      return HttpResponse.json({ error: "email and password required" }, { status: 400 });
    }

    const id = generateId();
    const solanaAddress = generateSolanaAddress();

    state.accounts.set(id, { id, email, solanaAddress });
    state.paymentStatus.set(id, {
      paid: false,
      paidUntil: null,
      solanaAddress,
      usdcPerPeriod: 5,
      periodDays: 30,
      creditedUsdc: 0,
      payments: [],
    });

    const sessionId = generateId();
    state.sessions.set(sessionId, { accountId: id });

    return HttpResponse.json(
      { id, email, solanaAddress },
      { status: 201, headers: { "Set-Cookie": `session=${sessionId}; Path=/` } }
    );
  }),

  // POST /api/v1/keys
  http.post("https://agentmbox.com/api/v1/keys", async ({ request }) => {
    const sessionId = getSession(request);
    if (!sessionId || !state.sessions.has(sessionId)) {
      return HttpResponse.json({ error: "Session cookie required" }, { status: 401 });
    }

    const body = await request.json() as { name: string };
    const { name } = body;
    if (!name) {
      return HttpResponse.json({ error: "name required" }, { status: 400 });
    }

    const id = generateId();
    const key = generateKey();
    const keyPrefix = key.substring(0, 11);

    state.apiKeys.set(key, { id, name, key, keyPrefix });

    return HttpResponse.json({ id, name, key, keyPrefix }, { status: 201 });
  }),

  // GET /api/v1/payment
  http.get("https://agentmbox.com/api/v1/payment", ({ request }) => {
    const apiKey = getApiKey(request);
    if (!apiKey) {
      return HttpResponse.json({ error: "API key required" }, { status: 401 });
    }

    const keyData = state.apiKeys.get(apiKey);
    if (!keyData) {
      return HttpResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const account = Array.from(state.accounts.values())[0];
    if (!account) {
      return HttpResponse.json({ error: "No account found" }, { status: 404 });
    }

    const status = state.paymentStatus.get(account.id);
    return HttpResponse.json(status || {
      paid: false,
      paidUntil: null,
      solanaAddress: "",
      usdcPerPeriod: 5,
      periodDays: 30,
      creditedUsdc: 0,
      payments: [],
    });
  }),

  // POST /api/v1/payment/check
  http.post("https://agentmbox.com/api/v1/payment/check", ({ request }) => {
    const apiKey = getApiKey(request);
    if (!apiKey) {
      return HttpResponse.json({ error: "API key required" }, { status: 401 });
    }

    const keyData = state.apiKeys.get(apiKey);
    if (!keyData) {
      return HttpResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const account = Array.from(state.accounts.values())[0];
    if (!account) {
      return HttpResponse.json({ error: "No account found" }, { status: 404 });
    }

    const status = state.paymentStatus.get(account.id);
    if (!status) {
      return HttpResponse.json({ error: "No payment status" }, { status: 404 });
    }

    // Simulate payment
    if (!status.paid) {
      status.paid = true;
      status.paidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      status.creditedUsdc = 5;
      status.payments.push({
        id: generateId(),
        amount: 5,
        timestamp: new Date().toISOString(),
      });
    }

    return HttpResponse.json({
      paid: status.paid,
      paidUntil: status.paidUntil,
      newCredits: 1,
      balanceUsdc: status.creditedUsdc,
      creditedUsdc: status.creditedUsdc,
    });
  }),

  // GET /api/v1/mailboxes
  http.get("https://agentmbox.com/api/v1/mailboxes", ({ request }) => {
    const apiKey = getApiKey(request);
    if (!apiKey) {
      return HttpResponse.json({ error: "API key required" }, { status: 401 });
    }

    const mailboxes = Array.from(state.mailboxes.values()).map(m => ({
      id: m.id,
      address: m.address,
      localPart: m.localPart,
      domainName: m.domainName,
      displayName: m.displayName,
      createdAt: m.createdAt,
    }));

    return HttpResponse.json({ mailboxes });
  }),

  // POST /api/v1/mailboxes
  http.post("https://agentmbox.com/api/v1/mailboxes", async ({ request }) => {
    const apiKey = getApiKey(request);
    if (!apiKey) {
      return HttpResponse.json({ error: "API key required" }, { status: 401 });
    }

    const account = Array.from(state.accounts.values())[0];
    const status = account && state.paymentStatus.get(account.id);

    if (!status?.paid) {
      return HttpResponse.json({ error: "Payment required" }, { status: 402 });
    }

    const body = await request.json() as { localPart: string; displayName?: string };
    const { localPart, displayName } = body;

    if (!localPart) {
      return HttpResponse.json({ error: "localPart required" }, { status: 400 });
    }

    const address = `${localPart}@agentmbox.com`;

    if (Array.from(state.mailboxes.values()).some(m => m.address === address)) {
      return HttpResponse.json({ error: "Address already taken" }, { status: 409 });
    }

    const id = generateId();
    const mailbox = {
      id,
      address,
      localPart,
      domainName: "agentmbox.com",
      displayName: displayName || null,
      password: generatePassword(),
      createdAt: new Date().toISOString(),
    };

    state.mailboxes.set(id, mailbox);
    state.emails.set(address, []);

    return HttpResponse.json({ mailbox }, { status: 201 });
  }),

  // GET /api/v1/mail
  http.get("https://agentmbox.com/api/v1/mail", ({ request }) => {
    const apiKey = getApiKey(request);
    if (!apiKey) {
      return HttpResponse.json({ error: "API key required" }, { status: 401 });
    }

    const url = new URL(request.url);
    const mailbox = url.searchParams.get("mailbox");
    if (!mailbox) {
      return HttpResponse.json({ error: "mailbox required" }, { status: 400 });
    }

    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const emails = state.emails.get(mailbox) || [];
    return HttpResponse.json({
      mailbox,
      emails: emails.slice(offset, offset + limit),
      limit,
      offset,
    });
  }),

  // GET /api/v1/mail/:id
  http.get("https://agentmbox.com/api/v1/mail/:id", ({ request, params }) => {
    const apiKey = getApiKey(request);
    if (!apiKey) {
      return HttpResponse.json({ error: "API key required" }, { status: 401 });
    }

    const url = new URL(request.url);
    const mailbox = url.searchParams.get("mailbox");
    if (!mailbox) {
      return HttpResponse.json({ error: "mailbox required" }, { status: 400 });
    }

    const emails = state.emails.get(mailbox) || [];
    const email = emails.find(e => e.id === params.id);

    if (!email) {
      return HttpResponse.json({ error: "Email not found" }, { status: 404 });
    }

    return HttpResponse.json({ email });
  }),

  // POST /api/v1/mail/send
  http.post("https://agentmbox.com/api/v1/mail/send", async ({ request }) => {
    const apiKey = getApiKey(request);
    if (!apiKey) {
      return HttpResponse.json({ error: "API key required" }, { status: 401 });
    }

    const account = Array.from(state.accounts.values())[0];
    const status = account && state.paymentStatus.get(account.id);

    if (!status?.paid) {
      return HttpResponse.json({ error: "Payment required" }, { status: 402 });
    }

    const body = await request.json() as { from: string; to: string | string[]; subject: string; text?: string; html?: string };
    const { from, to, subject, text, html } = body;

    if (!from || !to || !subject) {
      return HttpResponse.json({ error: "from, to, subject required" }, { status: 400 });
    }

    const recipients = Array.isArray(to) ? to : [to];
    const emailId = "M" + generateId();
    const now = new Date().toISOString();

    for (const recipient of recipients) {
      const emails = state.emails.get(recipient) || [];
      emails.unshift({
        id: emailId,
        from: [{ email: from }],
        to: recipients.map(e => ({ email: e })),
        cc: null,
        subject,
        textBody: text,
        htmlBody: html,
        receivedAt: now,
        preview: text?.substring(0, 100) || html?.substring(0, 100) || "",
        isRead: false,
        hasAttachment: false,
      });
      state.emails.set(recipient, emails);
    }

    return HttpResponse.json({ success: true });
  }),

  // DELETE /api/v1/mail/:id
  http.delete("https://agentmbox.com/api/v1/mail/:id", ({ request, params }) => {
    const apiKey = getApiKey(request);
    if (!apiKey) {
      return HttpResponse.json({ error: "API key required" }, { status: 401 });
    }

    const url = new URL(request.url);
    const mailbox = url.searchParams.get("mailbox");
    if (!mailbox) {
      return HttpResponse.json({ error: "mailbox required" }, { status: 400 });
    }

    const emails = state.emails.get(mailbox) || [];
    const index = emails.findIndex(e => e.id === params.id);

    if (index === -1) {
      return HttpResponse.json({ error: "Email not found" }, { status: 404 });
    }

    emails.splice(index, 1);
    state.emails.set(mailbox, emails);

    return HttpResponse.json({ success: true });
  }),
];

// Helper to reset state between tests
export function resetState() {
  state.accounts.clear();
  state.apiKeys.clear();
  state.sessions.clear();
  state.paymentStatus.clear();
  state.mailboxes.clear();
  state.emails.clear();
}

// Helper to create a test account
export function createTestAccount(email: string, password: string, mailboxAddress?: string) {
  const accountId = generateId();
  const solanaAddress = generateSolanaAddress();

  state.accounts.set(accountId, { id: accountId, email, solanaAddress });
  state.paymentStatus.set(accountId, {
    paid: false,
    paidUntil: null,
    solanaAddress,
    usdcPerPeriod: 5,
    periodDays: 30,
    creditedUsdc: 0,
    payments: [],
  });

  const sessionId = generateId();
  state.sessions.set(sessionId, { accountId });

  const keyId = generateId();
  const key = generateKey();
  state.apiKeys.set(key, { id: keyId, name: "test-key", key, keyPrefix: key.substring(0, 11) });

  let result = { accountId, apiKey: key, sessionId };

  if (mailboxAddress) {
    const status = state.paymentStatus.get(accountId);
    if (status) {
      status.paid = true;
      status.paidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      status.creditedUsdc = 5;
    }

    const localPart = mailboxAddress.split("@")[0];
    const mailboxId = generateId();
    state.mailboxes.set(mailboxId, {
      id: mailboxId,
      address: mailboxAddress,
      localPart,
      domainName: "agentmbox.com",
      displayName: "Test",
      password: generatePassword(),
      createdAt: new Date().toISOString(),
    });
    state.emails.set(mailboxAddress, []);
  }

  return result;
}
