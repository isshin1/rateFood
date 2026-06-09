'use client'
import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";

import { FilterPanel } from "./components/FilterPanel";
import { DishCard, Dish } from "./components/DishCard";
import { RestaurantCard, Restaurant } from "./components/RestaurantCard";
import { AddDishDialog } from "./components/AddDishDialog";
import { AddRestaurantDialog } from "./components/AddRestaurantDialog";
import { Tabs, TabsContent } from "./components/ui/tabs";
import { fetchWithAuth } from "@/lib/api";
import { Plus } from "lucide-react";
import { useAppContext } from "./contexts/AppContext";
import { useSession, SessionContextType } from ".//contexts/SessionContext";
import { OnboardingPopup } from "./components/OnboardingPopup";
import { RadialMapView } from "./components/RadialMapView";
import { useGeolocation } from "./hooks/useGeolocation";
import { Map as MapIcon, List as ListIcon } from "lucide-react";

export default function App() {
  const {
    selectedCity,
    setSelectedCity,
    selectedTab,
    dishes,
    setDishes,
    restaurants,
    setRestaurants,
    handleAddDish,
    handleAddRestaurant,
    loadingDishes,
    setLoadingDishes,
    loadingRestaurants,
    setLoadingRestaurants,
    dishesCurrentPage,
    setDishesCurrentPage,
    restaurantsCurrentPage,
    setRestaurantsCurrentPage,
    hasMoreDishes,
    setHasMoreDishes,
    hasMoreRestaurants,
    setHasMoreRestaurants,
    favouriteRestaurants,
    fetchFavourites,
    removeFavouriteRestaurant,
  } = useAppContext();

  const [hasMounted, setHasMounted] = useState(false);

  // Filter states
  const [dishSearch, setDishSearch] = useState("");
  const [dishTags, setDishTags] = useState<string[]>([]);
  const [dishRange, setDishRange] = useState(10);
  
  const [restaurantSearch, setRestaurantSearch] = useState("");
  const [restaurantTags, setRestaurantTags] = useState<string[]>([]);
  const [restaurantRange, setRestaurantRange] = useState(10);

  const { session }: SessionContextType = useSession();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [previousSessionState, setPreviousSessionState] = useState<string | null>(null);

  // Map view toggle (restaurants tab only)
  const [restaurantViewMode, setRestaurantViewMode] = useState<"list" | "map">("list");
  const [mapRadiusKm, setMapRadiusKm] = useState(8);
  const geo = useGeolocation(false);

  const handleOpenMapView = () => {
    setRestaurantViewMode("map");
    if (geo.status === "idle" || geo.status === "denied" || geo.status === "error") {
      geo.request();
    }
  };

  // Initialize app and handle onboarding
  useEffect(() => {
    setHasMounted(true);
    
    const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
    const savedCity = localStorage.getItem('selectedCity') || '';
    
    // Set the saved city
    setSelectedCity(savedCity);
    
    // Show onboarding if user hasn't seen it OR no city is selected
    // Changed the condition from AND to OR
    if (!hasSeenOnboarding || !savedCity) {
      setShowOnboarding(true);
    }
    
    // Initialize previous session state
    setPreviousSessionState(session?.token || null);
  }, [setSelectedCity]);

  // Watch for logout events
  useEffect(() => {
    if (!hasMounted) return;
    
    // If we had a session before but don't now, it means user logged out
    if (previousSessionState && !session?.token) {
      // User logged out - show onboarding and clear city selection
      setShowOnboarding(true);
      setSelectedCity('');
      localStorage.removeItem('selectedCity');
      // Optionally clear the onboarding flag to force them through it again
      localStorage.removeItem('hasSeenOnboarding');
    }
    
    // Update the previous session state
    setPreviousSessionState(session?.token || null);
  }, [session?.token, previousSessionState, setSelectedCity, hasMounted]);

  // Reset restaurants when city changes
  useEffect(() => {
    setRestaurants([]);
    setRestaurantsCurrentPage(0);
    setHasMoreRestaurants(true);
  }, [selectedCity, setRestaurants, setRestaurantsCurrentPage, setHasMoreRestaurants]);

  // Refresh favourites when city or login state changes
  useEffect(() => {
    if (selectedCity && session?.token) {
      fetchFavourites();
    }
  }, [selectedCity, session?.token, fetchFavourites]);

  // Reset dishes when city changes
  useEffect(() => {
    setDishes([]);
    setDishesCurrentPage(0);
    setHasMoreDishes(false);
  }, [selectedCity, setDishes, setDishesCurrentPage, setHasMoreDishes]);

  // Reset restaurant pagination when search query changes (debounced so we don't
  // refetch on every keystroke). When q is non-empty and locally we have nothing,
  // the backend will live-search Google and ingest matches on demand.
  useEffect(() => {
    const t = setTimeout(() => setRestaurantsCurrentPage(0), 400);
    return () => clearTimeout(t);
  }, [restaurantSearch, setRestaurantsCurrentPage]);

  // Fetch restaurants
  useEffect(() => {
    if (!selectedCity) return;
    setLoadingRestaurants(true);

    const qParam = restaurantSearch.trim()
      ? `&q=${encodeURIComponent(restaurantSearch.trim())}`
      : "";
    fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/restaurants?city=${encodeURIComponent(selectedCity)}${qParam}&page=${restaurantsCurrentPage}&size=20`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch restaurants for ${selectedCity}?page=${restaurantsCurrentPage}`);
        return res.json();
      })
      .then((data: { items: any[]; total: number; page: number; size: number }) => {
        const mapped = data.items.map((r) => ({
          id: r.id,
          name: r.name,
          cuisine: r.cuisine ?? "",
          description: r.description ?? r.formatted_address ?? "",
          tags: r.tags ?? [],
          image: r.photo_reference
            ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${r.id}/photo?w=600`
            : "",
          isFavourite: r.is_favourite ?? false,
          favoriteCount: r.favorite_count ?? 0,
        }));
        setRestaurants((prev) => (restaurantsCurrentPage === 0 ? mapped : [...prev, ...mapped]));
        setHasMoreRestaurants((restaurantsCurrentPage + 1) * data.size < data.total);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoadingRestaurants(false));
  }, [selectedCity, restaurantSearch, restaurantsCurrentPage, setRestaurants, setLoadingRestaurants, setHasMoreRestaurants]);

  // Fetch dishes
  useEffect(() => {
    if (!selectedCity) return;
    setLoadingDishes(true);

    fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/dishes?city=${encodeURIComponent(selectedCity)}&page=${dishesCurrentPage}&size=20`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch dishes for ${selectedCity}?page=${dishesCurrentPage}`);
        return res.json();
      })
      .then((data: { items: any[]; total: number; page: number; size: number }) => {
        const mapped = data.items.map((d: any) => ({
          id: d.id,
          name: d.name,
          restaurant: d.restaurant_name ?? "",
          restaurantId: d.restaurant_id,
          description: d.description ?? "",
          tags: d.tags ?? [],
          image: `${process.env.NEXT_PUBLIC_API_URL}/dishes/${d.id}/image?w=400`,
          isFavourite: d.is_favourite ?? false,
          favoriteCount: d.favorite_count ?? 0,
        }));
        setDishes((prev) => (dishesCurrentPage === 0 ? mapped : [...prev, ...mapped]));
        setHasMoreDishes((dishesCurrentPage + 1) * data.size < data.total);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoadingDishes(false));
  }, [selectedCity, dishesCurrentPage, setDishes, setLoadingDishes, setHasMoreDishes]);

  // Infinite scroll for restaurants
  useEffect(() => {
    function handleScroll() {
      if (
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 300
        && !loadingRestaurants
        && hasMoreRestaurants
        && selectedTab === "restaurants"
      ) {
        setRestaurantsCurrentPage(prev => prev + 1);
      }
    }
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadingRestaurants, hasMoreRestaurants, selectedTab, setRestaurantsCurrentPage]);

  // Add these handlers
  const handleOnboardingCitySelect = (city: string) => {
    setSelectedCity(city);
    localStorage.setItem('selectedCity', city);
    localStorage.setItem('hasSeenOnboarding', 'true');
    setShowOnboarding(false);
  };

  const handleOnboardingClose = () => {
    // Only allow closing without city selection if there's already a saved city
    const savedCity = localStorage.getItem('selectedCity') || '';
    if (savedCity) {
      localStorage.setItem('hasSeenOnboarding', 'true');
      setShowOnboarding(false);
    } else {
      // If no city is saved, don't allow closing - user must select a city
      // You could show an alert here or just prevent closing
      console.log("Please select a city before continuing");
    }
  };

  const filteredDishes = useMemo(() => {
    return dishes.filter(dish => {
      const matchesSearch = dish.name.toLowerCase().includes(dishSearch.toLowerCase()) ||
                           dish.restaurant.toLowerCase().includes(dishSearch.toLowerCase());
      const matchesTags = dishTags.length === 0 || dishTags.some(tag => dish.tags.includes(tag));
      return matchesSearch && matchesTags;
    });
  }, [dishes, dishSearch, dishTags]);

  const filteredRestaurants = useMemo(() => {
    // Name/q is resolved by the backend (so Google fallback works); only tag filter is client-side.
    return restaurants.filter(restaurant => {
      const matchesTags = restaurantTags.length === 0 || restaurantTags.some(tag => restaurant.tags.includes(tag));
      return matchesTags;
    });
  }, [restaurants, restaurantTags]);

  const handleRestaurantRating = (restaurantId: string, rating: number) => {
    const updatedRestaurants = restaurants.map(restaurant =>
      restaurant.id === restaurantId ? { ...restaurant, rating } : restaurant
    );
    setRestaurants(updatedRestaurants);
  };

  const handleRemoveDish = (dishId: string) => {
    setDishes(dishes.filter(d => d.id !== dishId));
  };

  const handleRemoveRestaurant = (restaurantId: string) => {
    setRestaurants(restaurants.filter(r => r.id !== restaurantId));
  };

  if (!hasMounted) return null;

  function AddDishDialogFloatingTrigger({ onAddDish, selectedCity }: { onAddDish: (newDish: Omit<Dish, "id" | "rating" | "favoriteCount">) => void, selectedCity: string }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        {/* {open && (
          <AddDishDialog open={open} onOpenChange={setOpen} onAddDish={onAddDish} selectedCity={selectedCity} />
        )}
        <div className="fixed bottom-4 right-4 z-50 block sm:hidden">
          <button
            onClick={() => setOpen(true)}
            className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg flex items-center justify-center"
            aria-label="Add Dish"
            title="Add Dish"
          >
            <Plus size={24} />
          </button>
        </div> */}
        {open && (
          <AddDishDialog open={open} onOpenChange={setOpen} onAddDish={onAddDish} selectedCity={selectedCity} />
        )}
      </>
    );
  }

function AddRestaurantDialogFloatingTrigger({ onAddRestaurant }: { onAddRestaurant: (newRestaurant: Omit<Restaurant, "id" | "rating" | "favoriteCount">) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
        <AddRestaurantDialog open={open} onOpenChange={setOpen} onAddRestaurant={onAddRestaurant} />
      )}
      <div className="fixed bottom-4 right-4 z-50 block sm:hidden">
        {/* <button
          onClick={() => setOpen(true)}
          className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg flex items-center justify-center"
          aria-label="Add Restaurant"
          title="Add Restaurant"
        >
          <Plus size={24} />
        </button> */}
      </div>
    </>
  );
}

  return (
    <div className="min-h-screen bg-background-secondary">
      <OnboardingPopup
        isOpen={showOnboarding}
        onClose={handleOnboardingClose}
        onCitySelect={handleOnboardingCitySelect}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 bg-background-secondary">
        <Tabs value={selectedTab} className="w-full">
          <TabsContent value="dishes" className="space-y-6" hidden={selectedTab !== "dishes"}>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-1">
                <FilterPanel
                  onSearchChange={setDishSearch}
                  onRangeChange={setDishRange}
                  searchValue={dishSearch}
                  locationRange={dishRange}
                />
              </div>
              <div className="lg:col-span-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                  {filteredDishes.map(dish => (
                    <DishCard
                      key={dish.id}
                      dish={dish}
                      onRemove={() => handleRemoveDish(dish.id)}
                      onFavouriteRemove={() => {} }
                      showMenu={session.roles?.includes("ROLE_ADMIN") ?? false}
                      selectedCity={selectedCity}
                    />
                  ))}
                </div>
                {filteredDishes.length === 0 && !loadingDishes && (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">No dishes found matching your criteria.</p>
                  </div>
                )}
                {loadingDishes && (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">Loading dishes...</p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="restaurants" className="space-y-6" hidden={selectedTab !== "restaurants"}>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-1">
                <FilterPanel
                  onSearchChange={setRestaurantSearch}
                  onRangeChange={setRestaurantRange}
                  searchValue={restaurantSearch}
                  locationRange={restaurantRange}
                />
              </div>
              <div className="lg:col-span-3">
                <div className="flex items-center justify-end mb-3 gap-2">
                  <button
                    onClick={() => setRestaurantViewMode("list")}
                    className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border ${restaurantViewMode === "list" ? "bg-orange-500 text-white border-orange-500" : "bg-white hover:bg-gray-50"}`}
                  >
                    <ListIcon size={14} /> List
                  </button>
                  <button
                    onClick={handleOpenMapView}
                    className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border ${restaurantViewMode === "map" ? "bg-orange-500 text-white border-orange-500" : "bg-white hover:bg-gray-50"}`}
                  >
                    <MapIcon size={14} /> Map
                  </button>
                </div>

                {restaurantViewMode === "map" && typeof document !== "undefined" && createPortal(
                  <div className="fixed inset-0 z-[60] bg-white overflow-auto p-4 sm:p-6">
                    {geo.status === "prompting" && (
                      <div className="text-center py-12 text-sm text-muted-foreground">
                        Waiting for location permission…
                      </div>
                    )}
                    {(geo.status === "denied" || geo.status === "unavailable" || geo.status === "error") && (
                      <div className="text-center py-10 bg-white rounded-lg border">
                        <p className="text-sm text-gray-700 mb-3">
                          {geo.status === "denied"
                            ? "Location permission was denied. Enable it in your browser settings to use the map view."
                            : geo.status === "unavailable"
                              ? "Your browser doesn't support geolocation."
                              : `Couldn't get your location: ${geo.error ?? "unknown error"}`}
                        </p>
                        <button
                          onClick={geo.request}
                          className="px-4 py-2 rounded-md bg-orange-500 text-white text-sm hover:bg-orange-600"
                        >
                          Try again
                        </button>
                      </div>
                    )}
                    {geo.status === "granted" && geo.coords && (
                      <>
                        <div className="flex items-center justify-end gap-3 mb-3 text-sm">
                          <label htmlFor="map-radius" className="text-muted-foreground">Radius</label>
                          <input
                            id="map-radius"
                            type="range"
                            min={1}
                            max={30}
                            step={1}
                            value={mapRadiusKm}
                            onChange={(e) => setMapRadiusKm(Number(e.target.value))}
                            className="w-48 accent-orange-500"
                          />
                          <span className="font-medium text-gray-800 tabular-nums w-12 text-right">
                            {mapRadiusKm} km
                          </span>
                        </div>
                        <RadialMapView
                          userLat={geo.coords.lat}
                          userLng={geo.coords.lng}
                          radiusKm={mapRadiusKm}
                          onRadiusChange={setMapRadiusKm}
                          onClose={() => setRestaurantViewMode("list")}
                        />
                      </>
                    )}
                  </div>,
                  document.body
                )}

                {restaurantViewMode === "list" && session?.token && favouriteRestaurants.length > 0 && (
                  <section className="mb-8">
                    <h2 className="text-lg font-semibold mb-3">
                      Your favourites in {selectedCity}
                    </h2>
                    <div
                      className="flex space-x-4 overflow-x-auto scrollbar-hide pb-2"
                      style={{ WebkitOverflowScrolling: "touch" }}
                    >
                      {favouriteRestaurants.map((r) => (
                        <div key={r.id} className="flex-shrink-0 w-56">
                          <RestaurantCard
                            restaurant={r}
                            onRemove={() => handleRemoveRestaurant(r.id)}
                            onFavouriteRemove={() => {
                              removeFavouriteRestaurant(r.id);
                              fetchFavourites();
                            }}
                            showMenu={false}
                            selectedCity={selectedCity}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                {restaurantViewMode === "list" && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                      {filteredRestaurants.map(restaurant => (
                        <RestaurantCard
                          key={restaurant.id}
                          restaurant={restaurant}
                          onRemove={() => handleRemoveRestaurant(restaurant.id)}
                          onFavouriteRemove={() => fetchFavourites()}
                          showMenu={session.roles?.includes("ROLE_ADMIN") ?? false}
                          selectedCity={selectedCity}
                        />
                      ))}
                    </div>
                    {filteredRestaurants.length === 0 && !loadingRestaurants && (
                      <div className="text-center py-12">
                        <p className="text-muted-foreground">No restaurants found matching your criteria.</p>
                      </div>
                    )}
                    {loadingRestaurants && (
                      <div className="text-center py-12">
                        <p className="text-muted-foreground">Loading restaurants...</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
        
        {selectedTab === "dishes" && selectedCity && (
          <AddDishDialogFloatingTrigger onAddDish={handleAddDish} selectedCity={selectedCity} />
        )}
        {selectedTab === "restaurants" && selectedCity && (
          <AddRestaurantDialogFloatingTrigger onAddRestaurant={handleAddRestaurant} />
        )}
      </div>
    </div>
  );
}