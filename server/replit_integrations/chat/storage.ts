export interface Conversation {
  id: number;
  title: string;
  createdAt: Date;
}

export interface Message {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt: Date;
}

export interface IChatStorage {
  getConversation(id: number): Promise<Conversation | undefined>;
  getAllConversations(): Promise<Conversation[]>;
  createConversation(title: string): Promise<Conversation>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<Message[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<Message>;
}

let nextConversationId = 1;
let nextMessageId = 1;
const conversationsMap = new Map<number, Conversation>();
const messagesMap = new Map<number, Message>();

export const chatStorage: IChatStorage = {
  async getConversation(id: number) {
    return conversationsMap.get(id);
  },

  async getAllConversations() {
    return Array.from(conversationsMap.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  async createConversation(title: string) {
    const conversation: Conversation = {
      id: nextConversationId++,
      title,
      createdAt: new Date(),
    };
    conversationsMap.set(conversation.id, conversation);
    return conversation;
  },

  async deleteConversation(id: number) {
    conversationsMap.delete(id);
    for (const [msgId, msg] of messagesMap) {
      if (msg.conversationId === id) {
        messagesMap.delete(msgId);
      }
    }
  },

  async getMessagesByConversation(conversationId: number) {
    return Array.from(messagesMap.values())
      .filter(m => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  },

  async createMessage(conversationId: number, role: string, content: string) {
    const message: Message = {
      id: nextMessageId++,
      conversationId,
      role,
      content,
      createdAt: new Date(),
    };
    messagesMap.set(message.id, message);
    return message;
  },
};
