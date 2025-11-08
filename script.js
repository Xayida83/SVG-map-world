// Configuration - easily changeable
const CONFIG = {
    pricePerPoint: 50,
    regionPercentage: 40,
    updateInterval: 30, // seconds. uppdatera data
    minDistance: 1, // pixels på avståndet mellan punkter
    newDonationDuration: 15, // seconds
    apiUrl: 'https://actsvenskakyrkan.adoveo.com/getProgressbarData/40',
    mapUrl: 'https://mapsvg.com/maps/world',
    useMockData: true // Set to false to use real API
};

// South America and Southern Africa countries (ISO codes)
const REGION_COUNTRIES = {
    // South America
    'BR': 'Brazil', 'AR': 'Argentina', 'PE': 'Peru', 'CO': 'Colombia',
    'VE': 'Venezuela', 'CL': 'Chile', 'EC': 'Ecuador', 'BO': 'Bolivia',
    'PY': 'Paraguay', 'UY': 'Uruguay', 'GY': 'Guyana', 'SR': 'Suriname',
    'GF': 'French Guiana', 'FK': 'Falkland Islands',
    // Southern Africa
    'ZA': 'South Africa', 'ZW': 'Zimbabwe', 'BW': 'Botswana', 'NA': 'Namibia',
    'MZ': 'Mozambique', 'ZM': 'Zambia', 'MW': 'Malawi', 'MG': 'Madagascar',
    'LS': 'Lesotho', 'SZ': 'Eswatini'
};

// Countries to exclude from point placement (ISO codes)
const EXCLUDED_COUNTRIES = {
    'GL': 'Greenland',
    'RU': 'Russia',
    'CA': 'Canada',
    'US': 'United States',
};

// Global state
let currentAmount = 0;
let previousAmount = 0;
let points = [];
let mapSvg = null;
let mapContainer = null;
let canvas = null;
let ctx = null;
let mapBounds = null;
let updateTimer = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    loadMap();
    setupEventListeners();
    loadConfigFromDOM();
    fetchDonationData();
    startAutoUpdate();
});

function initializeElements() {
    mapContainer = document.getElementById('mapContainer');
    canvas = document.getElementById('pointCanvas');
    
    // If canvas doesn't exist (CMS might have removed it), create it
    if (!canvas && mapContainer && mapContainer.parentElement) {
        canvas = document.createElement('canvas');
        canvas.id = 'pointCanvas';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '5';
        canvas.style.opacity = '0';
        mapContainer.parentElement.appendChild(canvas);
    }
    
    // Check if canvas exists before trying to get context
    if (canvas) {
        ctx = canvas.getContext('2d');
        // Set canvas size
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    } else {
        console.warn('Canvas element could not be created. Some features may not work.');
        // Create a dummy canvas for calculations if needed
        canvas = document.createElement('canvas');
        ctx = canvas.getContext('2d');
    }
}

function resizeCanvas() {
    // Canvas is now just for coordinate calculations if needed
    if (canvas && mapContainer) {
        canvas.width = mapContainer.offsetWidth;
        canvas.height = mapContainer.offsetHeight;
    }
    // Recalculate point positions when resizing (using stored SVG coordinates)
    if (points.length > 0 && mapSvg) {
        points.forEach(point => {
            if (point.svgX !== undefined && point.svgY !== undefined) {
                const screenPoint = svgToScreen(point.svgX, point.svgY);
                point.x = screenPoint.x;
                point.y = screenPoint.y;
            }
        });
        redrawPoints();
    }
}

function loadConfigFromDOM() {
    const priceInput = document.getElementById('pricePerPoint');
    const regionInput = document.getElementById('regionPercentage');
    const intervalInput = document.getElementById('updateInterval');
    const distanceInput = document.getElementById('minDistance');
    
    if (priceInput) {
        CONFIG.pricePerPoint = parseInt(priceInput.value) || 50;
        priceInput.addEventListener('change', (e) => {
            CONFIG.pricePerPoint = parseInt(e.target.value) || 50;
            updatePoints();
        });
    }
    
    if (regionInput) {
        CONFIG.regionPercentage = parseInt(regionInput.value) || 40;
        regionInput.addEventListener('change', (e) => {
            CONFIG.regionPercentage = parseInt(e.target.value) || 40;
            updatePoints();
        });
    }
    
    if (intervalInput) {
        CONFIG.updateInterval = parseInt(intervalInput.value) || 60;
        intervalInput.addEventListener('change', (e) => {
            CONFIG.updateInterval = parseInt(e.target.value) || 60;
            restartAutoUpdate();
        });
    }
    
    if (distanceInput) {
        CONFIG.minDistance = parseInt(distanceInput.value) || 20;
        distanceInput.addEventListener('change', (e) => {
            CONFIG.minDistance = parseInt(e.target.value) || 20;
            updatePoints();
        });
    }
}

function setupEventListeners() {
    const submitDonationBtn = document.getElementById('submitDonation');
    const donationAmountInput = document.getElementById('donationAmount');
    const useMockCheckbox = document.getElementById('useMockCheckbox');
    
    if (submitDonationBtn && donationAmountInput) {
        // Handle button click
        submitDonationBtn.addEventListener('click', () => {
            const amount = parseInt(donationAmountInput.value);
            if (amount && amount > 0) {
                addTestDonation(amount);
                donationAmountInput.value = ''; // Clear input after submission
            }
        });
        
        // Handle Enter key in input
        donationAmountInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const amount = parseInt(donationAmountInput.value);
                if (amount && amount > 0) {
                    addTestDonation(amount);
                    donationAmountInput.value = ''; // Clear input after submission
                }
            }
        });
    }
    
    if (useMockCheckbox) {
        // Set initial state
        useMockCheckbox.checked = CONFIG.useMockData;
        
        useMockCheckbox.addEventListener('change', (e) => {
            CONFIG.useMockData = e.target.checked;
            console.log('Mock data:', CONFIG.useMockData ? 'ON' : 'OFF');
            // Immediately fetch new data
            fetchDonationData();
        });
    }
}

function loadMap() {
    // First check if SVG is already embedded in HTML (for CMS integration)
    mapSvg = mapContainer.querySelector('svg');
    if (mapSvg) {
        console.log('SVG map found in HTML, using embedded version');
        processMapSVG(null); // Pass null to indicate SVG is already in DOM
        return;
    }
    
    // If not in HTML, try to load from file
    // Place your SVG file in the same folder as index.html and name it 'world.svg'
    // You can change the filename below if you named it differently
    const localSvgPath = 'world.svg';
    
    fetch(localSvgPath)
        .then(response => {
            if (response.ok) {
                return response.text();
            }
            throw new Error('Local SVG file not found');
        })
        .then(svgText => {
            processMapSVG(svgText);
        })
        .catch(error => {
            console.warn('Local SVG file not found, trying online version...', error);
            // Fallback: Try to load from mapsvg.com (may have CORS issues)
            fetch('https://mapsvg.com/maps/world')
                .then(response => {
                    if (response.ok) {
                        return response.text();
                    }
                    throw new Error('Failed to load map');
                })
                .then(svgText => {
                    processMapSVG(svgText);
                })
                .catch(error => {
                    console.error('Error loading map:', error);
                    loadAlternativeMap();
                });
        });
}

function cleanSVGContent(svgElement) {
    // Remove any HTML elements that might have gotten into SVG paths
    if (!svgElement) return;
    
    // First, remove any HTML elements that might be inside the SVG
    const htmlElements = svgElement.querySelectorAll('div, span, p, br');
    htmlElements.forEach(el => el.remove());
    
    // Find all paths and clean their d attributes
    const paths = svgElement.querySelectorAll('path');
    paths.forEach(path => {
        const dAttr = path.getAttribute('d');
        if (dAttr) {
            // First, find where valid path data ends by looking for first invalid character
            // Valid SVG path characters: m, M, l, L, h, H, v, V, c, C, s, S, q, Q, t, T, a, A, z, Z, numbers, spaces, commas, dots, minus, plus, e, E
            const validPathChars = /^[mMlLhHvVcCsSqQtTaAzZ\s\d.,\-+eE]*/;
            let cleaned = '';
            
            // Try to extract valid path data from the start
            const match = dAttr.match(/^([mMlLhHvVcCsSqQtTaAzZ][^\\<&]*?)(?=\\u|<|&|$)/);
            if (match) {
                cleaned = match[1];
            } else {
                // Fallback: remove all invalid content
                cleaned = dAttr
                    // Remove Unicode escape sequences and everything after them
                    .replace(/\\u[0-9a-fA-F]{4}.*$/gi, '') // Remove \uXXXX and everything after
                    // Remove HTML tags and everything after
                    .replace(/<[^>]*>.*$/g, '') // Remove <tag> and everything after
                    // Remove HTML entities and everything after
                    .replace(/&[a-zA-Z]+;.*$/g, '') // Remove &entity; and everything after
                    // Remove any backslashes (which indicate escape sequences)
                    .replace(/\\/g, '')
                    // Remove any remaining invalid characters
                    .replace(/[^mMlLhHvVcCsSqQtTaAzZ\s\d.,\-+eE]/g, '')
                    .trim();
            }
            
            // Final cleanup - ensure we only have valid path characters
            const validChars = /[mMlLhHvVcCsSqQtTaAzZ\s\d.,\-+eE]/;
            let lastValidIndex = -1;
            for (let i = 0; i < cleaned.length; i++) {
                if (validChars.test(cleaned[i])) {
                    lastValidIndex = i;
                } else {
                    break;
                }
            }
            
            if (lastValidIndex >= 0) {
                cleaned = cleaned.substring(0, lastValidIndex + 1).trim();
            }
            
            // Find the last valid path command before any HTML contamination
            // SVG path commands: m, M, l, L, h, H, v, V, c, C, s, S, q, Q, t, T, a, A, z, Z
            const validCommandMatch = cleaned.match(/^[^mMlLhHvVcCsSqQtTaAzZ]*([mMlLhHvVcCsSqQtTaAzZ][^mMlLhHvVcCsSqQtTaAzZ]*)/);
            if (validCommandMatch) {
                // Extract everything from the first valid command
                const firstCommandIndex = cleaned.search(/[mMlLhHvVcCsSqQtTaAzZ]/);
                if (firstCommandIndex >= 0) {
                    cleaned = cleaned.substring(firstCommandIndex);
                    // Remove everything after the last valid path segment
                    // Find where invalid content starts (like remaining HTML)
                    const invalidStart = cleaned.search(/[^mMlLhHvVcCsSqQtTaAzZ\s\d.,\-+eE]/);
                    if (invalidStart > 0) {
                        cleaned = cleaned.substring(0, invalidStart).trim();
                    }
                }
            }
            
            // Final validation - path must start with a valid command
            if (cleaned && !/^[mMlLhHvVcCsSqQtTaAzZ]/.test(cleaned)) {
                // Try to find any valid path command in the string
                const match = cleaned.match(/[mMlLhHvVcCsSqQtTaAzZ][^mMlLhHvVcCsSqQtTaAzZ]*/);
                if (match) {
                    cleaned = match[0];
                } else {
                    console.warn('Path data is completely invalid, removing:', path.getAttribute('id') || 'unknown');
                    path.remove();
                    return;
                }
            }
            
            // Only update if it changed and is valid
            if (cleaned !== dAttr) {
                if (cleaned.length > 0) {
                    console.warn('Cleaned invalid path data for:', path.getAttribute('id') || 'unknown path');
                    path.setAttribute('d', cleaned);
                } else {
                    // If path is empty after cleaning, remove it
                    console.warn('Removing path with empty data after cleaning:', path.getAttribute('id') || 'unknown');
                    path.remove();
                }
            }
        }
    });
}

function processMapSVG(svgText) {
    // If svgText is null, SVG is already in DOM (embedded in HTML)
    if (svgText) {
        mapContainer.innerHTML = svgText;
        mapSvg = mapContainer.querySelector('svg');
    } else {
        // SVG already exists in DOM, just get reference
        mapSvg = mapContainer.querySelector('svg');
    }
    
    if (mapSvg) {
        // Clean any invalid content from SVG
        cleanSVGContent(mapSvg);
        // Make SVG responsive
        if (!mapSvg.hasAttribute('viewBox')) {
            const bbox = mapSvg.getBBox();
            mapSvg.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
        }
        mapSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        mapSvg.style.width = '100%';
        mapSvg.style.height = '100%';
        
        // Style the SVG paths
        const paths = mapSvg.querySelectorAll('path');
        paths.forEach(path => {
            path.setAttribute('fill', '#000');
            path.setAttribute('stroke', '#beb8b8');
            path.setAttribute('stroke-width', '0.5');
        });
        
        // Wait for SVG to render
        setTimeout(() => {
            updatePoints();
        }, 200);
    }
}

function loadAlternativeMap() {
    // Load a simple world map SVG
    // You can replace this with your own SVG file
    mapContainer.innerHTML = `
        <svg viewBox="0 0 1000 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="width: 100%; height: 100%;">
            <rect width="1000" height="500" fill="#0a0a0a"/>
            <text x="500" y="250" text-anchor="middle" fill="#fff" font-size="20">
                Laddar världskarta...
            </text>
            <text x="500" y="280" text-anchor="middle" fill="#888" font-size="14">
                Om kartan inte laddas, kontrollera CORS-inställningar eller ladda upp SVG-filen lokalt
            </text>
        </svg>
    `;
    mapSvg = mapContainer.querySelector('svg');
    
    // Try to load a public world map SVG
    // For production, you should host the SVG file yourself
    console.warn('Using fallback map. For production, host the SVG file on your server.');
}

// Mock data function for testing
function getMockDonationData() {
    // Simulate increasing donations over time with occasional larger donations
    const baseAmount = 5000;
    const timeBasedIncrease = Math.floor(Date.now() / 10000) % 2000;
    
    // Occasionally add a larger "donation" (50-500 kr) to test new point highlighting
    const shouldAddDonation = Math.random() < 0.3; // 30% chance
    const donationAmount = shouldAddDonation ? (50 + Math.floor(Math.random() * 450)) : 0;
    
    return {
        amount: baseAmount + timeBasedIncrease + donationAmount
    };
}

async function fetchDonationData() {
    try {
        let data;
        
        if (CONFIG.useMockData) {
            // Use mock data for testing
            console.log('Using mock data for testing');
            data = getMockDonationData();
        } else {
            // Fetch from real API
            const response = await fetch(CONFIG.apiUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            data = await response.json();
        }
        
        if (data && typeof data.amount === 'number') {
            previousAmount = currentAmount;
            currentAmount = data.amount;
            
            // Update display
            const amountDisplay = document.getElementById('currentAmount');
            if (amountDisplay) {
                amountDisplay.textContent = currentAmount.toLocaleString('sv-SE');
            }
            
            updatePoints();
        } else {
            console.warn('Invalid data format received:', data);
        }
    } catch (error) {
        console.error('Error fetching donation data:', error);
        // If API fails and we're not using mock, try mock as fallback
        if (!CONFIG.useMockData) {
            console.log('API failed, falling back to mock data');
            const mockData = getMockDonationData();
            previousAmount = currentAmount;
            currentAmount = mockData.amount;
            
            const amountDisplay = document.getElementById('currentAmount');
            if (amountDisplay) {
                amountDisplay.textContent = currentAmount.toLocaleString('sv-SE');
            }
            updatePoints();
        }
    }
}

function startAutoUpdate() {
    if (updateTimer) {
        clearInterval(updateTimer);
    }
    
    updateTimer = setInterval(() => {
        fetchDonationData();
    }, CONFIG.updateInterval * 1000);
}

function restartAutoUpdate() {
    startAutoUpdate();
}

function addTestDonation(amount) {
    // When adding test donation, we want to see it as a new donation
    // So we set previousAmount to current amount before adding
    previousAmount = currentAmount;
    currentAmount += amount;
    
    // Update display
    const amountDisplay = document.getElementById('currentAmount');
    if (amountDisplay) {
        amountDisplay.textContent = currentAmount.toLocaleString('sv-SE');
    }
    
    // Update points to show the new donation points
    updatePoints();
    
    // If mock data is enabled, temporarily disable auto-update to prevent overwriting
    // The user can manually trigger updates or wait for the next cycle
    console.log(`Test donation added: ${amount} kr. Total: ${currentAmount} kr`);
}

function updatePoints() {
    if (!mapSvg) return;
    
    const totalPoints = Math.floor(currentAmount / CONFIG.pricePerPoint);
    const previousPoints = Math.floor(previousAmount / CONFIG.pricePerPoint);
    const newPointsCount = Math.max(0, totalPoints - previousPoints);
    
    // Calculate how many new points to add based on donation difference
    const donationDifference = currentAmount - previousAmount;
    const calculatedNewPoints = Math.floor(donationDifference / CONFIG.pricePerPoint);
    
    // Keep existing points that are still valid (not expired new points)
    const now = Date.now();
    const existingPoints = points.filter(p => {
        if (p.isNew) {
            // Keep new points that haven't expired yet
            return (now - p.createdAt) < CONFIG.newDonationDuration * 1000;
        }
        // Keep all regular points
        return true;
    });
    
    // Start with existing points
    points = [...existingPoints];
    
    // Calculate how many points we need total
    const existingRegularPoints = existingPoints.filter(p => !p.isNew).length;
    const existingNewPoints = existingPoints.filter(p => p.isNew).length;
    const neededRegularPoints = totalPoints - existingRegularPoints;
    
    // If we need more regular points, add them
    if (neededRegularPoints > 0) {
        // Get all country paths from SVG
        const countryPaths = mapSvg.querySelectorAll('path');
        const regionCountries = [];
        const globalCountries = [];
        
        countryPaths.forEach(path => {
            const countryId = path.getAttribute('data-id') || 
                             path.getAttribute('id') || 
                             path.getAttribute('data-name') ||
                             path.getAttribute('data-code') || '';
            const upperId = countryId.toUpperCase().substring(0, 2);
            
            // Skip excluded countries
            if (EXCLUDED_COUNTRIES[upperId]) {
                return;
            }
            
            if (REGION_COUNTRIES[upperId]) {
                regionCountries.push(path);
            } else if (countryId) {
                globalCountries.push(path);
            }
        });
        
        // If no countries found, use all paths (except excluded ones)
        if (regionCountries.length === 0 && globalCountries.length === 0) {
            countryPaths.forEach(path => {
                const countryId = path.getAttribute('data-id') || 
                                 path.getAttribute('id') || 
                                 path.getAttribute('data-name') ||
                                 path.getAttribute('data-code') || '';
                const upperId = countryId.toUpperCase().substring(0, 2);
                
                if (EXCLUDED_COUNTRIES[upperId]) {
                    return;
                }
                
                if (path.getBBox().width > 0 && path.getBBox().height > 0) {
                    globalCountries.push(path);
                }
            });
        }
        
        // Calculate points for each region
        const regionPointsCount = Math.floor(neededRegularPoints * (CONFIG.regionPercentage / 100));
        const globalPointsCount = neededRegularPoints - regionPointsCount;
        
        // Place new regular points
        placePointsInCountries(regionCountries, regionPointsCount, true);
        placePointsInCountries(globalCountries, globalPointsCount, false);
    }
    
    // Add new donation points if there are any
    if (calculatedNewPoints > 0) {
        // Get all country paths from SVG for new points
        const countryPaths = mapSvg.querySelectorAll('path');
        const regionCountries = [];
        const globalCountries = [];
        
        countryPaths.forEach(path => {
            const countryId = path.getAttribute('data-id') || 
                             path.getAttribute('id') || 
                             path.getAttribute('data-name') ||
                             path.getAttribute('data-code') || '';
            const upperId = countryId.toUpperCase().substring(0, 2);
            
            if (EXCLUDED_COUNTRIES[upperId]) {
                return;
            }
            
            if (REGION_COUNTRIES[upperId]) {
                regionCountries.push(path);
            } else if (countryId) {
                globalCountries.push(path);
            }
        });
        
        if (regionCountries.length === 0 && globalCountries.length === 0) {
            countryPaths.forEach(path => {
                const countryId = path.getAttribute('data-id') || 
                                 path.getAttribute('id') || 
                                 path.getAttribute('data-name') ||
                                 path.getAttribute('data-code') || '';
                const upperId = countryId.toUpperCase().substring(0, 2);
                
                if (EXCLUDED_COUNTRIES[upperId]) {
                    return;
                }
                
                if (path.getBBox().width > 0 && path.getBBox().height > 0) {
                    globalCountries.push(path);
                }
            });
        }
        
        // Calculate distribution for new points
        const newRegionPoints = Math.floor(calculatedNewPoints * (CONFIG.regionPercentage / 100));
        const newGlobalPoints = calculatedNewPoints - newRegionPoints;
        
        // Place new donation points
        const newPointsBefore = points.length;
        placePointsInCountries(regionCountries, newRegionPoints, true);
        placePointsInCountries(globalCountries, newGlobalPoints, false);
        
        // Mark the newly added points as "new"
        const newlyAddedPoints = points.slice(newPointsBefore);
        newlyAddedPoints.forEach(point => {
            point.isNew = true;
            point.createdAt = Date.now();
            
            // Generate animation timing for new points
            point.animationDuration = 0.8 + Math.random() * 0.6;
            point.animationDelay = Math.random() * 1;
            
            // Remove "new" status after duration
            setTimeout(() => {
                const pointIndex = points.findIndex(p => p === point);
                if (pointIndex !== -1 && points[pointIndex]) {
                    points[pointIndex].isNew = false;
                    // Adjust to regular point timing
                    points[pointIndex].animationDuration = 1.5 + Math.random() * 2;
                    points[pointIndex].animationDelay = Math.random() * 3;
                    redrawPoints();
                }
            }, CONFIG.newDonationDuration * 1000);
        });
    }
    
    // Update expired new points to regular
    points.forEach(point => {
        if (point.isNew && (now - point.createdAt) >= CONFIG.newDonationDuration * 1000) {
            point.isNew = false;
            if (!point.animationDuration) {
                point.animationDuration = 1.5 + Math.random() * 2;
                point.animationDelay = Math.random() * 3;
            }
        }
    });
    
    redrawPoints();
}

function placePointsInCountries(countryPaths, pointCount, isRegion) {
    if (countryPaths.length === 0 || pointCount <= 0) return;
    
    const pointsPerCountry = Math.ceil(pointCount / countryPaths.length);
    let placedCount = 0;
    
    for (const path of countryPaths) {
        if (placedCount >= pointCount) break;
        
        const pointsToPlace = Math.min(pointsPerCountry, pointCount - placedCount);
        
        for (let i = 0; i < pointsToPlace; i++) {
            const point = findPointOnLand(path, isRegion);
            if (point) {
                points.push(point);
                placedCount++;
            }
        }
    }
}

function findPointOnLand(path, isRegion) {
    if (!mapSvg) return null;
    
    const maxAttempts = 100;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
        try {
            // Get path bounding box
            const bbox = path.getBBox();
            
            if (bbox.width === 0 || bbox.height === 0) {
                attempts++;
                continue;
            }
            
            // Generate random point within bounding box
            const x = bbox.x + Math.random() * bbox.width;
            const y = bbox.y + Math.random() * bbox.height;
            
            // Check if point is inside path
            if (isPointInPath(path, x, y)) {
                // Convert SVG coordinates to screen coordinates first
                const screenPoint = svgToScreen(x, y);
                
                // Check minimum distance from other points (in screen coordinates)
                if (isValidDistance(screenPoint.x, screenPoint.y)) {
                    // Generate unique animation timing for each point
                    const animationDuration = 1.5 + Math.random() * 2; // Between 1.5s and 3.5s
                    const animationDelay = Math.random() * 3; // Random delay up to 3 seconds
                    
                    return {
                        x: screenPoint.x,
                        y: screenPoint.y,
                        svgX: x,
                        svgY: y,
                        isNew: false,
                        animationDuration: animationDuration,
                        animationDelay: animationDelay
                    };
                }
            }
        } catch (e) {
            // Skip this attempt if there's an error
        }
        
        attempts++;
    }
    
    return null;
}

function isPointInPath(path, x, y) {
    // Use SVG's isPointInFill method if available
    if (path.isPointInFill) {
        return path.isPointInFill(new DOMPoint(x, y));
    }
    
    // Fallback: create a temporary point and check
    const point = mapSvg.createSVGPoint();
    point.x = x;
    point.y = y;
    
    // Check if point is in the path's fill area
    try {
        return path.isPointInFill(point);
    } catch (e) {
        // If method not available, assume true (less accurate but works)
        return true;
    }
}

function isValidDistance(screenX, screenY) {
    for (const existingPoint of points) {
        const dx = screenX - existingPoint.x;
        const dy = screenY - existingPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < CONFIG.minDistance) {
            return false;
        }
    }
    
    return true;
}

function svgToScreen(svgX, svgY) {
    if (!mapSvg || !mapContainer) {
        return { x: svgX, y: svgY };
    }
    
    try {
        const svgPoint = mapSvg.createSVGPoint();
        svgPoint.x = svgX;
        svgPoint.y = svgY;
        
        // Get the transformation matrix
        const ctm = mapSvg.getScreenCTM();
        if (ctm) {
            const screenPoint = svgPoint.matrixTransform(ctm);
            const containerRect = mapContainer.getBoundingClientRect();
            const svgRect = mapSvg.getBoundingClientRect();
            
            // Calculate position relative to mapContainer
            return {
                x: screenPoint.x - svgRect.left,
                y: screenPoint.y - svgRect.top
            };
        }
    } catch (e) {
        console.warn('Error in svgToScreen:', e);
    }
    
    // Fallback calculation using viewBox
    const viewBox = mapSvg.viewBox.baseVal;
    const containerRect = mapContainer.getBoundingClientRect();
    
    if (viewBox.width && viewBox.height && containerRect.width && containerRect.height) {
        const scaleX = containerRect.width / viewBox.width;
        const scaleY = containerRect.height / viewBox.height;
        
        return {
            x: (svgX - viewBox.x) * scaleX,
            y: (svgY - viewBox.y) * scaleY
        };
    }
    
    return { x: svgX, y: svgY };
}

function redrawPoints() {
    if (!mapContainer) return;
    
    // Remove all existing point elements
    const existingPoints = mapContainer.querySelectorAll('.point');
    existingPoints.forEach(point => point.remove());
    
    // Create new point elements
    points.forEach((point, index) => {
        const pointElement = document.createElement('div');
        pointElement.className = 'point' + (point.isNew ? ' new-donation' : '');
        pointElement.style.left = point.x + 'px';
        pointElement.style.top = point.y + 'px';
        
        // Set unique animation timing for each point
        if (point.isNew) {
            // New donations have faster, more noticeable animation
            const newDuration = 0.8 + Math.random() * 0.6; // Between 0.8s and 1.4s
            const newDelay = Math.random() * 1; // Random delay up to 1 second
            pointElement.style.animationDuration = newDuration + 's';
            pointElement.style.animationDelay = newDelay + 's';
        } else {
            // Regular points use stored animation timing or generate new
            if (point.animationDuration === undefined) {
                point.animationDuration = 1.5 + Math.random() * 2; // Between 1.5s and 3.5s
                point.animationDelay = Math.random() * 3; // Random delay up to 3 seconds
            }
            pointElement.style.animationDuration = point.animationDuration + 's';
            pointElement.style.animationDelay = point.animationDelay + 's';
        }
        
        // Store reference to point data
        pointElement.dataset.pointIndex = index;
        
        mapContainer.appendChild(pointElement);
    });
}

// Handle window resize
let resizeTimeout;
window.addEventListener('resize', () => {
    resizeCanvas();
    // Debounce resize to avoid too many updates
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (points.length > 0) {
            resizeCanvas();
        }
    }, 100);
});

