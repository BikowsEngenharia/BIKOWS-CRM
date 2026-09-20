// Edge Function: crm-prospeccao (v6 — Places API NEW + autorização)
// Migrada da API legada (maps.googleapis.com/maps/api/place/*) para a
// Places API (New) em places.googleapis.com/v1. A legada foi descontinuada
// para novos projetos em mar/2025 e nao pode mais ser habilitada — era a
// causa do erro REQUEST_DENIED mesmo com chave valida.
// v6: exige usuário logado no CRM (JWT de sessão). Antes bastava a chave
//     anon (pública) para consumir a cota paga do Google Places.
// Secret necessario: GOOGLE_PLACES_API_KEY
// No Google Cloud Console habilite: "Places API (New)"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const JSON_H = { ...CORS_HEADERS, "Content-Type": "application/json" };

// ---- Autorização (cópia de _shared/auth.ts) ----
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
async function authorize(req: Request): Promise<{ ok: boolean; via: string }> {
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret) {
    const { data } = await admin.from("crm_config").select("value").eq("key", "cron_secret").maybeSingle();
    const esperado = (data?.value as any)?.secret;
    return esperado && esperado === cronSecret ? { ok: true, via: "cron" } : { ok: false, via: "cron-secret-invalido" };
  }
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, via: "sem-token" };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return { ok: false, via: "token-invalido" };
  return { ok: true, via: "user:" + (data.user.email || data.user.id) };
}

// Mapeamento de tipos Google -> categorias em PT-BR
const TIPO_BR: Record<string, string> = {
  manufacturing: "Indústria / Manufatura",
  food_processing: "Indústria Alimentícia",
  storage: "Armazenagem / Logística",
  warehouse: "Depósito / Logística",
  car_repair: "Oficina / Metalúrgica",
  electrician: "Eletromecânica",
  general_contractor: "Construção Civil",
  roofing_contractor: "Construção",
  plumber: "Hidráulica / Saneamento",
  moving_company: "Logística / Transporte",
  bakery: "Panificadora / Agroindústria",
  food_store: "Distribuição Alimentícia",
  grocery_or_supermarket: "Mercado / Distribuição",
  hardware_store: "Ferragem / Materiais Industriais",
  home_goods_store: "Materiais Industriais",
  industrial_park: "Parque Industrial",
  metal: "Metal mecânica",
  farm: "Agropecuária",
  agriculture: "Agropecuária",
};

const EXCLUIR_TIPOS = new Set([
  "point_of_interest", "establishment", "premise", "locality",
  "political", "geocode", "route", "street_address", "country",
  "administrative_area_level_1", "administrative_area_level_2",
  "sublocality", "neighborhood", "postal_code",
]);

function mapCategoriasBR(tipos: string[]): string[] {
  if (!tipos || tipos.length === 0) return ["Empresa"];
  const resultado: string[] = [];
  for (const t of tipos) {
    if (EXCLUIR_TIPOS.has(t)) continue;
    if (TIPO_BR[t]) { resultado.push(TIPO_BR[t]); continue; }
    for (const [key, val] of Object.entries(TIPO_BR)) {
      if (t.includes(key)) { resultado.push(val); break; }
    }
  }
  if (resultado.length === 0) {
    const primeiro = tipos.find(t => !EXCLUIR_TIPOS.has(t));
    resultado.push(primeiro
      ? primeiro.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
      : "Empresa");
  }
  return [...new Set(resultado)];
}

// business_status da API nova vem como enum OPERATIONAL / CLOSED_TEMPORARILY / CLOSED_PERMANENTLY
function normalizarStatus(s: string | undefined): string {
  return s || "OPERATIONAL";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED", message: "Use POST" }), { status: 405, headers: JSON_H });
  }

  const auth = await authorize(req);
  if (!auth.ok) {
    console.warn("[prospeccao] recusado:", auth.via);
    return new Response(JSON.stringify({ error: "NAO_AUTORIZADO", message: "Faça login no CRM para usar a prospecção.", via: auth.via }), { status: 401, headers: JSON_H });
  }

  const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({
      error: "API_KEY_NOT_CONFIGURED",
      message: "Configure GOOGLE_PLACES_API_KEY nos secrets do Supabase (Edge Functions).",
    }), { status: 200, headers: JSON_H });
  }

  let body: { keyword?: string; estado?: string; cidade?: string; raio?: number };
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: "INVALID_JSON", message: "Corpo da requisição inválido" }), { status: 400, headers: JSON_H });
  }

  const { keyword, estado, cidade } = body;
  if (!keyword || String(keyword).length > 120) {
    return new Response(JSON.stringify({ error: "MISSING_KEYWORD", message: "Informe uma palavra-chave (até 120 caracteres)" }), { status: 400, headers: JSON_H });
  }

  const partes = [String(keyword)];
  if (cidade) partes.push(String(cidade).slice(0, 80));
  if (estado) partes.push(String(estado).slice(0, 40));
  partes.push("Brasil");
  const textQuery = partes.join(" ");

  // Places API (New) — searchText: 1 chamada traz todos os campos, sem
  // precisar de um details por resultado (mais barato e mais rapido).
  const fieldMask = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.nationalPhoneNumber",
    "places.internationalPhoneNumber",
    "places.websiteUri",
    "places.rating",
    "places.userRatingCount",
    "places.types",
    "places.primaryType",
    "places.businessStatus",
  ].join(",");

  let json: Record<string, unknown>;
  try {
    const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify({
        textQuery,
        languageCode: "pt-BR",
        regionCode: "BR",
        maxResultCount: 20,
      }),
    });

    json = await resp.json();

    if (!resp.ok) {
      const err = (json?.error ?? {}) as Record<string, unknown>;
      const status = String(err.status ?? "");
      const msg = String(err.message ?? "Erro desconhecido");

      if (status === "PERMISSION_DENIED" || /API key not valid|API_KEY_INVALID/i.test(msg)) {
        return new Response(JSON.stringify({
          error: "API_KEY_INVALID",
          message: "Chave do Google inválida ou sem a 'Places API (New)' habilitada. No Google Cloud Console: APIs e serviços > Biblioteca > habilite 'Places API (New)' e confira as restrições da chave.",
          detalhe: msg,
        }), { status: 200, headers: JSON_H });
      }
      if (/billing/i.test(msg)) {
        return new Response(JSON.stringify({
          error: "BILLING_REQUIRED",
          message: "A Places API exige faturamento ativo no projeto do Google Cloud.",
          detalhe: msg,
        }), { status: 200, headers: JSON_H });
      }
      return new Response(JSON.stringify({ error: "GOOGLE_API_ERROR", message: msg, status }), { status: 200, headers: JSON_H });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: "FETCH_ERROR", message: `Erro ao chamar Google API: ${err}` }), { status: 500, headers: JSON_H });
  }

  const places = (json.places ?? []) as Record<string, any>[];

  const resultados = places.map(p => {
    const tipos: string[] = p.types || (p.primaryType ? [p.primaryType] : []);
    return {
      placeId: p.id || "",
      nome: p.displayName?.text || "",
      endereco: p.formattedAddress || "",
      telefone: p.nationalPhoneNumber || p.internationalPhoneNumber || "",
      website: p.websiteUri || "",
      rating: typeof p.rating === "number" ? p.rating : null,
      totalAvaliacoes: p.userRatingCount || 0,
      categoria: tipos.find(t => !EXCLUIR_TIPOS.has(t)) || "Empresa",
      categoriasBR: mapCategoriasBR(tipos),
      tipos,
      status: normalizarStatus(p.businessStatus),
    };
  });

  return new Response(JSON.stringify(resultados), { status: 200, headers: JSON_H });
});
