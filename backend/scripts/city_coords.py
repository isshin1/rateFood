"""Lat/lng for major Indian cities. Centre point for Google Places Text Search.
Hand-curated to roughly the city's downtown / city hall. Used by places_ingest.py.

To add a city: append `(name, lat, lng)` — name should match `cities-india.ts` exactly
so frontend filter values line up with backend `city` column.
"""

# (city, lat, lng)
CITIES: list[tuple[str, float, float]] = [
    # Metros
    ("Mumbai", 19.0760, 72.8777),
    ("Delhi", 28.6139, 77.2090),
    ("New Delhi", 28.6139, 77.2090),
    ("Bengaluru", 12.9716, 77.5946),
    ("Kolkata", 22.5726, 88.3639),
    ("Chennai", 13.0827, 80.2707),
    ("Hyderabad", 17.3850, 78.4867),
    ("Pune", 18.5204, 73.8567),
    ("Ahmedabad", 23.0225, 72.5714),
    ("Surat", 21.1702, 72.8311),

    # Tier 2 (popular foodie cities)
    ("Jaipur", 26.9124, 75.7873),
    ("Lucknow", 26.8467, 80.9462),
    ("Kanpur", 26.4499, 80.3319),
    ("Ghaziabad", 28.6692, 77.4538),
    ("Agra", 27.1767, 78.0081),
    ("Varanasi", 25.3176, 82.9739),
    ("Meerut", 28.9845, 77.7064),
    ("Indore", 22.7196, 75.8577),
    ("Bhopal", 23.2599, 77.4126),
    ("Nagpur", 21.1458, 79.0882),
    ("Nashik", 19.9975, 73.7898),
    ("Aurangabad", 19.8762, 75.3433),
    ("Thane", 19.2183, 72.9781),
    ("Navi Mumbai", 19.0330, 73.0297),
    ("Vadodara", 22.3072, 73.1812),
    ("Rajkot", 22.3039, 70.8022),
    ("Gurugram", 28.4595, 77.0266),
    ("Faridabad", 28.4089, 77.3178),
    ("Noida", 28.5355, 77.3910),
    ("Chandigarh", 30.7333, 76.7794),
    ("Mohali", 30.7046, 76.7179),
    ("Ludhiana", 30.9010, 75.8573),
    ("Amritsar", 31.6340, 74.8723),
    ("Patna", 25.5941, 85.1376),
    ("Ranchi", 23.3441, 85.3096),
    ("Jamshedpur", 22.8046, 86.2029),
    ("Bhubaneswar", 20.2961, 85.8245),
    ("Guwahati", 26.1445, 91.7362),
    ("Coimbatore", 11.0168, 76.9558),
    ("Madurai", 9.9252, 78.1198),
    ("Kochi", 9.9312, 76.2673),
    ("Thiruvananthapuram", 8.5241, 76.9366),
    ("Kozhikode", 11.2588, 75.7804),
    ("Mysuru", 12.2958, 76.6394),
    ("Mangaluru", 12.9141, 74.8560),
    ("Dehradun", 30.3165, 78.0322),
    ("Visakhapatnam", 17.6868, 83.2185),
    ("Vijayawada", 16.5062, 80.6480),
]

CITY_LOOKUP: dict[str, tuple[float, float]] = {c.lower(): (lat, lng) for c, lat, lng in CITIES}


def coords_for(city: str) -> tuple[float, float] | None:
    return CITY_LOOKUP.get(city.strip().lower())
