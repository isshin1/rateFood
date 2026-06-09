// Curated whitelist of major Indian cities mapped to their state.
// Used to (a) restrict the city picker to real cities, (b) filter restaurant
// autocomplete by state since Google's secondary_text reliably contains
// "..., <State>, India" for Indian addresses.

const CITY_STATE: ReadonlyArray<readonly [string, string]> = [
  // Metros + variants
  ["Mumbai", "Maharashtra"], ["Bombay", "Maharashtra"],
  ["Delhi", "Delhi"], ["New Delhi", "Delhi"],
  ["Bengaluru", "Karnataka"], ["Bangalore", "Karnataka"],
  ["Kolkata", "West Bengal"], ["Calcutta", "West Bengal"],
  ["Chennai", "Tamil Nadu"], ["Madras", "Tamil Nadu"],
  ["Hyderabad", "Telangana"], ["Secunderabad", "Telangana"],
  ["Pune", "Maharashtra"], ["Ahmedabad", "Gujarat"], ["Surat", "Gujarat"],

  // Andhra Pradesh
  ["Visakhapatnam", "Andhra Pradesh"], ["Vijayawada", "Andhra Pradesh"],
  ["Guntur", "Andhra Pradesh"], ["Tirupati", "Andhra Pradesh"],
  ["Nellore", "Andhra Pradesh"], ["Kurnool", "Andhra Pradesh"],
  ["Rajahmundry", "Andhra Pradesh"], ["Kakinada", "Andhra Pradesh"],
  ["Anantapur", "Andhra Pradesh"],

  // Arunachal Pradesh
  ["Itanagar", "Arunachal Pradesh"],

  // Assam
  ["Guwahati", "Assam"], ["Silchar", "Assam"], ["Dibrugarh", "Assam"],
  ["Jorhat", "Assam"], ["Tezpur", "Assam"],

  // Bihar
  ["Patna", "Bihar"], ["Gaya", "Bihar"], ["Bhagalpur", "Bihar"],
  ["Muzaffarpur", "Bihar"], ["Darbhanga", "Bihar"], ["Bihar Sharif", "Bihar"],
  ["Purnia", "Bihar"],

  // Chhattisgarh
  ["Raipur", "Chhattisgarh"], ["Bhilai", "Chhattisgarh"],
  ["Bilaspur", "Chhattisgarh"], ["Korba", "Chhattisgarh"], ["Durg", "Chhattisgarh"],

  // Goa
  ["Panaji", "Goa"], ["Panjim", "Goa"], ["Margao", "Goa"],
  ["Vasco da Gama", "Goa"], ["Mapusa", "Goa"],

  // Gujarat
  ["Vadodara", "Gujarat"], ["Baroda", "Gujarat"], ["Rajkot", "Gujarat"],
  ["Bhavnagar", "Gujarat"], ["Jamnagar", "Gujarat"], ["Gandhinagar", "Gujarat"],
  ["Junagadh", "Gujarat"], ["Anand", "Gujarat"], ["Nadiad", "Gujarat"],
  ["Bharuch", "Gujarat"], ["Porbandar", "Gujarat"],

  // Haryana
  ["Gurugram", "Haryana"], ["Gurgaon", "Haryana"], ["Faridabad", "Haryana"],
  ["Panipat", "Haryana"], ["Ambala", "Haryana"], ["Karnal", "Haryana"],
  ["Hisar", "Haryana"], ["Rohtak", "Haryana"], ["Sonipat", "Haryana"],
  ["Sonepat", "Haryana"], ["Yamunanagar", "Haryana"],

  // Himachal Pradesh
  ["Shimla", "Himachal Pradesh"], ["Dharamshala", "Himachal Pradesh"],
  ["Dharamsala", "Himachal Pradesh"], ["Manali", "Himachal Pradesh"],
  ["Mandi", "Himachal Pradesh"], ["Solan", "Himachal Pradesh"],
  ["Kullu", "Himachal Pradesh"], ["Palampur", "Himachal Pradesh"],

  // Jammu & Kashmir / Ladakh
  ["Srinagar", "Jammu and Kashmir"], ["Jammu", "Jammu and Kashmir"],
  ["Anantnag", "Jammu and Kashmir"], ["Leh", "Ladakh"],

  // Jharkhand
  ["Ranchi", "Jharkhand"], ["Jamshedpur", "Jharkhand"], ["Dhanbad", "Jharkhand"],
  ["Bokaro", "Jharkhand"], ["Bokaro Steel City", "Jharkhand"],
  ["Hazaribagh", "Jharkhand"], ["Deoghar", "Jharkhand"],

  // Karnataka
  ["Mysuru", "Karnataka"], ["Mysore", "Karnataka"], ["Mangaluru", "Karnataka"],
  ["Mangalore", "Karnataka"], ["Hubballi", "Karnataka"], ["Hubli", "Karnataka"],
  ["Belagavi", "Karnataka"], ["Belgaum", "Karnataka"], ["Davangere", "Karnataka"],
  ["Ballari", "Karnataka"], ["Bellary", "Karnataka"], ["Vijayapura", "Karnataka"],
  ["Bijapur", "Karnataka"], ["Tumakuru", "Karnataka"], ["Tumkur", "Karnataka"],
  ["Shivamogga", "Karnataka"], ["Shimoga", "Karnataka"], ["Udupi", "Karnataka"],
  ["Hassan", "Karnataka"],

  // Kerala
  ["Thiruvananthapuram", "Kerala"], ["Trivandrum", "Kerala"], ["Kochi", "Kerala"],
  ["Cochin", "Kerala"], ["Kozhikode", "Kerala"], ["Calicut", "Kerala"],
  ["Thrissur", "Kerala"], ["Trichur", "Kerala"], ["Kollam", "Kerala"],
  ["Quilon", "Kerala"], ["Kannur", "Kerala"], ["Cannanore", "Kerala"],
  ["Alappuzha", "Kerala"], ["Alleppey", "Kerala"], ["Palakkad", "Kerala"],
  ["Kottayam", "Kerala"], ["Malappuram", "Kerala"],

  // Madhya Pradesh
  ["Bhopal", "Madhya Pradesh"], ["Indore", "Madhya Pradesh"],
  ["Gwalior", "Madhya Pradesh"], ["Jabalpur", "Madhya Pradesh"],
  ["Ujjain", "Madhya Pradesh"], ["Sagar", "Madhya Pradesh"],
  ["Dewas", "Madhya Pradesh"], ["Satna", "Madhya Pradesh"],
  ["Ratlam", "Madhya Pradesh"], ["Rewa", "Madhya Pradesh"],
  ["Khandwa", "Madhya Pradesh"], ["Burhanpur", "Madhya Pradesh"],

  // Maharashtra
  ["Nagpur", "Maharashtra"], ["Nashik", "Maharashtra"], ["Nasik", "Maharashtra"],
  ["Aurangabad", "Maharashtra"], ["Solapur", "Maharashtra"],
  ["Sholapur", "Maharashtra"], ["Kolhapur", "Maharashtra"],
  ["Thane", "Maharashtra"], ["Navi Mumbai", "Maharashtra"],
  ["Amravati", "Maharashtra"], ["Sangli", "Maharashtra"], ["Akola", "Maharashtra"],
  ["Jalgaon", "Maharashtra"], ["Latur", "Maharashtra"], ["Ahmednagar", "Maharashtra"],
  ["Pimpri-Chinchwad", "Maharashtra"], ["Vasai-Virar", "Maharashtra"],

  // Manipur, Meghalaya, Mizoram, Nagaland
  ["Imphal", "Manipur"], ["Shillong", "Meghalaya"], ["Aizawl", "Mizoram"],
  ["Kohima", "Nagaland"], ["Dimapur", "Nagaland"],

  // Odisha
  ["Bhubaneswar", "Odisha"], ["Bhubaneshwar", "Odisha"], ["Cuttack", "Odisha"],
  ["Rourkela", "Odisha"], ["Sambalpur", "Odisha"], ["Puri", "Odisha"],
  ["Berhampur", "Odisha"], ["Brahmapur", "Odisha"], ["Balasore", "Odisha"],

  // Punjab
  ["Ludhiana", "Punjab"], ["Amritsar", "Punjab"], ["Jalandhar", "Punjab"],
  ["Patiala", "Punjab"], ["Mohali", "Punjab"], ["Bathinda", "Punjab"],
  ["Pathankot", "Punjab"], ["Hoshiarpur", "Punjab"], ["Moga", "Punjab"],
  ["Firozpur", "Punjab"],

  // Rajasthan
  ["Jaipur", "Rajasthan"], ["Jodhpur", "Rajasthan"], ["Udaipur", "Rajasthan"],
  ["Kota", "Rajasthan"], ["Ajmer", "Rajasthan"], ["Bikaner", "Rajasthan"],
  ["Alwar", "Rajasthan"], ["Bhilwara", "Rajasthan"], ["Sikar", "Rajasthan"],
  ["Pali", "Rajasthan"], ["Sri Ganganagar", "Rajasthan"],
  ["Mount Abu", "Rajasthan"], ["Pushkar", "Rajasthan"],

  // Sikkim
  ["Gangtok", "Sikkim"],

  // Tamil Nadu
  ["Coimbatore", "Tamil Nadu"], ["Madurai", "Tamil Nadu"],
  ["Tiruchirappalli", "Tamil Nadu"], ["Trichy", "Tamil Nadu"],
  ["Salem", "Tamil Nadu"], ["Tirunelveli", "Tamil Nadu"], ["Vellore", "Tamil Nadu"],
  ["Erode", "Tamil Nadu"], ["Tiruppur", "Tamil Nadu"], ["Thoothukudi", "Tamil Nadu"],
  ["Tuticorin", "Tamil Nadu"], ["Thanjavur", "Tamil Nadu"], ["Tanjore", "Tamil Nadu"],
  ["Dindigul", "Tamil Nadu"], ["Kanchipuram", "Tamil Nadu"],
  ["Cuddalore", "Tamil Nadu"], ["Karur", "Tamil Nadu"], ["Nagercoil", "Tamil Nadu"],
  ["Hosur", "Tamil Nadu"], ["Ooty", "Tamil Nadu"], ["Udhagamandalam", "Tamil Nadu"],
  ["Pondicherry", "Puducherry"], ["Puducherry", "Puducherry"],

  // Telangana
  ["Warangal", "Telangana"], ["Karimnagar", "Telangana"],
  ["Nizamabad", "Telangana"], ["Khammam", "Telangana"],
  ["Ramagundam", "Telangana"], ["Mahbubnagar", "Telangana"],

  // Tripura
  ["Agartala", "Tripura"],

  // Uttar Pradesh
  ["Lucknow", "Uttar Pradesh"], ["Kanpur", "Uttar Pradesh"],
  ["Ghaziabad", "Uttar Pradesh"], ["Agra", "Uttar Pradesh"],
  ["Varanasi", "Uttar Pradesh"], ["Banaras", "Uttar Pradesh"],
  ["Meerut", "Uttar Pradesh"], ["Prayagraj", "Uttar Pradesh"],
  ["Allahabad", "Uttar Pradesh"], ["Bareilly", "Uttar Pradesh"],
  ["Aligarh", "Uttar Pradesh"], ["Moradabad", "Uttar Pradesh"],
  ["Saharanpur", "Uttar Pradesh"], ["Gorakhpur", "Uttar Pradesh"],
  ["Noida", "Uttar Pradesh"], ["Greater Noida", "Uttar Pradesh"],
  ["Jhansi", "Uttar Pradesh"], ["Mathura", "Uttar Pradesh"],
  ["Vrindavan", "Uttar Pradesh"], ["Firozabad", "Uttar Pradesh"],
  ["Muzaffarnagar", "Uttar Pradesh"], ["Ayodhya", "Uttar Pradesh"],
  ["Faizabad", "Uttar Pradesh"], ["Etawah", "Uttar Pradesh"],
  ["Mirzapur", "Uttar Pradesh"], ["Sitapur", "Uttar Pradesh"],

  // Uttarakhand
  ["Dehradun", "Uttarakhand"], ["Haridwar", "Uttarakhand"],
  ["Roorkee", "Uttarakhand"], ["Haldwani", "Uttarakhand"],
  ["Nainital", "Uttarakhand"], ["Rishikesh", "Uttarakhand"],
  ["Mussoorie", "Uttarakhand"], ["Almora", "Uttarakhand"],

  // West Bengal
  ["Howrah", "West Bengal"], ["Asansol", "West Bengal"],
  ["Durgapur", "West Bengal"], ["Siliguri", "West Bengal"],
  ["Darjeeling", "West Bengal"], ["Bardhaman", "West Bengal"],
  ["Burdwan", "West Bengal"], ["Kharagpur", "West Bengal"],
  ["Malda", "West Bengal"], ["Haldia", "West Bengal"],
  ["Krishnanagar", "West Bengal"],

  // Union Territories
  ["Chandigarh", "Chandigarh"], ["Port Blair", "Andaman and Nicobar Islands"],
  ["Daman", "Dadra and Nagar Haveli and Daman and Diu"],
  ["Diu", "Dadra and Nagar Haveli and Daman and Diu"],
  ["Silvassa", "Dadra and Nagar Haveli and Daman and Diu"],
  ["Kavaratti", "Lakshadweep"],
];

const _cityToState = new Map(CITY_STATE.map(([c, s]) => [c.toLowerCase(), s]));

export function isMajorIndianCity(name: string): boolean {
  return _cityToState.has(name.trim().toLowerCase());
}

export function stateOfCity(name: string): string | undefined {
  return _cityToState.get(name.trim().toLowerCase());
}

export const MAJOR_INDIAN_CITIES = CITY_STATE.map(([c]) => c);
