import { fail, ok } from '../ports/result.js';
import { loadJsonFixture } from './fixture-loader.js';

export function createMockSupportAdapter({ failSend = false } = {}) {
  const byClientMessageId = new Map();
  return {
    async listThreads() { return ok(await loadJsonFixture('support/threads.json')); },
    async getMessages(input) {
      if (!input?.threadId) return fail('VALIDATION_ERROR', 'Thread ID kerak.');
      return ok(await loadJsonFixture('support/messages.json'));
    },
    async sendMessage(input) {
      if (!input?.clientMessageId || (!input.text && !input.attachment)) return fail('VALIDATION_ERROR', 'Xabar yoki attachment va clientMessageId kerak.');
      if (failSend) return loadJsonFixture('support/send-failed.json');
      if (!byClientMessageId.has(input.clientMessageId)) {
        byClientMessageId.set(input.clientMessageId, { id: `msg-${input.clientMessageId}`, threadId: input.threadId || 'thread-demo-new', text: input.text || null, attachment: input.attachment || null, status: 'SENT' });
      }
      return ok(structuredClone(byClientMessageId.get(input.clientMessageId)));
    },
    async uploadAttachment(input) {
      if (!input?.file) return fail('VALIDATION_ERROR', 'Fayl kerak.');
      return ok({ attachment: { id: 'att-demo-001', visibility: 'PRIVATE', previewUrl: 'https://files.example/private-preview/demo' } });
    },
  };
}
