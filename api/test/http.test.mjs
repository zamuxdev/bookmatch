import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import azure from '@azure/functions';
const { HttpRequest } = azure;
import { searchMovies, recommendBooks } from '../dist/functions.js';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const post = (body) => new HttpRequest({ method: 'POST', url: 'http://localhost/api/recommend', headers: { 'content-type': 'application/json' }, body: { string: body } });
test('HTTP handler rejects malformed and oversized bodies', async () => {
  assert.equal((await recommendBooks(post('{'))).status, 400);
  assert.equal((await recommendBooks(post('x'.repeat(16385)))).status, 413);
});
test('search exposes only public movie fields', async () => {
  process.env.TMDB_API_KEY = 'test';
  globalThis.fetch = async () => Response.json({ results: [{id: 1, title: 'Arrival', release_date: '2016-11-10', poster_path: '/poster.jpg', overview: 'First contact', popularity: 30}] });
  const response = await searchMovies(new HttpRequest({method: 'GET', url: 'http://localhost/api/movies?query=arrival'}));
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.jsonBody.movies[0]).sort(), ['id','overview','poster','title','year']);
});
test('recommendation handler completes all three services and ignores client titles', async () => {
  Object.assign(process.env, { TMDB_API_KEY: 'test', AI_API_URL: 'https://ai.example/chat', AI_API_KEY: 'test', AI_MODEL: 'test' });
  const recommendations = ['Solaris','Dune','Contact'].map(title => ({title, author: 'Test author', reason: 'Like Arrival, this explores first contact.', matchScore: 94}));
  globalThis.fetch = async (url, init) => {
    if (url.includes('themoviedb.org')) return Response.json({id: Number(new URL(url).pathname.split('/').at(-1)), title: 'Trusted TMDB title', overview: 'Story', genres: [{name:'Science Fiction'}], keywords: {keywords:[{name:'contact'}]}});
    if (url.includes('ai.example')) {
      assert.ok(init.body.includes('Trusted TMDB title'));
      assert.ok(!init.body.includes('Untrusted client title'));
      return Response.json({choices:[{message:{content:JSON.stringify({tasteProfile:{summary:'Curious',traits:['Science Fiction']},recommendations})}}]});
    }
    return Response.json({items:[]});
  };
  const response = await recommendBooks(post(JSON.stringify({movies:[1,2,3].map(id=>({id,title:'Untrusted client title'}))})));
  assert.equal(response.status, 200);
  assert.equal(response.jsonBody.recommendations.length, 3);
  assert.equal(response.jsonBody.movies.length, 3);
  assert.ok(response.jsonBody.warning);
});
