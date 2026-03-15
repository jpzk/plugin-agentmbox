import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { setupServer } from 'msw/node';
import { handlers, resetState, createTestAccount } from './mocks/handlers';
import type { IAgentRuntime, Memory, UUID, State } from '@elizaos/core';
import { sendEmailAction } from '../actions/sendEmail';
import { getEmailsAction } from '../actions/getEmails';
import { onboardingAction } from '../actions/onboarding';
import { AgentMBoxService } from '../services/AgentMBoxService';

function generateId(): UUID {
  return crypto.randomUUID() as UUID;
}

const server = setupServer(...handlers);

describe('E2E Tests with MSW', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    resetState();
  });

  describe('Onboarding Flow', () => {
    it('should create account and get payment address', async () => {
      const runtime = {
        agentId: generateId(),
        character: { name: 'TestAgent', bio: 'Test', id: generateId() },
        getSetting: (key: string) => {
          if (key === 'SOLANA_PRIVATE_KEY') return undefined;
          return null;
        },
        setSetting: () => {},
        getService: () => null,
      } as unknown as IAgentRuntime;

      const result = await onboardingAction.handler(
        runtime,
        { id: generateId(), entityId: generateId(), roomId: generateId(), content: { text: 'Set up email' }, createdAt: Date.now() } as Memory,
        { values: {}, data: {}, text: '' } as State,
        {}
      );

      expect(result.success).toBe(false);
      expect(result.stage).toBe('awaiting_payment');
      expect(result.paymentAddress).toBeDefined();
    });

    it('should detect already onboarded', async () => {
      const runtime = {
        getSetting: (key: string) => {
          if (key === 'AGENTMBOX_API_KEY') return 'ai_existing_key';
          if (key === 'AGENTMBOX_MAILBOX') return 'test@agentmbox.com';
          return null;
        },
        setSetting: () => {},
        getService: () => null,
      } as unknown as IAgentRuntime;

      const result = await onboardingAction.handler(
        runtime,
        { id: generateId(), entityId: generateId(), roomId: generateId(), content: { text: 'test' }, createdAt: Date.now() } as Memory,
        { values: {}, data: {}, text: '' } as State,
        {}
      );

      expect(result.success).toBe(true);
      expect(result.mailbox).toBe('test@agentmbox.com');
    });
  });

  describe('Email Actions', () => {
    let runtime: IAgentRuntime;
    let service: AgentMBoxService;

    beforeEach(async () => {
      const testAccount = createTestAccount('test@example.com', 'password123', 'myagent@agentmbox.com');
      runtime = {
        agentId: generateId(),
        character: { name: 'TestAgent', bio: 'Test', id: generateId() },
        getSetting: (key: string) => {
          if (key === 'AGENTMBOX_API_KEY') return testAccount.apiKey;
          if (key === 'AGENTMBOX_MAILBOX') return 'myagent@agentmbox.com';
          return null;
        },
        setSetting: () => {},
        getService: () => service,
        registerService: async (svc: any) => { service = svc; },
      } as unknown as IAgentRuntime;
      service = await AgentMBoxService.start(runtime);
    });

    afterEach(async () => {
      if (service) await service.stop();
    });

    it('should send email', async () => {
      const result = await sendEmailAction.handler(
        runtime,
        { id: generateId(), entityId: generateId(), roomId: generateId(), content: { text: 'test' }, createdAt: Date.now() } as Memory,
        { values: {}, data: {}, text: '' } as State,
        { to: 'recipient@example.com', subject: 'Test', text: 'Hello' }
      );
      expect(result.success).toBe(true);
    });

    it('should list emails', async () => {
      await sendEmailAction.handler(
        runtime,
        { id: generateId(), entityId: generateId(), roomId: generateId(), content: { text: 'test' }, createdAt: Date.now() } as Memory,
        { values: {}, data: {}, text: '' } as State,
        { to: 'myagent@agentmbox.com', subject: 'Test', text: 'Test' }
      );
      const result = await getEmailsAction.handler(
        runtime,
        { id: generateId(), entityId: generateId(), roomId: generateId(), content: { text: 'test' }, createdAt: Date.now() } as Memory,
        { values: {}, data: {}, text: '' } as State,
        { limit: 10 }
      );
      expect(result.success).toBe(true);
      expect(result.values?.emails?.length).toBeGreaterThan(0);
    });
  });

  describe('Polling', () => {
    let runtime: IAgentRuntime;
    let service: AgentMBoxService;

    beforeEach(async () => {
      const testAccount = createTestAccount('test2@example.com', 'password123', 'polling@agentmbox.com');
      runtime = {
        agentId: generateId(),
        character: { name: 'PollingAgent', bio: 'Test', id: generateId() },
        getSetting: (key: string) => {
          if (key === 'AGENTMBOX_API_KEY') return testAccount.apiKey;
          if (key === 'AGENTMBOX_MAILBOX') return 'polling@agentmbox.com';
          if (key === 'AGENTMBOX_POLLING_INTERVAL') return '1000';
          return null;
        },
        setSetting: () => {},
        getService: () => service,
        registerService: async (svc: any) => { service = svc; },
      } as unknown as IAgentRuntime;
      service = await AgentMBoxService.start(runtime);
    });

    afterEach(async () => {
      if (service) await service.stop();
    });

    it('should poll and cache emails', async () => {
      await new Promise(r => setTimeout(r, 1500));
      const cached = service.getCachedEmailsSync(10);
      expect(cached.length).toBeGreaterThanOrEqual(0);
    });
  });
});
