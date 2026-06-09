import React from "react";
import { useState } from "react";
import { useEffect } from "react";
import { useRef } from "react";
import { fetchWithAuth } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Plus } from "lucide-react";
import { Dish } from "./DishCard";
import toast from 'react-hot-toast';

interface AddDishDialogProps {
  onAddDish: (dish: Omit<Dish, "id" | "rating" | "favoriteCount">) => void;
  onEditDish?: (dish: Omit<Dish, "rating" | "favoriteCount">) => void; // Remove "id" from Omit for edit
  selectedCity: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  dishToEdit?: Dish | null;
}

interface RestaurantNameDropdownProps {
  selectedCity: string;
  restaurant: string;
  setRestaurant: (name: string, id?: string) => void;
  onValidate: (isValid: boolean) => void;
}

interface RestaurantHit {
  id: string;
  name: string;
  formatted_address?: string;
}

// Move component OUTSIDE of AddDishDialog
const RestaurantNameDropdown = React.memo(function RestaurantNameDropdown({
  selectedCity,
  restaurant,
  setRestaurant,
  onValidate,
}: RestaurantNameDropdownProps) {
  const [query, setQuery] = useState(restaurant);
  const prevRestaurantRef = useRef(restaurant);
  const [suggestions, setSuggestions] = useState<RestaurantHit[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [restaurantError, setRestaurantError] = useState("");

  const handleBlur = () => {
    onValidate(false)

    setTimeout(() => {
      setShowDropdown(false);
      if (query.trim() === "") {
        setRestaurantError("");
        onValidate(true);
        return;
      }
      const exactMatch = suggestions.find(
          (s) => s.name.toLowerCase() === query.trim().toLowerCase()
      );

      if (!exactMatch) {
        setRestaurantError("Pick a restaurant from the dropdown.");
      } else {
        setRestaurant(exactMatch.name, exactMatch.id);
        setRestaurantError("");
        onValidate(true);
      }
    }, 200);
  };

  useEffect(() => {
    if (restaurant !== prevRestaurantRef.current) {
      setQuery(restaurant);
      prevRestaurantRef.current = restaurant;
    }
  }, [restaurant]);

  // Set highlightedIndex to 0 if suggestions change and not empty
  useEffect(() => {
    if (showDropdown && suggestions.length > 0) {
      setHighlightedIndex(0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [suggestions, showDropdown]);

  useEffect(() => {
    if (!selectedCity || !query) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Hits the local catalogue first; if empty, the backend falls back to
      // Google Places and ingests matches, so the dropdown gradually covers
      // any restaurant the user types — not just ones already in the DB.
      fetchWithAuth(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants?city=${encodeURIComponent(
              selectedCity
          )}&q=${encodeURIComponent(query)}&page=0&size=10`
      )
          .then((res) => (res.ok ? res.json() : Promise.reject("Failed to fetch")))
          .then((data) => {
            const items: RestaurantHit[] = Array.isArray(data?.items) ? data.items : [];
            setSuggestions(items);
          })
          .catch(() => setSuggestions([]));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [selectedCity, query]);

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        handleSelect(suggestions[highlightedIndex].name, suggestions[highlightedIndex].id);
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setRestaurant(val);
    setShowDropdown(true);
    setRestaurantError("");
    onValidate(false);
  };

  const handleSelect = (restaurantName: string, restaurantId: string) => {
    setQuery(restaurantName);
    setRestaurant(restaurantName, restaurantId);
    setShowDropdown(false);
    setRestaurantError("");
    onValidate(true);
  };

  return (
      <div className="relative">
        <Label htmlFor="restaurant-name">Restaurant Name *</Label>
        <Input
            id="restaurant-name"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            required
            autoComplete="off"
            onFocus={() => setShowDropdown(true)}
            onBlur={handleBlur}
            aria-invalid={restaurantError ? "true" : "false"}
            aria-describedby={restaurantError ? "restaurant-error" : undefined}
        />
        {restaurantError && (
            <p id="restaurant-error" className="mt-1 text-red-600 text-sm">
              {restaurantError}
            </p>
        )}
        {showDropdown && (
            <ul className="absolute w-full bg-white border rounded shadow max-h-48 overflow-auto z-10">
              {query === "" ? (
                  <li className="px-3 py-2 text-gray-500 select-none">
                    Start typing to search restaurants...
                  </li>
              ) : suggestions.length > 0 ? (
                  suggestions.map((s, index) => (
                      <li
                          key={s.id}
                          className={`px-3 py-2 cursor-pointer hover:bg-gray-100 ${
                              index === highlightedIndex ? "bg-blue-100" : ""
                          }`}
                          onMouseDown={() => handleSelect(s.name, s.id)}
                          onMouseEnter={() => setHighlightedIndex(index)}
                      >
                        <div>{s.name}</div>
                        {s.formatted_address && (
                          <div className="text-xs text-gray-500 truncate">{s.formatted_address}</div>
                        )}
                      </li>
                  ))
              ) : (
                  <li className="px-3 py-2 text-gray-500 select-none">No restaurants found.</li>
              )}
            </ul>
        )}
      </div>
  );
});

export function AddDishDialog({ onAddDish, onEditDish, open, onOpenChange, selectedCity, dishToEdit = null }: AddDishDialogProps) {
  const [isRestaurantValid, setIsRestaurantValid] = useState(false);
  
  // Always use controlled mode - provide defaults if not passed
  const isControlled = open !== undefined && onOpenChange !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? onOpenChange : setInternalOpen;
  
  const isEditMode = dishToEdit !== null;

  const [formData, setFormData] = useState({
    id: "", // Add id field
    name: "",
    restaurant: "",
    restaurantId: "",
    description: "",
    tags: [] as string[],
    image: "",
    imageFile: undefined as File | undefined,
  });
  const [currentTag, setCurrentTag] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isRestaurantValid) {
      console.log(isRestaurantValid)
      toast.error("Please select a valid restaurant.");
      return;
    }
    if (formData.name && formData.restaurant) {
      if (isEditMode && onEditDish) {
        // For edit mode, include the id in the data
        onEditDish(formData);
      } else {
        // For add mode, exclude the id from the data
        const { id, ...addData } = formData;
        onAddDish(addData);
      }
      setFormData({
        id: "",
        name: "",
        restaurant: "",
        restaurantId: "",
        description: "",
        tags: [],
        image: "",
        imageFile: undefined,
      });
      setIsOpen(false);
    }
  };

  const addTag = () => {
    if (currentTag && !formData.tags.includes(currentTag)) {
      setFormData(prev => ({ ...prev, tags: [...prev.tags, currentTag] }));
      setCurrentTag("");
    }
  };

  const removeTag = (tag: string) => {
    setFormData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  useEffect(() => {
    if (dishToEdit) {
      setFormData({
        id: dishToEdit.id, // Include id for edit mode
        name: dishToEdit.name,
        restaurant: dishToEdit.restaurant,
        restaurantId: "",
        description: dishToEdit.description,
        tags: dishToEdit.tags,
        image: dishToEdit.image,
        imageFile: undefined,
      });
      setIsRestaurantValid(true);
    } else {
      setFormData({
        id: "", // Empty id for add mode
        name: "",
        restaurant: "",
        restaurantId: "",
        description: "",
        tags: [],
        image: "",
        imageFile: undefined,
      });
      setIsRestaurantValid(false);
    }
  }, [dishToEdit, isOpen]);

  // Render trigger button only when not controlled (uncontrolled mode)
  if (isControlled) {
    // Controlled mode - only render dialog content, no trigger
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditMode ? "Edit Dish" : "Add New Dish"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="dish-name">Dish Name *</Label>
              <Input
                  id="dish-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
              />
            </div>

            <div>
              <RestaurantNameDropdown
                  selectedCity={selectedCity}
                  restaurant={formData.restaurant}
                  setRestaurant={(restaurant: string, restaurantId?: string) =>
                    setFormData(prev => ({
                      ...prev,
                      restaurant,
                      restaurantId: restaurantId ?? prev.restaurantId,
                    }))
                  }
                  onValidate={setIsRestaurantValid}
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div>
              <Label>Tags</Label>
              <div className="flex space-x-2 mb-2">
                <Input
                    placeholder="Add tag"
                    value={currentTag}
                    onChange={(e) => setCurrentTag(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Button type="button" onClick={addTag} size="sm">Add</Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {formData.tags.map((tag) => (
                    <Badge key={tag} className="gap-1">
                      {tag}
                      <button
                          type="button"
                          className="p-0 m-0 text-sm leading-none cursor-pointer"
                          onClick={() => removeTag(tag)}
                      >
                        ×
                      </button>
                    </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="image-file">Photo</Label>
              <Input
                  id="image-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFormData(prev => ({
                      ...prev,
                      imageFile: f ?? undefined,
                      image: f ? f.name : "",
                    }));
                  }}
              />
              <p className="text-xs text-gray-500 mt-1">
                Optional — leave blank to use a stock photo.
              </p>
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{isEditMode ? "Save Changes" : "Add Dish"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  // Uncontrolled mode - render with trigger button
  return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <button
              data-slot="button"
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-primary/90 h-9 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Dish
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditMode ? "Edit Dish" : "Add New Dish"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="dish-name">Dish Name *</Label>
              <Input
                  id="dish-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
              />
            </div>

            <div>
              <RestaurantNameDropdown
                  selectedCity={selectedCity}
                  restaurant={formData.restaurant}
                  setRestaurant={(restaurant: string, restaurantId?: string) =>
                    setFormData(prev => ({
                      ...prev,
                      restaurant,
                      restaurantId: restaurantId ?? prev.restaurantId,
                    }))
                  }
                  onValidate={setIsRestaurantValid}
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div>
              <Label>Tags</Label>
              <div className="flex space-x-2 mb-2">
                <Input
                    placeholder="Add tag"
                    value={currentTag}
                    onChange={(e) => setCurrentTag(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Button type="button" onClick={addTag} size="sm">Add</Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {formData.tags.map((tag) => (
                    <Badge key={tag} className="gap-1">
                      {tag}
                      <button
                          type="button"
                          className="p-0 m-0 text-sm leading-none cursor-pointer"
                          onClick={() => removeTag(tag)}
                      >
                        ×
                      </button>
                    </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="image-file">Photo</Label>
              <Input
                  id="image-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFormData(prev => ({
                      ...prev,
                      imageFile: f ?? undefined,
                      image: f ? f.name : "",
                    }));
                  }}
              />
              <p className="text-xs text-gray-500 mt-1">
                Optional — leave blank to use a stock photo.
              </p>
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{isEditMode ? "Save Changes" : "Add Dish"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
  );
}