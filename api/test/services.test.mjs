import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  inputSchema,
  outputSchema,
  enrichBook,
  jsonFetch,
} from "../dist/services.js";
import { aiProvider } from "../dist/ai.js";
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const books = [1, 2, 3].map((n) => ({
  title: `Book ${n}`,
  author: "Author",
  reason: "Like Arrival, this explores language.",
  matchScore: 94,
}));
const valid = {
  tasteProfile: { summary: "Thoughtful stories", traits: ["Atmospheric"] },
  recommendations: books,
};
test("requires exactly three distinct positive integer IDs", () => {
  assert.equal(
    inputSchema.safeParse({ movies: [{ id: 1 }, { id: 2 }, { id: 3 }] })
      .success,
    true,
  );
  for (const ids of [
    [],
    [1, 2],
    [1, 2, 3, 4],
    [1, 1, 2],
    [-1, 2, 3],
    [1.5, 2, 3],
    ["1", 2, 3],
  ])
    assert.equal(
      inputSchema.safeParse({ movies: ids.map((id) => ({ id })) }).success,
      false,
    );
});
test("rejects missing authors, duplicate books, invalid scores and wrong count", () => {
  assert.equal(outputSchema.safeParse(valid).success, true);
  for (const patch of [
    { author: "" },
    { matchScore: 101 },
    { matchScore: 4.5 },
    { title: "" },
  ])
    assert.equal(
      outputSchema.safeParse({
        ...valid,
        recommendations: [{ ...books[0], ...patch }, ...books.slice(1)],
      }).success,
      false,
    );
  assert.equal(
    outputSchema.safeParse({ ...valid, recommendations: books.slice(1) })
      .success,
    false,
  );
  assert.equal(
    outputSchema.safeParse({
      ...valid,
      recommendations: [books[0], books[0], books[2]],
    }).success,
    false,
  );
});
test("Google Books failure and incorrect matches retain AI recommendation", async () => {
  globalThis.fetch = async () => {
    throw new Error("sensitive upstream error");
  };
  assert.equal((await enrichBook(books[0])).title, "Book 1");
  globalThis.fetch = async () =>
    Response.json({
      items: [{ volumeInfo: { title: "Other book", authors: ["Author"] } }],
    });
  assert.equal((await enrichBook(books[0])).metadataStatus, "not_found");
});
test("Google Books enriches an exact match and upgrades cover HTTPS", async () => {
  globalThis.fetch = async () =>
    Response.json({
      items: [
        {
          volumeInfo: {
            title: "Book 1",
            authors: ["Author"],
            description: "<b>Story</b>",
            imageLinks: { thumbnail: "http://books.google.com/image" },
            infoLink: "javascript:alert(1)",
          },
        },
      ],
    });
  const result = await enrichBook(books[0]);
  assert.equal(result.description, "Story");
  assert.ok(result.cover.startsWith("https:"));
  assert.equal(result.infoLink, null);
});
test("timeouts and upstream failures have safe public messages", async () => {
  globalThis.fetch = async () => {
    throw new DOMException("secret", "TimeoutError");
  };
  await assert.rejects(
    () => jsonFetch("https://example.com"),
    (e) => e.code === "TIMEOUT" && !e.message.includes("secret"),
  );
});
test("AI adapter validates JSON instead of accepting free text", async () => {
  Object.assign(process.env, {
    AI_API_URL: "https://example.com/chat/completions",
    AI_API_KEY: "test",
    AI_MODEL: "test",
  });
  globalThis.fetch = async () =>
    Response.json({ choices: [{ message: { content: "not JSON" } }] });
  await assert.rejects(
    () => aiProvider.recommend([]),
    (e) => e.code === "AI_INVALID",
  );
  globalThis.fetch = async () =>
    Response.json({
      choices: [{ message: { content: JSON.stringify(valid) } }],
    });
  assert.equal((await aiProvider.recommend([])).recommendations.length, 3);
});

test("Open Library supplies a Spanish edition cover when Google Books is rate limited", async () => {
  globalThis.fetch = async (url) => url.includes('googleapis.com')
    ? Response.json({error: {message: 'quota'}}, {status: 429})
    : Response.json({docs: [{key: '/works/OL123W', title: 'Book in another language', author_name: ['Author'], cover_i: 42,
        editions: {docs: [{title: 'Book 1: A subtitle', cover_i: 123}]}}]});
  const result = await enrichBook(books[0]);
  assert.equal(result.cover, 'https://covers.openlibrary.org/b/id/123-L.jpg?default=false');
  assert.equal(result.title, 'Book 1');
  assert.equal(result.infoLink, 'https://openlibrary.org/works/OL123W');
});

test("fallback rejects different authors, sequels and invalid cover IDs", async () => {
  for (const patch of [{author_name: ['Someone else']}, {title: 'Book 10'}, {cover_i: -1}]) {
    globalThis.fetch = async (url) => url.includes('googleapis.com')
      ? Response.json({items: []})
      : Response.json({docs: [{title: 'Book 1', author_name: ['Author'], cover_i: 123, ...patch}]});
    assert.equal((await enrichBook(books[0])).cover, null);
  }
});

test("fallback preserves Google metadata when a matching volume has no cover", async () => {
  globalThis.fetch = async (url) => url.includes('googleapis.com')
    ? Response.json({items: [{volumeInfo: {title: 'Book 1', authors: ['Author'], description: 'Sinopsis'}}]})
    : Response.json({docs: [{title: 'Book 1', author_name: ['Author'], cover_i: 123}]});
  const result = await enrichBook(books[0]);
  assert.equal(result.description, 'Sinopsis');
  assert.ok(result.cover.includes('/123-L.jpg'));
});
