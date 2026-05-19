import type { Express, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { chatStorage } from "./storage";
import { recordClaudeUsage } from "../../usage-tracker";

const resolvedAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
const hasChatAiCredentials = Boolean(resolvedAnthropicApiKey);

const anthropic: Anthropic | null = resolvedAnthropicApiKey
  ? new Anthropic({ apiKey: resolvedAnthropicApiKey })
  : null;

const CHAT_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";

export function registerChatRoutes(app: Express, basePath = "/api/chat"): void {
  app.get(`${basePath}/conversations`, async (_req: Request, res: Response) => {
    try {
      const conversations = await chatStorage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get(`${basePath}/conversations/:id`, async (req: Request, res: Response) => {
    try {
      const id = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id || "").trim();
      if (!id) {
        return res.status(400).json({ error: "Conversation id is required" });
      }
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post(`${basePath}/conversations`, async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(title || "New Chat");
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.delete(`${basePath}/conversations/:id`, async (req: Request, res: Response) => {
    try {
      const id = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id || "").trim();
      if (!id) {
        return res.status(400).json({ error: "Conversation id is required" });
      }
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  app.post(`${basePath}/conversations/:id/messages`, async (req: Request, res: Response) => {
    try {
      if (!hasChatAiCredentials || !anthropic) {
        return res.status(503).json({
          error: "AI chat service is not configured. Set ANTHROPIC_API_KEY.",
        });
      }

      const conversationId = String(
        Array.isArray(req.params.id) ? req.params.id[0] : req.params.id || ""
      ).trim();
      if (!conversationId) {
        return res.status(400).json({ error: "Conversation id is required" });
      }
      const { content } = req.body;

      await chatStorage.createMessage(conversationId, "user", content);

      const history = await chatStorage.getMessagesByConversation(conversationId);
      const chatMessages: Anthropic.MessageParam[] = history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = anthropic.messages.stream({
        model: CHAT_MODEL,
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        messages: chatMessages,
      });

      let fullResponse = "";

      stream.on("text", (delta) => {
        fullResponse += delta;
        res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      });

      const final = await stream.finalMessage();
      recordClaudeUsage({ model: CHAT_MODEL, usage: final.usage });

      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to send message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });
}
