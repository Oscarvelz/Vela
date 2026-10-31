import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/vela/i18n";
import { cn } from "@/lib/cn";
import { fieldClass, Button } from "./ui";

type LatLng = { lat: number; lng: number };

async function reverseAddress(lat: number, lng: number) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) return "";
  const data = (await response.json()) as { display_name?: string };
  return data.display_name || "";
}

async function searchAddress(query: string) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { lat?: string; lon?: string; display_name?: string }[];
  const hit = data[0];
  if (!hit?.lat || !hit.lon) return null;
  return { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name || query };
}

export function MapAddress({
  address,
  onAddress,
}: {
  address: string;
  onAddress: (value: string) => void;
}) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const onAddressRef = useRef(onAddress);
  const [status, setStatus] = useState<"locating" | "ready" | "denied">("locating");
  const [query, setQuery] = useState("");
  onAddressRef.current = onAddress;

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    let cancelled = false;
    let map: import("leaflet").Map | null = null;

    void (async () => {
      const leaflet = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (cancelled) return;
      const L = leaflet.default ?? leaflet;
      map = L.map(node, { zoomControl: false, attributionControl: true }).setView([20, 0], 2);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);
      const icon = L.divIcon({
        className: "",
        html: '<span style="display:block;width:16px;height:16px;border-radius:999px;background:#e7c27a;box-shadow:0 0 0 6px rgba(231,194,122,.28)"></span>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      const marker = L.marker(map.getCenter(), { icon, draggable: true }).addTo(map);
      mapRef.current = map;
      markerRef.current = marker;
      const settle = (point: LatLng, zoom = 16) => {
        marker.setLatLng([point.lat, point.lng]);
        map?.setView([point.lat, point.lng], zoom);
        void reverseAddress(point.lat, point.lng).then((label) => {
          if (!cancelled && label) onAddressRef.current(label);
        });
      };
      marker.on("dragend", () => {
        const point = marker.getLatLng();
        settle({ lat: point.lat, lng: point.lng }, map?.getZoom());
      });
      map.on("click", (event) => {
        settle({ lat: event.latlng.lat, lng: event.latlng.lng }, map?.getZoom());
      });
      requestAnimationFrame(() => map?.invalidateSize());
      if (!navigator.geolocation) {
        setStatus("denied");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (cancelled) return;
          setStatus("ready");
          settle({ lat: position.coords.latitude, lng: position.coords.longitude });
        },
        () => {
          if (!cancelled) setStatus("denied");
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
      );
    })();

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  return (
    <div className="mt-3 space-y-2">
      <div ref={box} className="h-56 overflow-hidden rounded-card border border-border bg-surface" />
      <p className="text-sm leading-relaxed text-dim">
        {status === "locating" ? t("mapSearching") : status === "denied" ? t("mapDenied") : t("mapHint")}
      </p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const next = query.trim();
          if (!next) return;
          void searchAddress(next).then((hit) => {
            if (!hit) return;
            onAddress(hit.label);
            markerRef.current?.setLatLng([hit.lat, hit.lng]);
            mapRef.current?.setView([hit.lat, hit.lng], 16);
          });
        }}
      >
        <input
          className={cn(fieldClass, "min-w-0 flex-1")}
          value={query}
          placeholder={t("mapSearchPh")}
          aria-label={t("mapSearchPh")}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button type="submit" variant="ghost" className="min-h-11 px-4">
          {t("mapAddress")}
        </Button>
      </form>
      {address ? <p className="text-sm leading-relaxed">{address}</p> : null}
    </div>
  );
}
