/**
 * Reel Script Prompt Engineering Module
 * 
 * Contains system/user prompt templates and the JSON response schema
 * for structured GPT-4o Mini script generation.
 */

/**
 * Build the system prompt that establishes the AI's persona, constraints, and output rules.
 * 
 * @param {object} config - Reel configuration
 * @param {string} config.tone - Desired tone (e.g., "professional", "energetic", "friendly")
 * @param {string} config.industry - Target industry vertical (e.g., "marketing", "food", "tech")
 * @param {number} config.duration - Target reel duration in seconds (15, 30, or 60)
 * @returns {string} The system prompt
 */
const buildSystemPrompt = (config = {}) => {
  const tone = config.tone || "professional";
  const industry = config.industry || "general";
  const duration = config.duration || 30;

  // Calculate optimal scene count: ~5 seconds per scene
  const sceneCount = Math.max(2, Math.min(8, Math.round(duration / 5)));
  const sceneDuration = Math.round(duration / sceneCount);

  return `You are a world-class Instagram Reels scriptwriter who specializes in creating viral ${industry} content. You write scripts that are optimized for maximum watch time, engagement, and shares on Instagram.

YOUR PERSONA:
- You deeply understand the ${industry} industry and what resonates with its audience
- You write in a ${tone} tone that feels authentic and relatable
- You know that the first 1.5 seconds determine whether someone keeps watching
- You optimize scripts for vertical 9:16 video format with a single talking-head avatar

SCRIPT REQUIREMENTS:
1. HOOK: A single punchy sentence (under 15 words) that immediately stops the scroll. Use curiosity gaps, bold claims, or pattern interrupts. Do NOT start with "Hey guys" or generic greetings.

2. SCENES: Exactly ${sceneCount} scenes, each approximately ${sceneDuration} seconds long.
   - DIALOGUE: What the avatar speaks aloud. Must be natural, conversational speech — NOT written prose. Each scene's dialogue must be speakable in ${sceneDuration} seconds at a pace of approximately 150 words per minute (roughly ${Math.round(sceneDuration * 2.5)} words per scene).
   - INSTRUCTION: A brief direction for the avatar's facial expression, body language, camera framing, or visual emphasis. Examples: "Close-up, raised eyebrow, slight smirk", "Medium shot, enthusiastic hand gesture", "Lean in toward camera, lower voice".
   - DURATION: The number of seconds for this scene (between 3 and 8 seconds).

3. CAPTION: An Instagram caption (under 2200 characters) that:
   - Starts with a compelling first line (this shows in the preview)
   - Includes 5–10 relevant hashtags mixing popular and niche tags
   - Ends with a call-to-action (save, share, follow, comment)

4. CTA: A specific, actionable call-to-action the avatar says at the end. Examples: "Comment 'GUIDE' and I'll send you the full breakdown", "Follow for Part 2 tomorrow", "Link in bio for the free checklist".

5. TOTAL DURATION: The sum of all scene durations. Must be approximately ${duration} seconds (±3 seconds).

6. AVATAR MOOD: The overall emotional tone for the avatar performance. Must be exactly one of: "professional", "energetic", "friendly", "dramatic", "calm".

CONTENT RULES:
- No explicit, offensive, or misleading content
- No medical, legal, or financial advice presented as fact
- No trademark or copyright violations
- Keep language inclusive and accessible
- Prioritize value delivery — every sentence must earn its place`;
};

/**
 * Build the user prompt from the raw user input.
 * 
 * @param {string} prompt - The user's raw reel prompt/topic
 * @param {object} config - Reel configuration
 * @returns {string} The user prompt
 */
const buildUserPrompt = (prompt, config = {}) => {
  const parts = [`Write a complete vertical video reel script about: "${prompt}"`];

  if (config.industry && config.industry !== "general") {
    parts.push(`Target industry: ${config.industry}`);
  }
  if (config.tone) {
    parts.push(`Desired tone: ${config.tone}`);
  }
  if (config.duration) {
    parts.push(`Target duration: ${config.duration} seconds`);
  }
  if (config.voice && config.voice !== "default") {
    parts.push(`Voice style preference: ${config.voice}`);
  }

  parts.push("\nGenerate the script now following every rule in your instructions.");

  return parts.join("\n");
};

/**
 * JSON Schema for OpenAI Structured Output (response_format: json_schema).
 * This guarantees GPT-4o Mini returns output conforming exactly to our Reel.script schema.
 */
const REEL_SCRIPT_SCHEMA = {
  name: "reel_script",
  strict: true,
  schema: {
    type: "object",
    properties: {
      hook: {
        type: "string",
        description: "A punchy opening line under 15 words that stops the scroll"
      },
      scenes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            dialogue: {
              type: "string",
              description: "The spoken dialogue for this scene"
            },
            instruction: {
              type: "string",
              description: "Visual/expression direction for the avatar"
            },
            duration: {
              type: "number",
              description: "Scene duration in seconds (3-8)"
            }
          },
          required: ["dialogue", "instruction", "duration"],
          additionalProperties: false
        },
        description: "Array of script scenes in chronological order"
      },
      caption: {
        type: "string",
        description: "Instagram caption with hashtags (under 2200 chars)"
      },
      cta: {
        type: "string",
        description: "Call-to-action line spoken by the avatar"
      },
      totalDuration: {
        type: "number",
        description: "Total reel duration in seconds (sum of all scene durations)"
      },
      avatarMood: {
        type: "string",
        enum: ["professional", "energetic", "friendly", "dramatic", "calm"],
        description: "Overall emotional tone for the avatar"
      }
    },
    required: ["hook", "scenes", "caption", "cta", "totalDuration", "avatarMood"],
    additionalProperties: false
  }
};

module.exports = {
  buildSystemPrompt,
  buildUserPrompt,
  REEL_SCRIPT_SCHEMA
};
