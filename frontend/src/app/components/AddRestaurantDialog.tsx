"use client";

import React, { useState } from "react";
import toast from "react-hot-toast";

import { fetchWithAuth } from "@/lib/api";
import { useAppContext } from "@/app/contexts/AppContext";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { PlacesAutocomplete, PlaceSelection } from "./PlacesAutocomplete";
import { Textarea } from "./ui/textarea";
import { X } from "lucide-react";

import type { Restaurant } from "./RestaurantCard";

interface AddRestaurantDialogProps {
  onAddRestaurant: (restaurant: Restaurant) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // legacy props kept for back-compat; ignored in the Places flow
  onEditRestaurant?: unknown;
  restaurantToEdit?: unknown;
}

export function AddRestaurantDialog({
  onAddRestaurant,
  open,
  onOpenChange,
}: AddRestaurantDialogProps) {
  const { selectedCity } = useAppContext();
  const isControlled = open !== undefined && onOpenChange !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isControlled ? open! : internalOpen;
  const setIsOpen = isControlled ? onOpenChange! : setInternalOpen;

  const [picked, setPicked] = useState<PlaceSelection | null>(null);
  const [description, setDescription] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [currentTag, setCurrentTag] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setPicked(null);
    setDescription("");
    setCuisine("");
    setTags([]);
    setCurrentTag("");
  }

  function addTag() {
    const t = currentTag.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setCurrentTag("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) {
      toast.error("Pick a restaurant from the search results");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/restaurants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place_id: picked.placeId,
          session_token: picked.sessionToken,
          description: description || null,
          cuisine: cuisine || null,
          tags,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      const mapped: Restaurant = {
        id: created.id,
        name: created.name,
        cuisine: created.cuisine ?? "",
        description: created.description ?? created.formatted_address ?? "",
        tags: created.tags ?? [],
        image: created.photo_reference
          ? `https://places.googleapis.com/v1/${created.photo_reference}/media?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&maxWidthPx=600`
          : "",
        favoriteCount: created.favorite_count ?? 0,
      };
      onAddRestaurant(mapped);
      toast.success(`Added ${created.name}`);
      reset();
      setIsOpen(false);
    } catch (err: any) {
      console.error(err);
      toast.error(`Failed to add restaurant: ${err.message ?? err}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Restaurant</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Search Google Maps *</Label>
            <PlacesAutocomplete onSelect={setPicked} cityBias={selectedCity || undefined} />
            {picked && (
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium">{picked.name}</span> — {picked.formattedAddress}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="cuisine">Cuisine (optional)</Label>
            <Input
              id="cuisine"
              value={cuisine}
              onChange={(e) => setCuisine(e.target.value)}
              placeholder="e.g. Italian, Thai…"
            />
          </div>

          <div>
            <Label htmlFor="description">Why do you recommend it?</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional note for other users"
            />
          </div>

          <div>
            <Label>Tags</Label>
            <div className="flex space-x-2 mb-2">
              <Input
                placeholder="Add tag"
                value={currentTag}
                onChange={(e) => setCurrentTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button type="button" onClick={addTag} size="sm">Add</Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                  {tag}
                  <button type="button" onClick={() => setTags(tags.filter((t) => t !== tag))}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={!picked || submitting}>
              {submitting ? "Adding…" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
