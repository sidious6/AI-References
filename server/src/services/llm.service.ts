import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import type {
  LLMProvider,
  ChatMessage,
  ChatCompletionOptions,
  ChatCompletionResponse,
  StreamChunk,
} from '../types/llm.js';

class LLMService {
  private arkClient: OpenAI | null = null;
  private openaiClient: OpenAI | null = null;
  private googleClient: GoogleGenerativeAI | null = null;
  private anthropicClient: Anthropic | null = null;

  constructor() {
    this.initClients();
  }

  private initClients() {
    // 火山引擎 DeepSeek (使用 OpenAI 兼容接口)
    if (config.llm.ark.apiKey) {
      this.arkClient = new OpenAI({
        apiKey: config.llm.ark.apiKey,
        baseURL: config.llm.ark.baseUrl,
      });
    }

    // OpenAI
    if (config.llm.openai.apiKey) {
      this.openaiClient = new OpenAI({
        apiKey: config.llm.openai.apiKey,
        baseURL: config.llm.openai.baseUrl,
      });
    }

    // Google Gemini
    if (config.llm.google.apiKey) {
      this.googleClient = new GoogleGenerativeAI(config.llm.google.apiKey);
    }

    // Anthropic Claude
    if (config.llm.anthropic.apiKey) {
      this.anthropicClient = new Anthropic({
        apiKey: config.llm.anthropic.apiKey,
      });
    }
  }

  getAvailableProviders(): LLMProvider[] {
    const providers: LLMProvider[] = [];
    if (this.arkClient) providers.push('ark');
    if (this.openaiClient) providers.push('openai');
    if (this.googleClient) providers.push('google');
    if (this.anthropicClient) providers.push('anthropic');
    return providers;
  }

  async chat(
    provider: LLMProvider,
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResponse> {
    switch (provider) {
      case 'ark':
        return this.chatWithArk(options);
      case 'openai':
        return this.chatWithOpenAI(options);
      case 'google':
        return this.chatWithGoogle(options);
      case 'anthropic':
        return this.chatWithAnthropic(options);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  async *chatStream(
    provider: LLMProvider,
    options: ChatCompletionOptions
  ): AsyncGenerator<StreamChunk> {
    switch (provider) {
      case 'ark':
        yield* this.streamWithArk(options);
        break;
      case 'openai':
        yield* this.streamWithOpenAI(options);
        break;
      case 'google':
        yield* this.streamWithGoogle(options);
        break;
      case 'anthropic':
        yield* this.streamWithAnthropic(options);
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  // 火山引擎 DeepSeek
  private async chatWithArk(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    if (!this.arkClient) throw new Error('Ark client not initialized');

    const completion = await this.arkClient.chat.completions.create({
      model: options.model || config.llm.ark.model,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    });

    return {
      content: completion.choices[0]?.message?.content || '',
      model: completion.model,
      provider: 'ark',
      usage: completion.usage ? {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      } : undefined,
    };
  }

  private async *streamWithArk(options: ChatCompletionOptions): AsyncGenerator<StreamChunk> {
    if (!this.arkClient) throw new Error('Ark client not initialized');

    const stream = await this.arkClient.chat.completions.create({
      model: options.model || config.llm.ark.model,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      const finishReason = chunk.choices[0]?.finish_reason;
      const done = finishReason === 'stop' || finishReason === 'length';
      yield { content, done };
    }
  }

  // OpenAI GPT
  private async chatWithOpenAI(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    if (!this.openaiClient) throw new Error('OpenAI client not initialized');

    const completion = await this.openaiClient.chat.completions.create({
      model: options.model || config.llm.openai.model,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    });

    return {
      content: completion.choices[0]?.message?.content || '',
      model: completion.model,
      provider: 'openai',
      usage: completion.usage ? {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      } : undefined,
    };
  }

  private async *streamWithOpenAI(options: ChatCompletionOptions): AsyncGenerator<StreamChunk> {
    if (!this.openaiClient) throw new Error('OpenAI client not initialized');

    const stream = await this.openaiClient.chat.completions.create({
      model: options.model || config.llm.openai.model,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      const finishReason = chunk.choices[0]?.finish_reason;
      const done = finishReason === 'stop' || finishReason === 'length';
      yield { content, done };
    }
  }

  // Google Gemini
  private async chatWithGoogle(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    if (!this.googleClient) throw new Error('Google client not initialized');

    const model = this.googleClient.getGenerativeModel({
      model: options.model || config.llm.google.model,
    });

    const systemMessage = options.messages.find(m => m.role === 'system');
    const userMessages = options.messages.filter(m => m.role !== 'system');

    const chat = model.startChat({
      history: userMessages.slice(0, -1).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
      },
      systemInstruction: systemMessage?.content,
    });

    const lastMessage = userMessages[userMessages.length - 1];
    const result = await chat.sendMessage(lastMessage.content);
    const response = result.response;

    return {
      content: response.text(),
      model: options.model || config.llm.google.model,
      provider: 'google',
    };
  }

  private async *streamWithGoogle(options: ChatCompletionOptions): AsyncGenerator<StreamChunk> {
    if (!this.googleClient) throw new Error('Google client not initialized');

    const model = this.googleClient.getGenerativeModel({
      model: options.model || config.llm.google.model,
    });

    const systemMessage = options.messages.find(m => m.role === 'system');
    const userMessages = options.messages.filter(m => m.role !== 'system');

    const chat = model.startChat({
      history: userMessages.slice(0, -1).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
      },
      systemInstruction: systemMessage?.content,
    });

    const lastMessage = userMessages[userMessages.length - 1];
    const result = await chat.sendMessageStream(lastMessage.content);

    for await (const chunk of result.stream) {
      const content = chunk.text();
      yield { content, done: false };
    }
    yield { content: '', done: true };
  }

  // Anthropic Claude
  private async chatWithAnthropic(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    if (!this.anthropicClient) throw new Error('Anthropic client not initialized');

    const systemMessage = options.messages.find(m => m.role === 'system');
    const userMessages = options.messages.filter(m => m.role !== 'system');

    const response = await this.anthropicClient.messages.create({
      model: options.model || config.llm.anthropic.model,
      max_tokens: options.maxTokens || 4096,
      system: systemMessage?.content,
      messages: userMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const textContent = response.content.find(c => c.type === 'text');

    return {
      content: textContent?.type === 'text' ? textContent.text : '',
      model: response.model,
      provider: 'anthropic',
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  private async *streamWithAnthropic(options: ChatCompletionOptions): AsyncGenerator<StreamChunk> {
    if (!this.anthropicClient) throw new Error('Anthropic client not initialized');

    const systemMessage = options.messages.find(m => m.role === 'system');
    const userMessages = options.messages.filter(m => m.role !== 'system');

    const stream = await this.anthropicClient.messages.stream({
      model: options.model || config.llm.anthropic.model,
      max_tokens: options.maxTokens || 4096,
      system: systemMessage?.content,
      messages: userMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { content: event.delta.text, done: false };
      }
    }
    yield { content: '', done: true };
  }
}

export const llmService = new LLMService();
