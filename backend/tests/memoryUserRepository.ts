import crypto from "node:crypto";
import type { UserRecord, UserRepository } from "../src/types.js";

export class MemoryUserRepository implements UserRepository {
  public records = new Map<string, UserRecord>();

  constructor(seed: UserRecord[] = []) {
    seed.forEach((record) => this.records.set(record.id, record));
  }

  listActive() {
    return Promise.resolve([...this.records.values()].filter((record) => !record.deletedAt));
  }

  findById(id: string) {
    const record = this.records.get(id);
    return Promise.resolve(record && !record.deletedAt ? record : null);
  }

  findByEmail(email: string) {
    return Promise.resolve([...this.records.values()].find((record) => record.email === email && !record.deletedAt) ?? null);
  }

  create(input: { name: string; email: string; company?: string | null }) {
    const now = new Date();
    const record: UserRecord = {
      id: crypto.randomUUID(),
      name: input.name,
      email: input.email,
      company: input.company ?? null,
      disabledAt: null,
      deletedAt: null,
      retentionUntil: null,
      createdAt: now,
      updatedAt: now
    };
    this.records.set(record.id, record);
    return Promise.resolve(record);
  }

  update(id: string, input: { name?: string; email?: string; company?: string | null }) {
    return this.patch(id, {
      name: input.name,
      email: input.email,
      company: input.company
    });
  }

  setDisabled(id: string, disabled: boolean) {
    return this.patch(id, { disabledAt: disabled ? new Date() : null });
  }

  softDelete(id: string, retentionUntil: Date) {
    const now = new Date();
    return this.patch(id, { disabledAt: now, deletedAt: now, retentionUntil });
  }

  private patch(id: string, patch: Partial<UserRecord>) {
    const existing = this.records.get(id);
    if (!existing) throw new Error("Missing test user");
    const next = { ...existing, ...definedPatch(patch), updatedAt: new Date() };
    this.records.set(id, next);
    return Promise.resolve(next);
  }
}

function definedPatch<T extends Record<string, unknown>>(patch: T) {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<UserRecord>;
}
