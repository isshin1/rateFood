'use client'
import { MapPin, Menu, Plus } from "lucide-react";
import React, {useState, useEffect, useRef} from "react";
import { FixedSizeList as List, ListChildComponentProps } from "react-window";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { AddDishDialog } from "./AddDishDialog";
import { AddRestaurantDialog } from "./AddRestaurantDialog";
import {Dish} from "@/app/components/DishCard";
import {Restaurant} from "@/app/components/RestaurantCard";
import Link from "next/link";
import { AuthDialog } from "./AuthDialog";
import { Button } from "./ui/button";
import { useSession } from "@/app/contexts/SessionContext";
import { fetchWithAuth } from "@/lib/api";
import { usePathname } from 'next/navigation';

interface NavbarProps {
  selectedCity: string;
  onCityChange: (city: string) => void;
  selectedTab: string;
  onTabChange: (tab: string) => void;
  onAddDish: (newDish: Omit<Dish, "id" | "rating" | "favoriteCount">) => void;
  onAddRestaurant: (newRestaurant: Omit<Restaurant, "id" | "rating" | "favoriteCount">) => void;
}

export function Navbar({ selectedCity, onCityChange, selectedTab, onTabChange, onAddDish, onAddRestaurant  }: NavbarProps) {
    const [citySearch, setCitySearch] = useState("");
    const [filteredCities, setFilteredCities] = useState<{ label: string; value: string }[]>([]);
    const [cityTotalPages, setCityTotalPages] = useState(1);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const PAGE_SIZE = 20; // or adjust per backend

    const [isCityModalOpen, setIsCityModalOpen] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const modalRef = useRef<HTMLDivElement>(null); // for outside click detection
    const listRef = useRef<List>(null);

    const pathname = usePathname();
    const { session, logout } = useSession();

    // Debug logging to help troubleshoot
    console.log('Navbar Debug Info:', {
        pathname,
        selectedTab,
        selectedCity,
        sessionRoles: session.roles,
        isLoggedIn: session.isLoggedIn,
        hasValidRole: session.roles?.includes('ADMIN') || session.roles?.includes('USER')
    });

    // keep updating window height
    const [listHeight, setListHeight] = useState(0);
    useEffect(() => {
        function updateHeight() {
            setListHeight(Math.round(window.innerHeight * 0.30)); // 40vh in px
        }

        updateHeight(); // Set initial height on mount

        window.addEventListener('resize', updateHeight);

        return () => window.removeEventListener('resize', updateHeight);
    }, []);


    useEffect(() => {
        if (selectedCity) {
            localStorage.setItem('selectedCity', selectedCity);
        }
    }, [selectedCity]);


    useEffect(() => {
        if (!isCityModalOpen) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            import("@/lib/google-maps").then(({ predictCities }) =>
                predictCities(citySearch)
            )
                .then((cities) => {
                    setFilteredCities(cities);
                    setCityTotalPages(1);
                })
                .catch(() => {
                    setFilteredCities([]);
                    setCityTotalPages(1);
                })
        }, 300);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [citySearch, isCityModalOpen, cityTotalPages]);

    // autqoficus search bar
    useEffect(() => {
        if (isCityModalOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
        if (isCityModalOpen) {
            setCitySearch(""); // clear field each time modal opens
        }
    }, [isCityModalOpen]);

    // Close on Escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setIsCityModalOpen(false);
            }
        };
        if (isCityModalOpen) {
            document.addEventListener("keydown", handleEsc);
        }
        return () => {
            document.removeEventListener("keydown", handleEsc);
        };
    }, [isCityModalOpen]);

    // highlight items in search
    useEffect(() => {
        if (isCityModalOpen) {
            setHighlightedIndex(0);
        }
    }, [isCityModalOpen, citySearch]);

    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollToItem(highlightedIndex);
        }
    }, [highlightedIndex]);


    // Handle keyboard navigation for above
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!filteredCities.length) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedIndex((prev) => Math.min(prev + 1, filteredCities.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (filteredCities[highlightedIndex]) {
                onCityChange(filteredCities[highlightedIndex].value);
                setIsCityModalOpen(false);
                setCitySearch("");
            }
        }
    };

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
                setIsCityModalOpen(false);
            }
        };
        if (isCityModalOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isCityModalOpen]);

    const Row = ({ index, style }: ListChildComponentProps) => {
        const city = filteredCities[index];
        const isHighlighted = index === highlightedIndex;
        return (
            <button
                style={style}
                key={city.label}
                onClick={() => {
                    onCityChange(city.value);
                    setIsCityModalOpen(false);
                    setCitySearch("");
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`px-3 py-2 text-left w-full cursor-pointer ${
                    isHighlighted ? "bg-blue-100 rounded" : "hover:bg-gray-100"
                }`}>

                {city.label}
            </button>
        );
    }
    const LIST_HEIGHT = listHeight; // 40vh in px
    const ITEM_HEIGHT = 40;  // px, height of each city button

    const [addDishOpen, setAddDishOpen] = useState(false);
    const [addRestaurantOpen, setAddRestaurantOpen] = useState(false);

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        if (isMenuOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isMenuOpen]);

    // Helper function to check if user has valid role
    const hasValidRole = () => {
        return session.roles?.includes('ADMIN') || session.roles?.includes('USER');
    };

    // Helper function to check if we should show Add Dish button
    const shouldShowAddDishButton = () => {
        return pathname === '/' && 
               selectedTab === 'dishes' && 
               selectedCity && 
               hasValidRole();
    };

    // Helper function to check if we should show Add Restaurant button
    const shouldShowAddRestaurantButton = () => {
        return pathname === '/' && 
               selectedTab === 'restaurants' && 
               selectedCity && 
               hasValidRole();
    };

    return (
        <>
            {/* Navbar */}
            <nav className="border-b bg-background sticky top-0 z-50 w-full overflow-visible">
                <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16 min-w-0">
                        {/* Left: Brand - Flexible width */}
                        <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
                            <Link
                            href="/"
                            className="w-10 h-10 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center cursor-pointer"
                            >
                            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain  scale-150" />
                            </Link>

                            <h1 className="text-lg sm:text-2xl font-bold text-primary hidden xs:block truncate">
                                FoodieDaddie
                            </h1>
                        </div>

                        {/* Center: Tabs - Hidden on very small screens */}
                        {pathname === '/' && (
                            <div className="hidden sm:flex justify-center flex-shrink-0">
                                <Tabs value={selectedTab} onValueChange={onTabChange}>
                                    <TabsList className="flex space-x-2 sm:space-x-4">
                                        <TabsTrigger value="dishes" className="text-sm">
                                            Dishes
                                        </TabsTrigger>
                                        <TabsTrigger value="restaurants" className="text-sm">
                                            Restaurants
                                        </TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </div>
                        )}

                        {/* Mobile Tabs - Show on small screens, below navbar */}
                        {pathname === '/' && (
                            <div className="sm:hidden absolute top-16 left-0 right-0 bg-background border-b z-40">
                                <div className="px-3 py-2">
                                    <Tabs value={selectedTab} onValueChange={onTabChange}>
                                        <TabsList className="flex w-full">
                                            <TabsTrigger value="dishes" className="flex-1 text-sm">
                                                Dishes
                                            </TabsTrigger>
                                            <TabsTrigger value="restaurants" className="flex-1 text-sm">
                                                Restaurants
                                            </TabsTrigger>
                                        </TabsList>
                                    </Tabs>
                                </div>
                            </div>
                        )}

                        {/* Right: Controls - Flexible width */}
                        <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0 min-w-0">
                            {/* Add buttons for desktop only */}
                            {pathname === '/' && session.isLoggedIn && (
                                <div className="hidden lg:block">
                                    {selectedTab === 'dishes' && (
                                        <button
                                            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] h-9 px-3 py-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg"
                                            onClick={() => setAddDishOpen(true)}
                                        >
                                            <Plus className="h-4 w-4" />
                                            <span className="hidden xl:inline">Add Dish</span>
                                        </button>
                                    )}

                                    {selectedTab === 'restaurants' && (
                                        <button
                                            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] h-9 px-3 py-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg"
                                            onClick={() => setAddRestaurantOpen(true)}
                                        >
                                            <Plus className="h-4 w-4" />
                                            <span className="hidden xl:inline">Add Restaurant</span>
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* City Selector - Only show on home page */}
                            {pathname === '/' && (
                                <button
                                    onClick={() => setIsCityModalOpen(true)}
                                    className="flex items-center space-x-1 sm:space-x-2 rounded px-2 sm:px-3 py-1 sm:py-1.5 bg-white border hover:bg-gray-50 transition-colors min-w-0 max-w-[120px] sm:max-w-none"
                                >
                                    <MapPin className="h-3 w-3 sm:h-4 sm:w-4 text-foreground flex-shrink-0" />
                                    <span className="text-xs sm:text-sm truncate">
                                        {selectedCity || "City"}
                                    </span>
                                </button>
                            )}

                            {/* Menu Button */}
                            <div className="relative flex-shrink-0" ref={menuRef}>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => setIsMenuOpen(prev => !prev)}
                                    className="h-8 w-8 sm:h-9 sm:w-9"
                                >
                                    <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
                                </Button>
                                {isMenuOpen && (
                                    <div className="absolute right-0 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-xl ring-0 ring-green ring-opacity-0 focus:outline-none z-5000">
                                        {pathname !== "/" && (
                                            <Link
                                                href="/"
                                                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                                onClick={() => setIsMenuOpen(false)}
                                            >
                                                Go to Home
                                            </Link>
                                        )}
                                        {session.isLoggedIn ? (
                                            <div>
                                                {pathname !== "/favourites" && (
                                                    <Link href="/favourites"
                                                         className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                                          onClick={() => setIsMenuOpen(false)}>
                                                            Show Favourites
                                                    </Link>
                                                )}
                                                <Link href="/submitted"
                                                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                                    onClick={() => setIsMenuOpen(false)}>
                                                        See Submitted Requests
                                                </Link>
                                                <div className="relative w-full">
                                                    <button
                                                        onClick={() => {
                                                        logout();
                                                        setIsMenuOpen(false);
                                                        }}
                                                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                                    >
                                                        Logout
                                                    </button>
                                                    
                                                    <div
                                                    className="absolute top-0 left-4 right-4"
                                                    style={{
                                                        height: '1px',
                                                        backgroundColor: 'rgba(0, 0, 0, 0.1)',
                                                        boxShadow: 'none',
                                                    }}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    setIsAuthDialogOpen(true);
                                                    setIsMenuOpen(false);
                                                }}
                                                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                            >
                                                Login / Sign Up
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </nav>

            <AuthDialog open={isAuthDialogOpen} onOpenChange={setIsAuthDialogOpen} />

            {/* Add Dish Dialog - Controlled */}
            {addDishOpen && selectedCity && (
                <AddDishDialog
                    onAddDish={onAddDish}
                    selectedCity={selectedCity}
                    open={addDishOpen}
                    onOpenChange={setAddDishOpen}
                />
            )}

            {/* Floating Add Button - Mobile Only - Bottom Right */}
            {pathname === '/' && session.isLoggedIn && (
                <button
                    className="fixed bottom-6 right-6 z-50 lg:hidden w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105"
                    onClick={() => {
                        if (selectedTab === 'dishes') {
                            setAddDishOpen(true);
                        } else if (selectedTab === 'restaurants') {
                            setAddRestaurantOpen(true);
                        }
                    }}
                    aria-label={selectedTab === 'dishes' ? 'Add Dish' : 'Add Restaurant'}
                    title={selectedTab === 'dishes' ? 'Add Dish' : 'Add Restaurant'}
                >
                    <Plus className="h-6 w-6" />
                </button>
            )}

            {/* Add Restaurant Dialog - Controlled */}
            {addRestaurantOpen && (
                <AddRestaurantDialog
                    onAddRestaurant={onAddRestaurant}
                    open={addRestaurantOpen}
                    onOpenChange={setAddRestaurantOpen}
                />
            )}

            {/* City Selection Modal */}
            {isCityModalOpen && (
                <div
                    className="fixed inset-0 z-[99999] bg-gray-800/50 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setIsCityModalOpen(false)}
                >
                    <div
                        className="bg-white rounded-lg shadow-lg w-full max-w-md p-4 flex flex-col h-[42vh] max-h-[500px]"
                        onClick={(e) => e.stopPropagation()}
                        ref={modalRef}
                    >
                        <div className="flex justify-between items-center mb-3">
                            <h2 className="text-lg font-semibold">Select City</h2>
                            <button
                                onClick={() => setIsCityModalOpen(false)}
                                className="text-gray-500 hover:text-black"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Search bar */}
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search city..."
                            value={citySearch}
                            onChange={(e) => setCitySearch(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full px-3 py-2 border rounded mb-3"
                        />

                        {/* Fixed height list area */}
                        <div style={{ height: LIST_HEIGHT }}>
                            {filteredCities.length === 0 ? (
                                <div className="flex h-full items-start justify-start">
                                    <p className="text-sm text-gray-500 px-3">No cities found.</p>
                                </div>
                            ) : (
                                <List
                                    ref={listRef}
                                    height={LIST_HEIGHT}
                                    itemCount={filteredCities.length}
                                    itemSize={ITEM_HEIGHT}
                                    width="100%"
                                >
                                    {Row}
                                </List>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}