import type { LibraryEntry } from './types';

export interface LibraryQuery {
  q?: string;
  region?: string;
  minRating?: number;
  minLengthKm?: number;
  maxLengthKm?: number;
  minCurviness?: number;
  sort?: 'rating' | 'length' | 'curviness';
}

export function filterLibrary(all: LibraryEntry[], f: LibraryQuery): LibraryEntry[] {
  const q = f.q?.toLowerCase().trim();
  const region = f.region?.toLowerCase().trim();
  const rows = all.filter(
    (e) =>
      (!q || [e.name, e.city, e.region, e.country, ...e.tags].some((s) => s.toLowerCase().includes(q))) &&
      (!region || `${e.city} ${e.region} ${e.country}`.toLowerCase().includes(region)) &&
      (f.minRating == null || e.rating >= f.minRating) &&
      (f.minLengthKm == null || e.lengthKm >= f.minLengthKm) &&
      (f.maxLengthKm == null || e.lengthKm <= f.maxLengthKm) &&
      (f.minCurviness == null || e.curviness >= f.minCurviness),
  );
  const key = { rating: 'rating', length: 'lengthKm', curviness: 'curviness' }[f.sort ?? 'rating'] as keyof LibraryEntry;
  return rows.sort((a, b) => (b[key] as number) - (a[key] as number));
}
