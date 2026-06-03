import type { AdminAuthRecord, AuthRepository } from "../src/types.js";

export class MemoryAuthRepository implements AuthRepository {
  constructor(private admin: AdminAuthRecord) {}

  async findAdminByEmail(email: string) {
    return this.admin.email === email ? this.admin : null;
  }

  async findAdminById(id: string) {
    return this.admin.id === id ? this.admin : null;
  }

  async updateAdminPassword(id: string, passwordHash: string) {
    if (this.admin.id === id) {
      this.admin = { ...this.admin, passwordHash };
    }
  }
}
