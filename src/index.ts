/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
  DB: D1Database;
  API_TOKEN: string;
}

interface ParsedResult {
  game: string;
  puzzle_number: number;
  time_seconds: number | null;
  guesses: number | null;
}

function parseResult(text: string): ParsedResult | null {
  const lines = text.trim().split('\n');
  const firstLine = lines[0];
  const secondLine = lines[1] || '';

// Pinpoint: "Pinpoint #734 | 2 guesses"
  const pinpointMatch = firstLine.match(/Pinpoint #(\d+) \| (\d+)/);
  if (pinpointMatch) {
    return {
      game: 'Pinpoint',
      puzzle_number: parseInt(pinpointMatch[1]),
      time_seconds: null,
      guesses: parseInt(pinpointMatch[2]),
    };
  }

  // Format 1 - "Patches #50 | 0:28 🧶" (time on same line)
  const sameLineMatch = firstLine.match(/^(\w+) #(\d+) \| (\d+):(\d+)/);
  if (sameLineMatch) {
    return {
      game: sameLineMatch[1],
      puzzle_number: parseInt(sameLineMatch[2]),
      time_seconds: parseInt(sameLineMatch[3]) * 60 + parseInt(sameLineMatch[4]),
      guesses: null,
    };
  }

  // Format 2 - "Zip #415\n0:19 🏁" (time on second line)
  const nextLineTimeMatch = secondLine.match(/^(\d+):(\d+)/);
  if (nextLineTimeMatch) {
    const gameMatch = firstLine.match(/^(\w+) #(\d+)/);
    if (gameMatch) {
      return {
        game: gameMatch[1],
        puzzle_number: parseInt(gameMatch[2]),
        time_seconds: parseInt(nextLineTimeMatch[1]) * 60 + parseInt(nextLineTimeMatch[2]),
        guesses: null,
      };
    }
  }

  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // POST /results — save a new result from Tasker
    if (request.method === 'POST' && url.pathname === '/results') {
      const token = request.headers.get('X-API-Token');
      if (token !== env.API_TOKEN) {
        return new Response('Unauthorized', { status: 401, headers: corsHeaders });
      }

      const body = await request.text();
      const parsed = parseResult(body);

      if (!parsed) {
        return new Response('Could not parse result', { status: 400, headers: corsHeaders });
      }

      await env.DB.prepare(
        `INSERT OR IGNORE INTO results (game, puzzle_number, time_seconds, guesses, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      )
      .bind(parsed.game, parsed.puzzle_number, parsed.time_seconds, parsed.guesses)
      .run();

      return new Response(JSON.stringify(parsed), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // GET /results — fetch all results for the React site
    if (request.method === 'GET' && url.pathname === '/results') {
      const { results } = await env.DB.prepare(
        `SELECT * FROM results ORDER BY created_at DESC`
      ).all();

      return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });
  },
};
