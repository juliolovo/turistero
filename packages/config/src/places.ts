import type { Place } from "@turistero/types";

/** Catálogo semilla. En Fase 2 pasa a la BD (tabla place) y cada usuario puede añadir países. */
export const PLACES: readonly Place[] = [
  { id: "managua", name: "Managua", country: "NI", timezone: "America/Managua", lat: 12.1364, lng: -86.2514 },
  { id: "leon", name: "León", country: "NI", timezone: "America/Managua", lat: 12.4379, lng: -86.878 },
  { id: "granada", name: "Granada", country: "NI", timezone: "America/Managua", lat: 11.9299, lng: -85.956 },
  { id: "masaya", name: "Masaya", country: "NI", timezone: "America/Managua", lat: 11.9744, lng: -86.0942 },
  { id: "rivas", name: "Rivas", country: "NI", timezone: "America/Managua", lat: 11.4373, lng: -85.8256 },
];

export const COUNTRIES: Record<string, { name: string; defaultPlaceId: string }> = {
  NI: { name: "Nicaragua", defaultPlaceId: "managua" },
};

export const DEFAULT_COUNTRY = "NI";

export function getPlace(id: string): Place | undefined {
  return PLACES.find((p) => p.id === id);
}

export function placesOf(country: string): Place[] {
  return PLACES.filter((p) => p.country === country);
}
