export const COMIC_GENRES = [
  "Fantasy",
  "Sci-fi",
  "Drama",
  "Comedy",
  "Action",
  "Romance",
  "Horror",
  "Mystery",
  "Thriller",
  "Adventure",
  "Slice of Life",
  "Supernatural",
  "Historical",
  "Sports",
  "Kids",
  "Inspirational",
] as const;

export const COMIC_GENRE_LABELS: Record<(typeof COMIC_GENRES)[number], string> = {
  Fantasy: "Fantasi",
  "Sci-fi": "Fiksi ilmiah",
  Drama: "Drama",
  Comedy: "Komedi",
  Action: "Aksi",
  Romance: "Romansa",
  Horror: "Horor",
  Mystery: "Misteri",
  Thriller: "Thriller",
  Adventure: "Petualangan",
  "Slice of Life": "Kehidupan sehari-hari",
  Supernatural: "Supranatural",
  Historical: "Sejarah",
  Sports: "Olahraga",
  Kids: "Anak",
  Inspirational: "Inspiratif",
};

export function getComicGenreLabel(genre: string) {
  return COMIC_GENRE_LABELS[genre as keyof typeof COMIC_GENRE_LABELS] || genre;
}
