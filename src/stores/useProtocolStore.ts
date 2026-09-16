import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { todayISO } from '../domain/date';
import type { Protocol, ProtocolLog } from '../domain/types';
import { adherence as computeAdherence, type Adherence } from '../domain/protocol';
import { uid } from '../lib/uid';
import { analytics } from '../services/analytics';
import { jsonStorage, STORE_KEYS } from './persist';

/**
 * Protocol / personal-tracking store. This is a RECORD-KEEPING tool only. The
 * app never recommends doses, cycles, compounds or treatment plans — all values
 * are entered by the user. See disclaimer surfaced in the UI.
 */
interface ProtocolState {
  protocols: Protocol[];
  logs: ProtocolLog[];

  addProtocol: (p: Omit<Protocol, 'id' | 'startedAt' | 'active'> & { startedAt?: string }) => Protocol;
  updateProtocol: (id: string, patch: Partial<Protocol>) => void;
  archiveProtocol: (id: string) => void;
  removeProtocol: (id: string) => void;

  logDose: (protocolId: string, taken: boolean, date?: string, notes?: string) => void;
  logsForProtocol: (protocolId: string) => ProtocolLog[];
  adherence: (protocolId: string, windowDays?: number) => Adherence;
  reset: () => void;
}

export const useProtocolStore = create<ProtocolState>()(
  persist(
    (set, get) => ({
      protocols: [],
      logs: [],

      addProtocol: (p) => {
        const protocol: Protocol = { ...p, id: uid('proto_'), startedAt: p.startedAt ?? todayISO(), active: true };
        set((s) => ({ protocols: [protocol, ...s.protocols] }));
        return protocol;
      },

      updateProtocol: (id, patch) =>
        set((s) => ({ protocols: s.protocols.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

      archiveProtocol: (id) =>
        set((s) => ({ protocols: s.protocols.map((p) => (p.id === id ? { ...p, active: false } : p)) })),

      removeProtocol: (id) =>
        set((s) => ({
          protocols: s.protocols.filter((p) => p.id !== id),
          logs: s.logs.filter((l) => l.protocolId !== id),
        })),

      logDose: (protocolId, taken, date = todayISO(), notes) => {
        const proto = get().protocols.find((p) => p.id === protocolId);
        const log: ProtocolLog = {
          id: uid('plog_'),
          protocolId,
          date,
          time: new Date().toISOString().slice(11, 16),
          taken,
          dose: proto?.dose ?? null,
          unit: proto?.unit ?? '',
          notes,
        };
        set((s) => ({ logs: [log, ...s.logs.filter((l) => !(l.protocolId === protocolId && l.date === date))] }));
        analytics.track('protocol_logged', { result: taken ? 'taken' : 'skipped' });
      },

      logsForProtocol: (protocolId) =>
        get().logs.filter((l) => l.protocolId === protocolId).sort((a, b) => (a.date < b.date ? 1 : -1)),

      adherence: (protocolId, windowDays = 30) => {
        const protocol = get().protocols.find((p) => p.id === protocolId);
        if (!protocol) return { taken: 0, expected: null, ratio: null };
        return computeAdherence(protocol, get().logs, windowDays, todayISO());
      },

      reset: () => set({ protocols: [], logs: [] }),
    }),
    { name: STORE_KEYS.protocols, storage: jsonStorage() },
  ),
);
