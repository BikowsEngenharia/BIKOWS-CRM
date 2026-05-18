// Edge Function: crm-prospeccao
// Deploy: supabase functions deploy crm-prospeccao
// Secret necessário: GOOGLE_PLACES_API_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Mapeamento de tipos Google → categorias em PT-BR
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
    // Verificar mapeamento direto
    if (TIPO_BR[t]) {
      resultado.push(TIPO_BR[t]);
      continue;
    }
    // Verificar se contém palavra-chave
    for (const [key, val] of Object.entries(TIPO_BR)) {
      if (t.includes(key)) {
        resultado.push(val);
        break;
      }
    }
  }
  // Se não mapeou nada, usar o primeiro tipo relevante formatado
  if (resultado.length === 0) {
    const primeiro = tipos.find(t => !EXCLUIR_TIPOS.has(t));
    if (primeiro) {
      resultado.push(
        primeiro.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      );
    } else {
      resultado.push("Empresa");
    }
  }
  return [...new Set(resultado)]; // remover duplicatas
}

async function fetchPlaceDetails(
  placeId: string,
  apiKey: string
): Promise<Record<string, unknown>> {
  const fields = [
    "name",
    "formatted_address",
    "formatted_phone_number",
    "website",
    "rating",
    "user_ratings_total",
    "types",
    "business_status",
  ].join(",");

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}&language=pt-BR`;

  const resp = await fetch(url);
  const data = await resp.json();

  if (data.status !== "OK") return {};
  return data.result || {};
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "METHOD_NOT_ALLOWED", message: "Use POST" }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  // Verificar API Key configurada
  const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: "API_KEY_NOT_CONFIGURED",
        message: "Configure GOOGLE_PLACES_API_KEY nos secrets do Supabase",
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  let body: { keyword?: string; estado?: string; cidade?: string; raio?: number };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "INVALID_JSON", message: "Corpo da requisição inválido" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  const { keyword, estado, cidade, raio = 50000 } = body;

  if (!keyword) {
    return new Response(
      JSON.stringify({ error: "MISSING_KEYWORD", message: "Informe uma palavra-chave" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  // Montar query de busca
  const queryParts = [keyword];
  if (cidade) queryParts.push(cidade);
  if (estado) queryParts.push(estado);
  queryParts.push("Brasil");

  const query = encodeURIComponent(queryParts.join(" "));
  const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&radius=${raio}&key=${apiKey}&language=pt-BR`;

  let searchData: { status: string; results?: Record<string, unknown>[]; error_message?: string };
  try {
    const searchResp = await fetch(textSearchUrl);
    searchData = await searchResp.json();
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "FETCH_ERROR", message: `Erro ao chamar Google API: ${err}` }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  if (searchData.status === "REQUEST_DENIED") {
    return new Response(
      JSON.stringify({
        error: "API_KEY_INVALID",
        message: "API Key inválida ou sem permissão para Places API. Verifique no Google Cloud Console.",
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  if (searchData.status !== "OK" && searchData.status !== "ZERO_RESULTS") {
    return new Response(
      JSON.stringify({
        error: "GOOGLE_API_ERROR",
        message: searchData.error_message || `Status: ${searchData.status}`,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  const places = (searchData.results || []).slice(0, 20);

  // Buscar detalhes de cada lugar em paralelo (máx 10 simultâneos para evitar rate limit)
  const BATCH_SIZE = 5;
  const resultados: Record<string, unknown>[] = [];

  for (let i = 0; i < places.length; i += BATCH_SIZE) {
    const batch = places.slice(i, i + BATCH_SIZE);
    const detailsPromises = batch.map(async (place) => {
      const placeId = place.place_id as string;
      if (!placeId) return null;

      try {
        const details = await fetchPlaceDetails(placeId, apiKey);

        const tipos = (details.types || place.types || []) as string[];
        return {
          placeId,
          nome: (details.name || place.name || "") as string,
          endereco: (details.formatted_address || (place.formatted_address as string) || "") as string,
          telefone: (details.formatted_phone_number || "") as string,
          website: (details.website || "") as string,
          rating: (details.rating || place.rating || null) as number | null,
          totalAvaliacoes: (details.user_ratings_total || (place as Record<string, unknown>).user_ratings_total || 0) as number,
          categoria: tipos.find((t: string) => !EXCLUIR_TIPOS.has(t)) || "Empresa",
          categoriasBR: mapCategoriasBR(tipos),
          tipos,
          status: (details.business_status || (place as Record<string, unknown>).business_status || "OPERATIONAL") as string,
        };
      } catch {
        // Se falhar detalhes, retornar dados básicos do text search
        const tipos = (place.types || []) as string[];
        return {
          placeId,
          nome: (place.name || "") as string,
          endereco: (place.formatted_address || "") as string,
          telefone: "",
          website: "",
          rating: (place.rating || null) as number | null,
          totalAvaliacoes: ((place as Record<string, unknown>).user_ratings_total || 0) as number,
          categoria: tipos.find((t: string) => !EXCLUIR_TIPOS.has(t)) || "Empresa",
          categoriasBR: mapCategoriasBR(tipos),
          tipos,
          status: ((place as Record<string, unknown>).business_status || "OPERATIONAL") as string,
        };
      }
    });

    const batchResults = await Promise.all(detailsPromises);
    resultados.push(...batchResults.filter(Boolean) as Record<string, unknown>[]);
  }

  return new Response(JSON.stringify(resultados), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
