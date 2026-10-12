"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import { ImagePlus, Loader2, UploadCloud, X } from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* Uploads images straight to Cloudinary and hands back their URLs. The first
   image doubles as the event poster; the rest are gallery shots. */
export function ImageUploader({
  value,
  onChange,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState("");

  async function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("image", file);
        const { url } = await api<{ url: string }>("/api/admin/uploads", {
          role: "admin",
          form,
        });
        urls.push(url);
      }
      onChange([...value, ...urls]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const remove = (url: string) => onChange(value.filter((u) => u !== url));

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {value.map((url, i) => (
            <div
              key={url}
              className="group relative size-24 overflow-hidden rounded-xl border border-border"
            >
              <img src={url} alt="" className="size-full object-cover" />
              {i === 0 && (
                <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[10px] font-semibold text-white">
                  Poster
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(url)}
                aria-label="Remove image"
                className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* the drop-zone: click or drag images straight in */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload images"
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          drag
            ? "border-primary bg-primary/5 text-primary"
            : "border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
          busy && "pointer-events-none opacity-60"
        )}
      >
        <span
          className={cn(
            "flex size-12 items-center justify-center rounded-full",
            drag ? "bg-primary/15" : "bg-muted"
          )}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : drag ? (
            <UploadCloud className="size-5" />
          ) : (
            <ImagePlus className="size-5" />
          )}
        </span>
        <div>
          <p className="text-sm font-medium text-foreground">
            {busy ? "Uploading…" : "Click to upload or drag & drop"}
          </p>
          <p className="text-xs text-muted-foreground">
            The first image becomes the poster · PNG or JPG, up to 8MB each
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => pick(e.target.files)}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {value.length > 0 && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])}>
          Clear all
        </Button>
      )}
    </div>
  );
}
