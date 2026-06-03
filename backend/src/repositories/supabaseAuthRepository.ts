import { SupabaseRestClient } from "./supabaseRestClient.js";
import type { AuthRepository } from "../types.js";

type AdminUserRow = {
  id: string;
  email: string;
  passwordHash: string;
  role: "super_admin" | "admin" | "read_only";
  createdAt: string;
  updatedAt: string;
};

export class SupabaseAuthRepository implements AuthRepository {
  constructor(private readonly client: SupabaseRestClient) {}

  findAdminByEmail(email: string) {
    return this.client.getOne<AdminUserRow>("AdminUser", {
      select: "*",
      email: `eq.${email.toLowerCase()}`
    });
  }

  findAdminById(id: string) {
    return this.client.getOne<AdminUserRow>("AdminUser", {
      select: "*",
      id: `eq.${id}`
    });
  }

  async updateAdminPassword(id: string, passwordHash: string) {
    await this.client.update<AdminUserRow>("AdminUser", { id: `eq.${id}` }, { passwordHash });
  }
}
