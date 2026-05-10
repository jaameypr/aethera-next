"use client";

import { useTheme } from "@/context/theme-context";
import { useLocale } from "@/context/locale-context";

// Minecraft-style pixelated day/night toggle
// off = moon/night icon (dark mode)  |  on = sun/day icon (light mode)
const MOON_SRC =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAQABADASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAIG/8QAIxAAAgIABQQDAAAAAAAAAAAAAQMCBAAREiExBUFRcROBsf/EABQBAQAAAAAAAAAAAAAAAAAAAAX/xAAWEQADAAAAAAAAAAAAAAAAAAAAEiL/2gAMAwEAAhEDEQA/AMBTp03dNglMVuttjqnKQ2UPOfntkOThbqVVUJ12BKnogZQZpy+Ucc8knwePWJrWqyqEHVmrTahEBqpbBoAH1n635wt3a9mjN1p8X2pw0qVEbKB/CO/c4OphSVP/2Q==";

const SUN_SRC =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAQABADASIAAhEBAxEB/8QAFwAAAwEAAAAAAAAAAAAAAAAAAQIEBf/EACMQAAEDAwQDAQEAAAAAAAAAAAQBAgUDESEAEjFBBlFhMkL/xAAUAQEAAAAAAAAAAAAAAAAAAAAF/8QAGBEAAwEBAAAAAAAAAAAAAAAAABIiMUH/2gAMAwEAAhEDEQA/AM+Bg4mS8coRccMOdNG01qVyH/kRvHPKKmMdr8uujPwUTG+NkRpw1AKWCbvHKa2zTGphc9u9p0q+rLqeMl4kSCGkYgtoE0HTahIz3bWGNanPrdyqWzn7p5ibh5CArnyZNMyVLpK0QSkt2BNXtVX+7ol1wuLJiyaHt+6Kyp//2Q==";

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const { t } = useLocale();
  const isDark = theme === "dark";

  const sliderPos = isDark ? "translateX(2em)" : "translateX(0)";

  return (
    <label
      title={isDark ? t("common.switchToLight") : t("common.switchToDark")}
      style={{
        fontSize: 17,
        position: "relative",
        display: "inline-block",
        width: "4em",
        height: "2em",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <input
        type="checkbox"
        checked={isDark}
        onChange={() => setTheme(isDark ? "light" : "dark")}
        aria-label={isDark ? t("common.switchToLight") : t("common.switchToDark")}
        style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
      />
      {/* track */}
      <span
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "#ccc",
          transition: ".4s",
        }}
      />
      {/* moon icon (dark mode) */}
      <img
        src={MOON_SRC}
        alt=""
        aria-hidden
        style={{
          position: "absolute",
          height: "2em",
          width: "2em",
          imageRendering: "pixelated",
          opacity: isDark ? 0 : 1,
          transition: ".4s",
          transform: sliderPos,
        }}
      />
      {/* sun icon (light mode) */}
      <img
        src={SUN_SRC}
        alt=""
        aria-hidden
        style={{
          position: "absolute",
          height: "2em",
          width: "2em",
          imageRendering: "pixelated",
          opacity: isDark ? 1 : 0,
          transition: ".4s",
          transform: sliderPos,
        }}
      />
    </label>
  );
}
