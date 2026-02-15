import { randomUUID } from "crypto";
import { Pool } from "pg";
import { type User, type InsertUser } from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
}

class MemStorage implements IStorage {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
}

class PostgresStorage implements IStorage {
  private pool: Pool;
  private tableReadyPromise: Promise<void> | null = null;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }

  private async ensureTable(): Promise<void> {
    if (!this.tableReadyPromise) {
      this.tableReadyPromise = (async () => {
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(64) PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);
      })();
    }
    return this.tableReadyPromise;
  }

  private mapRow(row: any): User {
    return {
      id: String(row.id),
      username: String(row.username),
      password: String(row.password),
    };
  }

  async getUser(id: string): Promise<User | undefined> {
    await this.ensureTable();
    const result = await this.pool.query(
      `
        SELECT id, username, password
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );
    if (result.rows.length === 0) {
      return undefined;
    }
    return this.mapRow(result.rows[0]);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    await this.ensureTable();
    const result = await this.pool.query(
      `
        SELECT id, username, password
        FROM users
        WHERE username = $1
        LIMIT 1
      `,
      [username]
    );
    if (result.rows.length === 0) {
      return undefined;
    }
    return this.mapRow(result.rows[0]);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    await this.ensureTable();
    const id = randomUUID();
    const result = await this.pool.query(
      `
        INSERT INTO users (id, username, password)
        VALUES ($1, $2, $3)
        RETURNING id, username, password
      `,
      [id, insertUser.username, insertUser.password]
    );
    return this.mapRow(result.rows[0]);
  }
}

const databaseUrl = process.env.DATABASE_URL?.trim();
const fallbackStorage = new MemStorage();

export const storage: IStorage = databaseUrl
  ? new PostgresStorage(databaseUrl)
  : fallbackStorage;
