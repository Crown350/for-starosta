import club from "../../../mock/game-club/edge-handler.cjs";

const { makeClubHandler } = club;
const base = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

if (!base || !serviceKey || !anonKey) throw new Error("Missing Supabase runtime configuration");

async function rpc(name: string, payload: unknown, roleKey: string): Promise<Response> {
  return fetch(`${base}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: roleKey,
      Authorization: `Bearer ${roleKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(6_000)
  });
}

async function stateRpc(name: string, payload: unknown) {
  const response = await rpc(name, payload, serviceKey!);
  if (!response.ok) throw new Error("Club storage request failed");
  return response.json();
}

Deno.serve(makeClubHandler({
  origin: "https://crown350.github.io",
  secret: serviceKey,
  async verifyAccess(accessKey: string) {
    const response = await rpc("starosta_state", {
      access_key: accessKey, operation: "session"
    }, anonKey!);
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error("Club identity verification failed");
    const result = await response.json();
    return result.ok && result.role === "editor" ? result.groupId : null;
  },
  storeForGroup(group: string) {
    return {
      read: () => stateRpc("starosta_club_read", { club: group }),
      commit: (previous: number, state: unknown, rate: unknown) => stateRpc(
        "starosta_club_commit", { club: group, previous, game_state: state, rate_state: rate }
      )
    };
  }
}));
