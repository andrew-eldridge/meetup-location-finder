// DOM elements
let start1 = document.getElementById("start1");
let start2 = document.getElementById("start2");
let destination = document.getElementById("destination");
let travelMode = document.getElementById("travel-mode");
let transitMode = document.getElementById("transit-mode");

// Initialize Google Maps API objects
function initMap() {
    // Add event listener for "update params"
    document.getElementById("update-params").addEventListener("click", onUpdateHandler);
    
    // Full view of United States
    let options = {
        zoom: 4,
        center: {lat:39.8283, lng:-98.5795}
    };

    // Initialize map and services
    let map = new google.maps.Map(document.getElementById("map"), options);
    let directionsService = new google.maps.DirectionsService();
    let directionsRenderer = new google.maps.DirectionsRenderer();
    let placesService = new google.maps.places.PlacesService(map);
    let geocoderService = new google.maps.Geocoder();
    directionsRenderer.setMap(map);

    // Find and set midpoint value of two provided coordinate pairs
    async function setMidpoint(coords1, coords2) {
        let midpoint = google.maps.geometry.spherical.interpolate(coords1, coords2, 0.5);
        map.setCenter(midpoint);
        map.setZoom(7);
    }

    // Abstraction layer for calculating/displaying new map midpoint
    async function calculateMidpoint() {
        const startCoords1 = convertAddressToCoordinates(start1.value);
        const startCoords2 = convertAddressToCoordinates(start2.value);
        return Promise.all([startCoords1, startCoords2]);
    }

    // Convert an address input to latLng coordinates
    async function convertAddressToCoordinates(address) {
        let geocodeRequest = {
            address: address
        };
        return await geocode(geocodeRequest);
    }

    // Get geocoded coordinates
    async function geocode(geocodeRequest) {
        return new Promise(function(resolve, reject){
            geocoderService.geocode(geocodeRequest, function(response, status){
                if (status === google.maps.GeocoderStatus.OK) {
                    console.log(response[0].geometry.location);
                    resolve(response[0].geometry.location);
                } else {
                    window.alert("Unable to fulfill request. Error: " + status);
                    reject(new Error("Unable to find requested location."));
                }
            });
        });
    }

    // When user clicks "Update Parameters" run the following callback...
    async function onUpdateHandler() {
        // First, calculate midpoint values
        calculateMidpoint().then((startCoords) => {
            // Second, set the midpoint on map
            setMidpoint(startCoords[0], startCoords[1]).then(() => {
                // Construct request for nearby destination locations
                let request = {
                    query: document.getElementById("destination").value,
                    fields: ["name", "geometry", "formatted_address", "permanently_closed"]
                };

                // Find destinations near query
                let potentialDestinations = null;
                placesService.findPlaceFromQuery(request, function(response, status){
                    if (status === google.maps.places.PlacesServiceStatus.OK) {
                        for (let i=0; i<response.length; i++) {
                            // Skip locations that are permanently closed
                            if (response[i].permanently_closed) {
                                continue;
                            }
                            // Scrape needed details from response
                            let props = {
                                name: response[i].name,
                                rating: response[i].rating,
                                website: response[i].website,
                                address: response[i].formatted_address,
                                icon: response[i].icon,
                                coords: response[i].geometry.location,
                            };
                            // Add marker for potential destination
                            addMarker(props);
                        }
                        map.setCenter(response[0].geometry.location);
                    } else {
                        window.alert("Unable to fulfill request. Error: " + status);
                    }
                })
            });
        });
    }

    // Add marker to map
    function addMarker(props) {
        // Create a marker instance
        let marker = new google.maps.Marker({
            position: props.coords,
            map: map
        });
        // Set custom icon image if present
        if (props.icon) {
            marker.setIcon(props.icon);
        }
        // Create an info window if details are provided
        if (props.name || props.rating || props.website || props.address) {
            // Concatenate location details
            let content = "";
            if (props.name) {
                content += "<h3>" + props.name + "</h3>";
            }
            if (props.rating) {
                content += "<h6>" + props.rating + " / 5</h6>";
            }
            if (props.website) {
                content += "<p><a href='" + props.website + "'>" + props.website + "</a></p>";
            }
            if (props.address) {
                content += "<p>" + props.address + "</p>";
            }
            // Create an info window instance
            let infoWindow = new google.maps.InfoWindow({
                content: content
            });
            // When marker is clicked, open info window
            marker.addListener("click", function(){
                infoWindow.open(map, marker);
            });
        }
    }
}

// Display a travel route based on query (starting point and destination)
function calculateAndDisplayRoute(directionsService, directionsRenderer) {
    // Set transit options if necessary
    let transitOptions = undefined;
    if (transitMode.offsetHeight !== 0) {
        transitOptions = {
            modes: [transitMode.value]
        };
    }
    // Set route
    directionsService.route(
        {
            origin: {query: document.getElementById("start").value},
            destination: {query: document.getElementById("end").value},
            travelMode: travelMode.value,
            transitOptions: transitOptions
        },
        function(response, status) {
            if (status === google.maps.DirectionsStatus.OK) {
                // Iterate through legs/steps of route and append to result string
                let resultString = "";
                let route = response.routes[0];
                let routeLength = 0;
                console.log(route.copyrights);
                let legs = route.legs;
                for (let j=0; j<legs.length; j++) {
                    let steps = legs[j].steps;
                    for (let k=0; k<steps.length; k++) {
                        resultString += "<p>Instructions: " + steps[k].instructions + "</p>";
                        routeLength += steps[k].duration.value;
                    }
                }
                // Parse the route length into hours/minutes/seconds
                let hrs = Math.floor(routeLength/3600);
                routeLength = routeLength%3600;
                let mins = Math.floor(routeLength/60);
                routeLength = routeLength%60;
                let secs = routeLength;
                // Construct HTML
                let routeLengthStr = "<h3>Estimated Time: " + hrs + " hrs " + mins + " mins " + secs + " secs</h3>";
                resultString = routeLengthStr + resultString;
                document.getElementById("result").innerHTML = resultString;
                // Set directions renderer
                directionsRenderer.setDirections(response);
            } else {
                window.alert("Unable to fulfill request. Error: " + status);
            }
        }
    );
}

/*
// Convert from degrees to radians
function degToRad(x) {
    return x * Math.PI / 180;
}

// Calculate the distance (in meters) between two coordinate sets
function getDistance(p1, p2) {
    let R = 6378137;
    let dLat = degToRad(p2.lat() - p1.lat());
    let dLong = degToRad(p2.lng() - p1.lng());
    let a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(rad(p1.lat())) * Math.cos(rad(p2.lat())) *
        Math.sin(dLong / 2) * Math.sin(dLong / 2);
    let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
 */

// If travel mode is switched to transit, display transit modes
travelMode.addEventListener("change", function(){
    if (travelMode.value === "TRANSIT") {
        transitMode.style.display = "block";
        travelMode.style.marginBottom = "10px";
        setTimeout(function(){
            transitMode.style.height = "auto";
            transitMode.style.padding = "5px";
        }, 10);
    } else {
        transitMode.style.height = "0";
        transitMode.style.padding = "0";
        setTimeout(function(){
            transitMode.style.display = "none";
            travelMode.style.marginBottom = "0";
        }, 360);
    }
});
