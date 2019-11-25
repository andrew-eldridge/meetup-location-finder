// DOM elements
let travelMode = document.getElementById("travel-mode");
let transitMode = document.getElementById("transit-mode");

// Initialize Google Maps API objects
function initMap() {
    // Initialize directions service, renderer, and map
    let directionsService = new google.maps.DirectionsService();
    let directionsRenderer = new google.maps.DirectionsRenderer();
    let options = {
        zoom: 4,
        center: {lat:39.8283, lng:-98.5795}
    };
    let map = new google.maps.Map(document.getElementById("map"), options);
    // Set map for directions renderer
    directionsRenderer.setMap(map);

    // Handler for changes to input elements
    let onUpdateHandler = function() {
        calculateAndDisplayRoute(directionsService, directionsRenderer);
    };
    document.getElementById("update-params").addEventListener("click", onUpdateHandler);

    // Add marker to map
    function addMarker(props) {
        // Create a marker instance
        let marker = new google.maps.Marker({
            position: props.coords,
            map: map
        });
        // Set custom icon image if present
        if (props.iconImage) {
            marker.setIcon(iconImage);
        }
        // Create an info window if details are provided
        if (props.content) {
            // Create an info window instance
            let infoWindow = new google.maps.InfoWindow({
                content: props.content
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
    // Calculate route (params: trip description, callback function)
    let transitOptions = undefined;
    if (transitMode.offsetHeight !== 0) {
        transitOptions = {
            modes: [transitMode.value]
        };
    }
    directionsService.route(
        {
            origin: {query: document.getElementById("start").value},
            destination: {query: document.getElementById("end").value},
            travelMode: travelMode.value,
            transitOptions: transitOptions
        },
        function(response, status) {
            if (status === "OK") {
                let resultString = "";
                let route = response.routes[0];
                let routeLength = 0;
                // don't forget copyrights
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
                let routeLengthStr = "<h3>Estimated Time: " + hrs + " hrs " + mins + " mins " + secs + " secs</h3>";
                resultString = routeLengthStr + resultString;
                document.getElementById("result").innerHTML = resultString;
                directionsRenderer.setDirections(response);
            } else {
                window.alert("Unable to fulfill request. Error: " + status);
            }
        }
    );
}

// If travel mode is switched to transit, display transit modes
travelMode.addEventListener("change", function(){
    if (travelMode.value === "TRANSIT") {
        transitMode.style.height = "auto";
        transitMode.style.padding = "5px";
        travelMode.style.marginBottom = "10px";
    } else {
        transitMode.style.height = "0";
        transitMode.style.padding = "0";
        travelMode.style.marginBottom = "0";
    }
});
