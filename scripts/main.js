// TODO: create data objects for each location rather than storing data in multiple arrays
// TODO: allow for pagination greater than 20 destinations at once?
// TODO: account for all factors in deciding a recommended meetup location (not just avg travel duration)
// TODO: link to Google Maps app instead of printing/rendering route directions?

// DOM elements
let start1 = document.getElementById("start1");
let start2 = document.getElementById("start2");
let destination = document.getElementById("destination");
let destinationAddress = null;
let searchRadius = document.getElementById("search-radius");
let travelMode = document.getElementById("travel-mode");
let transitMode = document.getElementById("transit-mode");
let result = document.getElementById("result");
let markers = [];
let infoWindows = [];
let circles = [];
let addresses = [];

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
        // Clear map for new query
        clearAllMarkers();
        clearAllInfoWindows();
        clearAllCircles();
        clearAllAddresses();
        clearRoute();

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
                let radius = 5000;
                if (searchRadius.value === "SMALL") {
                    radius = 1000;
                    map.setZoom(13);
                } else if (searchRadius.value === "MEDIUM") {
                    map.setZoom(12);
                } else if (searchRadius.value === "LARGE") {
                    radius = 10000;
                    map.setZoom(11);
                } else if (searchRadius.value === "VERY LARGE") {
                    radius = 50000;
                    map.setZoom(8);
                }

                // Draw a circle of search radius
                addCircle(midpoint, radius);

                // Construct request for nearby destination locations
                let nearbySearchRequest = {
                    keyword: destination.value,
                    location: midpoint,
                    radius: radius,
                    fields: ["place_id", "name", "rating", "geometry", "permanently_closed"]
                };

                // Find destinations near map center
                sendNearbySearchRequest(nearbySearchRequest).then((nearbySearchResponse) => {
                    let promises = [];
                    for (let i=0; i<nearbySearchResponse.length; i++) {
                        // Skip permanently closed locations
                        if (nearbySearchResponse[i].permanently_closed) {
                            continue;
                        }

                        promises.push(new Promise(function(resolve, reject){
                            // Initialize 'props' object
                            let props = {};

                            // Retrieve website if present
                            let detailsRequest = {
                                placeId: nearbySearchResponse[i].place_id,
                                fields: ["website", "address_components"]
                            };
                            sendDetailsRequest(detailsRequest).then((detailsResponse) => {
                                // Check for website
                                if (detailsResponse) {
                                    props.website = detailsResponse.website;
                                    let addrComps = detailsResponse.address_components;
                                    props.short_address = addrComps[0].short_name + " " + addrComps[1].short_name;
                                    props.long_address = "";
                                    for (let j=0; j<addrComps.length; j++) {
                                        if (j !== addrComps.length-1) {
                                            props.long_address += addrComps[j].long_name + " ";
                                        } else {
                                            props.long_address += addrComps[j].long_name;
                                        }
                                    }
                                }

                                // Scrape needed details from response
                                props.name = nearbySearchResponse[i].name;
                                props.rating = nearbySearchResponse[i].rating;
                                props.coords = nearbySearchResponse[i].geometry.location;

                                calculateTravelDuration(nearbySearchResponse[i].geometry.location).then((travelDuration) => {
                                    // Travel duration info
                                    props.travelDurationFromFirstOrigin = travelDuration.fromFirstOrigin;
                                    props.travelDurationFromSecondOrigin = travelDuration.fromSecondOrigin;

                                    // Check if closest marker needs to be updated
                                    let avgDuration = (travelDuration.fromFirstOriginInt + travelDuration.fromSecondOriginInt) / 2;
                                    let avgDurationObject = {
                                        index: i,
                                        avgDuration: avgDuration
                                    };

                                    // Add marker for potential destination
                                    addMarker(props);

                                    // Resolve the result of this iteration
                                    resolve(avgDurationObject);
                                });
                            });
                        }));
                    }
                    return Promise.all(promises);
                }, (nearbySearchReject) => {
                    return new Promise(function(resolve, reject){
                        reject(nearbySearchReject);
                    })
                }).then((avgDurationObjects) => {
                    // Calculate which destination is most conveniently located
                    let closestMarkerIndex = 2;
                    let closestMarkerAvgDuration = 0;
                    for (let i=0; i<avgDurationObjects.length; i++) {
                        if (avgDurationObjects[i].avgDuration < closestMarkerAvgDuration || closestMarkerAvgDuration === 0) {
                            closestMarkerIndex = i+2;
                            closestMarkerAvgDuration = avgDurationObjects[i].avgDuration;
                        }
                    }

                    // Create "get directions" buttons
                    let origin1Directions = document.createElement("BUTTON");
                    let origin2Directions = document.createElement("BUTTON");
                    origin1Directions.classList.add("btn", "btn-primary");
                    origin1Directions.appendChild(document.createTextNode("Get directions from " + start1.value));
                    origin2Directions.classList.add("btn", "btn-primary");
                    origin2Directions.appendChild(document.createTextNode("Get directions from " + start2.value));

                    // Set content of info window (append text and buttons)
                    let infoWindowNode = document.createElement("div");
                    let textNode = document.createElement("div");
                    textNode.innerHTML = "<i><p>Recommended</p></i>" + infoWindows[closestMarkerIndex].content;
                    infoWindowNode.appendChild(textNode);
                    infoWindowNode.appendChild(origin1Directions);
                    infoWindowNode.appendChild(document.createElement("br"));
                    infoWindowNode.appendChild(document.createElement("br"));
                    infoWindowNode.appendChild(origin2Directions);
                    infoWindows[closestMarkerIndex].setContent(infoWindowNode);

                    // Change icon color of marker for closest location and open its info window
                    markers[closestMarkerIndex].setIcon("http://maps.google.com/mapfiles/ms/icons/green.png");
                    //infoWindows[closestMarkerIndex].setContent("<i><p>Recommended</p></i>" + infoWindows[closestMarkerIndex].content);
                    infoWindows[closestMarkerIndex].open(map, markers[closestMarkerIndex]);

                    // Set destination address
                    destinationAddress = addresses[closestMarkerIndex];

                    // Add event listener for "get directions"
                    origin1Directions.addEventListener("click", () => calculateAndDisplayRoute(start1.value, destinationAddress));
                    origin2Directions.addEventListener("click", () => calculateAndDisplayRoute(start2.value, destinationAddress));
                }, (reject) => {
                    window.alert(reject);
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
                    reject(new Error("No destinations could be found. Try widening your search."));
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
        return await sendDistanceMatrixRequest(distanceMatrixRequest);
    }

    // Send a distance matrix request
    async function sendDistanceMatrixRequest(request) {
        return new Promise(function(resolve, reject){
            distanceService.getDistanceMatrix(request, function(response, status){
                if (status === google.maps.DistanceMatrixStatus.OK) {
                    resolve({
                        fromFirstOrigin: response.rows[0].elements[0].duration.text,
                        fromSecondOrigin: response.rows[1].elements[0].duration.text,
                        fromFirstOriginInt: response.rows[0].elements[0].duration.value,
                        fromSecondOriginInt: response.rows[1].elements[0].duration.value
                    });
                } else {
                    window.alert("Failed to calculate route distance. Error: " + status);
                    reject(new Error("Unable to calculate route distance."));
                }
            })
        })
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
            // Short address to display to user
            if (props.short_address) {
                content += "<p><b>" + props.short_address + "</b></p>";
            }
            // Long address to use in route queries
            if (props.long_address) {
                addresses.push(props.long_address);
            } else {
                addresses.push(null);
            }
            if (props.website) {
                content += "<p><a href='" + props.website + "'>" + props.website + "</a></p>";
            }
            if (props.travelDurationFromFirstOrigin) {
                content += "<p>Travel duration from " + start1.value + ": " + props.travelDurationFromFirstOrigin + "</p>";
            }
            if (props.travelDurationFromSecondOrigin) {
                content += "<p>Travel duration from " + start2.value + ": " + props.travelDurationFromSecondOrigin + "</p>";
            }

            // Create an info window instance
            let infoWindow = new google.maps.InfoWindow({
                content: content
            });

            // Append info window to infoWindows array
            infoWindows.push(infoWindow);

            // When marker is clicked, open info window
            marker.addListener("click", function(){
                infoWindow.open(map, marker);
            });
        }
    }

    // Add a circle
    function addCircle(midpoint, radius) {
        let circle = new google.maps.Circle({
            center: midpoint,
            radius: radius,
            strokeColor: "#0000FF",
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: "#0000FF",
            fillOpacity: 0.4
        });
        circle.setMap(map);
        circles.push(circle);
    }

    // Clear all markers
    function clearAllMarkers() {
        for (let i=0; i<markers.length; i++) {
            markers[i].setMap(null);
        }
        markers.length = 0;
    }

    // Clear all circles (there should only be one at a time)
    function clearAllCircles() {
        for (let i=0; i<circles.length; i++) {
            circles[i].setMap(null);
        }
        circles.length = 0;
    }

    // Clear all info windows
    function clearAllInfoWindows() {
        for (let i=0; i<infoWindows.length; i++) {
            infoWindows[i].setMap(null);
        }
        infoWindows.length = 0;
    }

    // Clear all addresses
    function clearAllAddresses() {
        addresses.length = 0;
    }

    // Clear the current route from map
    function clearRoute() {
        directionsRenderer.set("directions", null);
        result.innerHTML = "";
    }

    // Display a travel route
    function calculateAndDisplayRoute(origin, destination) {
        // Set transit options if necessary
        let transitOptions = undefined;
        if (travelMode.value === "TRANSIT") {
            transitOptions = {
                modes: [transitMode.value]
            };
        }
        let routeRequest = {
            origin: {query: origin},
            destination: {query: destination},
            travelMode: travelMode.value,
            transitOptions: transitOptions
        };

        // Set route
        directionsService.route(routeRequest, function(response, status) {
                if (status === google.maps.DirectionsStatus.OK) {
                    // Iterate through legs/steps of route and append to result string
                    let resultString = "<p><u>Instructions</u></p>";
                    let route = response.routes[0];
                    let legs = route.legs;
                    for (let j=0; j<legs.length; j++) {
                        let steps = legs[j].steps;
                        for (let k=0; k<steps.length; k++) {
                            resultString += "<p>" + steps[k].instructions + "</p>";
                        }
                    }

                    // Construct HTML
                    result.innerHTML = resultString;

                    // Set directions renderer
                    directionsRenderer.setDirections(response);
                } else {
                    window.alert("Unable to fulfill request. Error: " + status);
                }
            }
        );
    }
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
