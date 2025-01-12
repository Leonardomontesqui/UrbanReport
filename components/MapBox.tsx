"use client";
import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { ReportForm } from "./ReportForm";
import { createClient } from "@supabase/supabase-js";
import Image from "next/image";

interface MarkerPosition {
  lng: number;
  lat: number;
}

interface Memory {
  id: string;
  title: string;
  image_url: string;
  location: [number, number];
}

export default function MapBox() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<{ [key: string]: mapboxgl.Marker }>({});
  const activeMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [selectedLocation, setSelectedLocation] =
    useState<MarkerPosition | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const clearCurrentMarker = () => {
    if (activeMarkerRef.current) {
      activeMarkerRef.current.remove();
      activeMarkerRef.current = null;
    }
    setSelectedLocation(null);
  };

  const handleMapClick = (e: mapboxgl.MapMouseEvent) => {
    const lngLat = e.lngLat;

    // Clear any existing marker
    clearCurrentMarker();

    // Create a new marker element
    const el = document.createElement("div");
    el.className = "custom-marker";
    el.innerHTML = `
      <div class="bg-white rounded-lg shadow-lg p-2 border border-gray-200">
        <div class="w-4 h-4 bg-red-500 rounded-full mx-auto mb-1"></div>
        <p class="text-xs text-gray-600 text-center">Selected Location</p>
      </div>
    `;

    // Create and add the new marker
    const newMarker = new mapboxgl.Marker({
      element: el,
      anchor: "bottom",
    })
      .setLngLat(lngLat)
      .addTo(mapRef.current!);

    // Update refs and state
    activeMarkerRef.current = newMarker;
    setSelectedLocation({ lng: lngLat.lng, lat: lngLat.lat });
  };

  const createCustomMarker = (memory: Memory) => {
    const el = document.createElement("div");
    el.className = "memory-marker";
    el.innerHTML = `
      <div class="bg-white flex flex-col items-center rounded-lg shadow-lg p-2 border border-gray-200 w-24">
        <img src="${memory.image_url}" 
             alt="${memory.title}"
             class="w-20 h-20 object-cover rounded-lg mb-1" />
        <p class="text-xs text-gray-600 text-center font-semibold w-fit">${memory.title}</p>
      </div>
    `;

    return new mapboxgl.Marker({
      element: el,
      anchor: "bottom",
    });
  };

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    try {
      mapRef.current = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/outdoors-v12",
        center: [-79.9178, 43.263],
        zoom: 15,
      });

      // Add click handler after map loads
      mapRef.current.on("load", () => {
        mapRef.current?.on("click", handleMapClick);
      });

      // Initial fetch of memories
      const fetchMemories = async () => {
        const { data, error } = await supabase.from("memories2").select("*");

        if (error) {
          console.error("Error fetching memories:", error);
          return;
        }

        setMemories(data);
      };

      fetchMemories();

      // Set up real-time subscription
      const subscription = supabase
        .channel("memories2_changes")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "memories2",
          },
          (payload) => {
            setMemories((memories) => [...memories, payload.new as Memory]);
          }
        )
        .subscribe();

      return () => {
        clearCurrentMarker();
        mapRef.current?.remove();
        subscription.unsubscribe();
      };
    } catch (error) {
      console.error("Error initializing map:", error);
    }
  }, []);

  // Update markers when memories change
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing markers
    Object.values(markersRef.current).forEach((marker) => marker.remove());
    markersRef.current = {};

    // Add new markers
    memories.forEach((memory) => {
      const marker = createCustomMarker(memory)
        .setLngLat(memory.location)
        .addTo(mapRef.current!);

      markersRef.current[memory.id] = marker;
    });
  }, [memories]);

  return (
    <div className="relative h-screen w-full">
      <div ref={mapContainerRef} className="h-full w-full" />

      {selectedLocation && (
        <div className="absolute top-4 right-4 w-80">
          <ReportForm
            location={selectedLocation}
            onClose={clearCurrentMarker}
          />
        </div>
      )}

      <style jsx global>{`
        .custom-marker {
          transform: translate(-50%, -100%);
        }
        .memory-marker {
          transform: translate(-50%, -100%);
          cursor: pointer;
        }
        .memory-marker img {
          width: 64px;
          height: 64px;
          object-fit: cover;
        }
      `}</style>
    </div>
  );
}
