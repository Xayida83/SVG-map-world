// =======================
// Konfiguration
// =======================
const CONFIG = {
  pricePerPoint: 50,
  regionPercentage: 40,
  updateInterval: 30, // sekunder
  minDistance: 2,     // minsta pixelavstånd mellan punkter
  newDonationDuration: 15, // sekunder
  apiUrl: "https://actsvenskakyrkan.adoveo.com/getProgressbarData/40",
  mapUrl: "https://mapsvg.com/maps/world",
  useMockData: true
};

// =======================
// Regioner / exkludering
// =======================
const REGION_COUNTRIES = {
  // South America
  BR: "Brazil", AR: "Argentina", PE: "Peru", CO: "Colombia",
  VE: "Venezuela", CL: "Chile", EC: "Ecuador", BO: "Bolivia",
  PY: "Paraguay", UY: "Uruguay", GY: "Guyana", SR: "Suriname",
  GF: "French Guiana", FK: "Falkland Islands",
  // Southern Africa
  ZA: "South Africa", ZW: "Zimbabwe", BW: "Botswana", NA: "Namibia",
  MZ: "Mozambique", ZM: "Zambia", MW: "Malawi", MG: "Madagascar",
  LS: "Lesotho", SZ: "Eswatini", CD: "Democratic Republic of Congo"
};

const EXCLUDED_COUNTRIES = {
  GL: "Greenland",
  RU: "Russia",
  CA: "Canada",
  US: "United States"
};

// =======================
// Globalt state
// =======================
let currentAmount = 0;
let previousAmount = 0;
let points = [];
let mapSvg = null;
let mapContainer = null;
let canvas = null;
let ctx = null;
let updateTimer = null;

// =======================
// Mock & API helpers
// =======================
let MOCK_MODE = CONFIG.useMockData;
const MOCK_RESPONSE = { amount: 13000 };

const urls = [{ id: "collected-now", url: CONFIG.apiUrl }];

function getMockDonationData() {
  const baseAmount = 9000;
  const timeBasedIncrease = Math.floor(Date.now() / 10000) % 2000;
  const shouldAddDonation = Math.random() < 0.3;
  const donationAmount = shouldAddDonation ? (50 + Math.floor(Math.random() * 450)) : 0;
  return { amount: baseAmount + timeBasedIncrease + donationAmount };
}

// === Hämtning utan async/await ===
function fetchData(url) {
  if (MOCK_MODE) {
    console.log("[MOCK]", MOCK_RESPONSE);
    return Promise.resolve({ amount: Number(MOCK_RESPONSE.amount) || 0 });
  }

  return fetch(url, { cache: "no-store" })
    .then(res =>
      res.json().catch(() =>
        // fallback om servern skickar fel content-type
        res.text().then(t => JSON.parse(t))
      )
    )
    .then(data => ({ amount: Number(data?.amount) || 0 }))
    .catch(e => {
      console.error("[API error]", e);
      return { amount: 0 };
    });
}

// =======================
// Init
// =======================
document.addEventListener("DOMContentLoaded", () => {
  initializeElements();
  loadMap();
  // inga donations-UI-listeners – testas via konsolen
  fetchDonationData();
  startAutoUpdate();

  // konsol-hjälpare
  Object.assign(window, {
    fetchDonationData,
    addTestDonation,
    setMockMode: (on) => { MOCK_MODE = !!on; console.log("MOCK_MODE:", MOCK_MODE); },
    setAmount: (n) => {
      previousAmount = currentAmount;
      currentAmount = Number(n) || 0;
      updatePoints();
      console.log("Current amount set to", currentAmount);
    }
  });
});

function initializeElements() {
  mapContainer = document.getElementById("mapContainer");
  canvas = document.getElementById("pointCanvas");

  if (!canvas && mapContainer && mapContainer.parentElement) {
    canvas = document.createElement("canvas");
    canvas.id = "pointCanvas";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "5";
    canvas.style.opacity = "0";
    mapContainer.parentElement.appendChild(canvas);
  }

  if (canvas) {
    ctx = canvas.getContext("2d");
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
  } else {
    console.warn("Canvas element could not be created. Some features may not work.");
    canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d");
  }
}

function resizeCanvas() {
  if (canvas && mapContainer) {
    canvas.width = mapContainer.offsetWidth;
    canvas.height = mapContainer.offsetHeight;
  }
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

// =======================
// Karta
// =======================
function loadMap() {
  mapSvg = mapContainer?.querySelector("svg");
  if (mapSvg) {
    processMapSVG(null);
    return;
  }

  const localSvgPath = "https://raw.githubusercontent.com/Xayida83/SVG-map-world/refs/heads/master/world.svg";

  fetch(localSvgPath)
    .then(response => {
      if (response.ok) return response.text();
      throw new Error("Local SVG file not found");
    })
    .then(svgText => processMapSVG(svgText))
    .catch(error => {
      console.warn("Local SVG file not found, trying online version...", error);
      fetch("https://mapsvg.com/maps/world")
        .then(response => {
          if (response.ok) return response.text();
          throw new Error("Failed to load map");
        })
        .then(svgText => processMapSVG(svgText))
        .catch(error => {
          console.error("Error loading map:", error);
          loadAlternativeMap();
        });
    });
}

function cleanSVGContent(svgElement) {
  if (!svgElement) return;
  const htmlElements = svgElement.querySelectorAll("div, span, p, br");
  htmlElements.forEach(el => el.remove());

  const paths = svgElement.querySelectorAll("path");
  paths.forEach(path => {
    const dAttr = path.getAttribute("d");
    if (!dAttr) return;

    let cleaned = "";
    const match = dAttr.match(/^([mMlLhHvVcCsSqQtTaAzZ][^\\<&]*?)(?=\\u|<|&|$)/);
    if (match) {
      cleaned = match[1];
    } else {
      cleaned = dAttr
        .replace(/\\u[0-9a-fA-F]{4}.*$/gi, "")
        .replace(/<[^>]*>.*$/g, "")
        .replace(/&[a-zA-Z]+;.*$/g, "")
        .replace(/\\/g, "")
        .replace(/[^mMlLhHvVcCsSqQtTaAzZ\s\d.,\-+eE]/g, "")
        .trim();
    }

    const validChars = /[mMlLhHvVcCsSqQtTaAzZ\s\d.,\-+eE]/;
    let lastValidIndex = -1;
    for (let i = 0; i < cleaned.length; i++) {
      if (validChars.test(cleaned[i])) lastValidIndex = i; else break;
    }
    if (lastValidIndex >= 0) cleaned = cleaned.substring(0, lastValidIndex + 1).trim();

    if (cleaned && !/^[mMlLhHvVcCsSqQtTaAzZ]/.test(cleaned)) {
      const m2 = cleaned.match(/[mMlLhHvVcCsSqQtTaAzZ][^mMlLhHvVcCsSqQtTaAzZ]*/);
      if (m2) cleaned = m2[0]; else { path.remove(); return; }
    }

    if (cleaned !== dAttr) {
      if (cleaned.length > 0) path.setAttribute("d", cleaned);
      else path.remove();
    }
  });
}

function processMapSVG(svgText) {
  if (svgText) {
    mapContainer.innerHTML = svgText;
    mapSvg = mapContainer.querySelector("svg");
  } else {
    mapSvg = mapContainer.querySelector("svg");
  }

  if (mapSvg) {
    cleanSVGContent(mapSvg);
    if (!mapSvg.hasAttribute("viewBox")) {
      const bbox = mapSvg.getBBox();
      mapSvg.setAttribute("viewBox", `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
    }
    mapSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    mapSvg.style.width = "100%";
    mapSvg.style.height = "100%";

    const paths = mapSvg.querySelectorAll("path");
    paths.forEach(path => {
      path.setAttribute("fill", "#000");
      path.setAttribute("stroke", "#beb8b8");
      path.setAttribute("stroke-width", "0.5");
    });

    setTimeout(() => updatePoints(), 200);
  }
}

function loadAlternativeMap() {
  mapContainer.innerHTML = `
    <svg viewBox="0 0 1000 500" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="width: 100%; height: 100%;">
      <rect width="1000" height="500" fill="#0a0a0a"/>
      <text x="500" y="250" text-anchor="middle" fill="#fff" font-size="20">Laddar världskarta...</text>
      <text x="500" y="280" text-anchor="middle" fill="#888" font-size="14">Om kartan inte laddas, hosta SVG-filen lokalt</text>
    </svg>
  `;
  mapSvg = mapContainer.querySelector("svg");
  console.warn("Using fallback map. Host the SVG on your server for production.");
}

// =======================
// Hämtning & uppdatering
// =======================
// Ej async – ren then/catch-kedja
function fetchDonationData() {
  return fetchData(urls[0].url)
    .then(({ amount }) => {
      previousAmount = currentAmount;
      currentAmount = amount;
      console.log("[AMOUNT]", currentAmount);
      updatePoints();
    })
    .catch(error => {
      console.error("Kunde inte hämta donationsdata:", error);
      previousAmount = currentAmount;
      const mockData = getMockDonationData();
      currentAmount = Number(mockData.amount) || 0;
      console.log("[FALLBACK MOCK AMOUNT]", currentAmount);
      updatePoints();
    });
}

function startAutoUpdate() {
  if (updateTimer) clearInterval(updateTimer);
  updateTimer = setInterval(() => { fetchDonationData(); }, CONFIG.updateInterval * 1000);
}

function restartAutoUpdate() {
  startAutoUpdate();
}

function addTestDonation(amount) {
  previousAmount = currentAmount;
  currentAmount += Number(amount) || 0;
  console.log(`[TEST DONATION] +${amount} -> ${currentAmount}`);
  updatePoints();
}

// =======================
// Punkter / rendering
// =======================
function updatePoints() {
  if (!mapSvg) return;

  const totalPoints = Math.floor(currentAmount / CONFIG.pricePerPoint);
  const previousPoints = Math.floor(previousAmount / CONFIG.pricePerPoint);
  const donationDifference = currentAmount - previousAmount;
  const calculatedNewPoints = Math.floor(donationDifference / CONFIG.pricePerPoint);

  const now = Date.now();
  const existingPoints = points.filter(p => {
    if (p.isNew) return (now - p.createdAt) < CONFIG.newDonationDuration * 1000;
    return true;
  });

  points = [...existingPoints];

  const existingRegularPoints = existingPoints.filter(p => !p.isNew).length;
  const neededRegularPoints = totalPoints - existingRegularPoints;

  if (neededRegularPoints > 0) {
    const countryPaths = mapSvg.querySelectorAll("path");
    const regionCountries = [];
    const globalCountries = [];

    countryPaths.forEach(path => {
      const countryId =
        path.getAttribute("data-id") ||
        path.getAttribute("id") ||
        path.getAttribute("data-name") ||
        path.getAttribute("data-code") || "";
      const upperId = countryId.toUpperCase().substring(0, 2);

      if (EXCLUDED_COUNTRIES[upperId]) return;

      if (REGION_COUNTRIES[upperId]) regionCountries.push(path);
      else if (countryId) globalCountries.push(path);
    });

    if (regionCountries.length === 0 && globalCountries.length === 0) {
      countryPaths.forEach(path => {
        const countryId =
          path.getAttribute("data-id") ||
          path.getAttribute("id") ||
          path.getAttribute("data-name") ||
          path.getAttribute("data-code") || "";
        const upperId = countryId.toUpperCase().substring(0, 2);
        if (EXCLUDED_COUNTRIES[upperId]) return;
        if (path.getBBox().width > 0 && path.getBBox().height > 0) {
          globalCountries.push(path);
        }
      });
    }

    const regionPointsCount = Math.floor(neededRegularPoints * (CONFIG.regionPercentage / 100));
    const globalPointsCount = neededRegularPoints - regionPointsCount;

    placePointsInCountries(regionCountries, regionPointsCount, true);
    placePointsInCountries(globalCountries, globalPointsCount, false);
  }

  if (calculatedNewPoints > 0) {
    const countryPaths = mapSvg.querySelectorAll("path");
    const regionCountries = [];
    const globalCountries = [];

    countryPaths.forEach(path => {
      const countryId =
        path.getAttribute("data-id") ||
        path.getAttribute("id") ||
        path.getAttribute("data-name") ||
        path.getAttribute("data-code") || "";
      const upperId = countryId.toUpperCase().substring(0, 2);
      if (EXCLUDED_COUNTRIES[upperId]) return;
      if (REGION_COUNTRIES[upperId]) regionCountries.push(path);
      else if (countryId) globalCountries.push(path);
    });

    if (regionCountries.length === 0 && globalCountries.length === 0) {
      countryPaths.forEach(path => {
        const countryId =
          path.getAttribute("data-id") ||
          path.getAttribute("id") ||
          path.getAttribute("data-name") ||
          path.getAttribute("data-code") || "";
        const upperId = countryId.toUpperCase().substring(0, 2);
        if (EXCLUDED_COUNTRIES[upperId]) return;
        if (path.getBBox().width > 0 && path.getBBox().height > 0) {
          globalCountries.push(path);
        }
      });
    }

    const newRegionPoints = Math.floor(calculatedNewPoints * (CONFIG.regionPercentage / 100));
    const newGlobalPoints = calculatedNewPoints - newRegionPoints;

    const newPointsBefore = points.length;
    placePointsInCountries(regionCountries, newRegionPoints, true);
    placePointsInCountries(globalCountries, newGlobalPoints, false);

    const newlyAddedPoints = points.slice(newPointsBefore);
    newlyAddedPoints.forEach(point => {
      point.isNew = true;
      point.createdAt = Date.now();
      point.animationDuration = 0.8 + Math.random() * 0.6;
      point.animationDelay = Math.random() * 1;

      setTimeout(() => {
        const idx = points.findIndex(p => p === point);
        if (idx !== -1 && points[idx]) {
          points[idx].isNew = false;
          points[idx].animationDuration = 1.5 + Math.random() * 2;
          points[idx].animationDelay = Math.random() * 3;
          redrawPoints();
        }
      }, CONFIG.newDonationDuration * 1000);
    });
  }

  const now2 = Date.now();
  points.forEach(point => {
    if (point.isNew && (now2 - point.createdAt) >= CONFIG.newDonationDuration * 1000) {
      point.isNew = false;
      if (!point.animationDuration) {
        point.animationDuration = 1.5 + Math.random() * 2;
        point.animationDelay = Math.random() * 3;
      }
    }
  });

  redrawPoints();
}

function placePointsInCountries(countryPaths, pointCount/*, isRegion*/) {
  if (!countryPaths || countryPaths.length === 0 || pointCount <= 0) return;

  const pointsPerCountry = Math.ceil(pointCount / countryPaths.length);
  let placedCount = 0;

  for (const path of countryPaths) {
    if (placedCount >= pointCount) break;

    const toPlace = Math.min(pointsPerCountry, pointCount - placedCount);
    for (let i = 0; i < toPlace; i++) {
      const point = findPointOnLand(path);
      if (point) {
        points.push(point);
        placedCount++;
      }
    }
  }
}

function findPointOnLand(path) {
  if (!mapSvg) return null;

  const maxAttempts = 100;
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const bbox = path.getBBox();
      if (bbox.width === 0 || bbox.height === 0) { attempts++; continue; }

      const x = bbox.x + Math.random() * bbox.width;
      const y = bbox.y + Math.random() * bbox.height;

      if (isPointInPath(path, x, y)) {
        const screenPoint = svgToScreen(x, y);
        if (isValidDistance(screenPoint.x, screenPoint.y)) {
          const animationDuration = 1.5 + Math.random() * 2;
          const animationDelay = Math.random() * 3;
          return {
            x: screenPoint.x,
            y: screenPoint.y,
            svgX: x,
            svgY: y,
            isNew: false,
            animationDuration,
            animationDelay
          };
        }
      }
    } catch { /* ignore */ }
    attempts++;
  }
  return null;
}

function isPointInPath(path, x, y) {
  if (path.isPointInFill) {
    return path.isPointInFill(new DOMPoint(x, y));
  }
  const point = mapSvg.createSVGPoint();
  point.x = x; point.y = y;
  try { return path.isPointInFill(point); } catch { return true; }
}

function isValidDistance(screenX, screenY) {
  for (const existingPoint of points) {
    const dx = screenX - existingPoint.x;
    const dy = screenY - existingPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < CONFIG.minDistance) return false;
  }
  return true;
}

function svgToScreen(svgX, svgY) {
  if (!mapSvg || !mapContainer) return { x: svgX, y: svgY };
  try {
    const svgPoint = mapSvg.createSVGPoint();
    svgPoint.x = svgX;
    svgPoint.y = svgY;
    const ctm = mapSvg.getScreenCTM();
    if (ctm) {
      const screenPoint = svgPoint.matrixTransform(ctm);
      const svgRect = mapSvg.getBoundingClientRect();
      return {
        x: screenPoint.x - svgRect.left,
        y: screenPoint.y - svgRect.top
      };
    }
  } catch (e) {
    console.warn("Error in svgToScreen:", e);
  }

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

  const existingPoints = mapContainer.querySelectorAll(".point");
  existingPoints.forEach(p => p.remove());

  points.forEach((point, index) => {
    const el = document.createElement("div");
    el.className = "point" + (point.isNew ? " new-donation" : "");
    el.style.left = point.x + "px";
    el.style.top = point.y + "px";
    el.innerHTML = "&nbsp;"; // för vissa CMS/DOM
    if (point.isNew) {
      const newDuration = 0.8 + Math.random() * 0.6;
      const newDelay = Math.random() * 1;
      el.style.animationDuration = newDuration + "s";
      el.style.animationDelay = newDelay + "s";
    } else {
      if (point.animationDuration === undefined) {
        point.animationDuration = 1.5 + Math.random() * 2;
        point.animationDelay = Math.random() * 3;
      }
      el.style.animationDuration = point.animationDuration + "s";
      el.style.animationDelay = point.animationDelay + "s";
    }
    el.dataset.pointIndex = index;
    mapContainer.appendChild(el);
  });
}

// =======================
// Resize debounce
// =======================
let resizeTimeout;
window.addEventListener("resize", () => {
  resizeCanvas();
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (points.length > 0) resizeCanvas();
  }, 100);
});
