import type { Book, MatchResult, Movie } from "../types";
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  try {
    const response = await fetch(`/api/${path}`, options);
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("El servicio no está disponible. Inténtalo de nuevo en unos momentos.");
    }
    if (!response.ok)
      throw new Error(
        data.error?.message || "Algo salió mal. Inténtalo de nuevo.",
      );
    return data as T;
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError")
      throw new Error("La solicitud tardó demasiado. Inténtalo de nuevo.");
    if (e instanceof TypeError)
      throw new Error(
        "No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.",
      );
    throw e;
  }
}
export const searchMovies = (query: string, signal: AbortSignal) =>
  request<{ movies: Movie[] }>(`movies?query=${encodeURIComponent(query)}`, {
    signal,
  });
export const recommendBooks = (movies: Movie[]) =>
  request<MatchResult>("recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ movies: movies.map(({ id }) => ({ id })) }),
    signal: AbortSignal.timeout(45000),
  });
export const createPayment = (book: Book, price: number) =>
  request<{ checkoutUrl: string; preferenceId: string }>("create-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: book.title,
      author: book.author,
      price,
    }),
    signal: AbortSignal.timeout(30000),
  });
