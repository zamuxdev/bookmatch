export interface Movie {
  id: number;
  title: string;
  year: string;
  poster: string | null;
  overview: string;
}
export interface Book {
  title: string;
  author: string;
  reason: string;
  matchScore: number;
  cover: string | null;
  description: string;
  publishedDate: string;
  categories: string[];
  infoLink: string | null;
}
export interface MatchResult {
  tasteProfile: { summary: string; traits: string[] };
  recommendations: Book[];
  warning: string | null;
}
