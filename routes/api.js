const express = require('express');
const axios = require('axios');
const { deserialize } = require('mongodb');
const router = express.Router();


function getModelData(base, temp, windSpeed, humidity, pressure, rain, swe, depth) {
    try {
        // Define Avalanche Danger Scale
        const AVALANCHE_DANGER_SCALE = {
            1: "Low - Isolated avalanches possible, especially on very steep slopes",
            2: "Moderate - Avalanches possible on certain slopes and aspects",
            3: "Considerable - Dangerous avalanche conditions widespread",
            4: "High - Very dangerous avalanche conditions, travel in avalanche terrain strongly discouraged",
            5: "Extreme - Extremely dangerous avalanche conditions, travel in avalanche terrain prohibited"
        };

        // Define Functions for Individual Factors
        function temperatureRisk(temp) {
            if (temp < -20) { // Extremely cold, very high risk
                return 4;
            } else if (temp >= -20 && temp < -10) { // Very cold, high risk
                return 3;
            } else if (temp >= -10 && temp < 0) { // Cold, moderate risk
                return 2;
            } else if (temp >= 0 && temp < 5) { // Cool, low risk
                return 1;
            } else { // Warm, very low risk
                return 0;
            }
        }

        function windSpeedRisk(windSpeed) {
            if (windSpeed > 70) { // Extremely strong winds, very high risk
                return 4;
            } else if (windSpeed >= 50 && windSpeed <= 70) { // Strong winds, high risk
                return 3;
            } else if (windSpeed >= 30 && windSpeed < 50) { // Moderate winds, moderate risk
                return 2;
            } else if (windSpeed >= 10 && windSpeed < 30) { // Light winds, low risk
                return 1;
            } else { // Very light winds, very low risk
                return 0;
            }
        }

        function humidityRisk(humidity) {
            if (humidity > 90) { // Very high humidity, high risk
                return 2;
            } else if (humidity >= 70 && humidity <= 90) { // High humidity, moderate risk
                return 1;
            } else { // Low humidity, low risk
                return 0;
            }
        }

        function pressureRisk(pressure) {
            let riskVal;
            if (pressure < 1000) { // Very low pressure, high risk
                riskVal = 4;
            } else if (pressure >= 1000 && pressure < 1010) { // Low pressure, moderate risk
                riskVal = 3;
            } else if (pressure >= 1010 && pressure < 1020) { // Normal pressure, low risk
                riskVal = 2;
            } else if (pressure >= 1020 && pressure < 1030) { // High pressure, moderate risk
                riskVal = 1;
            } else { // Very high pressure, low risk
                riskVal = 0;
            }

            return riskVal;
        }

        function rainRisk(precipitation) {
            if (precipitation > 20) { // Heavy rain, very high risk
                return 4;
            } else if (precipitation >= 10 && precipitation <= 20) { // Moderate rain, high risk
                return 3;
            } else if (precipitation >= 5 && precipitation < 10) { // Light rain, moderate risk
                return 2;
            } else { // No rain, low risk
                return 1;
            }
        }

        function sweRisk(swe) {
            if (swe > 500) { // Very high SWE, very high risk
                return 4;
            } else if (swe >= 250 && swe <= 500) { // High SWE, high risk
                return 3;
            } else if (swe >= 100 && swe < 250) { // Moderate SWE, moderate risk
                return 2;
            } else { // Low SWE, low risk
                return 1;
            }
        }

        function snowDepthRisk(depth) {
            if (depth > 200) { // Very high snow depth, very high risk
                return 4;
            } else if (depth >= 100 && depth <= 200) { // High snow depth, high risk
                return 3;
            } else if (depth >= 50 && depth < 100) { // Moderate snow depth, moderate risk
                return 2;
            } else { // Low snow depth, low risk
                return 1;
            }
        }

        function calculateAvalancheRisk(base, temp, windSpeed, humidity, pressure, rain, swe, depth) {
            const tempRiskVal = temperatureRisk(temp);
            const windSpeedVal = windSpeedRisk(windSpeed);
            const humidityVal = humidityRisk(humidity);
            const pressureVal = pressureRisk(pressure);
            const rainVal = rainRisk(rain);
            const sweVal = sweRisk(swe);
            const depthVal = snowDepthRisk(depth);

            const riskVals = [base, tempRiskVal, windSpeedVal, humidityVal, pressureVal, rainVal, sweVal, depthVal];
            const dangerLevel = Math.round((riskVals.reduce((sum, val) => sum + val, 0) / riskVals.length) % 5);

            return { dangerLevel, description: AVALANCHE_DANGER_SCALE[dangerLevel] };
        }

        // Example usage:
        const riskResult = calculateAvalancheRisk(base, temp, windSpeed, humidity, pressure, rain, swe, depth);
        
        return {
            riskResult
        };

    } catch(error) {
        console.error('Error fetching API data:', error.message);
        throw new Error('Internal Server Error');
    }
}

const getSnowData = async () => {
    try {
        const lat = 33.76653715;
        const lon = 74.09154945;
        
        const closestStationsUrl = `https://powderlines.kellysoftware.org/api/closest_stations?lat=${lat}&lng=${lon}&count=1`;
        const stationResponse = await axios.get(closestStationsUrl);
        const station = stationResponse.data[0];

        // Make API request to get snow data for the station
        const baseSnowDataUrl = `https://powderlines.kellysoftware.org/api/station/${station['station_information']['triplet']}?days=1`;
        const snowDataResponse = await axios.get(baseSnowDataUrl);
        const snowData = snowDataResponse.data;

        // Extract specific fields from the snow data
        const extractedData = snowData.data.map(entry => ({
            Date: entry.Date,
            SnowWaterEquivalent: entry['Snow Water Equivalent (in)'],
            SnowDepth: entry['Snow Depth (in)'],
        }));

        // Send the extracted data to the client
        const dateFromExtractedData0 = extractedData[0].Date;
        const dateFromExtractedData1 = extractedData[1].Date;

        const water0 = extractedData[0].SnowWaterEquivalent;
        const water1 = extractedData[1].SnowWaterEquivalent;

        const depth0 = extractedData[0].SnowDepth;
        const depth1 = extractedData[1].SnowDepth;

        return {
            extractedData,
            snowData,
            dateFromExtractedData0,
            dateFromExtractedData1,
            water0,
            water1,
            depth0,
            depth1,
        };
    } catch (error) {
        console.error('Error fetching API data:', error.message);
        throw new Error('Internal Server Error');
    }
};

router.get('/', async (req, res, next) => {
    try {
        const snowData = await getSnowData();

        // Specify the latitude and longitude
        const lat = 33.76653715;
        const lon = 74.09154945;

        // Embed weather data
        const api_key = 'f39f40c8ad92453089e62741231912';
        const weatherAPIUrl = `http://api.weatherapi.com/v1/current.json?key=${api_key}&q=${lat},${lon}`;
        const weatherResponse = await axios.get(weatherAPIUrl);
        const weatherData = weatherResponse.data;

        const extractedweatherData = {
            Region: weatherData.location.region,
            Temp: weatherData.current.temp_c,
            Wind: weatherData.current.wind_kph,
            Humidity: weatherData.current.humidity,
            Pressure: weatherData.current.pressure_mb,
            Rain: weatherData.current.precip_mm,
        };

        const region = extractedweatherData.Region;
        const temp = extractedweatherData.Temp;
        const wind = extractedweatherData.Wind;
        const humidity = extractedweatherData.Humidity;
        const pressure = extractedweatherData.Pressure;
        const rain = extractedweatherData.Rain;

        // temp, windSpeed, humidity, pressure, rain, swe, depth
        base = 5; 
        const modelData = getModelData(base, temp, wind, humidity, pressure, rain, snowData.water1 * 25.4, snowData.depth1 * 2.54);

        // Render the home template with data
        res.render('data', {
            date0: snowData.dateFromExtractedData0,
            date1: snowData.dateFromExtractedData1,
            water0: snowData.water0,
            water1: snowData.water1,
            depth0: snowData.depth0,
            depth1: snowData.depth1,
            weatherData: weatherData,
            region: region,
            temp: temp,
            wind: wind,
            humidity: humidity,
            pressure: pressure,
            rain: rain,
            level: modelData.riskResult.dangerLevel,
            description: modelData.riskResult.description,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// api.js

async function handleUpload() {
    const photoInput = document.getElementById('photoInput');
    const uploadStatus = document.getElementById('uploadStatus');

    const file = photoInput.files[0];
    const modelData = None;

    if (file) {
        try {
            const formData = new FormData();
            formData.append('image', file);

            const response = await fetch('https://9c6d-112-196-77-202.ngrok-free.app/predict', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const result = await response.json();
                const label = result.label;
                const avalanche = result.avalanche;

                modelData = getModelData(label, temp, wind, humidity, pressure, rain, snowData.water1 * 25.4, snowData.depth1 * 2.54);

                uploadStatus.textContent = `File uploaded successfully. Result: ${JSON.stringify(result)}`;
            } else {
                uploadStatus.textContent = 'Error uploading file.';
            }
        } catch (error) {
            console.error('Error uploading file:', error.message);
            uploadStatus.textContent = 'Error uploading file.';
        }

        res.render('data', {
            level: modelData.riskResult.dangerLevel,
            description: modelData.riskResult.description,
        });
    } else {
        uploadStatus.textContent = 'Please choose a file.';
    }
}

// Export functions if needed
// export { handleUpload };


module.exports = router;
