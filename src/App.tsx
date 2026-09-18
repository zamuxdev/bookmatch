import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Film,
  LoaderCircle,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import Poster from "./components/Poster";
import { createPayment, recommendBooks, searchMovies } from "./services/api";
import type { Book, MatchResult, Movie } from "./types";
const paymentMessages = {
  success: "Compra de prueba completada correctamente.",
  failure: "El pago de prueba no pudo completarse.",
  pending: "El pago de prueba quedó pendiente.",
} as const;
type PaymentStatus = keyof typeof paymentMessages;
function bookPrice(title: string) {
  let hash = 0;
  for (let i = 0; i < title.length; i++)
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  return 249 + (hash % 151);
}
const loadingMessages = [
  "Analizando tus películas...",
  "Encontrando temas en común...",
  "Buscando entre los libros...",
  "Encontrando tu próxima lectura...",
];
const films = [
  {
    title: "Interstellar",
    poster: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
  },
  {
    title: "The Grand Budapest Hotel",
    poster: "https://image.tmdb.org/t/p/w500/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg",
  },
  {
    title: "Dune",
    poster: "https://image.tmdb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg",
  },
];
export default function App() {
  const [query, setQuery] = useState(""),
    [matches, setMatches] = useState<Movie[]>([]),
    [selected, setSelected] = useState<Movie[]>([]),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState(""),
    [error, setError] = useState(""),
    [stage, setStage] = useState<"select" | "loading" | "results">("select"),
    [result, setResult] = useState<MatchResult | null>(null),
    [step, setStep] = useState(0),
    [searched, setSearched] = useState(false),
    [buying, setBuying] = useState<string | null>(null),
    [buyError, setBuyError] = useState(""),
    [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("payment");
    if (!status) return;
    if (status in paymentMessages) setPaymentStatus(status as PaymentStatus);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setMatches([]);
    setSearchError("");
    setSearched(false);
    setSearching(false);
    if (query.trim().length < 2) return;
    setSearching(true);
    const timer = setTimeout(() => {
      searchMovies(
        query.trim(),
        AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
      )
        .then((data) => {
          if (!controller.signal.aborted) {
            setMatches(data.movies);
            setSearched(true);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setSearchError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  useEffect(() => {
    if (stage !== "loading") return;
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, 3)), 4500);
    return () => clearInterval(timer);
  }, [stage]);
  function select(movie: Movie) {
    if (selected.some((m) => m.id === movie.id)) return;
    if (selected.length === 3) {
      setError("Elige solo tres películas. Quita una para agregar otra.");
      return;
    }
    setSelected((s) => [...s, movie]);
    setQuery("");
    setError("");
    searchRef.current?.focus();
  }
  async function findBooks() {
    if (selected.length !== 3) return;
    setError("");
    setStage("loading");
    setStep(0);
    try {
      const data = await recommendBooks(selected);
      setResult(data);
      setStage("results");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Algo salió mal. Inténtalo de nuevo.",
      );
      setStage("select");
    }
  }
  async function buy(book: Book) {
    if (buying) return;
    setBuyError("");
    setBuying(book.title);
    try {
      const { checkoutUrl } = await createPayment(book, bookPrice(book.title));
      window.location.href = checkoutUrl;
    } catch (e) {
      setBuyError(
        e instanceof Error
          ? e.message
          : "Algo salió mal. Inténtalo de nuevo.",
      );
      setBuying(null);
    }
  }
  function reset() {
    setSelected([]);
    setResult(null);
    setQuery("");
    setError("");
    setStage("select");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  return (
    <div className="app-shell">
      <header>
        <a className="brand" href="/" aria-label="Inicio de BookMatch">
          <span className="brand-icon">
            <BookOpen size={23} />
          </span>
          BOOK<span>MATCH</span>
          <span className="brand-dot">.</span>
        </a>
        <a className="how-link" href="#how-it-works">
          Cómo funciona <ArrowUpRight size={15} />
        </a>
      </header>
      <main>
        {paymentStatus && (
          <div
            className={`payment-banner payment-${paymentStatus}`}
            role="status"
          >
            <p>{paymentMessages[paymentStatus]}</p>
            <span>Pago simulado · No se realizó ningún cargo real.</span>
            <button
              className="icon-button"
              onClick={() => setPaymentStatus(null)}
              aria-label="Cerrar aviso de pago"
            >
              <X size={15} />
            </button>
          </div>
        )}
        {stage === "select" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span /> DESCUBRE TU PRÓXIMA LECTURA
                </div>
                <h1>
                  Tus películas.
                  <br />
                  Tu próximo <em>libro.</em>
                </h1>
                <p className="intro">
                  Elige 3 películas que te encanten y descubre libros
                  <br className="desktop-break" /> que no podrás dejar de leer.
                </p>
                <div className="hero-note">
                  <span className="mini-icon">
                    <Film size={16} />
                  </span>
                  <span>
                    A tu gusto, con un toque de inteligencia artificial.
                  </span>
                </div>
              </div>
              <div
                className="hero-art"
                aria-label="Un mundo de historias, de la pantalla al papel"
              >
                <div className="art-orbit" />
                <div className="poster-stack">
                  {films.map((f, i) => (
                    <div className={`art-poster art-poster-${i}`} key={f.title}>
                      <Poster src={f.poster} title={f.title} />
                    </div>
                  ))}
                </div>
                <div className="floating-label">
                  <Sparkles size={16} />
                  <span>La misma emoción. Otra historia.</span>
                </div>
                <span className="art-caption">
                  DE LA PANTALLA A TU LIBRERO
                </span>
              </div>
            </section>
            <section className="selection-panel">
              <div className="section-top">
                <div>
                  <div className="eyebrow muted">LA PRIMERA ESCENA</div>
                  <h2>¿Cuáles son tus tres películas?</h2>
                </div>
                <span className="selection-count">
                  <b>{selected.length}</b> / 3 seleccionadas
                </span>
              </div>
              <div className="search-container">
                <div className="search-box">
                  <Search size={21} />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    maxLength={100}
                    placeholder="Busca una película que te encante…"
                    aria-label="Buscar películas"
                    aria-controls="movie-results"
                    autoComplete="off"
                  />
                  {searching ? (
                    <LoaderCircle className="spin" size={19} />
                  ) : query ? (
                    <button
                      className="icon-button"
                      onClick={() => setQuery("")}
                      aria-label="Borrar búsqueda"
                    >
                      <X size={18} />
                    </button>
                  ) : (
                    <span className="search-hint">Busca por título</span>
                  )}
                </div>
                {query.trim().length > 0 && (
                  <div
                    id="movie-results"
                    className="search-results"
                    aria-live="polite"
                  >
                    {query.trim().length < 2 ? (
                      <p>Escribe al menos 2 caracteres para buscar una película.</p>
                    ) : searchError ? (
                      <p role="alert">{searchError}</p>
                    ) : searching ? (
                      <p>Buscando películas…</p>
                    ) : searched && matches.length === 0 ? (
                      <p>No encontramos películas. Prueba con otro título.</p>
                    ) : (
                      matches.map((movie) => (
                        <button
                          className="search-result"
                          key={movie.id}
                          onClick={() => select(movie)}
                          disabled={selected.some((m) => m.id === movie.id)}
                        >
                          <div className="result-poster">
                            <Poster src={movie.poster} title={movie.title} />
                          </div>
                          <span>
                            <strong>{movie.title}</strong>
                            <small>{movie.year || "Año no disponible"}</small>
                          </span>
                          {selected.some((m) => m.id === movie.id) ? (
                            <Check size={18} />
                          ) : (
                            <Plus size={18} />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="selected-grid">
                {[0, 1, 2].map((i) => {
                  const movie = selected[i];
                  return movie ? (
                    <div className="selected-card filled" key={movie.id}>
                      <Poster src={movie.poster} title={movie.title} />
                      <div className="selected-shade" />
                      <span className="slot-number">0{i + 1}</span>
                      <button
                        className="remove-movie"
                        aria-label={`Quitar ${movie.title}`}
                        onClick={() => {
                          setSelected((s) =>
                            s.filter((m) => m.id !== movie.id),
                          );
                          setError("");
                        }}
                      >
                        <X size={16} />
                      </button>
                      <div className="selected-title">
                        <h3>{movie.title}</h3>
                        <span>{movie.year}</span>
                      </div>
                    </div>
                  ) : (
                    <button
                      key={i}
                      className="selected-card empty"
                      onClick={() => searchRef.current?.focus()}
                      aria-label={`Elegir película ${i + 1}`}
                    >
                      <span className="slot-number">0{i + 1}</span>
                      <span className="add-circle">
                        <Plus size={23} />
                      </span>
                      <strong>
                        {
                          [
                            "La que puedes ver una y otra vez",
                            "La que dejó huella en ti",
                            "La que te representa",
                          ][i]
                        }
                      </strong>
                      <span>
                        Elige tu {["primera", "segunda", "tercera"][i]} película
                      </span>
                    </button>
                  );
                })}
              </div>
              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
              <div className="selection-bottom">
                <p>
                  <span className="tiny-dots">
                    {[0, 1, 2].map((i) => (
                      <i
                        key={i}
                        className={i < selected.length ? "active" : ""}
                      />
                    ))}
                  </span>
                  {selected.length === 3
                    ? "Tus tres películas están listas. Pasemos de página."
                    : "Tres películas. Un nuevo capítulo."}
                </p>
                <button
                  className="primary-button"
                  disabled={selected.length !== 3}
                  onClick={findBooks}
                >
                  <Sparkles size={17} /> ENCONTRAR MI PRÓXIMO LIBRO{" "}
                  <ArrowRight size={18} />
                </button>
              </div>
            </section>
            <section className="how-section" id="how-it-works">
              <span className="eyebrow muted">
                UN GIRO PARA TUS PRÓXIMAS LECTURAS
              </span>
              <div className="steps">
                <div>
                  <span className="step-icon">
                    <Film />
                  </span>
                  <div>
                    <h3>Elige tus favoritas</h3>
                    <p>Tres películas que hablan de ti.</p>
                  </div>
                  <ChevronRight className="step-arrow" />
                </div>
                <div>
                  <span className="step-icon">
                    <Sparkles />
                  </span>
                  <div>
                    <h3>Conectamos tus gustos</h3>
                    <p>Los temas, la atmósfera, la magia.</p>
                  </div>
                  <ChevronRight className="step-arrow" />
                </div>
                <div>
                  <span className="step-icon">
                    <BookOpen />
                  </span>
                  <div>
                    <h3>Descubre tu próxima lectura</h3>
                    <p>Tres libros con tu tipo de historia.</p>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
        {stage === "loading" && (
          <section className="loading-screen" aria-live="polite">
            <div className="loading-symbol">
              <BookOpen size={44} />
              <Sparkles size={23} />
            </div>
            <span className="eyebrow">DE LA PANTALLA AL LIBRERO</span>
            <h1>{loadingMessages[step]}</h1>
            <p>Las buenas historias siempre se encuentran.</p>
            <div className="loading-movies">
              {selected.map((m) => (
                <div key={m.id}>
                  <Poster src={m.poster} title={m.title} />
                </div>
              ))}
            </div>
            <div className="loading-track">
              <span />
            </div>
          </section>
        )}
        {stage === "results" && result && (
          <section className="results-screen">
            <span className="eyebrow">
              <Sparkles size={15} /> TU PERFIL DE GUSTOS
            </span>
            <h1>
              Te gustan las
              <br />
              <em>historias extraordinarias.</em>
            </h1>
            <div className="traits">
              {result.tasteProfile.traits.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <p className="profile-summary">{result.tasteProfile.summary}</p>
            <div className="profile-movies">
              {selected.map((m) => (
                <div key={m.id}>
                  <div>
                    <Poster src={m.poster} title={m.title} />
                  </div>
                  <span>
                    {m.title}
                    <small>{m.year}</small>
                  </span>
                </div>
              ))}
            </div>
            <div className="reads-heading">
              <div>
                <span className="eyebrow muted">EL SIGUIENTE CAPÍTULO</span>
                <h2>
                  Tus próximas lecturas<span>.</span>
                </h2>
              </div>
              <span>TRES HISTORIAS PARA TI</span>
            </div>
            {result.warning && (
              <p className="metadata-warning" role="status">
                {result.warning}
              </p>
            )}
            <div className="books-grid">
              {result.recommendations.map((b, i) => {
                const price = bookPrice(b.title);
                return (
                <article className="book-card" key={b.title}>
                  <div className={`book-art book-art-${i}`}>
                    <span className="book-number">0{i + 1}</span>
                    <div className="book-cover">
                      <Poster src={b.cover} title={b.title} book />
                    </div>
                    <span className="match-score">
                      <Sparkles size={13} />
                      {b.matchScore}% DE AFINIDAD
                    </span>
                  </div>
                  <div className="book-copy">
                    <h3>{b.title}</h3>
                    <p className="author">
                      {b.author}
                      {b.publishedDate && (
                        <span> · {b.publishedDate.slice(0, 4)}</span>
                      )}
                    </p>
                    <div className="book-tags">
                      {b.categories.slice(0, 2).map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </div>
                    <h4>Por qué te gustará</h4>
                    <p>{b.reason}</p>
                    {b.description && (
                      <details>
                        <summary>Sobre el libro</summary>
                        <p>{b.description}</p>
                      </details>
                    )}
                    {b.infoLink && (
                      <a href={b.infoLink} target="_blank" rel="noreferrer">
                        Ver este libro <ArrowUpRight size={15} />
                      </a>
                    )}
                    <div className="buy-section">
                      <button
                        className="buy-button"
                        disabled={buying !== null}
                        onClick={() => buy(b)}
                      >
                        {buying === b.title ? (
                          <>
                            <LoaderCircle className="spin" size={15} />
                            Conectando con Mercado Pago…
                          </>
                        ) : (
                          <>
                            <ShoppingBag size={15} />
                            Comprar libro · ${price} MXN
                          </>
                        )}
                      </button>
                      <span className="sandbox-note">
                        Pago simulado · No se realizará ningún cargo real.
                      </span>
                    </div>
                  </div>
                </article>
                );
              })}
            </div>
            {buyError && (
              <p className="error-message" role="alert">
                {buyError}
              </p>
            )}
            <p className="score-note">
              Los porcentajes de afinidad son una interpretación de tus gustos hecha por IA.
            </p>
            <button className="primary-button reset-button" onClick={reset}>
              PROBAR CON OTRAS 3 PELÍCULAS <ArrowRight size={17} />
            </button>
          </section>
        )}
      </main>
      <footer>
        <a className="brand footer-brand" href="/">
          {" "}
          <BookOpen size={17} /> BOOKMATCH!<span className="brand-dot">.</span>
        </a>
        <p>Por amor a las buenas historias.</p>
        <span>
          Datos de películas de{" "}
          <a
            href="https://www.themoviedb.org/"
            target="_blank"
            rel="noreferrer"
          >
            TMDB
          </a>{" "}
          <span className="footer-dot">·</span> Libros de Google Books y Open Library
        </span>
      </footer>
      <p className="attribution">
        Este producto usa la API de TMDB, pero TMDB no lo avala ni certifica.
      </p>
    </div>
  );
}
