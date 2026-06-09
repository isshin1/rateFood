import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { useSession, SessionContextType } from "../contexts/SessionContext";
import { Heart, Pencil, Check, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import toast from "react-hot-toast";
import { fetchWithAuth } from "@/lib/api";
import ActionMenu from "./ActionMenu";
import { AddDishDialog } from "./AddDishDialog";
import { useAppContext } from '@/app/contexts/AppContext';

export interface Dish {
  id: string;
  name: string;
  restaurant: string;
  restaurantId?: string;
  description: string;
  tags: string[];
  image: string;
  imageFile?: File;  // not persisted — used when uploading
  isFavourite?: boolean;
  favoriteCount: number
}

interface DishCardProps {
  dish: Dish;
  onRemove: () => void;
  onFavouriteRemove: () => void;
  onUpdate?: (updatedDish: Dish) => void;
  selectedCity: string;
  showMenu: boolean;
  isSubmittedPage?: boolean; // Add this as an optional prop
}

export function DishCard({ dish, onRemove, onFavouriteRemove, onUpdate, selectedCity, showMenu, isSubmittedPage = false }: DishCardProps) {
  const { session }: SessionContextType = useSession();
  const { setDishes, submittedDishes, setSubmittedDishes } = useAppContext();

  const [isFavourite, setIsFavourite] = useState(dish.isFavourite ?? false);
  const [favoriteCount, setFavoriteCount] = useState(dish.favoriteCount);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Demo functions for the new buttons
  // const handleApprove = () => {
  //   console.log("Approve button clicked for dish:", dish.name);
  //   setSubmittedDishes(prevDishes => prevDishes.filter(d => d.id !== dish.id));
  //   toast.success("Dish approved!");
  // };

  const handleApprove = async () => {
    console.log("Approve button clicked for dish:", dish.id);

    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/foodapp/dish/draft/${dish.id}`;
      const response = await fetch(url, {
        method: "PUT",  // approve = PUT
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.token}`, // if auth required
        },
        // body: JSON.stringify({ approved: true }), // if backend expects body
      });

      if (response.ok) {
        // Remove from local state
        setSubmittedDishes(prevDishes =>
          prevDishes.filter(d => d.id !== dish.id)
        );
        toast.success("Dish approved successfully!");
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || "Failed to approve dish.");
      }
    } catch (error) {
      console.error("Error approving dish:", error);
      toast.error("Something went wrong while approving dish.");
    }
  };


  const handleReject = async () => {
    console.log("Reject button clicked for dish:", dish.name);

    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/foodapp/dish/draft/${dish.id}`;
      const response = await fetch(url, {
        method: "DELETE",   // usually reject = delete
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.token}`, // if auth required
        },
      });

      if (response.ok) {
        // Remove from local state
        setSubmittedDishes(prevDishes =>
          prevDishes.filter(d => d.id !== dish.id)
        );
        toast.success("Dish rejected successfully!");
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || "Failed to reject dish.");
      }
    } catch (error) {
      console.error("Error rejecting dish:", error);
      toast.error("Something went wrong while rejecting dish.");
    }
  };

  const onDelete = async () => {
    if (!session.token) {
      toast.error("You must be logged in to delete a dish.");
      return;
    }

    const url = `${process.env.NEXT_PUBLIC_API_URL}/dishes/${dish.id}`;

    try {
      const response = await fetchWithAuth(url, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success(t => (
          <div onClick={() => toast.dismiss(t.id)} style={{ cursor: "pointer" }}>
            Dish deleted successfully!
          </div>
        ));
        onRemove();
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || "Failed to delete the dish");
      }
    } catch (error) {
      toast.error(`${error} error occurred. Please try again.`);
    }
  }

  const handleEdit = () => {
    if (!session.token) {
      toast.error("You must be logged in to edit a dish.");
      return;
    }
    setIsEditDialogOpen(true);
  };

// In DishCard.tsx, update the handleEditSuccess function:

  const handleEditSuccess = async (updatedDishData: Omit<Dish, "favoriteCount">) => {
    try {
      // Make API call to update the dish
      const url = `${process.env.NEXT_PUBLIC_API_URL}/foodapp/updateDish`;

      const response = await fetchWithAuth(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatedDishData), // This now includes the id
      });

      if (response.ok) {
        const updatedDish: Dish = {
          ...dish,
          ...updatedDishData,
          favoriteCount: dish.favoriteCount
        };

        // Check if session.roles exists and includes 'ADMIN'
        if (session.roles?.includes('ADMIN')) {
          toast.success(t => (
            <div onClick={() => toast.dismiss(t.id)} style={{ cursor: "pointer" }}>
              Dish updated successfully!
            </div>
          ));
          setDishes((prevDishes: Dish[]) =>
            prevDishes.map(d =>
              d.id === updatedDish.id ? updatedDish : d
            )
          );
        }

        // Check if session.roles exists and includes 'USER'
        if (session.roles?.includes('USER')) {
          toast.success("Update Request is sent for approval")
          setDishes((prevDishes: Dish[]) =>
            prevDishes.filter(d => d.id !== updatedDish.id)
          );
        }

        setIsEditDialogOpen(false);
        if (onUpdate) {
          onUpdate(updatedDish);
        }

      } else {
        const errorData = await response.json();
        toast.error(errorData.message || "Failed to update the dish");
      }
    } catch (error) {
      toast.error(`${error} error occurred. Please try again.`);
    }
  };

  const handleFavouriteToggle = async () => {
    if (!session.token) {
      toast.error("You must be logged in to favourite a dish.");
      return;
    }

    const endpoint = isFavourite ? "unFavourite" : "favourite";
    const url = `${process.env.NEXT_PUBLIC_API_URL}/foodapp/dish/${endpoint}/${dish.id}`;

    try {
      const response = await fetchWithAuth(url, {
        method: "POST",
      });

      if (response.ok) {
        if (isFavourite) {
          // Currently favourited → unfavourite
          setIsFavourite(false);
          setFavoriteCount((prev) => Math.max(0, prev - 1));
          onFavouriteRemove();
          toast.success(t => (
            <div onClick={() => toast.dismiss(t.id)} style={{ cursor: "pointer" }}>
              Dish unfavourited successfully!
            </div>
          ));

        } else {
          // Currently not favourited → favourite
          setIsFavourite(true);
          setFavoriteCount((prev) => prev + 1);
          toast.success(t => (
            <div onClick={() => toast.dismiss(t.id)} style={{ cursor: "pointer" }}>
              Dish Favourited successfully!
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
      <Card className="overflow-hidden shadow hover:shadow-md transition-shadow  min-h-90 max-h-90">
        <CardHeader className="p-0 mb-0 gap-0">
          <div className="relative w-full h-48">
            <ImageWithFallback
              src={dish.image}
              alt={dish.name}
              className="object-cover"
            />
            {isSubmittedPage && (
              <>
                {session.roles?.includes('ADMIN') && (
                  <>
                    {/* Approve Button - Top Left */}
                    <div
                      className="absolute top-2 left-2 bg-green-500 hover:bg-green-600 rounded-full p-1.5 cursor-pointer shadow-md transition-colors"
                      onClick={handleApprove}
                    >
                      <Check className="w-5 h-5 text-white" />
                    </div>

                    {/* Reject Button - Top Right */}
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
                    {/* Only Reject Button - Top Right */}
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



            {/* Favorite Button - Moved to bottom right to avoid overlap */}
            {session.isLoggedIn && !isSubmittedPage && (
              <div
                className="absolute top-2 right-2 bg-white rounded-full p-1.5 cursor-pointer flex flex-col items-center shadow border border-black"
                onClick={handleFavouriteToggle}
              >
                <Heart
                  className={`w-6 h-6 ${isFavourite ? "text-red-500 fill-current" : "text-gray-500"
                    }`}
                />
                <span className="text-sm font-medium text-gray-700">
                  {favoriteCount}
                </span>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="px-4 mt-0">
          <div className="space-y-3 px-0">
            <div className="flex justify-between items-start space-y-0">
              <div>
                <h3 className="font-semibold">{dish.name}</h3>
                <p className="text-sm text-muted-foreground">{dish.restaurant}</p>
              </div>

              {showMenu && <div>
                <ActionMenu onEdit={handleEdit} onDelete={onDelete} />
              </div>
              }
            </div>

            <p className="text-sm text-gray-600 line-clamp-1">
              {dish.description}
            </p>

            {/* <div className="flex items-center justify-between">
            </div> */}

            <div className="flex flex-nowrap gap-1 overflow-x-auto scrollbar-hide">
              {dish.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog - Only render when editing */}
      {isEditDialogOpen && (
        <AddDishDialog
          selectedCity={selectedCity}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          dishToEdit={dish}
          onAddDish={() => { }} // Not used in edit mode
          onEditDish={handleEditSuccess}
        />
      )}
    </>
  );
}