import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { useSession, SessionContextType } from "../contexts/SessionContext";
import { Heart, Pencil, Check, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import toast from "react-hot-toast";
import { fetchWithAuth } from "@/lib/api";
import ActionMenu from "./ActionMenu";
import { AddRestaurantDialog } from "./AddRestaurantDialog";
import { useAppContext } from '@/app/contexts/AppContext';

export interface Restaurant {
  id: string;
  name: string;
  cuisine: string;
  description: string;
  tags: string[];
  image: string;
  isFavourite?: boolean;
  favoriteCount: number;
}

interface RestaurantCardProps {
  restaurant: Restaurant;
  onRemove: () => void;
  onFavouriteRemove: () => void;
  onUpdate?: (updatedRestaurant: Restaurant) => void;
  selectedCity: string;
  showMenu: boolean;
  isSubmittedPage?: boolean;
}

export function RestaurantCard({
  restaurant,
  onRemove,
  onFavouriteRemove,
  onUpdate,
  selectedCity,
  showMenu,
  isSubmittedPage = false,
}: RestaurantCardProps) {
  const { session }: SessionContextType = useSession();
  const { setRestaurants, submittedRestaurants, setSubmittedRestaurants } = useAppContext();

  const [isFavourite, setIsFavourite] = useState(restaurant.isFavourite ?? false);
  const [favoriteCount, setFavoriteCount] = useState(restaurant.favoriteCount);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const handleApprove = async () => {
    console.log("Approve button clicked for restaurant:", restaurant.id);

    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/foodapp/restaurant/draft/${restaurant.id}`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.token}`,
        },
      });

      if (response.ok) {
        setSubmittedRestaurants(prevRestaurants =>
          prevRestaurants.filter(r => r.id !== restaurant.id)
        );
        toast.success("Restaurant approved successfully!");
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || "Failed to approve restaurant.");
      }
    } catch (error) {
      console.error("Error approving restaurant:", error);
      toast.error("Something went wrong while approving restaurant.");
    }
  };

  const handleReject = async () => {
    console.log("Reject button clicked for restaurant:", restaurant.name);

    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/foodapp/restaurant/draft/${restaurant.id}`;
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.token}`,
        },
      });

      if (response.ok) {
        setSubmittedRestaurants(prevRestaurants =>
          prevRestaurants.filter(r => r.id !== restaurant.id)
        );
        toast.success("Restaurant rejected successfully!");
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || "Failed to reject restaurant.");
      }
    } catch (error) {
      console.error("Error rejecting restaurant:", error);
      toast.error("Something went wrong while rejecting restaurant.");
    }
  };

  const onDelete = async () => {
    if (!session.token) {
      toast.error("You must be logged in to delete a restaurant.");
      return;
    }

    const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurant.id}`;

    try {
      const response = await fetchWithAuth(url, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success(t => (
          <div onClick={() => toast.dismiss(t.id)} style={{ cursor: "pointer" }}>
            Restaurant deleted successfully!
          </div>
        ));
        onRemove();
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || "Failed to delete the restaurant");
      }
    } catch (error) {
      toast.error(`${error} error occurred. Please try again.`);
    }
  }

  const handleEdit = () => {
    if (!session.token) {
      toast.error("You must be logged in to edit a restaurant.");
      return;
    }
    setIsEditDialogOpen(true);
  };

  const handleEditSuccess = async (updatedRestaurantData: Omit<Restaurant,  "favoriteCount">) => {
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/foodapp/updateRestaurant`;

      const response = await fetchWithAuth(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
      body: JSON.stringify({ ...updatedRestaurantData, city: selectedCity, id:updatedRestaurantData.id }),      });

      if (response.ok) {
        const updatedRestaurant: Restaurant = {
          ...restaurant,
          ...updatedRestaurantData,
          id: restaurant.id,
          favoriteCount: restaurant.favoriteCount
        };

        if (session.roles?.includes('ADMIN')) {
          toast.success(t => (
            <div onClick={() => toast.dismiss(t.id)} style={{ cursor: "pointer" }}>
              Restaurant updated successfully!
            </div>
          ));
          setRestaurants((prevRestaurants: Restaurant[]) =>
            prevRestaurants.map(r =>
              r.id === updatedRestaurant.id ? updatedRestaurant : r
            )
          );
        }

        if (session.roles?.includes('USER')) {
          toast.success("Update Request is sent for approval")
          setRestaurants((prevRestaurants: Restaurant[]) =>
            prevRestaurants.filter(r => r.id !== updatedRestaurant.id)
          );
        }

        setIsEditDialogOpen(false);
        if (onUpdate) {
          onUpdate(updatedRestaurant);
        }

      } else {
        const errorData = await response.json();
        toast.error(errorData.message || "Failed to update the restaurant");
      }
    } catch (error) {
      toast.error(`${error} error occurred. Please try again.`);
    }
  };

  const handleFavouriteToggle = async () => {
    if (!session.token) {
      toast.error("You must be logged in to favourite a restaurant.");
      return;
    }

    const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurant.id}/favorite`;

    try {
      const response = await fetchWithAuth(url, {
        method: isFavourite ? "DELETE" : "POST",
      });

      if (response.ok) {
        if (isFavourite) {
          setIsFavourite(false);
          setFavoriteCount((prev) => Math.max(0, prev - 1));
          onFavouriteRemove();
          toast.success(t => (
            <div onClick={() => toast.dismiss(t.id)} style={{ cursor: "pointer" }}>
              Restaurant unfavourited successfully!
            </div>
          ));
        } else {
          setIsFavourite(true);
          setFavoriteCount((prev) => prev + 1);
          onFavouriteRemove();  // reused as a "favourites changed" hook — refreshes the strip
          toast.success(t => (
            <div onClick={() => toast.dismiss(t.id)} style={{ cursor: "pointer" }}>
              Restaurant Favourited successfully!
            </div>
          ));
        }
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || "Failed to update favourite status.");
      }
    } catch (error) {
      toast.error(`${error} error occurred. Please try again.`);
    }
  };

  return (
    <>
      <Card className="overflow-hidden shadow hover:shadow-md transition-shadow gap-0">
        <CardHeader className="p-0">
          <div className="relative w-full h-48">
            <ImageWithFallback
              src={restaurant.image}
              alt={restaurant.name}
              className="object-cover"
            />
            {isSubmittedPage && (
              <>
                {session.roles?.includes('ADMIN') && (
                  <>
                    <div
                      className="absolute top-2 left-2 bg-green-500 hover:bg-green-600 rounded-full p-1.5 cursor-pointer shadow-md transition-colors"
                      onClick={handleApprove}
                    >
                      <Check className="w-5 h-5 text-white" />
                    </div>
                    <div
                      className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 rounded-full p-1.5 cursor-pointer shadow-md transition-colors"
                      onClick={handleReject}
                    >
                      <X className="w-5 h-5 text-white" />
                    </div>
                  </>
                )}
                {session.roles?.includes('USER') && !session.roles?.includes('ADMIN') && (
                  <>
                    <div
                      className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 rounded-full p-1.5 cursor-pointer shadow-md transition-colors"
                      onClick={handleReject}
                    >
                      <X className="w-5 h-5 text-white" />
                    </div>
                  </>
                )}
              </>
            )}
            {session.isLoggedIn && !isSubmittedPage && (
              <div
                className="absolute top-2 right-2 bg-white rounded-full p-1.5 cursor-pointer flex flex-col items-center shadow border border-black"
                onClick={handleFavouriteToggle}
              >
                <Heart
                  className={`w-6 h-6 ${
                      isFavourite ? "text-red-500 fill-current" : "text-gray-500"
                  }`}
                />
                <span className="text-sm font-medium text-gray-700">
                  {favoriteCount}
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4">
          <div className="space-y-1">
            <div className="flex justify-between items-start space-y-0">
              <div>
                <h3 className="font-semibold">{restaurant.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {restaurant.cuisine}
                </p>
              </div>
              {showMenu && (
                <div>
                  <ActionMenu onEdit={handleEdit} onDelete={onDelete} />
                </div>
              )}
            </div>
            <p className="text-sm text-gray-600 line-clamp-2">
              {restaurant.description}
            </p>
            <div className="flex flex-wrap gap-1">
              {restaurant.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} className="text-xs ">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      {isEditDialogOpen && (
        <AddRestaurantDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          restaurantToEdit={restaurant}
          onAddRestaurant={() => {}}
          onEditRestaurant={handleEditSuccess}
        />
      )}
    </>
  );
}
