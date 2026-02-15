import { randomUUID } from "crypto";
import { Pool } from "pg";

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: Date;
}

export interface IChatStorage {
  getConversation(id: string): Promise<Conversation | undefined>;
  getAllConversations(): Promise<Conversation[]>;
  createConversation(title: string): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;
  getMessagesByConversation(conversationId: string): Promise<Message[]>;
  createMessage(conversationId: string, role: string, content: string): Promise<Message>;
}

class MemoryChatStorage implements IChatStorage {
  private conversationsMap = new Map<string, Conversation>();
  private messagesMap = new Map<string, Message>();

  async getConversation(id: string): Promise<Conversation | undefined> {
    return this.conversationsMap.get(id);
  }

  async getAllConversations(): Promise<Conversation[]> {
    return Array.from(this.conversationsMap.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  async createConversation(title: string): Promise<Conversation> {
    const conversation: Conversation = {
      id: randomUUID(),
      title,
      createdAt: new Date(),
    };
    this.conversationsMap.set(conversation.id, conversation);
    return conversation;
  }

  async deleteConversation(id: string): Promise<void> {
    this.conversationsMap.delete(id);
    for (const [messageId, message] of this.messagesMap) {
      if (message.conversationId === id) {
        this.messagesMap.delete(messageId);
      }
    }
  }

  async getMessagesByConversation(conversationId: string): Promise<Message[]> {
    return Array.from(this.messagesMap.values())
      .filter((message) => message.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async createMessage(
    conversationId: string,
    role: string,
    content: string
  ): Promise<Message> {
    const message: Message = {
      id: randomUUID(),
      conversationId,
      role,
      content,
      createdAt: new Date(),
    };
    this.messagesMap.set(message.id, message);
    return message;
  }
}

class PostgresChatStorage implements IChatStorage {
  private pool: Pool;
  private tableReadyPromise: Promise<void> | null = null;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }

  private async ensureTables(): Promise<void> {
    if (!this.tableReadyPromise) {
      this.tableReadyPromise = (async () => {
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS chat_conversations (
            id VARCHAR(64) PRIMARY KEY,
            project_id VARCHAR(64),
            participant_ids VARCHAR(64)[] NOT NULL DEFAULT '{}'::varchar[],
            title VARCHAR(255),
            last_message_at TIMESTAMP,
            is_archived BOOLEAN DEFAULT FALSE,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
        `);

        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS chat_messages (
            id VARCHAR(64) PRIMARY KEY,
            conversation_id VARCHAR(64) NOT NULL,
            sender_id VARCHAR(64) NOT NULL,
            sender_name VARCHAR(255) NOT NULL,
            sender_avatar VARCHAR(500),
            content TEXT NOT NULL,
            message_type VARCHAR(50) DEFAULT 'text',
            is_read BOOLEAN DEFAULT FALSE,
            read_by TEXT[] DEFAULT '{}'::text[],
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
        `);

        await this.pool.query(`
          CREATE INDEX IF NOT EXISTS idx_chat_conversations_created_at
          ON chat_conversations(created_at DESC);
        `);

        await this.pool.query(`
          CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id_created_at
          ON chat_messages(conversation_id, created_at);
        `);
      })();
    }

    return this.tableReadyPromise;
  }

  private mapConversation(row: any): Conversation {
    return {
      id: String(row.id),
      title: row.title ? String(row.title) : "New Chat",
      createdAt: new Date(row.created_at || new Date().toISOString()),
    };
  }

  private mapMessage(row: any): Message {
    const senderId = row.sender_id ? String(row.sender_id) : "";
    return {
      id: String(row.id),
      conversationId: String(row.conversation_id),
      role: senderId.includes("assistant") ? "assistant" : "user",
      content: String(row.content),
      createdAt: new Date(row.created_at || new Date().toISOString()),
    };
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    await this.ensureTables();
    const result = await this.pool.query(
      `
        SELECT id, title, created_at
        FROM chat_conversations
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );
    if (result.rows.length === 0) {
      return undefined;
    }
    return this.mapConversation(result.rows[0]);
  }

  async getAllConversations(): Promise<Conversation[]> {
    await this.ensureTables();
    const result = await this.pool.query(
      `
        SELECT id, title, created_at
        FROM chat_conversations
        WHERE is_archived IS DISTINCT FROM TRUE
        ORDER BY created_at DESC
      `
    );
    return result.rows.map((row) => this.mapConversation(row));
  }

  async createConversation(title: string): Promise<Conversation> {
    await this.ensureTables();
    const id = randomUUID();
    const result = await this.pool.query(
      `
        INSERT INTO chat_conversations (id, participant_ids, title, created_at, updated_at)
        VALUES ($1, '{}'::varchar[], $2, NOW(), NOW())
        RETURNING id, title, created_at
      `,
      [id, title]
    );
    return this.mapConversation(result.rows[0]);
  }

  async deleteConversation(id: string): Promise<void> {
    await this.ensureTables();
    await this.pool.query(
      `
        DELETE FROM chat_messages
        WHERE conversation_id = $1
      `,
      [id]
    );
    await this.pool.query(
      `
        DELETE FROM chat_conversations
        WHERE id = $1
      `,
      [id]
    );
  }

  async getMessagesByConversation(conversationId: string): Promise<Message[]> {
    await this.ensureTables();
    const result = await this.pool.query(
      `
        SELECT id, conversation_id, sender_id, content, created_at
        FROM chat_messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
      `,
      [conversationId]
    );
    return result.rows.map((row) => this.mapMessage(row));
  }

  async createMessage(
    conversationId: string,
    role: string,
    content: string
  ): Promise<Message> {
    await this.ensureTables();
    const id = randomUUID();
    const senderId = role === "assistant" ? "easeverse-assistant" : "easeverse-user";
    const senderName = role === "assistant" ? "EaseVerse AI" : "User";
    const result = await this.pool.query(
      `
        INSERT INTO chat_messages (
          id,
          conversation_id,
          sender_id,
          sender_name,
          content,
          message_type,
          is_read,
          read_by,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          'text',
          FALSE,
          '{}'::text[],
          NOW(),
          NOW()
        )
        RETURNING id, conversation_id, sender_id, content, created_at
      `,
      [id, conversationId, senderId, senderName, content]
    );

    await this.pool.query(
      `
        UPDATE chat_conversations
        SET last_message_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `,
      [conversationId]
    );

    return this.mapMessage(result.rows[0]);
  }
}

const databaseUrl = process.env.DATABASE_URL?.trim();

export const chatStorage: IChatStorage = databaseUrl
  ? new PostgresChatStorage(databaseUrl)
  : new MemoryChatStorage();
