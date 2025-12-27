import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import { settingsService } from './settings.service.js';
import type {
  LLMProvider,
  ChatCompletionOptions,
  ChatCompletionResponse,
  StreamChunk,
} from '../types/llm.js';

class LLMService {
  // 动态获取客户端配置
  private async getClientConfig(provider: LLMProvider): Promise<{
    apiKey: string;
    baseUrl: string;
    model: string;
  } | null> {
    // 映射 provider 到 endpoint id
    const endpointMap: Record<LLMProvider, string> = {
      ark: 'ark',
      openai: 'openai',
      google: 'google',
      anthropic: 'anthropic',
    };
    
    const endpointId = endpointMap[provider];
    return settingsService.getEffectiveApiKey(endpointId);
  }

  async getAvailableProviders(): Promise<LLMProvider[]> {
    const providers: LLMProvider[] = [];
    const modelSettings = await settingsService.getModel();
    
    for (const endpoint of modelSettings.endpoints) {
      if (endpoint.enabled && endpoint.api_key_masked) {
        const providerMap: Record<string, LLMProvider> = {
          ark: 'ark',
          openai: 'openai',
          google: 'google',
          anthropic: 'anthropic',
        };
        const provider = providerMap[endpoint.id];
        if (provider && !providers.includes(provider)) {
          providers.push(provider);
        }
      }
    }
    return providers;
  }

  async chat(
    provider: LLMProvider,
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResponse> {
    switch (provider) {
      case 'ark':
        return this.chatWithOpenAICompatible('ark', options);
      case 'openai':
        return this.chatWithOpenAICompatible('openai', options);
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
        yield* this.streamWithOpenAICompatible('ark', options);
        break;
      case 'openai':
        yield* this.streamWithOpenAICompatible('openai', options);
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

  // OpenAI 兼容接口 (OpenAI, Ark, DeepSeek, Qwen 等)
  private async chatWithOpenAICompatible(
    endpointId: string,
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResponse> {
    const clientConfig = await this.getClientConfig(endpointId as LLMProvider);
    if (!clientConfig) throw new Error(`${endpointId} client not configured`);

    const client = new OpenAI({
      apiKey: clientConfig.apiKey,
      baseURL: clientConfig.baseUrl,
    });

    const completion = await client.chat.completions.create({
      model: options.model || clientConfig.model,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    });

    return {
      content: completion.choices[0]?.message?.content || '',
      model: completion.model,
      provider: endpointId as LLMProvider,
      usage: completion.usage ? {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      } : undefined,
    };
  }

  private async *streamWithOpenAICompatible(
    endpointId: string,
    options: ChatCompletionOptions
  ): AsyncGenerator<StreamChunk> {
    const clientConfig = await this.getClientConfig(endpointId as LLMProvider);
    if (!clientConfig) throw new Error(`${endpointId} client not configured`);

    const client = new OpenAI({
      apiKey: clientConfig.apiKey,
      baseURL: clientConfig.baseUrl,
    });

    const stream = await client.chat.completions.create({
      model: options.model || clientConfig.model,
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
    const clientConfig = await this.getClientConfig('google');
    if (!clientConfig) throw new Error('Google client not configured');

    const client = new GoogleGenerativeAI(clientConfig.apiKey);
    const model = client.getGenerativeModel({
      model: options.model || clientConfig.model,
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
      model: options.model || clientConfig.model,
      provider: 'google',
    };
  }

  private async *streamWithGoogle(options: ChatCompletionOptions): AsyncGenerator<StreamChunk> {
    const clientConfig = await this.getClientConfig('google');
    if (!clientConfig) throw new Error('Google client not configured');

    const client = new GoogleGenerativeAI(clientConfig.apiKey);
    const model = client.getGenerativeModel({
      model: options.model || clientConfig.model,
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
    const clientConfig = await this.getClientConfig('anthropic');
    if (!clientConfig) throw new Error('Anthropic client not configured');

    const client = new Anthropic({
      apiKey: clientConfig.apiKey,
    });

    const systemMessage = options.messages.find(m => m.role === 'system');
    const userMessages = options.messages.filter(m => m.role !== 'system');

    const response = await client.messages.create({
      model: options.model || clientConfig.model,
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
    const clientConfig = await this.getClientConfig('anthropic');
    if (!clientConfig) throw new Error('Anthropic client not configured');

    const client = new Anthropic({
      apiKey: clientConfig.apiKey,
    });

    const systemMessage = options.messages.find(m => m.role === 'system');
    const userMessages = options.messages.filter(m => m.role !== 'system');

    const stream = await client.messages.stream({
      model: options.model || clientConfig.model,
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
