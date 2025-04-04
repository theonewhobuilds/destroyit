// Hardcoded Supabase credentials
const SUPABASE_URL = "https://ikbnuqabgdgikorhipnm.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrYm51cWFiZ2RnaWtvcmhpcG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMxMDU5NjEsImV4cCI6MjA1ODY4MTk2MX0.hK6qmYgWe62yn-cXfRgzr9cX-MWpyfxRUjL2jAIJjoU";

// Global state variables
let supabase;
let currentUser = null;
let currentGamingName = null;
let isGuest = false;
let gameInterval = null;
let gameStartTime = null;
let score = 0;
let lives = 3;
let wordsTyped = 0;
let fallingObjects = [];
let activePowerups = [];
let lastScoreBracket = -1;
let powerupSpawned = {};
let slowdownTimeout = null;
let slowdownActive = false;
let pauseTimeout = null;
let pauseActive = false;

// Initialize Supabase Client - Placed early
try {
  if (!window.supabase?.createClient) {
       throw new Error("Supabase library not loaded from CDN.");
  }
  const { createClient } = window.supabase;
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log("Supabase client initialized successfully.");
} catch (error) {
   console.error("FATAL: Supabase client failed to initialize:", error);
   document.body.innerHTML = `<div style="color: red; padding: 20px; font-size: 1.5em; text-align: center;">Error initializing Supabase: ${error.message}. Check credentials/CDN.</div>`;
   // Stop further script execution if Supabase fails to load
   throw new Error("Stopping script execution due to Supabase init failure.");
}

// --- UI Navigation ---
function showScreen(screenId) {
  console.log("Showing screen:", screenId);
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove("active");
  });

  // Stop game if navigating away from game screen
  if (gameInterval && screenId !== "game-screen") {
    console.log("Navigating away from game, stopping game.");
    clearInterval(gameInterval);
    gameInterval = null;
    if (slowdownTimeout) clearTimeout(slowdownTimeout);
    if (pauseTimeout) clearTimeout(pauseTimeout);
    slowdownActive = false; pauseActive = false; slowdownTimeout = null; pauseTimeout = null;
    clearGameElements(); // Clear visuals
  }

  const targetScreen = document.getElementById(screenId);
  if (targetScreen) {
    targetScreen.classList.add("active");
  } else {
    console.error("Screen not found:", screenId, "Fallback to home.");
    document.getElementById("home-screen")?.classList.add("active");
    return;
  }

  // Screen-specific actions
  switch (screenId) {
    case "profile-screen":
      if (currentUser) { loadProfileStats(); checkGamingName(); }
      else { console.warn("Profile screen shown but no user."); showScreen("home-screen"); }
      break;
    case "leaderboard-screen":
      fetchLeaderboard();
      // Ensure back button is visible for leaderboard
      document.getElementById('leaderboard-back-btn')?.style.setProperty("display", "block", "important");
      break;
    case "game-screen":
      if ((isGuest && currentGamingName) || (currentUser && currentGamingName)) { startGame(); }
      else { console.log("Cannot start game, name not set."); if (!isGuest) showGamingNameModal(false); else playAsGuest(); }
      break;
    case "home-screen":
      checkAuth(); // Refresh auth UI state
       // Hide leaderboard back button when on home
       document.getElementById('leaderboard-back-btn')?.style.setProperty("display", "none", "important");
      break;
     default:
          // Hide leaderboard back button if not on leaderboard screen
           document.getElementById('leaderboard-back-btn')?.style.setProperty("display", "none", "important");
  }
}

// --- Authentication & User Flow ---
function checkAuthAndPlay() {
  if (!supabase) return console.error("Supabase not initialized.");
  console.log("checkAuthAndPlay - User:", currentUser?.email || "None");
  if (!currentUser) {
    if (confirm("Sign in with Google to save scores? Cancel to play as guest.")) { signInWithGoogle(); }
    else { playAsGuest(); }
  } else {
    checkGamingName().then((name) => {
      if (!name) showGamingNameModal(false); // Prompt if no name set
      else showScreen("game-screen"); // Name exists, start game
    }).catch(err => console.error("Error checking name in checkAuthAndPlay:", err));
  }
}

function playAsGuest() {
  console.log("Playing as guest");
  isGuest = true; currentUser = null; currentGamingName = null;
  const modal = document.getElementById("gaming-name-modal"); if (!modal) return;
  modal.dataset.isProfileUpdate = "false"; modal.classList.add("active");
  const input = document.getElementById("gaming-name-input");
  if (input) { input.value = ""; setTimeout(() => input.focus(), 100); }
}

function signInWithGoogle() {
  if (!supabase) return console.error("Supabase not initialized.");
  console.log("Attempting Google Sign-In...");
  supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.href } })
    .catch(error => { console.error("Error initiating Google Sign-In:", error.message); alert(`Google Sign-In failed: ${error.message}`); });
}

function logout() {
  if (!supabase) return console.error("Supabase not initialized.");
  console.log("Logging out...");
  supabase.auth.signOut().then(({ error }) => { if (error) console.error("Error during sign out:", error); })
    .catch(err => console.error("Sign out promise error:", err));
  // Auth state change listener handles UI reset and redirect
}

async function checkAuth() {
  if (!supabase) return false;
  try {
    // console.log("Checking auth session..."); // Reduce console noise
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    // if (sessionError) console.error("Error getting session:", sessionError.message); // Often expected if no session

    const loginBtn = document.getElementById("login-btn");
    const profileBtn = document.getElementById("profile-btn");
    const logoutBtn = document.getElementById("logout-btn");
    const guestBtn = document.querySelector('button[onclick="playAsGuest()"]');

    if (session?.user) { // User is logged in
      if (currentUser?.id !== session.user.id) console.log("User session active:", session.user.email); // Log only if user changes
      currentUser = session.user; isGuest = false;
      loginBtn?.style.setProperty("display", "none", "important");
      profileBtn?.style.setProperty("display", "block", "important");
      logoutBtn?.style.setProperty("display", "block", "important");
      guestBtn?.style.setProperty("display", "none", "important");
      await checkGamingName(); // Load name after confirming user
      return true;
    } else { // User is logged out
       if (currentUser) console.log("No active user session found / User logged out."); // Log only if state changes
      currentUser = null; isGuest = false; currentGamingName = null;
      loginBtn?.style.setProperty("display", "block", "important");
      profileBtn?.style.setProperty("display", "none", "important");
      logoutBtn?.style.setProperty("display", "none", "important");
      guestBtn?.style.setProperty("display", "block", "important");
      updateUIName(null); // Explicitly clear name display
      return false;
    }
  } catch (error) {
    console.error("Error in checkAuth function:", error);
    // Force logged-out state on unexpected error
    currentUser = null; isGuest = false; currentGamingName = null;
    document.getElementById("login-btn")?.style.setProperty("display", "block", "important");
    document.getElementById("profile-btn")?.style.setProperty("display", "none", "important");
    document.getElementById("logout-btn")?.style.setProperty("display", "none", "important");
    document.querySelector('button[onclick="playAsGuest()"]')?.style.setProperty("display", "block", "important");
    updateUIName(null);
    return false;
  }
}

// --- Gaming Name Handling ---
function validateGamingName(name) {
  if (!name || name.trim() === "") return { valid: false, message: "Please enter a gaming name", sanitized: "" };
  let sanitized = name.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (sanitized.length < 3) return { valid: false, message: "Min 3 chars (a-z, 0-9, _)", sanitized: "" };
  if (sanitized.length > 15) sanitized = sanitized.substring(0, 15); // Apply max length
  if (sanitized !== name.toLowerCase()) console.log(`Name sanitized: '${name}' -> '${sanitized}'`);
  return { valid: true, message: "", sanitized: sanitized };
}

function canChangeGamingName() {
  if (!currentUser) return true;
  const today = new Date().toISOString().split("T")[0];
  const key = `nameChanges_${currentUser.id}_${today}`;
  return (parseInt(localStorage.getItem(key) || "0") < 3);
}

function incrementNameChangeCounter() {
  if (!currentUser) return;
  const today = new Date().toISOString().split("T")[0];
  const key = `nameChanges_${currentUser.id}_${today}`;
  const count = parseInt(localStorage.getItem(key) || "0");
  const newCount = count + 1;
  localStorage.setItem(key, newCount.toString());
  console.log(`Name changes used today: ${newCount}`);
  const remaining = Math.max(0, 3 - newCount);
  alert(`Gaming name updated! You have ${remaining} changes remaining today.`);
}

function showGamingNameModal(isUpdate = false) {
  const modal = document.getElementById("gaming-name-modal"); if (!modal) return;
  if (isUpdate && !currentUser) { alert("Log in to change name"); return; }
  if (isUpdate && currentGamingName && !canChangeGamingName()) { alert("Daily name change limit reached."); return; }
  console.log("Showing gaming name modal, isUpdate:", isUpdate);
  modal.classList.add("active"); modal.dataset.isProfileUpdate = isUpdate ? "true" : "false";
  const inputField = document.getElementById("gaming-name-input");
  if (inputField) { inputField.value = (isUpdate && currentGamingName) ? currentGamingName : ""; setTimeout(() => inputField.focus(), 100); }
}

function closeGamingNameModal() {
  const modal = document.getElementById("gaming-name-modal"); if (!modal) return;
  modal.classList.remove("active");
  // If modal closed without confirming, handle redirect if needed
  if (isGuest && !currentGamingName) { isGuest = false; showScreen("home-screen"); } // Guest cancelled
  else if (!isGuest && currentUser && !currentGamingName && modal.dataset.isProfileUpdate === "false") { showScreen("home-screen"); } // Logged-in user cancelled initial setup
}

async function checkGamingName() {
    if (!currentUser?.id) { updateUIName(null); return null; }
    // console.log("Checking gaming name for user:", currentUser.id); // Reduce noise
    try {
        const { data, error } = await supabase.from("profiles").select("gaming_name").eq("id", currentUser.id).maybeSingle();
        if (error) { console.error("Error fetching profile for gaming name:", error.message); currentGamingName = null; updateUIName("Error"); return null; }
        currentGamingName = data?.gaming_name || null;
        // if (!currentGamingName) console.log("No gaming name found for user."); // Log only if null
        updateUIName(currentGamingName);
        return currentGamingName;
    } catch (fetchError) { console.error("Unexpected error fetching gaming name:", fetchError); currentGamingName = null; updateUIName("Error"); return null; }
}

function updateUIName(name) { // Helper to update all UI elements needing the name
   const profileNameEl = document.getElementById("current-gaming-name");
   const gameNameEl = document.getElementById("player-name");
   const displayName = name || (isGuest ? "Guest" : (currentUser ? "Not Set" : "Player"));
   if (profileNameEl) profileNameEl.textContent = name || "Not Set";
   if (gameNameEl) gameNameEl.textContent = displayName;
}

async function submitGamingName() {
    if (!supabase) return console.error("Supabase not initialized.");
    const modal = document.getElementById("gaming-name-modal"); const input = document.getElementById("gaming-name-input"); if (!modal || !input) return;
    const validation = validateGamingName(input.value); if (!validation.valid) return alert(validation.message);
    const gamingName = validation.sanitized; const isUpdate = modal.dataset.isProfileUpdate === "true";

    if (currentUser) { // Logged-in user flow
        if (isUpdate && gamingName !== currentGamingName && !canChangeGamingName()) return alert("Daily name change limit reached.");
        try {
            const { data: existing, error: checkErr } = await supabase.from("profiles").select("id").eq("gaming_name", gamingName).neq("id", currentUser.id).limit(1);
            if (checkErr) throw checkErr;
            if (existing?.length > 0) return alert("Gaming name already taken.");

            console.log("Upserting profile for", currentUser.id, "with name", gamingName);
            const { data: upsertData, error: upsertErr } = await supabase.from("profiles")
                .upsert({ id: currentUser.id, gaming_name: gamingName, updated_at: new Date().toISOString() }, { onConflict: "id" })
                .select("gaming_name").single();
            if (upsertErr) throw upsertErr; // Let catch block handle alert

            const previousName = currentGamingName; // Store before update
            currentGamingName = upsertData.gaming_name; updateUIName(currentGamingName);
            console.log("Profile upsert successful. Name:", currentGamingName);
            modal.classList.remove("active"); input.value = "";
            if (isUpdate && currentGamingName !== previousName) incrementNameChangeCounter(); // Alert is inside
            else if (isUpdate) alert("Gaming name saved.");
            if (!isUpdate) showScreen("game-screen"); // Proceed to game if initial setup
            else loadProfileStats(); // Refresh profile stats after update

        } catch (error) { console.error("Error submitting gaming name:", error); alert(`Failed to save name: ${error.message}. Check RLS/Policies.`); }
    } else if (isGuest) { // Guest flow
        currentGamingName = gamingName; updateUIName(currentGamingName);
        console.log("Guest name set locally:", currentGamingName);
        modal.classList.remove("active"); input.value = ""; showScreen("game-screen");
    } else { console.error("Submit called without user or guest state."); }
}

// --- Profile & Leaderboard Data ---
 async function loadProfileStats() {
     if (!currentUser?.id) { console.log("Cannot load stats: No user."); /* Clear stats UI */ return; }
     console.log("Loading profile stats for:", currentUser.id);
     try {
         const { data: userScores, error: scoreError } = await supabase.from("scores").select("score, wpm").eq("profile_id", currentUser.id);
         if (scoreError) throw scoreError;
         const highestScore = userScores.length > 0 ? Math.max(...userScores.map(s => s.score || 0)) : 0;
         const bestWPM = userScores.length > 0 ? Math.max(...userScores.map(s => s.wpm || 0)) : 0;
         const gamesPlayed = userScores.length;
         document.getElementById("highest-score").textContent = highestScore;
         document.getElementById("best-wpm").textContent = bestWPM;
         document.getElementById("games-played").textContent = gamesPlayed;

         // Fetch ranking (consider performance)
         const { data: allScores, error: rankError } = await supabase.from("scores").select("profile_id, score").order("score", { ascending: false }); // Only need score & profile_id for rank
         if (rankError) throw rankError;
         const userRankIndex = allScores.findIndex(s => s.profile_id === currentUser.id); // Find first entry for user
         const rank = userRankIndex !== -1 ? userRankIndex + 1 : 0;
         document.getElementById("leaderboard-rank").textContent = rank > 0 ? `#${rank}` : "-";

     } catch (error) {
         console.error("Error loading profile stats:", error);
         document.getElementById("highest-score").textContent = "Err"; /* Update UI on error */
         document.getElementById("best-wpm").textContent = "Err";
         document.getElementById("games-played").textContent = "Err";
         document.getElementById("leaderboard-rank").textContent = "Err";
     }
 }

function fetchLeaderboard() {
    if (!supabase) return console.error("Supabase not initialized.");
    console.log("Fetching leaderboard...");
    const container = document.getElementById("leaderboard"); if (!container) return;
    const contentDivId = "leaderboard-content";

    // Ensure the container has the base structure
    container.innerHTML = `
        <div class="leaderboard-container">
           <button class="close-btn" onclick="showScreen('home-screen')">✕</button>
           <h2 class="leaderboard-title">LEADERBOARD</h2>
           <div class="leaderboard-header"><div>Rank</div><div>Player</div><div>Score</div><div>WPM</div></div>
           <div id="${contentDivId}" style="text-align:center; padding: 20px; color: #00f7ff;">Loading...</div>
        </div>`;
    // Back button is positioned relative to screen, managed by showScreen

    const content = document.getElementById(contentDivId);
    supabase.from("scores").select("score,wpm,username,profiles:profile_id(gaming_name)")
        .order("score", { ascending: false }).order("wpm", { ascending: false, nullsFirst: false }).limit(10)
        .then(({ data: scores, error }) => {
            if (error) { console.error("Error fetching leaderboard:", error); content.textContent = `Error: ${error.message}`; content.style.color = "#ff00ff"; return; }
            content.innerHTML = ""; content.style.textAlign = "left"; // Reset styles
            if (!scores?.length) { content.textContent = "No scores yet."; content.style.textAlign = "center"; return; }
            scores.forEach((scoreData, index) => {
               let displayName = scoreData.profiles?.gaming_name || scoreData.username || "Player";
               const item = document.createElement("div"); item.className = "leaderboard-item";
               item.innerHTML = `<div class="rank">#${index + 1}</div><div class="username">${displayName}</div><div class="score">${scoreData.score || 0}</div><div class="wpm">${scoreData.wpm || 0}</div>`;
               content.appendChild(item);
            });
        }).catch(fetchError => { console.error("Fetch Leaderboard Promise Catch:", fetchError); content.textContent = "Failed to load leaderboard."; content.style.color = "#ff00ff"; content.style.textAlign = "center";});
}

// --- Game Mechanics ---
 function initGame() {
     console.log("Initializing game state...");
     clearGameElements();
     score = 0; lives = 3; wordsTyped = 0; fallingObjects = []; activePowerups = [];
     gameStartTime = Date.now(); lastScoreBracket = -1; powerupSpawned = {};
     if (slowdownTimeout) clearTimeout(slowdownTimeout); slowdownTimeout = null; slowdownActive = false;
     if (pauseTimeout) clearTimeout(pauseTimeout); pauseTimeout = null; pauseActive = false;
     updateScore(); updateLives(); updateUIName(currentGamingName);
     document.getElementById("lives")?.style.setProperty("display", "flex", "important");
     document.getElementById("game-status")?.style.setProperty("display", "none", "important");
     console.log("Game state init complete for:", currentGamingName || (isGuest ? "Guest" : "Player"));
 }

 function clearGameElements() {
     const gameArea = document.querySelector(".game-area"); if (!gameArea) return;
     gameArea.querySelectorAll(".falling-object, .powerup, .score-popup, .powerup-effect").forEach(el => el.remove());
     fallingObjects = []; activePowerups = [];
     const wordInput = document.getElementById("word-input"); if (wordInput) wordInput.value = "";
 }

function updateScore() {
    document.getElementById("score")?.textContent = score;
    const gameDurationMinutes = (Date.now() - gameStartTime) / 60000;
    const currentWpm = (gameDurationMinutes > 0.05 && wordsTyped > 0) ? Math.round(wordsTyped / gameDurationMinutes) : 0;
    document.getElementById("wpm")?.textContent = currentWpm;
}

function updateLives() {
    const livesDisplay = document.getElementById("lives"); if (!livesDisplay) return;
    livesDisplay.innerHTML = ""; // Clear previous
    for (let i = 0; i < lives; i++) { const lifeElement = document.createElement('span'); lifeElement.className = 'life'; livesDisplay.appendChild(lifeElement); }
}

function gainLife() { if (lives < 3) { lives++; updateLives(); console.log("Gained life, lives =", lives); } else { console.log("Max lives reached."); /* score += 10; updateScore(); */ } }
function loseLife() { if (lives > 0) { lives--; updateLives(); console.log("Lost life, lives =", lives); } if (lives <= 0 && gameInterval) gameOver(); } // Only trigger game over if game is running

function spawnObject() {
    const gameArea = document.querySelector(".game-area"); if (!gameArea || pauseActive) return;
    const words = ["ACCESS","ADMIN","AUTH","BINARY","BUFFER","CACHE","CIPHER","CLIENT","CLOUD","CODE","COMPILER","CONNECT","CONSOLE","COOKIE","CORE","CRACK","CYBER","DATA","DEBUG","DECODE","DENIAL","DEVICE","DNS","DOMAIN","ENCRYPT","ERROR","EXPLOIT","FIREWALL","FRAMEWORK","GLITCH","GRID","HACK","HASH","HOST","INPUT","INSTALL","INTEL","KERNEL","KEY","LEAK","LINK","LOG","LOOP","MALWARE","MATRIX","MEMORY","MODEM","NET","NEURAL","NODE","NULL","PACKET","PATCH","PING","PIXEL","PORT","PROXY","QUERY","RAM","RENDER","ROOT","ROUTER","SCRIPT","SDK","SEGMENT","SERVER","SHELL","SOCKET","SOURCE","SPAM","STACK","STREAM","SYNTAX","SYSTEM","TABLE","TOKEN","TRACE","UPLOAD","URL","USER","VIRUS","VOID","WAREZ","WIRE","ZONE"];
    const word = words[Math.floor(Math.random() * words.length)];
    const areaWidth = gameArea.offsetWidth; const objectWidth = Math.max(100, word.length * 12);
    const x = Math.random() * Math.max(0, areaWidth - objectWidth);
    const element = document.createElement("div"); element.className = "falling-object";
    element.innerHTML = `<div class="shape">⬡</div><div class="word">${word}</div>`;
    element.style.position = "absolute"; element.style.left = x + "px"; element.style.top = "-100px"; element.style.width = `${objectWidth}px`; gameArea.appendChild(element);
    const baseMinSpeed = 1.5, baseMaxSpeed = 3.0, speedFactor = 0.009, maxSpeed = 8.0;
    const increase = score * speedFactor; const minSpeed = Math.min(baseMinSpeed + increase, maxSpeed - (baseMaxSpeed - baseMinSpeed));
    const maxSpeedNow = Math.min(baseMaxSpeed + increase, maxSpeed); let speed = minSpeed + Math.random() * (maxSpeedNow - minSpeed);
    const obj = { word, element, y: -100, speed, originalSpeed: speed };
    if (slowdownActive) obj.speed = obj.originalSpeed * 0.5;
    fallingObjects.push(obj);
}

 function removeObject(index) { if (index >= 0 && index < fallingObjects.length) { fallingObjects[index]?.element?.remove(); fallingObjects.splice(index, 1); } }

function checkAndSpawnObjects() {
    if (pauseActive) return;
    const maxObjects = Math.min(8, Math.floor(score / 50) + 2);
    const spawnProb = 1 - (fallingObjects.length / maxObjects);
    if (fallingObjects.length < maxObjects && Math.random() < spawnProb * 0.1) { spawnObject(); }
}

 function spawnPowerup() {
     if (score < 50 || pauseActive) return;
     const scoreBracket = Math.floor(score / 100);
     if (powerupSpawned[scoreBracket] || Math.random() > 0.03) return; // Spawn chance per frame
     powerupSpawned[scoreBracket] = true; // Once per bracket
     const types = ["extra-life", "slowdown", "pause", "destroy-all"]; const type = types[Math.floor(Math.random() * types.length)];
     const gameArea = document.querySelector(".game-area"); if (!gameArea) return;
     const x = Math.random() * (gameArea.offsetWidth - 60);
     const powerup = document.createElement("div"); powerup.className = `powerup ${type}`;
     powerup.textContent = {"extra-life":"❤️", "slowdown":"⏱️", "pause":"⏸️", "destroy-all":"💥"}[type];
     powerup.style.left = x + "px"; powerup.style.top = "-60px"; powerup.dataset.type = type;
     powerup.addEventListener("click", function() { activatePowerup(type); const index = activePowerups.findIndex(p => p.element === this); if (index !== -1) activePowerups.splice(index, 1); this.remove(); });
     gameArea.appendChild(powerup); activePowerups.push({ element: powerup, type: type, y: -60 });
     console.log(`Spawned powerup: ${type}`);
 }

 function activatePowerup(type) {
      const gameArea = document.querySelector(".game-area"); if (!gameArea) return;
      const effect = document.createElement("div"); effect.className = "powerup-effect";
      effect.textContent = {"extra-life": "LIFE+1", "slowdown": "SLOWDOWN!", "pause": "PAUSED!", "destroy-all": "CLEARED!"}[type];
      effect.style.color = {"extra-life": "#ff0000", "slowdown": "#00ffff", "pause": "#ffff00", "destroy-all": "#ff00ff"}[type];
      gameArea.appendChild(effect); setTimeout(() => effect.remove(), 1000);
      console.log(`Activating powerup: ${type}`);

      switch(type) {
          case "extra-life": gainLife(); break;
          case "slowdown":
               if (slowdownTimeout) clearTimeout(slowdownTimeout); slowdownActive = true;
               fallingObjects.forEach(obj => { if (!obj.originalSpeed) obj.originalSpeed = obj.speed; obj.speed = obj.originalSpeed * 0.5; });
               slowdownTimeout = setTimeout(() => { slowdownActive = false; fallingObjects.forEach(obj => { if (obj.originalSpeed) obj.speed = obj.originalSpeed; delete obj.originalSpeed; }); slowdownTimeout = null; console.log("Slowdown ended."); }, 10000);
               break;
          case "pause":
               if (!pauseActive && gameInterval) {
                  clearInterval(gameInterval); gameInterval = null; pauseActive = true;
                  pauseTimeout = setTimeout(() => { if (pauseActive) { gameInterval = setInterval(gameLoop, 50); pauseActive = false; pauseTimeout = null; console.log("Game resumed."); } }, 5000);
                  console.log("Game paused.");
               } else effect.remove();
               break;
          case "destroy-all":
               let points = 0;
               fallingObjects.slice().forEach(obj => {
                   points += (obj.word.length || 1);
                   showScorePopup(obj.element, points); // Use helper
                   const index = fallingObjects.indexOf(obj); if (index > -1) removeObject(index);
               });
               score += points; wordsTyped += fallingObjects.length; updateScore();
               console.log(`Destroy All: +${points} points`);
               break;
      }
 }

 function showScorePopup(targetElement, points) { // Helper for score popups
      if (!targetElement) return;
      const gameArea = document.querySelector(".game-area"); if (!gameArea) return;
      const popup = document.createElement("div"); popup.className = "score-popup"; popup.textContent = `+${points}`;
      popup.style.left = targetElement.style.left; popup.style.top = targetElement.style.top;
      gameArea.appendChild(popup); setTimeout(() => popup.remove(), 1000);
 }


 // --- Core Game Loop & Control ---
 function startGame() {
     if ((!isGuest && !currentGamingName) || (isGuest && !currentGamingName)) { console.error("StartGame called but name not set."); showGamingNameModal(false); return; }
     initGame(); console.log("Starting game...");
     if (gameInterval) clearInterval(gameInterval);
     spawnObject(); setTimeout(spawnObject, 1500 + Math.random() * 1000); // Spawn second after delay
     gameInterval = setInterval(gameLoop, 50); // Use named loop function
     console.log("Game loop started. Interval ID:", gameInterval);
     document.getElementById("word-input")?.focus();
     document.getElementById("game-status")?.style.setProperty("display", "none", "important");
 }

 function gameLoop() { // Encapsulate the loop logic
     if (!pauseActive) { updateGame(); checkAndSpawnObjects(); spawnPowerup(); }
 }

 function updateGame() {
     const gameArea = document.querySelector(".game-area"); if (!gameArea) return;
     const h = gameArea.offsetHeight, boundary = h - 60; // Y-coord where words are missed

     // Update words
     for (let i = fallingObjects.length - 1; i >= 0; i--) {
         const obj = fallingObjects[i]; if (!obj?.element) { removeObject(i); continue; }
         obj.y += obj.speed; obj.element.style.top = obj.y + "px";
         if (obj.y > boundary) { /* console.log(`Word '${obj.word}' missed`); */ removeObject(i); loseLife(); }
     }
     // Update powerups
     for (let i = activePowerups.length - 1; i >= 0; i--) {
         const p = activePowerups[i]; if (!p?.element) { activePowerups.splice(i, 1); continue; }
         p.y += 1.5; p.element.style.top = p.y + "px";
         if (p.y > h) { p.element.remove(); activePowerups.splice(i, 1); }
     }
 }

 async function gameOver() { // Made async
     console.log("Game Over!");
     if (gameInterval) clearInterval(gameInterval); gameInterval = null;
     if (slowdownTimeout) clearTimeout(slowdownTimeout); slowdownTimeout = null; slowdownActive = false;
     if (pauseTimeout) clearTimeout(pauseTimeout); pauseTimeout = null; pauseActive = false;

     const gameDurationMinutes = (Date.now() - gameStartTime) / 60000;
     const finalWpm = (gameDurationMinutes > 0.05 && wordsTyped > 0) ? Math.round(wordsTyped / gameDurationMinutes) : 0;
     document.getElementById("final-score")?.textContent = score;
     document.getElementById("typing-speed")?.textContent = finalWpm;

     // Display Game Over message in game area
     document.getElementById("game-status")?.style.setProperty("display", "block", "important");

     clearGameElements(); // Clear falling items visually

     // Attempt score saving - handles guest/auth logic inside
     await saveScore(score, finalWpm);

     showScreen("end-screen");
 }

function restartGame() { console.log("Restarting game..."); showScreen('game-screen'); }

 // =======================================================
 // ===== CORRECTED saveScore Function Starts =====
 // =======================================================
 async function saveScore(finalScore, finalWpm) { // Use distinct arg names
   try {
     if (isGuest) {
       console.log(`Guest score: ${finalScore}, WPM: ${finalWpm}. Not saving.`);
       // fetchLeaderboard(); // Refresh anyway? Optional.
       return; // IMPORTANT: Exit for guests
     }
     if (!currentUser?.id) { console.error("Save Error: Not logged in."); alert("Log in to save score."); return; }
     if (!currentGamingName) { console.error("Save Error: Gaming name not set."); alert("Set gaming name in profile to save score."); return; }

     console.log(`Saving score via Edge Function for ${currentUser.id}: ${finalScore} score, ${finalWpm} WPM`);
     const { data, error } = await supabase.functions.invoke('submit-score', {
       body: JSON.stringify({ score: finalScore, wpm: finalWpm }) // Send correct data
     });

     if (error) { console.error('Edge Function invocation error:', error); alert(`Save failed: ${error.message || 'Unknown function error'}`); }
     else { console.log('Edge Function success:', data); alert(data?.message || "Score saved!"); }

   } catch (invokeError) { console.error("Exception during function invocation:", invokeError); alert("Unexpected error saving score."); }
   finally { fetchLeaderboard(); } // Always refresh leaderboard after attempt
 }
 // =======================================================
 // ===== CORRECTED saveScore Function Ends =====
 // =======================================================

 // --- Event Listeners and Initial Load ---
 // Use DOMContentLoaded to ensure elements exist before attaching listeners
 document.addEventListener("DOMContentLoaded", () => {
   if (!supabase) { console.error("DOM loaded but Supabase client is not initialized."); return; }
   console.log("DOM Loaded. Attaching listeners and checking auth.");

   // --- Input Listener ---
   const wordInputEl = document.getElementById("word-input");
   if (wordInputEl) {
       wordInputEl.addEventListener("input", (e) => {
           if (pauseActive) { e.target.value = ""; return; }
           const text = e.target.value.toUpperCase(); if (!text) return;
           let lowestMatchIndex = -1, lowestMatchY = -1;
           fallingObjects.forEach((obj, i) => { if (text === obj.word && obj.y > lowestMatchY) { lowestMatchY = obj.y; lowestMatchIndex = i; } });
           if (lowestMatchIndex !== -1) {
               const obj = fallingObjects[lowestMatchIndex]; const points = obj.word.length;
               score += points; wordsTyped++; updateScore();
               showScorePopup(obj.element, points); removeObject(lowestMatchIndex);
               if (score > 0 && score % 50 === 0) gainLife(); // Life gain check
               e.target.value = ""; // Clear input on match
           }
       });
       wordInputEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.value) e.target.value = ""; }); // Clear incorrect on Enter
   } else { console.error("Word input element not found."); }

   // --- Global Key Listener ---
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            const activeScreen = document.querySelector('.screen.active');
            const modalActive = document.getElementById('gaming-name-modal')?.classList.contains('active');
            if (modalActive) closeGamingNameModal();
            else if (document.getElementById('game-screen')?.classList.contains('active')) showScreen('home-screen');
            else if (activeScreen && activeScreen.id !== 'home-screen') showScreen('home-screen');
        }
    });

   // --- Initial Auth Check & State Listener ---
   checkAuth().then(() => { console.log("Initial auth check complete after DOM load."); if (!document.querySelector('.screen.active')) showScreen("home-screen"); });
   supabase.auth.onAuthStateChange((event, session) => {
       console.log("Auth state changed:", event, session?.user?.email || "No user");
       checkAuth(); // Re-run checkAuth to update UI and state based on any change
       // If signing out, checkAuth handles redirecting home if necessary
       if (event === 'SIGNED_OUT' && !document.getElementById('home-screen')?.classList.contains('active')) { showScreen('home-screen'); }
       // Optionally handle SIGNED_IN event specifically if needed (e.g., check for profile)
       if (event === 'SIGNED_IN') { checkGamingName(); } // Ensure name check happens after sign in confirms user
   });

   console.log("Game setup and event listeners initialized.");
 }); // End DOMContentLoaded