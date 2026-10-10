"use client";

import { useEffect, useState } from "react";
import { getCurrentDevice, type CurrentDevice } from "@/lib/comic-target-device";

export function useCurrentDevice() {
  const [currentDevice, setCurrentDevice] = useState<CurrentDevice | null>(null);

  useEffect(() => {
    const pointerQuery = window.matchMedia("(pointer: fine)");
    const updateDevice = () => setCurrentDevice(getCurrentDevice(window.innerWidth, pointerQuery.matches));
    updateDevice();
    window.addEventListener("resize", updateDevice);
    pointerQuery.addEventListener("change", updateDevice);
    return () => {
      window.removeEventListener("resize", updateDevice);
      pointerQuery.removeEventListener("change", updateDevice);
    };
  }, []);

  return currentDevice;
}
