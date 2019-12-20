// DOM elements
let start1 = document.getElementById("start1");
let start2 = document.getElementById("start2");
let destination = document.getElementById("destination");
let searchRadius = document.getElementById("search-radius");
let travelMode = document.getElementById("travel-mode");
let transitMode = document.getElementById("transit-mode");
let markers = [];

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
    let distanceService = new google.maps.DistanceMatrixService();
    directionsRenderer.setMap(map);

    // When user clicks "Update Parameters" run the following callback...
    async function onUpdateHandler() {
        // Clear all markers currently on map
        clearAllMarkers();

        // Calculate coordinate values
        calculateCoordinates().then((startCoords) => {
            // Add markers for starting locations
            let start1Props = {
                name: "Starting location 1",
                icon: "http://maps.google.com/mapfiles/ms/icons/blue.png",
                address: start1.value,
                coords: startCoords[0]
            };
            let start2Props = {
                name: "Starting location 2",
                icon: "http://maps.google.com/mapfiles/ms/icons/blue.png",
                address: start2.value,
                coords: startCoords[1]
            };
            addMarker(start1Props);
            addMarker(start2Props);

            // Get midpoint and update map
            updateMap(startCoords[0], startCoords[1]).then((midpoint) => {
                // Determine user's selected search radius
                let radius = 10000;
                if (searchRadius.value === "SMALL") {
                    radius = 1000;
                } else if (searchRadius.value === "LARGE") {
                    radius = 50000;
                }
                // Construct request for nearby destination locations
                let nearbySearchRequest = {
                    keyword: destination.value,
                    location: midpoint,
                    radius: radius,
                    fields: ["place_id", "name", "rating", "formatted_address", "geometry", "permanently_closed"]
                };

                // Find destinations near map center
                sendNearbySearchRequest(nearbySearchRequest).then((nearbySearchResponse) => {
                    for (let i=0; i<nearbySearchResponse.length; i++) {
                        // Skip permanently closed locations
                        if (nearbySearchResponse[i].permanently_closed) {
                            continue;
                        }

                        // Initialize 'props' object
                        let props = {};

                        // Retrieve website if present
                        let detailsRequest = {
                            placeId: nearbySearchResponse[i].place_id,
                            fields: ["website"]
                        };
                        sendDetailsRequest(detailsRequest).then((detailsResponse) => {
                            // Check for website
                            if (detailsResponse) {
                                props.website = detailsResponse.website;
                            }

                            // Scrape needed details from response
                            props.name = nearbySearchResponse[i].name;
                            props.rating = nearbySearchResponse[i].rating;
                            props.address = nearbySearchResponse[i].formatted_address;
                            props.coords = nearbySearchResponse[i].geometry.location;

                            // Add marker for potential destination
                            addMarker(props);
                        });
                    }
                });
            });
        });
    }

    // Send a nearby search request
    async function sendNearbySearchRequest(request) {
        return new Promise(function(resolve,reject){
            placesService.nearbySearch(request, function(response, status){
                if (status === google.maps.places.PlacesServiceStatus.OK) {
                    resolve(response);
                } else {
                    reject(new Error("Unable to find nearby destination locations."));
                }
            })
        })
    }

    // Send a website request
    async function sendDetailsRequest(request) {
        return new Promise(function(resolve, reject){
            placesService.getDetails(request, function(response, status){
                if (status === google.maps.places.PlacesServiceStatus.OK) {
                    resolve(response);
                } else {
                    resolve(null);
                }
            })
        })
    }

    // Set map center to midpoint of origins
    async function updateMap(coords1, coords2) {
        let midpoint = await getMidpoint(coords1, coords2);
        map.setCenter(new google.maps.LatLng(midpoint.lat(), midpoint.lng()));
        map.setZoom(10);
        return midpoint;
    }

    // Find midpoint of two coordinates
    async function getMidpoint(coords1, coords2) {
        return new Promise(function(resolve, reject){
            resolve(google.maps.geometry.spherical.interpolate(coords1, coords2, 0.5));
        })
    }

    // Calculates origin coordinate values
    async function calculateCoordinates() {
        const startCoords1 = convertAddressToCoordinates(start1.value);
        const startCoords2 = convertAddressToCoordinates(start2.value);
        return Promise.all([startCoords1, startCoords2]);
    }

    // Convert input to latLng coordinates
    async function convertAddressToCoordinates(address) {
        let geocodeRequest = {
            address: address
        };
        return await sendGeocodeRequest(geocodeRequest);
    }

    // Send a geocode request
    async function sendGeocodeRequest(request) {
        return new Promise(function(resolve, reject){
            geocoderService.geocode(request, function(response, status){
                if (status === google.maps.GeocoderStatus.OK) {
                    resolve(response[0].geometry.location);
                } else {
                    window.alert("Unable to fulfill request. Error: " + status);
                    reject(new Error("Unable to find requested location."));
                }
            });
        });
    }

    // Add marker to map
    async function addMarker(props) {
        // Create a marker instance
        let marker = new google.maps.Marker({
            position: props.coords,
            map: map
        });

        // Add marker to markers array
        markers.push(marker);

        // Use custom icon if provided
        if (props.icon) {
            marker.setIcon(props.icon);
        } else {
            marker.setIcon("http://maps.google.com/mapfiles/ms/icons/red.png");
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

            calculateTravelDuration(props.coords).then((travelDuration) => {
                // Append travel durations to content
                content += "<p>Travel duration from " + start1.value + ": " + travelDuration.fromFirstOrigin + "</p>";
                content += "<p>Travel duration from " + start2.value + ": " + travelDuration.fromSecondOrigin + "</p>";

                // Create an info window instance
                let infoWindow = new google.maps.InfoWindow({
                    content: content
                });

                // When marker is clicked, open info window
                marker.addListener("click", function(){
                    infoWindow.open(map, marker);
                })
            });
        }
    }

    // Clear all markers
    function clearAllMarkers() {
        for (let i=0; i<markers.length; i++) {
            markers[i].setMap(null);
        }
        markers.length = 0;
    }

    // Calculate duration of route
    async function calculateTravelDuration(destination) {
        let distanceMatrixRequest = {
            origins: [start1.value, start2.value],
            destinations: [destination],
            travelMode: travelMode.value
        };
        if (travelMode.value === "TRANSIT") {
            distanceMatrixRequest.transitOptions = {
                modes: [transitMode.value]
            }
        }
        return await sendDistanceMatrixRequest(distanceService, distanceMatrixRequest);
    }

    // Send a distance matrix request
    async function sendDistanceMatrixRequest(distanceService, request) {
        return new Promise(function(resolve, reject){
            distanceService.getDistanceMatrix(request, function(response, status){
                if (status === google.maps.DistanceMatrixStatus.OK) {
                    resolve({fromFirstOrigin: response.rows[0].elements[0].duration.text, fromSecondOrigin: response.rows[1].elements[0].duration.text});
                } else {
                    window.alert("Failed to calculate route distance. Error: " + status);
                    reject(new Error("Unable to calculate route distance."));
                }
            })
        })
    }
}

// Display a travel route based on query (starting point and destination)
// TODO: abstract the functionality of drawing a route into a separate function (this one only needs to return the estimated time!!!)
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
                        // resultString += "<p>Instructions: " + steps[k].instructions + "</p>";
                        routeLength += steps[k].duration.value;
                    }
                }

                // Convert route length into hours/minutes/seconds
                let hrs = Math.floor(routeLength/3600);
                routeLength = routeLength%3600;
                let mins = Math.floor(routeLength/60);
                routeLength = routeLength%60;
                let secs = routeLength;

                // Construct HTML
                let routeLengthStr = "<h6>" + hrs + " hrs " + mins + " mins " + secs + " secs</h6>";
                /*
                resultString = routeLengthStr + resultString;
                document.getElementById("result").innerHTML = resultString;
                 */

                // Set directions renderer
                //directionsRenderer.setDirections(response);

                // Return time estimate
                return routeLengthStr;
            } else {
                window.alert("Unable to fulfill request. Error: " + status);
            }
        }
    );
}

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
