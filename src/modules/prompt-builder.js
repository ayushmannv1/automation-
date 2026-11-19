/**
 * Builds structured prompts for Gemini Vision API with Car Jam game rules
 */

export class PromptBuilder {
  /**
   * Build the main game analysis prompt
   * @param {Object} context - Game context
   * @param {number} context.chapter - Current chapter
   * @param {number} context.level - Current level
   * @param {number} context.lives - Current lives
   * @param {Array<{x:number, y:number, reasoning:string}>} context.previousMoves - Last few moves made
   * @param {boolean} context.lastMoveFailed - Whether the last move resulted in failure
   * @returns {string} The prompt text
   */
  buildGameAnalysisPrompt(context) {
    const { chapter, level, lives, previousMoves = [], lastMoveFailed = false } = context;

    let prompt = `You are an expert AI playing the mobile puzzle game "Car Jam: Traffic Puzzle Match Parking Escape".

You are analyzing a screenshot of the current game state.
Current: Chapter ${chapter}, Level ${level}, Lives: ${lives}/5

## GAME RULES:
1. **Core Objective:** Match 3 cars of the SAME COLOR in the parking slots (the row of slots at the bottom of the screen).
2. **Valid Moves:** Only tap cars that are AVAILABLE/UNBLOCKED:
   - Cars showing an "eye" icon are tappable
   - Cars with a clear path from their FRONT, LEFT, or RIGHT side are tappable
   - NEVER tap a car that can only exit from its BACK — that is NOT a valid move
   - Moving one car clears the path for other cars behind it
3. **Strategy:** 
   - Prioritize completing color matches (get 3 of same color to slots)
   - Don't fill all parking slots without completing a match (causes "Out of Space" failure)
   - Plan 2-3 moves ahead: consider which cars become unblocked after moving the current one
   - If parking slots are getting full, focus on completing existing partial matches
4. **Dynamic Obstacles:**
   - Barricades: Open after 1st match, close after 2nd match, open after 3rd match (alternating pattern)
   - Other obstacles may appear at higher levels — analyze the screenshot carefully
5. **Parking Slot Count:** There are limited parking slots. Never exceed the capacity.

## WHAT TO LOOK FOR IN THE SCREENSHOT:
- The game board with colored cars in a parking lot grid
- Parking slots at the bottom (may already have some cars)
- Road/path layout showing which cars can move where
- Any obstacles (barricades, barriers)
- Car colors: identify all visible car colors precisely
- Eye icons on tappable cars
- Numbers on cars (indicating multiple cars or queue)

## CURRENT GAME STATE DETECTION:
First, determine what screen is showing:
- "gameplay" — Active puzzle board visible
- "level_complete" — Victory/completion screen showing
- "level_failed" — Failure/out of space screen showing  
- "ad" — Advertisement is showing (look for skip button, X, countdown timer, >>, Close)
- "menu" — Main menu or chapter select screen
- "other" — Any other screen (popup, store, reward, etc.)
`;

    if (previousMoves.length > 0) {
      prompt += `\n## PREVIOUS MOVES (most recent first):\n`;
      previousMoves.slice(-5).reverse().forEach((move, i) => {
        prompt += `${i + 1}. Tapped (${move.x}, ${move.y}) — ${move.reasoning || 'no reasoning recorded'}\n`;
      });
    }

    if (lastMoveFailed) {
      prompt += `\n## ⚠️ IMPORTANT: The last move did NOT work as expected. The game state may have changed unexpectedly (new obstacle, blocked path, etc.). Analyze the current screenshot CAREFULLY and adapt your strategy. Try a DIFFERENT approach.\n`;
    }

    prompt += `
## INSTRUCTIONS:
Analyze the screenshot(s) provided. If two screenshots are provided, the first is the PREVIOUS state and the second is the CURRENT state — compare them to understand what changed.

Respond with a JSON object (and ONLY a JSON object, no markdown code blocks):

{
  "screenType": "gameplay" | "level_complete" | "level_failed" | "ad" | "menu" | "other",
  "reasoning": "Detailed explanation of what you see and why you chose this action",
  "action": "tap" | "back" | "wait" | "none",
  "tapX": <number or null, absolute pixel X coordinate in screenshot>,
  "tapY": <number or null, absolute pixel Y coordinate in screenshot>,
  "confidence": <0.0 to 1.0>,
  "carsInSlots": <number of cars currently in parking slots>,
  "totalSlots": <total parking slot capacity>,
  "adInfo": {
    "hasCountdown": <boolean>,
    "countdownSeconds": <number or null>,
    "skipButtonLocation": {"x": <number>, "y": <number>} or null,
    "closeButtonLocation": {"x": <number>, "y": <number>} or null
  }
}`;

    return prompt;
  }

  /**
   * Build prompt specifically for ad detection and closing
   */
  buildAdDetectionPrompt() {
    return `You are looking at a mobile phone screenshot. Determine if this is an advertisement or the game "Car Jam".

If it's an ad, find the close/skip button. Look for:
- An "X" button (usually top-right or top-left corner)
- A "Skip" text/button
- A ">>" fast-forward button
- A "Close" button
- A countdown timer (e.g., "5s", "3...")
- If this is the Google Play Store, respond with action "back"

Respond with JSON only:
{
  "isAd": true/false,
  "isPlayStore": true/false,
  "action": "tap" | "back" | "wait",
  "tapX": <number or null>,
  "tapY": <number or null>,
  "waitSeconds": <number or null>,
  "reasoning": "explanation"
}`;
  }
}
