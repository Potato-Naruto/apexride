export interface LatLng {
  lat: number;
  lng: number;
}

/** A single announced event on the route (turn, fork, exit, roundabout, arrival). */
export interface Maneuver {
  id: number;
  /** Distance from route start in metres where the maneuver happens. */
  at: number;
  type: string;
  modifier?: string;
  /** Road the rider ends up on after this maneuver. */
  road: string;
  /** Imperative phrase, e.g. "turn left onto Main Street". */
  text: string;
  location: LatLng;
}

/**
 * One continuous route. Intermediate waypoints are *not* represented as
 * arrivals - they are only anchors the geometry passes through.
 */
export interface RouteData {
  id: string;
  name: string;
  waypoints: LatLng[];
  /** [lng, lat] pairs (GeoJSON order). */
  geometry: [number, number][];
  /** cumulative[i] = metres from start to geometry[i]. */
  cumulative: number[];
  distance: number;
  duration: number;
  /** 0-100, degrees of heading change per km scaled. */
  curviness: number;
  maneuvers: Maneuver[];
}

export type RoutePreference = 'fastest' | 'curvy';

export interface LibraryEntry {
  id: string;
  name: string;
  city: string;
  region: string;
  country: string;
  lengthKm: number;
  rating: number;
  curviness: number;
  tags: string[];
  source: string;
  waypoints: LatLng[];
  description?: string;
}

export interface Rider {
  id: string;
  name: string;
  color: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  ts: number;
}
