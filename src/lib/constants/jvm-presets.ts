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
      "Recommended for Paper/Spigot servers > 4 GB. Optimizes GC pauses for Minecraft.",
    minRamMb: 4096,
    flags:
      "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1",
  },
  {
    id: "g1gc-balanced",
    label: "G1GC Balanced",
    description: "Balanced G1GC configuration for servers with 2–8 GB RAM.",
    minRamMb: 2048,
    flags: "-XX:+UseG1GC -XX:MaxGCPauseMillis=100 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:G1HeapRegionSize=4M -XX:InitiatingHeapOccupancyPercent=20",
  },
  {
    id: "zgc",
    label: "ZGC (Java 17+)",
    description:
      "Very low GC pauses, ideal for servers with > 8 GB RAM and Java 17+.",
    minRamMb: 8192,
    flags: "-XX:+UseZGC -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch",
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Standard JVM without additional flags. For small servers or tests.",
    flags: "",
  },
  {
    id: "custom",
    label: "Custom",
    description: "Enter your own JVM flags manually.",
    flags: "",
  },
];
