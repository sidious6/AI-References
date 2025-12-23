import { Router, Request, Response } from 'express';
import { llmService } from '../services/llm.service.js';
import { config } from '../config/index.js';
import type { LLMProvider, ChatMessage } from '../types/llm.js';

const router = Router();

// 获取可用的模型提供商列表
router.get('/providers', (_req: Request, res: Response) => {
  const providers = llmService.getAvailableProviders();
  const defaultProvider = config.llm.defaultProvider as LLMProvider;
  
  res.json({
    providers,
    defaultProvider,
    models: {
      ark: { name: 'DeepSeek (火山引擎)', model: config.llm.ark.model },
      openai: { name: 'GPT-4 Turbo', model: config.llm.openai.model },
      google: { name: 'Gemini Pro', model: config.llm.google.model },
      anthropic: { name: 'Claude 3.5 Sonnet', model: config.llm.anthropic.model },
    },
  });
});

// 聊天接口 (非流式)
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { provider, messages, model, temperature, maxTokens } = req.body as {
      provider?: LLMProvider;
      messages: ChatMessage[];
      model?: string;
      temperature?: number;
      maxTokens?: number;
    };

    const selectedProvider = provider || (config.llm.defaultProvider as LLMProvider);
    
    const response = await llmService.chat(selectedProvider, {
      messages,
      model,
      temperature,
      maxTokens,
    });

    res.json(response);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// 聊天接口 (流式)
router.post('/chat/stream', async (req: Request, res: Response) => {
  try {
    const { provider, messages, model, temperature, maxTokens } = req.body as {
      provider?: LLMProvider;
      messages: ChatMessage[];
      model?: string;
      temperature?: number;
      maxTokens?: number;
    };

    const selectedProvider = provider || (config.llm.defaultProvider as LLMProvider);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = llmService.chatStream(selectedProvider, {
      messages,
      model,
      temperature,
      maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Stream error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export default router;
