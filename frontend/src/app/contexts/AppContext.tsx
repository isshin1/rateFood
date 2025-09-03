'use client'
import { createContext, useContext, useState, ReactNode } from 'react';
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
  const [selectedTab, setSelectedTab] = useState('dishes');

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
    const dish: Dish = {
      ...newDish,
      id: Date.now().toString(),
      // rating: 0,
      favoriteCount: 0,
    };

    try {
      const response = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/foodapp/dish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newDish)
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const createdDish: Dish = await response.json();
      
      // Use the server response if available, otherwise use local dish
      if (session.roles?.includes('ADMIN')) {
        setDishes(prev => [createdDish || dish, ...prev]);
        toast.success('New Dish Added', createdDish);
      }
      if (session.roles?.includes('USER')) {
        // setDishes(prev => [createdDish || dish, ...prev]);
        toast.success('Draft Dish Request added', createdDish);
      }

    } catch (error) {
      console.error('Failed to add dish:', error);
      // Still add to local state as fallback
      setDishes(prev => [dish, ...prev]);
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
      const dishesResponse = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/foodapp/dish/favourites/${selectedCity}`);
      if (dishesResponse.ok) {
        const dishesData = await dishesResponse.json();
        setFavouriteDishes(dishesData.data || []);
      }

      // Fetch favourite restaurants
      const restaurantsResponse = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/foodapp/restaurant/favourites/${selectedCity}`);
      if (restaurantsResponse.ok) {
        const restaurantsData = await restaurantsResponse.json();
        setFavouriteRestaurants(restaurantsData.data || []);
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