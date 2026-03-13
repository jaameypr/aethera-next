export interface JvmPreset {
  id: string;
  label: string;
  description: string;
  minRamMb?: number; // only recommend above this RAM
  flags: string; // the actual JVM flag string
}

export const JVM_FLAG_PRESETS: JvmPreset[] = [
  {
    id: "aikars",
    label: "Aikar's Flags",
    description:
      "Empfohlen für Paper/Spigot Server > 4 GB. Optimiert GC-Pausen für Minecraft.",
    minRamMb: 4096,
    flags:
      "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1",
  },
  {
    id: "g1gc-balanced",
    label: "G1GC Balanced",
    description: "Ausgewogene G1GC-Konfiguration für Server mit 2–8 GB RAM.",
    minRamMb: 2048,
    flags: "-XX:+UseG1GC -XX:MaxGCPauseMillis=100 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:G1HeapRegionSize=4M -XX:InitiatingHeapOccupancyPercent=20",
  },
  {
    id: "zgc",
    label: "ZGC (Java 17+)",
    description:
      "Sehr geringe GC-Pausen, ideal für Server mit > 8 GB RAM und Java 17+.",
    minRamMb: 8192,
    flags: "-XX:+UseZGC -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch",
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Standard JVM ohne zusätzliche Flags. Für kleine Server oder Tests.",
    flags: "",
  },
  {
    id: "custom",
    label: "Custom",
    description: "Eigene JVM-Flags manuell eingeben.",
    flags: "",
  },
];
