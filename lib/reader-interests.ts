import { COMIC_GENRES, getComicGenreLabel } from "@/lib/comic-genres";

export const READER_INTEREST_GENRES = COMIC_GENRES;
export const MAX_READER_INTEREST_GENRES = 5;
export type ReaderInterestGenre = (typeof READER_INTEREST_GENRES)[number];

export function isReaderInterestGenre(value: string): value is ReaderInterestGenre {
  return (READER_INTEREST_GENRES as readonly string[]).includes(value);
}

export { getComicGenreLabel };
