'use client'
import { useState, useMemo, useEffect } from "react";

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

  // Reset dishes when city changes
  useEffect(() => {
    setDishes([]);
    setDishesCurrentPage(0);
    setHasMoreDishes(false);
  }, [selectedCity, setDishes, setDishesCurrentPage, setHasMoreDishes]);

  // Fetch restaurants
  useEffect(() => {
    if (!selectedCity) return;
    setLoadingRestaurants(true);

    fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/foodapp/restaurant/${selectedCity}?page=${restaurantsCurrentPage}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch restaurants for ${selectedCity}?page=${restaurantsCurrentPage}`);
        return res.json();
      })
    .then(data => {
      setRestaurants(prev => {
        const newRestaurants = restaurantsCurrentPage === 0 ? data.data : [...prev, ...data.data];
        return newRestaurants;
      });
        setHasMoreRestaurants(restaurantsCurrentPage + 1 < data.totalPages);
      })

      .catch(err => console.error(err))
      .finally(() => setLoadingRestaurants(false));
  }, [selectedCity, restaurantsCurrentPage, setRestaurants, setLoadingRestaurants, setHasMoreRestaurants]);

  // Fetch dishes
  useEffect(() => {
    if (!selectedCity) return;
    setLoadingDishes(true);

    fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/foodapp/dish/${selectedCity}?page=${dishesCurrentPage}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch dishes for ${selectedCity}?page=${dishesCurrentPage}`);
        return res.json();
      })
      .then(data => {
        setDishes(prev => {
          const newDishes = dishesCurrentPage === 0 ? data.data : [...prev, ...data.data];
          return newDishes;
        });
        setHasMoreDishes(dishesCurrentPage + 1 < data.totalPages);
      })
      .catch(err => console.error(err))
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
    return restaurants.filter(restaurant => {
      const matchesSearch = restaurant.name.toLowerCase().includes(restaurantSearch.toLowerCase()) ||
                           restaurant.cuisine.toLowerCase().includes(restaurantSearch.toLowerCase());
      const matchesTags = restaurantTags.length === 0 || restaurantTags.some(tag => restaurant.tags.includes(tag));
      return matchesSearch && matchesTags;
    });
  }, [restaurants, restaurantSearch, restaurantTags]);

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
                      showMenu={session.token ? true: false}
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
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
                  {filteredRestaurants.map(restaurant => (
                    <RestaurantCard
                      key={restaurant.id}
                      restaurant={restaurant}
                      // onRatingChange={handleRestaurantRating}
                      onRemove={() => handleRemoveRestaurant(restaurant.id)}
                      onFavouriteRemove={() => {} }
                      showMenu={session.token ? true: false}
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