'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Dish } from "@/app/components/DishCard";
import { Restaurant } from "@/app/components/RestaurantCard";
import { fetchWithAuth } from "@/lib/api";
import { useCallback } from 'react';
import { useSession, SessionContextType } from "../contexts/SessionContext";
import toast from 'react-hot-toast';

interface AppContextType {
  selectedCity: string;
  setSelectedCity: (city: string) => void;
  selectedTab: string;
  setSelectedTab: (tab: string) => void;
  
  // Dishes state and actions
  dishes: Dish[];
  setDishes: React.Dispatch<React.SetStateAction<Dish[]>>;
  handleAddDish: (newDish: Omit<Dish, "id" | "rating" | "favoriteCount">) => void;
  
  // Restaurants state and actions
  restaurants: Restaurant[];
  setRestaurants: React.Dispatch<React.SetStateAction<Restaurant[]>>;

  // setRestaurants: (restaurants: Restaurant[]) => void;
  handleAddRestaurant: (newRestaurant: Omit<Restaurant, "id" | "rating" | "favoriteCount">) => void;
  
  // Favourites state and actions
  favouriteDishes: Dish[];
  setFavouriteDishes: (dishes: Dish[]) => void;
  favouriteRestaurants: Restaurant[];
  setFavouriteRestaurants: (restaurants: Restaurant[]) => void;
  fetchFavourites: () => Promise<void>;
  removeFavouriteDish: (dishId: string) => void;
  removeFavouriteRestaurant: (restaurantId: string) => void;
  
  // Submitted requests state and actions
  submittedDishes: Dish[];
  // setSubmittedDishes: (dishes: Dish[]) => void;
    setSubmittedDishes: React.Dispatch<React.SetStateAction<Dish[]>>;
  submittedRestaurants: Restaurant[];
  // setSubmittedRestaurants: (restaurants: Restaurant[]) => void;
    setSubmittedRestaurants: React.Dispatch<React.SetStateAction<Restaurant[]>>;

  fetchSubmittedRequests: () => Promise<void>;
  loadingSubmittedRequests: boolean;
  setLoadingSubmittedRequests: (loading: boolean) => void;
  
  // Loading states
  loadingDishes: boolean;
  setLoadingDishes: (loading: boolean) => void;
  loadingRestaurants: boolean;
  setLoadingRestaurants: (loading: boolean) => void;
  loadingFavourites: boolean;
  setLoadingFavourites: (loading: boolean) => void;
  
  // Pagination states
  dishesCurrentPage: number;
  setDishesCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  restaurantsCurrentPage: number;
  setRestaurantsCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  hasMoreDishes: boolean;
  setHasMoreDishes: (hasMore: boolean) => void;
  hasMoreRestaurants: boolean;
  setHasMoreRestaurants: (hasMore: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedTab, setSelectedTabState] = useState('dishes');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('selectedTab');
    if (saved === 'dishes' || saved === 'restaurants') setSelectedTabState(saved);
  }, []);

  const setSelectedTab = (tab: string) => {
    setSelectedTabState(tab);
    if (typeof window !== 'undefined') localStorage.setItem('selectedTab', tab);
  };

  // Common state for dishes and restaurants
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  
  // Favourites state
  const [favouriteDishes, setFavouriteDishes] = useState<Dish[]>([]);
  const [favouriteRestaurants, setFavouriteRestaurants] = useState<Restaurant[]>([]);
  
  // Submitted requests state
  const [submittedDishes, setSubmittedDishes] = useState<Dish[]>([]);
  const [submittedRestaurants, setSubmittedRestaurants] = useState<Restaurant[]>([]);
  
  // Loading states
  const [loadingDishes, setLoadingDishes] = useState(false);
  const [loadingRestaurants, setLoadingRestaurants] = useState(false);
  const [loadingFavourites, setLoadingFavourites] = useState(false);
  const [loadingSubmittedRequests, setLoadingSubmittedRequests] = useState(false);
  
  // Pagination states
  const [dishesCurrentPage, setDishesCurrentPage] = useState(0);
  const [restaurantsCurrentPage, setRestaurantsCurrentPage] = useState<number>(0);
  const [hasMoreDishes, setHasMoreDishes] = useState(false);
  const [hasMoreRestaurants, setHasMoreRestaurants] = useState(true);
  const { session }: SessionContextType = useSession();

  const handleAddDish = async (newDish: Omit<Dish, "id" | "rating" | "favoriteCount">) => {
    const restaurantId = (newDish as Dish).restaurantId;
    if (!restaurantId) {
      toast.error("Pick a restaurant from the dropdown first.");
      return;
    }

    try {
      // auto_favorite=true: backend will favourite the dish AND its restaurant in one go
      const response = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/dishes?auto_favorite=true`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newDish.name,
            description: newDish.description || null,
            tags: newDish.tags ?? [],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const created = await response.json();

      // If the user picked a photo, upload it as a follow-up multipart call.
      const imageFile = (newDish as Dish).imageFile;
      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        const imgResp = await fetchWithAuth(
          `${process.env.NEXT_PUBLIC_API_URL}/dishes/${created.id}/image`,
          { method: 'POST', body: fd }
        );
        if (!imgResp.ok) {
          toast.error("Dish added, but photo upload failed.");
        }
      }

      const mapped: Dish = {
        id: created.id,
        name: created.name,
        restaurant: created.restaurant_name ?? newDish.restaurant,
        restaurantId: created.restaurant_id,
        description: created.description ?? "",
        tags: created.tags ?? [],
        image: `${process.env.NEXT_PUBLIC_API_URL}/dishes/${created.id}/image?w=400`,
        isFavourite: created.is_favourite ?? true,
        favoriteCount: created.favorite_count ?? 1,
      };

      setDishes(prev => [mapped, ...prev]);
      await fetchFavourites();  // refresh the favourites strip
      toast.success('Dish added and favourited');
    } catch (error) {
      console.error('Failed to add dish:', error);
      toast.error(`Failed to add dish: ${error}`);
    }
  };
const handleAddRestaurant = async (newRestaurant: Omit<Restaurant, "id" | "rating" | "favoriteCount">) => {
  const restaurant: Restaurant = {
    ...newRestaurant,
    id: Date.now().toString(), // or however you generate IDs
    favoriteCount: 0, // Initialize with 0 favorites
    // rating: 0, // Add this if you need rating
  };


    try {
      console.log('Adding restaurant:', JSON.stringify({ ...newRestaurant, city: selectedCity }));
      
      const response = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/foodapp/restaurant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...newRestaurant, city: selectedCity })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const createdRestaurant: Restaurant = await response.json();
      // Use the server response if available, otherwise use local dish
      if (session.roles?.includes('ADMIN')) {
        setRestaurants(prev => [createdRestaurant || restaurant, ...prev]);
        toast.success('New Restaurant Added', createdRestaurant);
      }
      if (session.roles?.includes('USER')) {
        // setDishes(prev => [createdDish || dish, ...prev]);
        toast.success('Draft Restaurant Request added', createdRestaurant);
      }

    } catch (error) {
      console.error('Failed to add restaurant:', error);
      // Still add to local state as fallback
      setRestaurants(prev => [restaurant, ...prev]);
    }
  };

  // Fetch favourites
  const fetchFavourites = useCallback(async () => {
    if (!selectedCity) return;
    
    setLoadingFavourites(true);
    try {
      // Fetch favourite dishes
      const dishesResponse = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/favorites/dishes?city=${encodeURIComponent(selectedCity)}`
      );
      if (dishesResponse.ok) {
        const rows: any[] = await dishesResponse.json();
        setFavouriteDishes(
          rows.map((d) => ({
            id: d.id,
            name: d.name,
            restaurant: d.restaurant_name ?? "",
            restaurantId: d.restaurant_id,
            description: d.description ?? "",
            tags: d.tags ?? [],
            image: `${process.env.NEXT_PUBLIC_API_URL}/dishes/${d.id}/image?w=400`,
            isFavourite: true,
            favoriteCount: d.favorite_count ?? 0,
          }))
        );
      }

      // Fetch favourite restaurants
      const restaurantsResponse = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/favorites/restaurants?city=${encodeURIComponent(selectedCity)}`
      );
      if (restaurantsResponse.ok) {
        const rows: any[] = await restaurantsResponse.json();
        setFavouriteRestaurants(
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            cuisine: r.cuisine ?? "",
            description: r.description ?? r.formatted_address ?? "",
            tags: r.tags ?? [],
            image: r.photo_reference
              ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${r.id}/photo?w=600`
              : "",
            isFavourite: true,
            favoriteCount: r.favorite_count ?? 0,
          }))
        );
      }
    } catch (error) {
      console.error('Failed to fetch favourites:', error);
    } finally {
      setLoadingFavourites(false);
    }
  }, [selectedCity, setFavouriteDishes, setFavouriteRestaurants, setLoadingFavourites]);

  // Fetch submitted requests
  const fetchSubmittedRequests = useCallback(async () => {
    setLoadingSubmittedRequests(true);
    try {
      // Fetch submitted dishes
      const dishesResponse = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/foodapp/dish/draft`);
      if (dishesResponse.ok) {
        const dishesData = await dishesResponse.json();
        console.log(dishesData);
        setSubmittedDishes( dishesData || []);
      }

      // Fetch submitted restaurants
      const restaurantsResponse = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/foodapp/restaurant/draft`);
      // console.log(restaurantsResponse)
      if (restaurantsResponse.ok) {
        const restaurantsData = await restaurantsResponse.json();
        console.log(restaurantsData);
        setSubmittedRestaurants(restaurantsData || []);
      }
    } catch (error) {
      console.error('Failed to fetch submitted requests:', error);
    } finally {
      setLoadingSubmittedRequests(false);
    }
  }, []);

  // Remove favourite dish
  const removeFavouriteDish = async (dishId: string) => {
    setFavouriteDishes(prev => prev.filter(d => d.id !== dishId));
    await fetchFavourites();  // refetch updated favourites from API
  };

  // Remove favourite restaurant
  const removeFavouriteRestaurant = (restaurantId: string) => {
    setFavouriteRestaurants(prev => prev.filter(r => r.id !== restaurantId));
  };

  return (
    <AppContext.Provider value={{
      selectedCity,
      setSelectedCity,
      selectedTab,
      setSelectedTab,
      dishes,
      setDishes,
      handleAddDish,
      restaurants,
      setRestaurants,
      handleAddRestaurant,
      favouriteDishes,
      setFavouriteDishes,
      favouriteRestaurants,
      setFavouriteRestaurants,
      fetchFavourites,
      removeFavouriteDish,
      removeFavouriteRestaurant,
      submittedDishes,
      setSubmittedDishes,
      submittedRestaurants,
      setSubmittedRestaurants,
      fetchSubmittedRequests,
      loadingSubmittedRequests,
      setLoadingSubmittedRequests,
      loadingDishes,
      setLoadingDishes,
      loadingRestaurants,
      setLoadingRestaurants,
      loadingFavourites,
      setLoadingFavourites,
      dishesCurrentPage,
      setDishesCurrentPage,
      restaurantsCurrentPage,
      setRestaurantsCurrentPage,
      hasMoreDishes,
      setHasMoreDishes,
      hasMoreRestaurants,
      setHasMoreRestaurants,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}