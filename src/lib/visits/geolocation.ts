"use client";

export type GeoReading = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
};

export function captureDeviceGps(): Promise<GeoReading> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not available on this device/browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy:
            typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null,
          timestamp: pos.timestamp,
        });
      },
      (err) => reject(new Error(err.message || "Unable to read GPS")),
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      }
    );
  });
}
