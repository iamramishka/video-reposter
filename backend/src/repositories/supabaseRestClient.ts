import { randomUUID } from "node:crypto";

type QueryParams = Record<string, string | number | boolean | undefined>;

export class SupabaseRestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
  }
}

export class SupabaseRestClient {
  constructor(
    private readonly url: string,
    private readonly serviceRoleKey: string
  ) {}

  get<T>(table: string, query?: QueryParams) {
    return this.request<T>(table, { method: "GET", query });
  }

  async getOne<T>(table: string, query?: QueryParams) {
    const rows = await this.get<T[]>(table, { ...query, limit: 1 });
    return rows[0] ?? null;
  }

  create<T>(table: string, body: Record<string, unknown>) {
    return this.request<T[]>(table, {
      method: "POST",
      body: { id: randomUUID(), ...body },
      headers: { Prefer: "return=representation" }
    }).then((rows) => requireReturnedRow(table, rows));
  }

  update<T>(table: string, query: QueryParams, body: Record<string, unknown>) {
    return this.request<T[]>(table, {
      method: "PATCH",
      query,
      body: { ...body, updatedAt: new Date().toISOString() },
      headers: { Prefer: "return=representation" }
    }).then((rows) => requireReturnedRow(table, rows));
  }

  updateMany(table: string, query: QueryParams, body: Record<string, unknown>) {
    return this.request<unknown[]>(table, {
      method: "PATCH",
      query,
      body: { ...body, updatedAt: new Date().toISOString() },
      headers: { Prefer: "return=minimal" }
    });
  }

  private async request<T>(
    table: string,
    options: {
      method: "GET" | "POST" | "PATCH";
      query?: QueryParams;
      body?: Record<string, unknown>;
      headers?: Record<string, string>;
    }
  ): Promise<T> {
    const endpoint = new URL(`/rest/v1/${table}`, this.url);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) endpoint.searchParams.set(key, String(value));
    }

    const response = await fetch(endpoint, {
      method: options.method,
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "application/json",
        "Accept-Profile": "vr",
        "Content-Profile": "vr",
        ...options.headers
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new SupabaseRestError("Supabase REST request failed", response.status, body);
    }
    return body as T;
  }
}

function requireReturnedRow<T>(table: string, rows: T[]) {
  const row = rows[0];
  if (!row) {
    throw new SupabaseRestError(`Supabase ${table} mutation returned no rows`, 500, rows);
  }
  return row;
}

export function dateFromSupabase(value: string | null | undefined) {
  return value ? new Date(value) : null;
}
