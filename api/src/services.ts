import { z } from "zod";
export class PublicError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const inputSchema = z.object({
  movies: z
    .array(z.object({ id: z.number().int().positive().max(2147483647) }))
    .length(3)
    .refine((m) => new Set(m.map((x) => x.id)).size === 3),
});
export const outputSchema = z.object({
  tasteProfile: z.object({
    summary: z.string().min(1).max(1000),
    traits: z.array(z.string().min(1).max(60)).min(1).max(6),
  }),
  recommendations: z
    .array(
      z.object({
        title: z.string().min(1).max(250),
        author: z.string().min(1).max(200),
        reason: z.string().min(1).max(1500),
        matchScore: z.number().int().min(0).max(100),
      }),
    )
    .length(3)
    .refine(
      (books) => new Set(books.map((b) => normalize(b.title))).size === 3,
    ),
});
export const paymentSchema = z
  .object({
    title: z.string().trim().min(1).max(250),
    author: z.string().trim().min(1).max(200),
    price: z.number().min(1).max(10000),
  })
  .strict();
const preferenceSchema = z.object({
  id: z.string().min(1),
  init_point: z.string().optional(),
  sandbox_init_point: z.string().optional(),
});
export async function createCheckoutPreference(
  payment: z.infer<typeof paymentSchema>,
) {
  const token = setting("MERCADOPAGO_ACCESS_TOKEN");
  let base: URL;
  try {
    base = new URL(setting("APP_BASE_URL"));
    if (!["http:", "https:"].includes(base.protocol)) throw new Error();
  } catch {
    throw new PublicError(
      503,
      "CONFIGURATION",
      "Falta configurar APP_BASE_URL con una URL válida en el backend.",
    );
  }
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  const data = await jsonFetch(
    "https://api.mercadopago.com/checkout/preferences",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            title: payment.title,
            description: `Libro recomendado por BookMatch · ${payment.author}`,
            quantity: 1,
            currency_id: "MXN",
            unit_price: payment.price,
          },
        ],
        back_urls: {
          success: `${base.origin}/?payment=success`,
          failure: `${base.origin}/?payment=failure`,
          pending: `${base.origin}/?payment=pending`,
        },
        // Mercado Pago rechaza auto_return cuando las back_urls son locales.
        ...(isLocal ? {} : { auto_return: "approved" }),
      }),
    },
    10000,
    "PAYMENTS",
  );
  const preference = preferenceSchema.safeParse(data);
  const checkoutUrl = preference.success
    ? preference.data.sandbox_init_point || preference.data.init_point
    : null;
  if (!preference.success || !checkoutUrl)
    throw new PublicError(
      502,
      "PAYMENTS_ERROR",
      "El servicio de pagos no está disponible. Inténtalo de nuevo.",
    );
  return { checkoutUrl, preferenceId: preference.data.id };
}
export function setting(name: string) {
  const value = process.env[name];
  if (!value)
    throw new PublicError(
      503,
      "CONFIGURATION",
      `Falta configurar ${name} en el backend. Revisa tu .env y reinicia los contenedores.`,
    );
  return value;
}
export async function jsonFetch(
  url: string,
  init: RequestInit = {},
  timeout = 8000,
  service = "TMDB",
): Promise<any> {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) throw new Error("upstream");
    return await response.json();
  } catch (e) {
    if (
      e instanceof Error &&
      (e.name === "TimeoutError" || e.name === "AbortError")
    )
      throw new PublicError(
        504,
        "TIMEOUT",
        "La solicitud tardó demasiado. Inténtalo de nuevo.",
      );
    throw new PublicError(
      502,
      `${service}_ERROR`,
      service === "AI"
        ? "El servicio de recomendaciones no está disponible. Inténtalo de nuevo."
        : service === "PAYMENTS"
          ? "El servicio de pagos no está disponible. Inténtalo de nuevo."
          : "No pudimos consultar el catálogo de películas. Inténtalo de nuevo.",
    );
  }
}
export async function tmdb(path: string, params: Record<string, string> = {}) {
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  url.search = new URLSearchParams({
    ...params,
    api_key: setting("TMDB_API_KEY"),
    language: "es-MX",
  }).toString();
  return jsonFetch(url.toString());
}
export function movieSummary(m: any) {
  return {
    id: m.id,
    title: m.title,
    year: m.release_date?.slice(0, 4) || "",
    poster: m.poster_path
      ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
      : null,
    overview: m.overview || "",
  };
}
export function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
function safeLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.protocol = "https:";
    return url.toString();
  } catch {
    return null;
  }
}
async function googleBook(
  book: z.infer<typeof outputSchema>["recommendations"][number],
) {
  const fallback = {
    ...book,
    cover: null as string | null,
    description: "",
    publishedDate: "",
    categories: [] as string[],
    infoLink: null as string | null,
    metadataStatus: "unavailable",
  };
  try {
    const url = new URL("https://www.googleapis.com/books/v1/volumes");
    url.search = new URLSearchParams({
      q: `intitle:"${book.title}" inauthor:"${book.author}"`,
      maxResults: "5",
      printType: "books",
      langRestrict: "es",
      ...(process.env.GOOGLE_BOOKS_API_KEY
        ? { key: process.env.GOOGLE_BOOKS_API_KEY }
        : {}),
    }).toString();
    const data = await jsonFetch(url.toString(), {}, 5000, "BOOKS");
    const found = data.items?.find(
      (item: any) =>
        normalize(item.volumeInfo?.title || "") === normalize(book.title) &&
        item.volumeInfo?.authors?.some(
          (a: string) => normalize(a) === normalize(book.author),
        ),
    );
    if (!found) return { ...fallback, metadataStatus: "not_found" };
    const v = found.volumeInfo;
    return {
      ...book,
      title: v.title,
      author: v.authors.join(", "),
      cover: safeLink(v.imageLinks?.thumbnail) || safeLink(v.imageLinks?.smallThumbnail),
      description:
        typeof v.description === "string"
          ? v.description.replace(/<[^>]*>/g, "").slice(0, 3000)
          : "",
      publishedDate: v.publishedDate || "",
      categories: v.categories || [],
      infoLink: safeLink(v.infoLink),
      metadataStatus: "available",
    };
  } catch {
    return fallback;
  }
}

// Accept subtitles, but not sequels or unrelated books with similar names.
function sameTitle(candidate: string, title: string) {
  return normalize(candidate) === normalize(title) ||
    normalize(candidate.split(/[:：]/)[0]) === normalize(title);
}

export async function enrichBook(
  book: z.infer<typeof outputSchema>["recommendations"][number],
) {
  const result = await googleBook(book);
  if (result.cover) return result;
  try {
    const url = new URL("https://openlibrary.org/search.json");
    url.search = new URLSearchParams({
      title: book.title,
      author: book.author,
      lang: "es",
      limit: "5",
      fields: "key,title,author_name,cover_i,editions,editions.title,editions.cover_i",
    }).toString();
    const data = await jsonFetch(url.toString(), {}, 8000, "BOOKS");
    for (const work of data.docs || []) {
      if (!work.author_name?.some((author: string) =>
        normalize(author) === normalize(book.author))) continue;
      const edition = work.editions?.docs?.find((item: any) =>
        typeof item.title === "string" && sameTitle(item.title, book.title) &&
        Number.isInteger(item.cover_i) && item.cover_i > 0);
      const coverId = edition?.cover_i ||
        (typeof work.title === "string" && sameTitle(work.title, book.title)
          ? work.cover_i : null);
      if (!Number.isInteger(coverId) || coverId <= 0) continue;
      return {
        ...result,
        cover: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`,
        infoLink: result.infoLink ||
          (typeof work.key === "string" && /^\/works\/OL\d+W$/.test(work.key)
            ? `https://openlibrary.org${work.key}` : null),
        metadataStatus: "available",
      };
    }
  } catch {
    // Keep the recommendation even when both catalogs are unavailable.
  }
  return result;
}
