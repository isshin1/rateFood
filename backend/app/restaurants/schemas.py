import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CreateRestaurantRequest(BaseModel):
    place_id: str = Field(min_length=1)
    session_token: str | None = None
    description: str | None = None
    cuisine: str | None = None
    tags: list[str] = Field(default_factory=list)


class RestaurantResponse(BaseModel):
    id: uuid.UUID
    place_id: str
    name: str
    formatted_address: str
    lat: float
    lng: float
    photo_reference: str | None
    city: str | None
    description: str | None
    cuisine: str | None
    tags: list[str]
    favorite_count: int
    is_favourite: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class CreateDishRequest(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    tags: list[str] = Field(default_factory=list)


class DishResponse(BaseModel):
    id: uuid.UUID
    restaurant_id: uuid.UUID
    name: str
    description: str | None
    image_key: str | None
    tags: list[str]
    favorite_count: int
    is_favourite: bool = False
    restaurant_name: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class NearbyRestaurant(BaseModel):
    id: uuid.UUID
    name: str
    formatted_address: str
    lat: float
    lng: float
    photo_reference: str | None
    cuisine: str | None
    tags: list[str]
    favorite_count: int
    is_favourite: bool = False
    distance_km: float
    bearing_deg: float  # 0 = north, 90 = east

    model_config = {"from_attributes": True}


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    size: int
