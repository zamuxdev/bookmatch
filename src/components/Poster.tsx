import { useState } from "react";
import { BookOpen, Film } from "lucide-react";
export default function Poster({
  src,
  title,
  book = false,
}: {
  src: string | null;
  title: string;
  book?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return src && failedSrc !== src ? (
    <img src={src} alt={title} onError={() => setFailedSrc(src)} loading="lazy" />
  ) : (
    <div className="poster-fallback">
      {book ? <BookOpen /> : <Film />}
      <span>{title}</span>
    </div>
  );
}
