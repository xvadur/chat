import os
import sys
import json
import requests

def search_places(query):
    api_key = os.environ.get("GOOGLE_PLACES_API_KEY")
    if not api_key:
        print("Error: GOOGLE_PLACES_API_KEY not found in environment.")
        sys.exit(1)

    url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
    params = {
        "query": query,
        "key": api_key
    }
    
    response = requests.get(url, params=params)
    return response.json()

def get_place_details(place_id):
    api_key = os.environ.get("GOOGLE_PLACES_API_KEY")
    url = "https://maps.googleapis.com/maps/api/place/details/json"
    params = {
        "place_id": place_id,
        "key": api_key,
        "fields": "name,formatted_address,website,rating,user_ratings_total,opening_hours,formatted_phone_number"
    }
    response = requests.get(url, params=params)
    return response.json()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 places_search.py <query> [--details <place_id>]")
        sys.exit(1)

    if sys.argv[1] == "--details":
        result = get_place_details(sys.argv[2])
    else:
        result = search_places(sys.argv[1])
    
    print(json.dumps(result, indent=2, ensure_ascii=False))
