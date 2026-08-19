/**
 * MiForge Voice Pipeline — Layer 0 Interface: Voice Agent
 *
 * Pipeline: STT (NVIDIA Parakeet, free) → LLM (NIM, free) → TTS (Coqui, local)
 * Target latency: <500ms end-to-end
 *
 * All components are free:
 *   - STT: NVIDIA Parakeet CTC 1.1B via NIM API (free tier)
 *   - LLM: Any provider from the free pool (routed via ConfidenceRouter)
 *   - TTS: Coqui TTS (MPL-2.0, runs locally, unlimited)
 *
 * Install: pip install coqui-tts
 * NIM STT: Uses NVIDIA_API_KEY (same key as LLM, no extra signup)
 */

import { ConfidenceRouter } from '../providers/confidence-router.js';
import { FREE_PROVIDERS } from '../providers/index.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface VoiceConfig {
  /** NVIDIA API key for Parakeet STT (free tier) */
  nvidiaApiKey?: string;
  /** STT model (default: nvidia/parakeet-ctc-1.1b-asr) */
  sttModel?: string;
  /** LLM provider for processing (default: groq for speed) */
  llmProvider?: string;
  /** LLM model */
  llmModel?: string;
  /** TTS engine: 'coqui' (local) or 'piper' (local alt) */
  ttsEngine?: 'coqui' | 'piper';
  /** TTS voice model */
  ttsVoice?: string;
  /** System prompt for voice assistant */
  systemPrompt?: string;
  /** Max response tokens (keep short for voice) */
  maxTokens?: number;
}

export interface VoiceResult {
  /** Transcribed text from user speech */
  transcript: string;
  /** LLM response text */
  response: string;
  /** Path to generated audio file (TTS output) */
  audioPath?: string;
  /** Audio bytes (WAV format) for streaming */
  audioBuffer?: Buffer;
  /** Timing breakdown */
  timing: {
    sttMs: number;
    llmMs: number;
    ttsMs: number;
    totalMs: number;
  };
  /** Tokens used (LLM) */
  tokensUsed: number;
}

export interface STTResult {
  text: string;
  confidence: number;
  durationMs: number;
}

// ═══════════════════════════════════════════════════════════════
// VOICE PIPELINE
// ═══════════════════════════════════════════════════════════════

export class VoicePipeline {
  private config: Required<VoiceConfig>;
  private router: ConfidenceRouter;
  private conversationHistory: { role: string; content: string }[] = [];

  constructor(config?: VoiceConfig) {
    this.config = {
      nvidiaApiKey: config?.nvidiaApiKey || process.env.NVIDIA_API_KEY || '',
      sttModel: config?.sttModel || 'nvidia/parakeet-ctc-1.1b-asr',
      llmProvider: config?.llmProvider || 'groq', // Groq = 320 tok/s, lowest latency
      llmModel: config?.llmModel || 'llama-3.3-70b-versatile',
      ttsEngine: config?.ttsEngine || 'coqui',
      ttsVoice: config?.ttsVoice || 'tts_models/en/ljspeech/tacotron2-DDC',
      systemPrompt: config?.systemPrompt || 'You are MiForge, a helpful voice assistant. Keep responses concise (1-3 sentences). Be natural and conversational.',
      maxTokens: config?.maxTokens || 150, // Short for voice
    };
    this.router = new ConfidenceRouter();
  }

  /**
   * Full voice pipeline: audio in → text response + audio out
   * Target: <500ms total latency
   */
  async process(audioInput: Buffer | string): Promise<VoiceResult> {
    const totalStart = Date.now();

    // ── Step 1: STT (Speech-to-Text) via NVIDIA Parakeet ──
    const sttStart = Date.now();
    const stt = await this.transcribe(audioInput);
    const sttMs = Date.now() - sttStart;

    if (!stt.text.trim()) {
      return {
        transcript: '',
        response: '',
        timing: { sttMs, llmMs: 0, ttsMs: 0, totalMs: Date.now() - totalStart },
        tokensUsed: 0,
      };
    }

    // ── Step 2: LLM Processing (Groq for speed: 320 tok/s) ──
    const llmStart = Date.now();
    const llmResult = await this.generateResponse(stt.text);
    const llmMs = Date.now() - llmStart;

    // ── Step 3: TTS (Text-to-Speech) via Coqui (local, unlimited) ──
    const ttsStart = Date.now();
    const ttsResult = await this.synthesize(llmResult.text);
    const ttsMs = Date.now() - ttsStart;

    const totalMs = Date.now() - totalStart;

    // Log timing
    console.log(`[Voice] Pipeline: STT=${sttMs}ms LLM=${llmMs}ms TTS=${ttsMs}ms Total=${totalMs}ms ${totalMs < 500 ? '✅' : '⚠️'}`);

    return {
      transcript: stt.text,
      response: llmResult.text,
      audioPath: ttsResult.audioPath,
      audioBuffer: ttsResult.audioBuffer,
      timing: { sttMs, llmMs, ttsMs, totalMs },
      tokensUsed: llmResult.tokens,
    };
  }

  /**
   * STT only — transcribe audio to text
   */
  async transcribe(audio: Buffer | string): Promise<STTResult> {
    const start = Date.now();

    // NVIDIA Parakeet via NIM API (free tier, same key as LLM)
    if (this.config.nvidiaApiKey) {
      try {
        const result = await this.transcribeNvidia(audio);
        return { ...result, durationMs: Date.now() - start };
      } catch (err: any) {
        console.warn(`[Voice:STT] NVIDIA Parakeet failed: ${err.message}`);
      }
    }

    // Fallback: Groq Whisper (free tier)
    try {
      const result = await this.transcribeGroq(audio);
      return { ...result, durationMs: Date.now() - start };
    } catch (err: any) {
      console.warn(`[Voice:STT] Groq Whisper failed: ${err.message}`);
    }

    return { text: '', confidence: 0, durationMs: Date.now() - start };
  }

  /**
   * TTS only — synthesize text to audio
   */
  async synthesize(text: string): Promise<{ audioPath?: string; audioBuffer?: Buffer }> {
    if (!text.trim()) return {};

    switch (this.config.ttsEngine) {
      case 'coqui':
        return this.ttsCoqui(text);
      case 'piper':
        return this.ttsPiper(text);
      default:
        return this.ttsCoqui(text);
    }
  }

  /**
   * Reset conversation history
   */
  resetConversation(): void {
    this.conversationHistory = [];
  }

  // ═══════════════════════════════════════════════════════════════
  // STT BACKENDS
  // ═══════════════════════════════════════════════════════════════

  /**
   * NVIDIA Parakeet CTC 1.1B — Free via NIM API
   * Best accuracy for English. Same API key as LLM models.
   */
  private async transcribeNvidia(audio: Buffer | string): Promise<{ text: string; confidence: number }> {
    const audioBuffer = typeof audio === 'string'
      ? Buffer.from(await (await fetch(audio)).arrayBuffer())  // URL → buffer
      : audio;

    // NIM ASR endpoint
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');
    formData.append('model', this.config.sttModel);
    formData.append('language', 'en');

    const res = await fetch('https://integrate.api.nvidia.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.nvidiaApiKey}`,
      },
      body: formData,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      throw new Error(`NVIDIA STT returned ${res.status}`);
    }

    const data = await res.json() as { text: string };
    return { text: data.text || '', confidence: 0.95 };
  }

  /**
   * Groq Whisper — Free tier fallback STT
   */
  private async transcribeGroq(audio: Buffer | string): Promise<{ text: string; confidence: number }> {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) throw new Error('No GROQ_API_KEY');

    const audioBuffer = typeof audio === 'string'
      ? Buffer.from(await (await fetch(audio)).arrayBuffer())
      : audio;

    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('language', 'en');
    formData.append('response_format', 'json');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqKey}` },
      body: formData,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`Groq STT returned ${res.status}`);

    const data = await res.json() as { text: string };
    return { text: data.text || '', confidence: 0.9 };
  }

  // ═══════════════════════════════════════════════════════════════
  // LLM PROCESSING
  // ═══════════════════════════════════════════════════════════════

  private async generateResponse(userText: string): Promise<{ text: string; tokens: number }> {
    // Add to conversation history
    this.conversationHistory.push({ role: 'user', content: userText });

    // Keep last 10 turns for context (voice conversations are short)
    if (this.conversationHistory.length > 20) {
      this.conversationHistory = this.conversationHistory.slice(-20);
    }

    const provider = FREE_PROVIDERS.find(p => p.name === this.config.llmProvider);
    if (!provider) {
      return { text: "I'm sorry, I can't process that right now.", tokens: 0 };
    }

    const apiKey = process.env[provider.apiKeyEnv] || '';

    try {
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.llmModel,
          messages: [
            { role: 'system', content: this.config.systemPrompt },
            ...this.conversationHistory,
          ],
          max_tokens: this.config.maxTokens,
          temperature: 0.7,
          stream: false,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        return { text: "I'm having trouble responding right now.", tokens: 0 };
      }

      const data = await res.json() as any;
      const text = data.choices?.[0]?.message?.content || '';
      const tokens = data.usage?.total_tokens || 0;

      // Add to history
      this.conversationHistory.push({ role: 'assistant', content: text });

      return { text, tokens };
    } catch (err: any) {
      console.warn(`[Voice:LLM] ${err.message}`);
      return { text: "Sorry, I couldn't process that.", tokens: 0 };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TTS BACKENDS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Coqui TTS — MPL-2.0, runs locally, unlimited, no API key
   * Install: pip install coqui-tts
   * Models auto-download on first use.
   */
  private async ttsCoqui(text: string): Promise<{ audioPath?: string; audioBuffer?: Buffer }> {
    const { execSync } = await import('child_process');
    const outputPath = `/tmp/miforge-tts-${Date.now()}.wav`;

    try {
      // Coqui TTS CLI — generates WAV file
      execSync(
        `tts --text "${text.replace(/"/g, '\\"').slice(0, 500)}" ` +
        `--model_name "${this.config.ttsVoice}" ` +
        `--out_path "${outputPath}" 2>/dev/null`,
        { timeout: 10_000, stdio: 'pipe' }
      );

      const { readFileSync } = await import('fs');
      const audioBuffer = readFileSync(outputPath);

      return { audioPath: outputPath, audioBuffer };
    } catch (err: any) {
      console.warn(`[Voice:TTS] Coqui failed: ${err.message}`);
      // Fallback: try piper
      return this.ttsPiper(text);
    }
  }

  /**
   * Piper TTS — lightweight alternative, very fast (~50ms for short text)
   * Install: pip install piper-tts
   */
  private async ttsPiper(text: string): Promise<{ audioPath?: string; audioBuffer?: Buffer }> {
    const { execSync } = await import('child_process');
    const outputPath = `/tmp/miforge-tts-${Date.now()}.wav`;

    try {
      execSync(
        `echo "${text.replace(/"/g, '\\"').slice(0, 500)}" | ` +
        `piper --model en_US-lessac-medium --output_file "${outputPath}" 2>/dev/null`,
        { timeout: 10_000, stdio: 'pipe' }
      );

      const { readFileSync } = await import('fs');
      const audioBuffer = readFileSync(outputPath);

      return { audioPath: outputPath, audioBuffer };
    } catch (err: any) {
      console.warn(`[Voice:TTS] Piper failed: ${err.message}`);
      return {};
    }
  }
}

export const voicePipeline = new VoicePipeline();
