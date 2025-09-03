import React, { useState, useEffect, useRef } from 'react';
import { X, MapPin, Clock, Star } from 'lucide-react';
import { FixedSizeList as List, ListChildComponentProps } from "react-window";
import { fetchWithAuth } from "@/lib/api";

interface OnboardingPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onCitySelect: (city: string) => void;
}

export function OnboardingPopup({ isOpen, onClose, onCitySelect }: OnboardingPopupProps) {
  const [selectedCity, setSelectedCity] = useState("");
  const [citySearch, setCitySearch] = useState("");
  const [filteredCities, setFilteredCities] = useState<string[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<List>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const PAGE_SIZE = 20;
  const LIST_HEIGHT = 200;
  const ITEM_HEIGHT = 40;

  // Fetch cities when search changes
  useEffect(() => {
    if (!isDropdownOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    debounceRef.current = setTimeout(() => {
      fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/foodapp/city?name=${encodeURIComponent(citySearch)}&page=0&size=${PAGE_SIZE}`
      )
        .then(res => {
          if (!res.ok) throw new Error("Failed to fetch cities");
          return res.json();
        })
        .then(data => {
          setFilteredCities(data.data || []);
        })
        .catch(() => {
          setFilteredCities([]);
        });
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [citySearch, isDropdownOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isDropdownOpen || !filteredCities.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, filteredCities.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCities[highlightedIndex]) {
        handleCitySelect(filteredCities[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      setIsDropdownOpen(false);
    }
  };

  // Scroll to highlighted item
  useEffect(() => {
    if (listRef.current && isDropdownOpen) {
      listRef.current.scrollToItem(highlightedIndex);
    }
  }, [highlightedIndex, isDropdownOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleCitySelect = (city: string) => {
    setSelectedCity(city);
    setCitySearch(city);
    setIsDropdownOpen(false);
  };

  const handleContinue = () => {
    if (selectedCity) {
      onCitySelect(selectedCity);
      onClose();
    }
  };



  const Row = ({ index, style }: ListChildComponentProps) => {
    const city = filteredCities[index];
    const isHighlighted = index === highlightedIndex;
    
    return (
      <button
        style={style}
        key={city}
        onClick={() => handleCitySelect(city)}
        onMouseEnter={() => setHighlightedIndex(index)}
        className={`px-4 py-3 text-left w-full cursor-pointer transition-all duration-150 ${
          isHighlighted 
            ? "bg-orange-50 text-orange-700 font-medium" 
            : "hover:bg-gray-50 text-gray-700"
        }`}
      >
        {city}
      </button>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                <div className="w-4 h-4 bg-orange-500 rounded-full"></div>
              </div>
            </div>
          </div>
          
          <h1 className="text-2xl font-bold text-center mb-2">
            Welcome to FoodieApp!
          </h1>
          <p className="text-orange-100 text-center text-sm">
            Discover delicious local dishes and restaurants in your city
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Features */}
          <div className="space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
                <div className="w-5 h-5 bg-orange-500 rounded flex items-center justify-center">
                  <span className="text-white text-xs">🍽️</span>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Local Cuisines</h3>
                <p className="text-sm text-gray-600">Explore authentic dishes from your region</p>
              </div>
            </div>
{/* 
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900"></h3>
                <p className="text-sm text-gray-600">Fast delivery from top restaurants</p>
              </div>
            </div> */}

            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center">
                <Star className="w-5 h-5 text-yellow-500" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Top Rated</h3>
                <p className="text-sm text-gray-600">Curated selection of best restaurants from users</p>
              </div>
            </div>
          </div>

          {/* City Selection */}
          <div className="pt-4 border-t">
            <div className="flex items-center space-x-2 mb-3">
              <MapPin className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Select your city to get started</span>
            </div>
            
            <div className="relative" ref={dropdownRef}>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search for your city..."
                value={citySearch}
                onChange={(e) => {
                  setCitySearch(e.target.value);
                  setIsDropdownOpen(true);
                }}
                onFocus={() => setIsDropdownOpen(true)}
                onKeyDown={handleKeyDown}
                className={`w-full px-4 py-3 border-2 transition-all duration-200 focus:outline-none ${
                  isDropdownOpen && filteredCities.length > 0
                    ? 'border-orange-500 rounded-b-lg rounded-t-none border-t-0 bg-white'
                    : 'border-gray-200 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-100'
                }`}
              />
              
              {isDropdownOpen && filteredCities.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 bg-white border-2 border-orange-500 border-b-0 rounded-t-lg rounded-b-none shadow-lg z-10 overflow-hidden">
                  <List
                    ref={listRef}
                    height={Math.min(LIST_HEIGHT, filteredCities.length * ITEM_HEIGHT)}
                    itemCount={filteredCities.length}
                    itemSize={ITEM_HEIGHT}
                    width="100%"
                  >
                    {Row}
                  </List>
                </div>
              )}
              
              {isDropdownOpen && citySearch && filteredCities.length === 0 && (
                <div className="absolute bottom-full left-0 right-0 bg-white border-2 border-orange-500 border-b-0 rounded-t-lg rounded-b-none shadow-lg p-3 z-10">
                  <p className="text-sm text-gray-500">No cities found</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-0">
          <button
            onClick={handleContinue}
            disabled={!selectedCity}
            className="w-full py-3 px-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:from-gray-300 disabled:to-gray-300 text-white rounded-lg font-medium transition-all duration-200 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}