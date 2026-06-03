import { SupabaseRestClient } from "./supabaseRestClient.js";

type AdminUserRow = {
  id: string;
  email: string;
  passwordHash: string;
  role: "super_admin" | "admin" | "read_only";
  createdAt: string;
  updatedAt: string;
};

export class SupabaseAuthRepository {
  constructor(private readonly client: SupabaseRestClient) {}

  findAdminByEmail(email: string) {
    return this.client.getOne<AdminUserRow>("AdminUser", {
      select: "*",
      email: `eq.${email.toLowerCase()}`
    });
  }
}
