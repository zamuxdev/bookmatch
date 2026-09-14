import { aiProvider } from "./ai.js";
import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import {
  createCheckoutPreference,
  enrichBook,
  inputSchema,
  movieSummary,
  paymentSchema,
  PublicError,
  tmdb,
} from "./services.js";
const response = (status: number, body: unknown): HttpResponseInit => ({
  status,
  jsonBody: body,
  headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
});
function failure(e: unknown) {
  return e instanceof PublicError
    ? response(e.status, { error: { code: e.code, message: e.message } })
    : response(500, {
        error: {
          code: "INTERNAL",
          message: "Algo salió mal. Inténtalo de nuevo.",
        },
      });
}
export async function searchMovies(
  req: HttpRequest,
): Promise<HttpResponseInit> {
  try {
    const query = req.query.get("query")?.trim() || "";
    if (query.length < 2 || query.length > 100)
      throw new PublicError(
        400,
        "INPUT",
        "Escribe entre 2 y 100 caracteres para buscar.",
      );
    const data = await tmdb("search/movie", {
      query,
      include_adult: "false",
      page: "1",
    });
    return response(200, {
      movies: data.results
        .filter((m: any) => !m.adult)
        .slice(0, 12)
        .map(movieSummary),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function recommendBooks(
  req: HttpRequest,
): Promise<HttpResponseInit> {
  try {
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new PublicError(
        415,
        "INPUT",
        "Envía tu selección de películas en formato JSON.",
      );
    if (Number(req.headers.get("content-length")) > 16384)
      throw new PublicError(
        413,
        "INPUT",
        "Tu selección es demasiado grande. Elige tres películas de nuevo.",
      );
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 16384)
      throw new PublicError(413, "INPUT", "Tu selección es demasiado grande.");
    let parsed;
    try {
      parsed = inputSchema.safeParse(JSON.parse(raw));
    } catch {
      throw new PublicError(
        400,
        "INPUT",
        "Selecciona exactamente tres películas diferentes.",
      );
    }
    if (!parsed.success)
      throw new PublicError(
        400,
        "INPUT",
        "Selecciona exactamente tres películas diferentes.",
      );
    const movies = await Promise.all(
      parsed.data.movies.map(async ({ id }) => {
        const m = await tmdb(`movie/${id}`, { append_to_response: "keywords" });
        return {
          id: m.id,
          title: m.title,
          overview: m.overview,
          genres: m.genres?.map((x: any) => x.name),
          keywords: m.keywords?.keywords?.map((x: any) => x.name),
        };
      }),
    );
    const result = await aiProvider.recommend(movies);
    const recommendations = await Promise.all(
      result.recommendations.map(enrichBook),
    );
    return response(200, {
      tasteProfile: result.tasteProfile,
      movies,
      recommendations,
      warning: recommendations.some((b) => b.metadataStatus !== "available")
        ? "No pudimos verificar algunos libros en los catálogos. Tus recomendaciones siguen disponibles."
        : null,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function createPayment(
  req: HttpRequest,
): Promise<HttpResponseInit> {
  try {
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new PublicError(
        415,
        "INPUT",
        "Envía los datos del libro en formato JSON.",
      );
    if (Number(req.headers.get("content-length")) > 4096)
      throw new PublicError(413, "INPUT", "La solicitud es demasiado grande.");
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 4096)
      throw new PublicError(413, "INPUT", "La solicitud es demasiado grande.");
    let parsed;
    try {
      parsed = paymentSchema.safeParse(JSON.parse(raw));
    } catch {
      throw new PublicError(400, "INPUT", "Los datos del libro no son válidos.");
    }
    if (!parsed.success)
      throw new PublicError(400, "INPUT", "Los datos del libro no son válidos.");
    return response(200, await createCheckoutPreference(parsed.data));
  } catch (e) {
    return failure(e);
  }
}
app.http("searchMovies", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "movies",
  handler: searchMovies,
});
app.http("recommendBooks", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "recommend",
  handler: recommendBooks,
});
app.http("createPayment", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "create-payment",
  handler: createPayment,
});
