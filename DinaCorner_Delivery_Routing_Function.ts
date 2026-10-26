import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const MAX_DISTANCE_METERS = 50_000;
const RATE_EGP_PER_KM = 10;
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

type Branch = {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  is_active: boolean;
};

type RouteResult = Branch & {
  distance_meters: number;
  duration: string | null;
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function readJsonMap(name: string): Record<string, string> {
  try {
    const value = Deno.env.get(name);
    return value ? JSON.parse(value) : {};
  } catch (_) {
    return {};
  }
}

function requiredEnv(name: string, fallback?: string): string {
  const value = (Deno.env.get(name) || fallback || "").trim();
  if (!value) throw new HttpError(503, `Server setup is incomplete: ${name} is not configured in Supabase Edge Function secrets.`);
  return value;
}

function getRouteMode(): "DRIVE" | "TWO_WHEELER" {
  const value = String(Deno.env.get("GOOGLE_ROUTES_MODE") || "TWO_WHEELER").toUpperCase().trim();
  return value === "DRIVE" ? "DRIVE" : "TWO_WHEELER";
}

function parseCoordinates(body: Record<string, unknown>): { latitude: number; longitude: number } {
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (body.latitude === null || body.latitude === undefined || body.longitude === null || body.longitude === undefined ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new HttpError(400, "Choose a valid GPS location or a saved address with a map pin.");
  }
  return { latitude, longitude };
}

async function getAdminClient() {
  const url = requiredEnv("SUPABASE_URL");
  const secrets = readJsonMap("SUPABASE_SECRET_KEYS");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY", secrets.default);
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function getCustomer(admin: ReturnType<typeof createClient>, request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HttpError(401, "Please sign in before requesting delivery.");
  const { data, error } = await admin.auth.getUser(match[1]);
  if (error || !data.user) throw new HttpError(401, "Your session could not be verified. Sign in again.");
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("id,role,is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throw new HttpError(500, "Could not verify the customer profile.");
  if (!profile || profile.is_active !== true || profile.role !== "customer") {
    throw new HttpError(403, "An active customer account is required to place a delivery order.");
  }
  return data.user;
}

async function getActiveBranches(admin: ReturnType<typeof createClient>): Promise<Branch[]> {
  const { data, error } = await admin.from("locations")
    .select("id,name,city,address,latitude,longitude,is_active")
    .eq("is_active", true)
    .order("name");
  if (error) throw new HttpError(500, "Could not load active branches. Check the locations table and its coordinates.");
  const branches = (Array.isArray(data) ? data : []) as Branch[];
  if (!branches.length) throw new HttpError(503, "No active branches are available for delivery.");
  const missing = branches.filter((branch) => {
    const lat = Number(branch.latitude);
    const lng = Number(branch.longitude);
    return branch.latitude === null || branch.longitude === null || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180;
  });
  if (missing.length) {
    const names = missing.map((branch) => branch.name || branch.id).join(", ");
    throw new HttpError(503, `Road delivery is not ready: add valid latitude and longitude to every active branch (${names}).`);
  }
  return branches;
}

async function getDrivingDistanceMeters(
  branch: Branch,
  destination: { latitude: number; longitude: number },
  apiKey: string,
  travelMode: "DRIVE" | "TWO_WHEELER",
): Promise<RouteResult> {
  const response = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: Number(branch.latitude), longitude: Number(branch.longitude) } } },
      destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
      travelMode,
      computeAlternativeRoutes: false,
      units: "METRIC",
    }),
    signal: AbortSignal.timeout(15_000),
  });

  let payload: Record<string, unknown> = {};
  try { payload = await response.json(); } catch (_) {}
  if (!response.ok) {
    // Keep provider response bodies and API configuration details out of the customer response.
    console.error("Google Routes API request failed", response.status, JSON.stringify(payload).slice(0, 1000));
    throw new HttpError(502, `Could not calculate a road route from ${branch.name}. No delivery order has been placed.`);
  }
  const routes = Array.isArray(payload.routes) ? payload.routes as Array<Record<string, unknown>> : [];
  const route = routes[0];
  const meters = Number(route?.distanceMeters);
  if (!route || !Number.isFinite(meters) || !Number.isInteger(meters) || meters < 0) {
    throw new HttpError(502, `A valid road route from ${branch.name} could not be confirmed. No delivery order has been placed.`);
  }
  return { ...branch, distance_meters: meters, duration: typeof route.duration === "string" ? route.duration : null };
}

async function findNearestBranchByRoad(
  admin: ReturnType<typeof createClient>,
  destination: { latitude: number; longitude: number },
) {
  const apiKey = requiredEnv("GOOGLE_ROUTES_API_KEY");
  const mode = getRouteMode();
  const branches = await getActiveBranches(admin);
  // Require a route for every active branch: skipping a failed route could select the wrong branch.
  const routes = await Promise.all(branches.map((branch) => getDrivingDistanceMeters(branch, destination, apiKey, mode)));
  routes.sort((a, b) => a.distance_meters - b.distance_meters || a.name.localeCompare(b.name));
  const nearest = routes[0];
  const covered = nearest.distance_meters <= MAX_DISTANCE_METERS;
  const fee = Number((nearest.distance_meters / 100).toFixed(2));
  return {
    covered,
    message: covered ? null : `The nearest branch is ${nearest.name}, ${(nearest.distance_meters / 1000).toFixed(2)} km away by road. Delivery is available only within 50 km.`,
    branch_id: nearest.id,
    branch_name: nearest.name,
    branch_city: nearest.city,
    branch_address: nearest.address,
    distance_meters: nearest.distance_meters,
    distance_km: Number((nearest.distance_meters / 1000).toFixed(3)),
    delivery_fee: fee,
    rate_per_km: RATE_EGP_PER_KM,
    maximum_distance_meters: MAX_DISTANCE_METERS,
    max_distance_km: MAX_DISTANCE_METERS / 1000,
    travel_mode: mode,
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed." }, 405);

  try {
    const admin = await getAdminClient();
    const user = await getCustomer(admin, request);
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch (_) { throw new HttpError(400, "Request body must be valid JSON."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Request body must be a JSON object.");
    const action = String(body.action || "");
    if (action !== "quote" && action !== "place-order") throw new HttpError(400, "Unknown delivery action.");
    const coordinates = parseCoordinates(body);
    const route = await findNearestBranchByRoad(admin, coordinates);

    if (action === "quote") {
      return jsonResponse({ ...route, latitude: coordinates.latitude, longitude: coordinates.longitude });
    }
    if (!route.covered) throw new HttpError(422, route.message || "Delivery is outside the 50 km limit.");
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) {
      throw new HttpError(400, "Your basket must contain between 1 and 30 different items.");
    }

    const address = typeof body.address === "string" ? body.address.trim().slice(0, 500) : "";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "";
    const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(`${coordinates.latitude},${coordinates.longitude}`)}`;
    const { data, error } = await admin.rpc("place_route_delivery_order_internal", {
      p_customer_id: user.id,
      p_location_id: route.branch_id,
      p_items: body.items,
      p_delivery_address: address || null,
      p_delivery_map_url: mapUrl,
      p_delivery_latitude: coordinates.latitude,
      p_delivery_longitude: coordinates.longitude,
      p_distance_meters: route.distance_meters,
      p_notes: notes || null,
    });
    if (error) {
      console.error("place_route_delivery_order_internal failed", error.message);
      throw new HttpError(400, error.message || "The delivery order could not be saved.");
    }
    return jsonResponse(data, 201);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (!(error instanceof HttpError)) console.error("delivery-routing failed", error);
    const message = error instanceof HttpError ? error.message : "The delivery service could not confirm the route. No order has been placed.";
    return jsonResponse({ message }, status);
  }
});
