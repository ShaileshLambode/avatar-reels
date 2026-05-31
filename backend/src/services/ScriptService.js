const OpenAI = require("openai");
const config = require("../config/env");
const logger = require("../utils/logger");
const {
  buildSystemPrompt,
  buildUserPrompt,
  REEL_SCRIPT_SCHEMA
} = require("./prompts/reelScript");

class ScriptService {
  constructor() {
    if (!config.OPENAI_API_KEY) {
      logger.warn("ScriptService: OPENAI_API_KEY is not set. Script generation will fail at runtime.");
      this.client = null;
    } else {
      this.client = new OpenAI({
        apiKey: config.OPENAI_API_KEY,
        maxRetries: config.OPENAI_MAX_RETRIES || 3
      });
      logger.info(`ScriptService initialized with model: ${config.OPENAI_MODEL}`);
    }

    this.model = config.OPENAI_MODEL || "gpt-4o-mini";
  }

  /**
   * Generate a structured reel script using GPT-4o Mini.
   * 
   * @param {string} prompt - The user's raw reel topic/prompt
   * @param {object} reelConfig - Reel configuration (tone, industry, duration, etc.)
   * @param {function} onProgress - Progress callback: (percent, message) => void
   * @returns {Promise<object>} Structured script matching Reel.script schema
   */
  async generateScript(prompt, reelConfig = {}, onProgress) {
    if (!this.client) {
      throw new Error("ScriptService: OpenAI client not initialized. Check OPENAI_API_KEY in .env");
    }

    const startTime = Date.now();

    // Stage 1: Build prompts
    if (onProgress) onProgress(10, "[Script] Analyzing prompt and building context...");

    const systemPrompt = buildSystemPrompt(reelConfig);
    const userPrompt = buildUserPrompt(prompt, reelConfig);

    logger.info(`ScriptService: Generating script for prompt "${prompt.substring(0, 80)}..." with model ${this.model}`);
    logger.debug(`ScriptService: System prompt length: ${systemPrompt.length} chars`);
    logger.debug(`ScriptService: User prompt length: ${userPrompt.length} chars`);

    // Stage 2: Call OpenAI API
    if (onProgress) onProgress(25, "[Script] Sending to GPT-4o Mini...");

    let completion;
    try {
      completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: {
          type: "json_schema",
          json_schema: REEL_SCRIPT_SCHEMA
        },
        temperature: 0.8,
        max_tokens: 2000
      });
    } catch (apiError) {
      logger.error(`ScriptService: OpenAI API call failed: ${apiError.message}`);

      // Provide clearer error messages for common issues
      if (apiError.status === 401) {
        throw new Error("ScriptService: Invalid OpenAI API key. Please check OPENAI_API_KEY in .env");
      }
      if (apiError.status === 429) {
        throw new Error("ScriptService: OpenAI rate limit exceeded. The SDK will auto-retry, but if this persists, check your billing/usage limits.");
      }
      if (apiError.status === 500 || apiError.status === 503) {
        throw new Error(`ScriptService: OpenAI server error (${apiError.status}). Will be retried by the queue system.`);
      }

      throw new Error(`ScriptService: OpenAI API error — ${apiError.message}`);
    }

    // Stage 3: Parse and validate response
    if (onProgress) onProgress(70, "[Script] Received AI response, validating structure...");

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error("ScriptService: Empty response from OpenAI API");
    }

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (parseError) {
      logger.error(`ScriptService: Failed to parse API response as JSON: ${rawContent.substring(0, 200)}`);
      throw new Error("ScriptService: GPT returned invalid JSON. This should not happen with structured output mode.");
    }

    // Stage 4: Validate the parsed response
    if (onProgress) onProgress(85, "[Script] Validating script content and adjusting durations...");

    const validated = this._validateResponse(parsed, reelConfig);

    // Stage 5: Log token usage
    this._logTokenUsage(completion, startTime);

    if (onProgress) onProgress(100, "[Script] Script generation complete!");

    return validated;
  }

  /**
   * Validate the parsed response and adjust durations if needed.
   * 
   * @param {object} parsed - The parsed JSON response
   * @param {object} reelConfig - Original reel config for target duration
   * @returns {object} The validated and possibly adjusted script
   */
  _validateResponse(parsed, reelConfig = {}) {
    // Required field checks
    if (!parsed.hook || typeof parsed.hook !== "string") {
      throw new Error("ScriptService: Response missing valid 'hook' field");
    }
    if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
      throw new Error("ScriptService: Response missing valid 'scenes' array");
    }
    if (!parsed.caption || typeof parsed.caption !== "string") {
      throw new Error("ScriptService: Response missing valid 'caption' field");
    }
    if (!parsed.cta || typeof parsed.cta !== "string") {
      throw new Error("ScriptService: Response missing valid 'cta' field");
    }

    // Validate each scene
    for (let i = 0; i < parsed.scenes.length; i++) {
      const scene = parsed.scenes[i];
      if (!scene.dialogue || typeof scene.dialogue !== "string") {
        throw new Error(`ScriptService: Scene ${i + 1} missing valid 'dialogue'`);
      }
      if (!scene.instruction || typeof scene.instruction !== "string") {
        throw new Error(`ScriptService: Scene ${i + 1} missing valid 'instruction'`);
      }
      // Clamp duration to 3-8s range
      if (typeof scene.duration !== "number" || scene.duration < 1) {
        scene.duration = 5;
      }
      scene.duration = Math.max(3, Math.min(8, Math.round(scene.duration)));
    }

    // Recalculate totalDuration from actual scene durations
    const actualTotal = parsed.scenes.reduce((sum, s) => sum + s.duration, 0);
    parsed.totalDuration = actualTotal;

    // Adjust scene durations if far from target
    const targetDuration = reelConfig.duration || 30;
    if (Math.abs(actualTotal - targetDuration) > 5) {
      logger.warn(`ScriptService: AI generated ${actualTotal}s script but target was ${targetDuration}s. Adjusting scene durations.`);
      parsed.scenes = this._adjustSceneDurations(parsed.scenes, targetDuration);
      parsed.totalDuration = parsed.scenes.reduce((sum, s) => sum + s.duration, 0);
    }

    // Validate avatarMood enum
    const validMoods = ["professional", "energetic", "friendly", "dramatic", "calm"];
    if (!validMoods.includes(parsed.avatarMood)) {
      logger.warn(`ScriptService: Invalid avatarMood "${parsed.avatarMood}", defaulting to "${reelConfig.tone || "professional"}"`);
      parsed.avatarMood = reelConfig.tone || "professional";
      // Fallback if tone isn't a valid mood either
      if (!validMoods.includes(parsed.avatarMood)) {
        parsed.avatarMood = "professional";
      }
    }

    // Trim caption to Instagram limit
    if (parsed.caption.length > 2200) {
      parsed.caption = parsed.caption.substring(0, 2197) + "...";
      logger.warn("ScriptService: Caption trimmed to 2200 character Instagram limit");
    }

    logger.info(`ScriptService: Validated script — ${parsed.scenes.length} scenes, ${parsed.totalDuration}s total, mood: ${parsed.avatarMood}`);
    return parsed;
  }

  /**
   * Proportionally adjust scene durations to match the target total.
   * 
   * @param {Array} scenes - Array of scene objects
   * @param {number} targetDuration - Desired total duration in seconds
   * @returns {Array} Adjusted scenes
   */
  _adjustSceneDurations(scenes, targetDuration) {
    const currentTotal = scenes.reduce((sum, s) => sum + s.duration, 0);
    const ratio = targetDuration / currentTotal;

    return scenes.map((scene) => ({
      ...scene,
      duration: Math.max(3, Math.min(8, Math.round(scene.duration * ratio)))
    }));
  }

  /**
   * Log token usage for cost awareness and debugging.
   * 
   * @param {object} completion - The OpenAI completion response
   * @param {number} startTime - Timestamp when the request started
   */
  _logTokenUsage(completion, startTime) {
    const elapsed = Date.now() - startTime;
    const usage = completion.usage;

    if (usage) {
      const inputCost = (usage.prompt_tokens / 1_000_000) * 0.15;   // $0.15 per 1M input tokens
      const outputCost = (usage.completion_tokens / 1_000_000) * 0.60; // $0.60 per 1M output tokens
      const totalCost = inputCost + outputCost;

      logger.info([
        `ScriptService: Token usage — `,
        `Model: ${completion.model} | `,
        `Input: ${usage.prompt_tokens} tokens | `,
        `Output: ${usage.completion_tokens} tokens | `,
        `Total: ${usage.total_tokens} tokens | `,
        `Est. cost: $${totalCost.toFixed(6)} | `,
        `Latency: ${elapsed}ms`
      ].join(""));
    } else {
      logger.info(`ScriptService: Completion received in ${elapsed}ms (no usage data available)`);
    }
  }
}

module.exports = ScriptService;
