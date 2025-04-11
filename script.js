// --- Constants ---
const HOME_SCREEN_ID = "home-screen";
const GAME_SCREEN_ID = "game-screen";
const LEADERBOARD_SCREEN_ID = "leaderboard-screen";
const PROFILE_SCREEN_ID = "profile-screen";
const END_SCREEN_ID = "end-screen";
const GAMING_NAME_MODAL_ID = "gaming-name-modal";

const LOGIN_BTN_ID = "login-btn";
const PROFILE_BTN_ID = "profile-btn";
const LOGOUT_BTN_ID = "logout-btn";
const GUEST_BTN_ID = "guest-btn";
const PLAY_BTN_ID = "play-btn";
const LEADERBOARD_BTN_ID = "leaderboard-btn"; // Assuming this exists for consistency
const CLOSE_MODAL_BTN_ID = "close-modal-btn";
const SUBMIT_NAME_BTN_ID = "submit-name-btn";
const PROFILE_CLOSE_BTN_ID = "profile-close-btn";
const CHANGE_NAME_BTN_ID = "change-name-btn";
const PROFILE_BACK_BTN_ID = "profile-back-btn"; // Assuming this exists
const GAME_CLOSE_BTN_ID = "game-close-btn";
const RESTART_BTN_ID = "restart-btn";
const END_LEADERBOARD_BTN_ID = "end-leaderboard-btn";
const END_HOME_BTN_ID = "end-home-btn";
const LEADERBOARD_CLOSE_BTN_ID = "leaderboard-close-btn";
const LEADERBOARD_BACK_BTN_ID = "leaderboard-back-btn";

const GAMING_NAME_INPUT_ID = "gaming-name-input";
const WORD_INPUT_ID = "word-input";
const CURRENT_GAMING_NAME_ID = "current-gaming-name";
const PLAYER_NAME_ID = "player-name"; // In-game display
const HIGHEST_SCORE_ID = "highest-score";
const BEST_WPM_ID = "best-wpm";
const GAMES_PLAYED_ID = "games-played";
const LEADERBOARD_RANK_ID = "leaderboard-rank";
const SCORE_ID = "score";
const WPM_ID = "wpm";
const LIVES_ID = "lives";
const GAME_STATUS_ID = "game-status";
const FINAL_SCORE_ID = "final-score";
const TYPING_SPEED_ID = "typing-speed";
const LEADERBOARD_CONTAINER_ID = "leaderboard-container-dynamic";
const GAMING_NAME_ERROR_ID = "gaming-name-error"; // Add this element to your modal HTML

const GAME_AREA_SELECTOR = ".game-area";
const SCREEN_SELECTOR = ".screen";
const DYNAMIC_GAME_ITEM_SELECTOR =
  ".falling-object, .powerup, .score-popup, .powerup-effect";

const MAX_LIVES = 3;
const NAME_CHANGE_LIMIT = 3;
const SCORE_THRESHOLD_LIFE_GAIN = 50;
const MIN_WPM_DURATION_SEC = 3;
const SLOWDOWN_DURATION_MS = 10000;
const PAUSE_DURATION_MS = 5000;
const GAME_LOOP_INTERVAL_MS = 50; // ~20 FPS

// --- Global state variables ---
let supabase;
let currentUser = null;
let currentGamingName = null;
let isGuest = false;
let gameInterval = null;
let gameStartTime = null;
let score = 0;
let lives = MAX_LIVES;
let wordsTyped = 0;
let fallingObjects = [];
let activePowerups = [];
let lastScoreBracket = -1;
let powerupSpawned = {};
let slowdownTimeout = null;
let slowdownActive = false;
let pauseTimeout = null;
let pauseActive = false;
let isInitialized = false;

// --- Cached DOM Elements (Initialized in DOMContentLoaded) ---
let loginBtnEl, profileBtnEl, logoutBtnEl, guestBtnEl;
let wordInputEl; // Game input

// --- Initialization ---
async function initializeSupabase() {
  console.log(">>> initializeSupabase START");
  try {
    if (!window.supabase?.createClient)
      throw new Error("Supabase library not loaded.");
    console.log(">>> Fetching config...");
    const response = await fetch(
      "https://ikbnuqabgdgikorhipnm.functions.supabase.co/auth-config"
    ); // Consider making URL a const
    console.log(">>> Config fetch status:", response.status);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(">>> Failed config fetch response text:", errorText);
      throw new Error(`Failed config fetch - Status: ${response.status}`);
    }
    const config = await response.json();
    console.log(">>> Config received.");
    if (!config.supabaseUrl || !config.supabaseAnonKey)
      throw new Error("Config missing URL or Key.");

    console.log(">>> Creating client...");
    const { createClient } = window.supabase;
    supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
    console.log(">>> Supabase client CREATED.");

    console.log(">>> Adding onAuthStateChange listener...");
    supabase.auth.onAuthStateChange(handleAuthStateChange);
    console.log(">>> Listener added.");

    console.log(">>> Running initial checkAuth...");
    await checkAuth();
    console.log(">>> Initial checkAuth finished.");

    isInitialized = true;
    console.log(">>> initializeSupabase COMPLETE.");
  } catch (error) {
    handleInitializationError(error);
  }
}

function handleAuthStateChange(event, session) {
  const userEmail = session?.user?.email || "No user";
  console.log(`>>> Auth state changed: ${event}, User: ${userEmail}`);
  checkAuth(); // Re-run checks on any auth change
}

function handleInitializationError(error) {
  console.error(">>> FATAL ERROR in initializeSupabase:", error);
  const errorDiv = document.createElement("div");
  errorDiv.style.cssText =
    "color: red; padding: 20px; font-size: 1.5em; text-align: center; position: fixed; top: 0; left: 0; width: 100%; background: white; z-index: 1000;";
  errorDiv.textContent = `Error initializing: ${error.message}. Check console.`;
  document.body.prepend(errorDiv);
  // Prevent further script execution that relies on Supabase
  isInitialized = false; // Explicitly set flag
  throw new Error("Stopping script execution due to init failure."); // Re-throw
}

function ensureInitialized() {
  if (!isInitialized) {
    console.error("Check: Supabase not initialized. Function call blocked.");
    return false;
  }
  return true;
}

// --- UI Navigation & State ---
async function showScreen(screenId) {
  if (!isInitialized && screenId !== HOME_SCREEN_ID) {
    console.warn(`showScreen(${screenId}) blocked: Not initialized.`);
    return;
  }
  console.log("Showing screen:", screenId);
  document
    .querySelectorAll(SCREEN_SELECTOR)
    .forEach((s) => s.classList.remove("active"));

  if (gameInterval && screenId !== GAME_SCREEN_ID) stopGameCleanup();

  const targetScreen = document.getElementById(screenId);
  if (targetScreen) {
    targetScreen.classList.add("active");
    console.log(`Screen ${screenId} activated.`);
    await runScreenActions(screenId); // Run actions after activating screen
  } else {
    console.error("Screen element not found:", screenId, "Fallback home.");
    document.getElementById(HOME_SCREEN_ID)?.classList.add("active");
  }
}

function stopGameCleanup() {
  console.log("Navigating away, stopping game interval and timers.");
  clearInterval(gameInterval);
  gameInterval = null;
  if (slowdownTimeout) clearTimeout(slowdownTimeout);
  if (pauseTimeout) clearTimeout(pauseTimeout);
  slowdownActive = false;
  pauseActive = false;
  slowdownTimeout = null;
  pauseTimeout = null;
  clearGameElements();
}

async function runScreenActions(screenId) {
  console.log(`Running actions for screen: ${screenId}`);
  const backButton = document.getElementById(LEADERBOARD_BACK_BTN_ID); // Cache if used more

  try {
    switch (screenId) {
      case PROFILE_SCREEN_ID:
        if (currentUser) {
          console.log("Loading profile stats...");
          await Promise.all([loadProfileStats(), checkGamingName()]); // Load concurrently
        } else {
          console.warn("Profile screen requested, no user. Redirect home.");
          showScreen(HOME_SCREEN_ID);
        }
        break;
      case LEADERBOARD_SCREEN_ID:
        console.log("Fetching leaderboard...");
        await fetchLeaderboard();
        if (backButton)
          backButton.style.setProperty("display", "block", "important");
        break;
      case GAME_SCREEN_ID:
        console.log("Checking conditions to start game...");
        handleGameScreenEntry();
        break;
      case HOME_SCREEN_ID:
        console.log("Refreshing auth state for home screen...");
        await checkAuth(); // Refresh UI state
        if (backButton)
          backButton.style.setProperty("display", "none", "important");
        break;
      case END_SCREEN_ID:
        console.log("End screen shown.");
        if (backButton)
          backButton.style.setProperty("display", "none", "important");
        break;
      default:
        console.log(`No specific actions for screen: ${screenId}`);
        if (backButton)
          backButton.style.setProperty("display", "none", "important");
    }
  } catch (error) {
    console.error(`Error during actions for showScreen(${screenId}):`, error);
  }
  console.log(`Finished actions for screen: ${screenId}`);
}

function handleGameScreenEntry() {
  if ((isGuest && currentGamingName) || (currentUser && currentGamingName)) {
    console.log("Conditions met, starting game...");
    startGame();
  } else {
    console.log("Cannot start game: Name not set.");
    if (!isGuest && currentUser) showGamingNameModal(false);
    else if (isGuest && !currentGamingName) showGamingNameModal(false);
    else showScreen(HOME_SCREEN_ID); // Go home if not logged in/guest
  }
}

// --- Authentication & User Flow ---
function playAsGuest() {
  console.log("Playing as guest");
  isGuest = true;
  currentUser = null;
  currentGamingName = null;
  updateUIName(null);
  showGamingNameModal(false); // Show modal for guest name entry
}

async function signInWithGoogle() {
  // Made async
  if (!ensureInitialized()) return;
  console.log("Attempting Google Sign-In (forcing account selection)...");
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.href,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) throw error; // Let catch block handle
    console.log("Google Sign-In process initiated, redirect should occur.");
  } catch (error) {
    console.error("Error initiating Google Sign-In:", error);
    alert(`Google Sign-In failed: ${error.message}`);
  }
}

async function logout() {
  // Made async
  if (!ensureInitialized()) return;
  console.log("Logging out...");
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error; // Let catch block handle
    console.log("Sign out successful.");
    // Clear local state immediately
    currentUser = null;
    currentGamingName = null;
    isGuest = false;
    updateUIName(null);
    // checkAuth listener will handle UI updates and redirect if necessary
  } catch (error) {
    console.error("Error during sign out:", error);
    alert(`Logout failed: ${error.message}`);
  }
}

async function checkAuth() {
  if (!supabase) {
    console.log("checkAuth called early.");
    updateAuthUI(false); // Update to logged-out state
    return false;
  }
  console.log("checkAuth: Checking session...");
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error)
      console.error("checkAuth: Error getting session:", error.message); // Log but continue

    const user = session?.user;
    updateAuthUI(!!user); // Update UI based on whether user exists

    if (user) {
      if (currentUser?.id !== user.id)
        console.log("checkAuth: User state updated.");
      currentUser = user;
      isGuest = false;
      await checkGamingName(); // Check name only if user is confirmed
      return true;
    } else {
      if (currentUser) console.log("checkAuth: User logged out.");
      currentUser = null;
      currentGamingName = null; // Clear user details
      // Don't automatically turn off guest mode on logout
      updateUIName(null);
      return false;
    }
  } catch (error) {
    console.error("checkAuth: FATAL Error:", error);
    updateAuthUI(false); // Force logged out UI on error
    currentUser = null;
    isGuest = false;
    currentGamingName = null;
    updateUIName(null);
    return false;
  }
}

// Helper to centralize Auth UI updates
function updateAuthUI(isUserLoggedIn) {
  // Use cached elements if available, otherwise get them
  const login = loginBtnEl || document.getElementById(LOGIN_BTN_ID);
  const profile = profileBtnEl || document.getElementById(PROFILE_BTN_ID);
  const logout = logoutBtnEl || document.getElementById(LOGOUT_BTN_ID);
  const guest = guestBtnEl || document.getElementById(GUEST_BTN_ID);

  const loggedInDisplay = isUserLoggedIn ? "block" : "none";
  const loggedOutDisplay = isUserLoggedIn ? "none" : "block";

  if (login) login.style.display = loggedOutDisplay;
  if (guest) guest.style.display = loggedOutDisplay; // Show guest button only when logged out
  if (profile) profile.style.display = loggedInDisplay;
  if (logout) logout.style.display = loggedInDisplay;
}

// --- Gaming Name Handling ---
function validateGamingName(name) {
  if (!name || name.trim() === "")
    return { valid: false, message: "Name required" };
  let sanitized = name.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (sanitized.length < 3)
    return { valid: false, message: "Min 3 chars (a-z, 0-9, _)" };
  if (sanitized.length > 15) sanitized = sanitized.substring(0, 15);
  if (
    sanitized !==
    name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .substring(0, 15)
  ) {
    console.warn(`Name sanitized: '${name}' -> '${sanitized}'`);
  }
  return { valid: true, message: "", sanitized };
}

function canChangeGamingName() {
  if (!currentUser) return true; // Should be blocked elsewhere if no user
  const today = new Date().toISOString().split("T")[0];
  const key = `nameChanges_${currentUser.id}_${today}`;
  const changesMade = parseInt(localStorage.getItem(key) || "0");
  console.log(`Name change check: ${changesMade}/${NAME_CHANGE_LIMIT} used.`);
  return changesMade < NAME_CHANGE_LIMIT;
}

function incrementNameChangeCounter() {
  if (!currentUser) return;
  const today = new Date().toISOString().split("T")[0];
  const key = `nameChanges_${currentUser.id}_${today}`;
  const count = parseInt(localStorage.getItem(key) || "0");
  const newCount = count + 1;
  localStorage.setItem(key, newCount.toString());
  const remaining = Math.max(0, NAME_CHANGE_LIMIT - newCount);
  console.log(`Name changes used today: ${newCount}. Remaining: ${remaining}.`);
  // Maybe use a less intrusive notification than alert
  // showTemporaryMessage(`Name updated! ${remaining} changes left today.`);
}

function showGamingNameModal(isUpdate = false) {
  const modal = document.getElementById(GAMING_NAME_MODAL_ID);
  if (!modal) return console.error("Gaming name modal element missing!");
  if (isUpdate && !currentUser) return alert("Log in to change name.");
  if (isUpdate && currentGamingName && !canChangeGamingName())
    return alert("Daily name change limit reached.");

  console.log("Showing gaming name modal, isUpdate:", isUpdate);
  modal.classList.add("active");
  modal.dataset.isProfileUpdate = isUpdate ? "true" : "false";
  const inputField = document.getElementById(GAMING_NAME_INPUT_ID);
  if (inputField) {
    inputField.value = isUpdate && currentGamingName ? currentGamingName : "";
    setTimeout(() => {
      inputField.focus();
      inputField.select();
    }, 150);
  } else console.error("Gaming name input missing!");
}

function closeGamingNameModal() {
  const modal = document.getElementById(GAMING_NAME_MODAL_ID);
  if (!modal) return console.error("Gaming name modal element missing!");
  modal.classList.remove("active");
  console.log("Gaming name modal closed.");
  // Handle cancellation logic
  if (
    isGuest &&
    !currentGamingName &&
    modal.dataset.isProfileUpdate === "false"
  ) {
    isGuest = false;
    updateUIName(null);
    showScreen(HOME_SCREEN_ID);
  } else if (
    !isGuest &&
    currentUser &&
    !currentGamingName &&
    modal.dataset.isProfileUpdate === "false"
  ) {
    showScreen(HOME_SCREEN_ID);
  }
}

async function checkGamingName() {
  if (!currentUser?.id) {
    updateUIName(null);
    return null;
  }
  console.log(`checkGamingName: Checking for user ${currentUser.id}`);
  try {
    const { data, error, status } = await supabase
      .from("profiles")
      .select("gaming_name")
      .eq("id", currentUser.id)
      .single();
    if (error && status !== 406) throw error; // Rethrow actual errors
    currentGamingName = data?.gaming_name || null;
    console.log(`checkGamingName: Found name: ${currentGamingName}`);
    updateUIName(currentGamingName);
    return currentGamingName;
  } catch (error) {
    console.error("checkGamingName: Error fetching profile:", error);
    currentGamingName = null;
    updateUIName("Error");
    return null;
  }
}

function updateUIName(name) {
  console.log(`updateUIName: Setting name: ${name}`);
  const profileNameEl = document.getElementById(CURRENT_GAMING_NAME_ID);
  const gameNameEl = document.getElementById(PLAYER_NAME_ID);
  const displayName =
    name || (isGuest ? "Guest" : currentUser ? "Not Set" : "Player");
  if (profileNameEl) profileNameEl.textContent = name || "Not Set";
  if (gameNameEl) gameNameEl.textContent = displayName;
}

async function submitGamingName() {
  if (!ensureInitialized()) return;
  console.log("submitGamingName triggered.");

  const modal = document.getElementById(GAMING_NAME_MODAL_ID);
  const input = document.getElementById(GAMING_NAME_INPUT_ID);
  const errorMsgEl = document.getElementById(GAMING_NAME_ERROR_ID);

  if (errorMsgEl) errorMsgEl.textContent = "";
  if (!modal || !input) return console.error("Submit name elements missing.");

  const validation = validateGamingName(input.value);
  if (!validation.valid) {
    if (errorMsgEl) errorMsgEl.textContent = validation.message;
    else alert(validation.message);
    input.focus();
    return;
  }
  const gamingName = validation.sanitized;
  const isUpdate = modal.dataset.isProfileUpdate === "true";
  console.log(`Validated name: ${gamingName}, isUpdate: ${isUpdate}`);

  if (currentUser) {
    console.log("Submitting as logged-in user.");
    if (isUpdate && gamingName === currentGamingName)
      return alert("Name unchanged.");
    if (isUpdate && !canChangeGamingName())
      return alert("Daily change limit reached.");

    console.log("Checking auth state before DB...");
    const {
      data: { user: userCheck },
      error: getUserError,
    } = await supabase.auth.getUser();
    if (getUserError || !userCheck) return alert("Auth error. Try re-login.");
    const userIdToUse = userCheck.id;
    console.log(`Confirmed User ID: ${userIdToUse}`);

    try {
      console.log("Checking if name is taken...");
      const { data: existing, error: checkErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("gaming_name", gamingName)
        .neq("id", userIdToUse)
        .limit(1);
      if (checkErr)
        throw new Error(`DB error checking name: ${checkErr.message}`);
      if (existing?.length > 0) return alert("Name taken.");

      console.log(`Upserting profile...`);
      const { data: upsertData, error: upsertErr } = await supabase
        .from("profiles")
        .upsert(
          {
            id: userIdToUse,
            gaming_name: gamingName,
            username: gamingName,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        ) // Added username based on previous error
        .select("gaming_name")
        .single();
      if (upsertErr) throw new Error(`Failed to save: ${upsertErr.message}`);

      console.log("Upsert successful:", upsertData);
      const previousName = currentGamingName;
      currentGamingName = upsertData.gaming_name;
      updateUIName(currentGamingName);
      if (isUpdate && currentGamingName !== previousName)
        incrementNameChangeCounter();
      else if (isUpdate) alert("Name saved.");

      modal.classList.remove("active");
      input.value = "";
      if (!isUpdate) showScreen(GAME_SCREEN_ID);
      else loadProfileStats();
    } catch (error) {
      console.error("submitGamingName DB error:", error);
      if (errorMsgEl) errorMsgEl.textContent = error.message;
      else alert(error.message);
    }
  } else if (isGuest) {
    console.log("Submitting as guest.");
    currentGamingName = gamingName;
    updateUIName(currentGamingName);
    modal.classList.remove("active");
    input.value = "";
    showScreen(GAME_SCREEN_ID);
  } else console.error("Submit called without user/guest state.");
}

// --- Profile & Leaderboard Data ---
async function loadProfileStats() {
  if (!ensureInitialized() || !currentUser?.id) {
    console.log("Cannot load stats: No user/init.");
    // Clear/reset stats UI if needed
    document.getElementById(CURRENT_GAMING_NAME_ID).textContent = "N/A";
    [
      HIGHEST_SCORE_ID,
      BEST_WPM_ID,
      GAMES_PLAYED_ID,
      LEADERBOARD_RANK_ID,
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = "-";
    });
    return;
  }
  console.log(`Loading profile stats for: ${currentUser.id}`);
  // Set loading state
  document.getElementById(CURRENT_GAMING_NAME_ID).textContent =
    currentGamingName || "Loading...";
  [HIGHEST_SCORE_ID, BEST_WPM_ID, GAMES_PLAYED_ID, LEADERBOARD_RANK_ID].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = "Loading...";
    }
  );

  try {
    const { data: userScores, error: scoreError } = await supabase
      .from("scores")
      .select("score, wpm")
      .eq("profile_id", currentUser.id);
    if (scoreError) throw scoreError;

    const scores = userScores || []; // Handle null case
    const highestScore =
      scores.length > 0 ? Math.max(...scores.map((s) => s.score || 0)) : 0;
    const bestWPM =
      scores.length > 0 ? Math.max(...scores.map((s) => s.wpm || 0)) : 0;
    const gamesPlayed = scores.length;

    document.getElementById(HIGHEST_SCORE_ID).textContent = highestScore;
    document.getElementById(BEST_WPM_ID).textContent = bestWPM;
    document.getElementById(GAMES_PLAYED_ID).textContent = gamesPlayed;
    console.log(
      `Basic stats loaded - Score: ${highestScore}, WPM: ${bestWPM}, Played: ${gamesPlayed}`
    );

    console.log("Fetching rank..."); // Consider making rank fetching optional or cached
    const { data: rankedScores, error: rankError } = await supabase
      .from("scores")
      .select("profile_id, score")
      .order("score", { ascending: false })
      .order("wpm", { ascending: false });
    if (rankError) throw rankError;

    const userRankIndex = (rankedScores || []).findIndex(
      (s) => s.profile_id === currentUser.id
    );
    const rank = userRankIndex !== -1 ? userRankIndex + 1 : 0;
    document.getElementById(LEADERBOARD_RANK_ID).textContent =
      rank > 0 ? `#${rank}` : "Unranked";
    console.log(`Rank calculated: ${rank > 0 ? "#" + rank : "Unranked"}`);
  } catch (error) {
    console.error("Error loading profile stats:", error);
    [
      HIGHEST_SCORE_ID,
      BEST_WPM_ID,
      GAMES_PLAYED_ID,
      LEADERBOARD_RANK_ID,
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = "Error";
    });
  } finally {
    document.getElementById(CURRENT_GAMING_NAME_ID).textContent =
      currentGamingName || "Not Set";
    console.log("Profile stats loading finished.");
  }
}

async function fetchLeaderboard() {
  // Made async to match others
  if (!ensureInitialized())
    return console.error("Leaderboard: Supabase not init.");
  console.log("Fetching leaderboard (SELECT)...");
  const container = document.getElementById(LEADERBOARD_CONTAINER_ID);
  if (!container) return console.error("Leaderboard container missing!");
  container.innerHTML = `<div style="text-align:center; padding: 20px;">Loading...</div>`; // Simplified loading

  try {
    const { data: scores, error } = await supabase
      .from("scores")
      .select(`score, wpm, profiles ( gaming_name )`)
      .order("score", { ascending: false })
      .order("wpm", { ascending: false })
      .limit(10);
    if (error) throw error;

    container.innerHTML = ""; // Clear loading

    if (!scores || scores.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 20px;">No scores yet.</div>`;
      return console.log("Leaderboard empty.");
    }

    console.log("Leaderboard data received:", scores);
    scores.forEach((scoreData, index) => {
      let displayName = scoreData.profiles?.gaming_name || "Player"; // Use optional chaining safely
      const item = document.createElement("div");
      item.className = "leaderboard-item"; // Use this class for styling rows
      item.innerHTML = `
              <div class="rank">#${index + 1}</div>
              <div class="username">${displayName}</div>
              <div class="score">${scoreData.score || 0}</div>
              <div class="wpm">${scoreData.wpm || 0}</div>`;
      container.appendChild(item);
    });
    console.log("Leaderboard display updated.");
  } catch (error) {
    console.error("Error fetching leaderboard (SELECT):", error);
    container.innerHTML = `<div style="text-align:center; padding: 20px; color: red;">Error: ${error.message}</div>`;
  }
}

// --- Game Mechanics ---
function initGame() {
  console.log("Initializing game state...");
  clearGameElements();
  score = 0;
  lives = MAX_LIVES;
  wordsTyped = 0;
  fallingObjects = [];
  activePowerups = [];
  gameStartTime = Date.now();
  lastScoreBracket = -1;
  powerupSpawned = {};

  if (slowdownTimeout) clearTimeout(slowdownTimeout);
  if (pauseTimeout) clearTimeout(pauseTimeout);
  if (gameInterval) clearInterval(gameInterval);
  slowdownTimeout = null;
  slowdownActive = false;
  pauseTimeout = null;
  pauseActive = false;
  gameInterval = null;

  updateScore();
  updateLives();
  updateUIName(currentGamingName);
  document
    .getElementById(LIVES_ID)
    ?.style.setProperty("display", "flex", "important");
  document
    .getElementById(GAME_STATUS_ID)
    ?.style.setProperty("display", "none", "important");
  document.getElementById(WORD_INPUT_ID)?.focus();
  console.log(
    "Game state initialized for:",
    currentGamingName || (isGuest ? "Guest" : "Player")
  );
}

function clearGameElements() {
  console.log("Clearing game elements...");
  const gameArea = document.querySelector(GAME_AREA_SELECTOR);
  if (!gameArea) return console.error("Game area not found!");
  gameArea
    .querySelectorAll(DYNAMIC_GAME_ITEM_SELECTOR)
    .forEach((el) => el.remove());
  fallingObjects = [];
  activePowerups = [];
  const wordInput = document.getElementById(WORD_INPUT_ID);
  if (wordInput) wordInput.value = "";
}

function updateScore() {
  document.getElementById(SCORE_ID).textContent = score;
  let currentWpm = 0;
  if (gameStartTime && wordsTyped > 0) {
    const elapsedSeconds = (Date.now() - gameStartTime) / 1000;
    if (elapsedSeconds >= MIN_WPM_DURATION_SEC) {
      currentWpm = Math.round(wordsTyped / (elapsedSeconds / 60));
    }
  }
  document.getElementById(WPM_ID).textContent = currentWpm;
}

function updateLives() {
  const livesDisplay = document.getElementById(LIVES_ID);
  if (!livesDisplay) return console.error("Lives display missing!");
  livesDisplay.innerHTML = ""; // Clear
  console.log(`Updating lives display: ${lives}/${MAX_LIVES}`);
  for (let i = 0; i < lives; i++) {
    const lifeElement = document.createElement("span");
    lifeElement.className = "life";
    lifeElement.textContent = "❤️";
    livesDisplay.appendChild(lifeElement);
  }
}

function gainLife() {
  if (lives < MAX_LIVES) {
    lives++;
    updateLives();
    console.log("Gained life, lives =", lives);
  } else console.log("Max lives reached.");
}

function loseLife() {
  if (lives > 0) {
    lives--;
    updateLives();
    console.log("Lost life, lives =", lives);
  }
  if (lives <= 0 && gameInterval) gameOver();
}

function spawnObject() {
  const gameArea = document.querySelector(GAME_AREA_SELECTOR);
  if (!gameArea || pauseActive) return;
  // Consider making words list a const at the top
  const words = ["ACCESS", "ADMIN", "AUTH" /* ...rest of words... */, , "ZONE"];
  if (!words?.length) return console.error("Word list empty!");
  const word = words[Math.floor(Math.random() * words.length)];
  const areaWidth = gameArea.offsetWidth;
  const objectWidth = Math.max(80, word.length * 10 + 20);
  const x = Math.random() * Math.max(0, areaWidth - objectWidth);

  const element = document.createElement("div");
  element.className = "falling-object";
  element.innerHTML = `<div class="shape">⬡</div><div class="word">${word}</div>`; // Assuming safe HTML
  element.style.cssText = `position:absolute; left:${x}px; top:-100px; width:${objectWidth}px; text-align:center;`;
  gameArea.appendChild(element);

  // Speed calculation (keep as is or simplify if desired)
  const baseMin = 1.5,
    baseMax = 3.0,
    factor = 0.009,
    maxSpeed = 8.0;
  const increase = score * factor;
  const minSpeed = Math.min(baseMin + increase, maxSpeed - (baseMax - baseMin));
  const maxSpeedNow = Math.min(baseMax + increase, maxSpeed);
  let speed = minSpeed + Math.random() * (maxSpeedNow - minSpeed);

  const obj = { word, element, y: -100, speed, originalSpeed: speed };
  if (slowdownActive) obj.speed = obj.originalSpeed * 0.5;
  fallingObjects.push(obj);
}

function removeObject(index) {
  if (index >= 0 && index < fallingObjects.length) {
    fallingObjects[index]?.element?.remove(); // Safely remove element
    fallingObjects.splice(index, 1);
  }
}

function checkAndSpawnObjects() {
  if (pauseActive) return;
  const baseMax = 2,
    increasePer = 1,
    absoluteMax = 8;
  const maxObjects = Math.min(
    absoluteMax,
    baseMax + Math.floor(score / SCORE_THRESHOLD_LIFE_GAIN) * increasePer
  ); // Use constant
  if (fallingObjects.length < maxObjects) {
    const spawnProb = (1 - fallingObjects.length / maxObjects) * 0.1; // Adjust base prob 0.1
    if (Math.random() < spawnProb) spawnObject();
  }
}

function spawnPowerup() {
  if (
    score < SCORE_THRESHOLD_LIFE_GAIN ||
    pauseActive ||
    activePowerups.length > 2
  )
    return;
  const scoreBracket = Math.floor(score / 100); // Spawn attempt per 100 points
  if (powerupSpawned[scoreBracket] || Math.random() > 0.02) return; // 2% chance
  powerupSpawned[scoreBracket] = true;

  const gameArea = document.querySelector(GAME_AREA_SELECTOR);
  if (!gameArea) return console.error("Spawn powerup: Game area missing!");

  const types = ["extra-life", "slowdown", "pause", "destroy-all"];
  const type = types[Math.floor(Math.random() * types.length)];
  const powerupSize = 50;
  const x = Math.random() * Math.max(0, gameArea.offsetWidth - powerupSize);

  const element = document.createElement("div");
  element.className = `powerup ${type}`;
  element.textContent = {
    "extra-life": "❤️",
    slowdown: "⏱️",
    pause: "⏸️",
    "destroy-all": "💥",
  }[type];
  element.style.cssText = `position:absolute; left:${x}px; top:-60px; width:${powerupSize}px; height:${powerupSize}px; /* Add other styles */`;
  element.dataset.type = type;
  element.addEventListener("click", handlePowerupClick); // Use named handler
  gameArea.appendChild(element);
  activePowerups.push({ element, type, y: -60 });
  console.log(`Spawned powerup: ${type}`);
}

function handlePowerupClick() {
  const type = this.dataset.type; // 'this' refers to the clicked element
  console.log(`Powerup clicked: ${type}`);
  activatePowerup(type);
  const index = activePowerups.findIndex((p) => p.element === this);
  if (index !== -1) activePowerups.splice(index, 1);
  this.remove();
}

function activatePowerup(type) {
  console.log(`Activating powerup: ${type}`);
  // Display effect removed for brevity, re-add if needed
  switch (type) {
    case "extra-life":
      gainLife();
      break;
    case "slowdown":
      applySlowdownEffect();
      break;
    case "pause":
      applyPauseEffect();
      break;
    case "destroy-all":
      applyDestroyAllEffect();
      break;
    default:
      console.warn(`Unknown powerup type: ${type}`);
  }
}

// --- Powerup Effect Helper Functions ---
function applySlowdownEffect() {
  if (slowdownActive && slowdownTimeout)
    clearTimeout(slowdownTimeout); // Reset timer if active
  else {
    // Apply effect if not active
    slowdownActive = true;
    fallingObjects.forEach((obj) => {
      if (obj.originalSpeed === undefined) obj.originalSpeed = obj.speed;
      obj.speed = obj.originalSpeed * 0.5;
    });
  }
  slowdownTimeout = setTimeout(() => {
    slowdownActive = false;
    fallingObjects.forEach((obj) => {
      if (obj.originalSpeed !== undefined) obj.speed = obj.originalSpeed;
      delete obj.originalSpeed;
    });
    slowdownTimeout = null;
    console.log("Slowdown ended.");
  }, SLOWDOWN_DURATION_MS);
}

function applyPauseEffect() {
  if (!pauseActive && gameInterval) {
    clearInterval(gameInterval);
    gameInterval = null;
    pauseActive = true;
    if (pauseTimeout) clearTimeout(pauseTimeout);
    pauseTimeout = setTimeout(() => {
      if (pauseActive) resumeGameFromPause();
    }, PAUSE_DURATION_MS);
    console.log("Game paused.");
  } else console.log("Cannot pause: Already paused or game stopped.");
}

function resumeGameFromPause() {
  gameInterval = setInterval(gameLoop, GAME_LOOP_INTERVAL_MS);
  pauseActive = false;
  pauseTimeout = null;
  console.log("Game resumed.");
}

function applyDestroyAllEffect() {
  let pointsGained = 0,
    objectsDestroyed = 0;
  for (let i = fallingObjects.length - 1; i >= 0; i--) {
    const obj = fallingObjects[i];
    const points = obj.word.length || 1;
    pointsGained += points;
    objectsDestroyed++;
    showScorePopup(obj.element, points); // Keep popup visual
    removeObject(i);
  }
  if (objectsDestroyed > 0) {
    score += pointsGained;
    wordsTyped += objectsDestroyed;
    updateScore();
    console.log(`Destroy All: +${pointsGained} points.`);
  } else console.log("Destroy All: No objects.");
}

function showScorePopup(targetElement, points) {
  if (!targetElement?.parentNode) return; // Don't show if target already removed
  const gameArea = targetElement.closest(GAME_AREA_SELECTOR); // Find parent game area
  if (!gameArea) return;

  const popup = document.createElement("div");
  popup.className = "score-popup";
  popup.textContent = `${points > 0 ? "+" : ""}${points}`;
  // Simplified positioning for brevity, adjust styling via CSS
  popup.style.cssText = `position:absolute; left:${
    targetElement.offsetLeft + targetElement.offsetWidth / 2
  }px; top:${
    targetElement.offsetTop - 10
  }px; transform:translateX(-50%); pointer-events:none; transition: opacity 1s, transform 1s;`;
  gameArea.appendChild(popup);
  // Trigger animation (fade out, move up) - Use CSS ideally
  requestAnimationFrame(() => {
    // Ensure element is in DOM before animating
    popup.style.opacity = "0";
    popup.style.transform = "translate(-50%, -30px)";
  });
  setTimeout(() => popup.remove(), 1000); // Remove after animation
}

// --- Core Game Loop & Control ---
function startGame() {
  console.log("Starting game...");
  initGame();
  spawnObject();
  setTimeout(spawnObject, 1000 + Math.random() * 1000);
  gameInterval = setInterval(gameLoop, GAME_LOOP_INTERVAL_MS);
  console.log(`Game loop started: ${gameInterval}.`);
  document.getElementById(WORD_INPUT_ID)?.focus();
  document
    .getElementById(GAME_STATUS_ID)
    ?.style.setProperty("display", "none", "important");
}

function gameLoop() {
  if (pauseActive) return;
  updateGame();
  checkAndSpawnObjects();
  spawnPowerup();
}

function updateGame() {
  const gameArea = document.querySelector(GAME_AREA_SELECTOR);
  if (!gameArea) return console.error("updateGame: Game area missing!");
  const missBoundary = gameArea.offsetHeight - 30;

  for (let i = fallingObjects.length - 1; i >= 0; i--) {
    const obj = fallingObjects[i];
    if (!obj?.element) {
      removeObject(i);
      continue;
    } // Basic check
    obj.y += obj.speed;
    obj.element.style.top = `${obj.y}px`;
    if (obj.y > missBoundary) {
      showScorePopup(obj.element, -1);
      removeObject(i);
      loseLife();
    }
  }
  for (let i = activePowerups.length - 1; i >= 0; i--) {
    const p = activePowerups[i];
    if (!p?.element) {
      activePowerups.splice(i, 1);
      continue;
    } // Basic check
    p.y += 1.5;
    p.element.style.top = `${p.y}px`;
    if (p.y > gameArea.offsetHeight) {
      p.element.remove();
      activePowerups.splice(i, 1);
    }
  }
}

async function gameOver() {
  // Made async for saveScore
  console.log("gameOver: Sequence started.");
  stopGameCleanup(); // Stop intervals, timers, clear elements

  let finalWpm = 0;
  if (gameStartTime && wordsTyped > 0) {
    const durationMinutes = (Date.now() - gameStartTime) / 60000;
    if (durationMinutes > 0.05)
      finalWpm = Math.round(wordsTyped / durationMinutes);
  }
  console.log(`Final Score: ${score}, WPM: ${finalWpm}`);

  // Update end screen UI
  document.getElementById(FINAL_SCORE_ID).textContent = score;
  document.getElementById(TYPING_SPEED_ID).textContent = finalWpm;
  const gameStatusEl = document.getElementById(GAME_STATUS_ID);
  if (gameStatusEl) {
    gameStatusEl.textContent = "GAME OVER";
    gameStatusEl.style.display = "block";
  }

  await saveScore(score, finalWpm); // Attempt save, handles guest/auth inside
  showScreen(END_SCREEN_ID);
  console.log("gameOver: Sequence complete.");
}

function restartGame() {
  console.log("Restarting game...");
  showScreen(GAME_SCREEN_ID); // Will trigger startGame
}

// --- saveScore Function (Using Edge Function) ---
async function saveScore(finalScore, finalWpm) {
  console.log(`Attempting save score=${finalScore}, wpm=${finalWpm}`);
  try {
    if (isGuest) return console.log(`Guest score. Not saving.`);
    if (!ensureInitialized() || !currentUser?.id || !currentGamingName) {
      console.error("Cannot save score: Pre-checks failed (init/login/name).");
      alert("Cannot save score. Ensure you are logged in with a gaming name.");
      return;
    }
    console.log(`Invoking 'submit-score' for ${currentUser.id}`);
    const { data, error } = await supabase.functions.invoke("submit-score", {
      body: JSON.stringify({ score: finalScore, wpm: finalWpm }),
    });
    if (error) throw error; // Let catch block handle
    console.log("Edge Function success:", data);
    alert(data?.message || "Score saved!");
  } catch (error) {
    console.error("saveScore error:", error);
    alert(`Failed to save score: ${error.message || "Unknown error"}.`);
  } finally {
    fetchLeaderboard(); // Always refresh leaderboard
  }
}

// --- Event Listener Setup ---
function setupEventListeners() {
  // Cache frequently accessed elements used in listeners
  loginBtnEl = document.getElementById(LOGIN_BTN_ID);
  profileBtnEl = document.getElementById(PROFILE_BTN_ID);
  logoutBtnEl = document.getElementById(LOGOUT_BTN_ID);
  guestBtnEl = document.getElementById(GUEST_BTN_ID);
  wordInputEl = document.getElementById(WORD_INPUT_ID);

  // Attach non-Supabase listeners
  console.log("Attaching static listeners...");
  addClickListener(CLOSE_MODAL_BTN_ID, closeGamingNameModal);
  addClickListener(PROFILE_CLOSE_BTN_ID, () => showScreen(HOME_SCREEN_ID));
  addClickListener(LEADERBOARD_CLOSE_BTN_ID, () => showScreen(HOME_SCREEN_ID));
  addClickListener(GAME_CLOSE_BTN_ID, () => showScreen(HOME_SCREEN_ID));
  addClickListener(END_HOME_BTN_ID, () => showScreen(HOME_SCREEN_ID));
  addClickListener(LEADERBOARD_BACK_BTN_ID, () => showScreen(HOME_SCREEN_ID));
  if (wordInputEl) {
    wordInputEl.addEventListener("input", handleWordInput);
    wordInputEl.addEventListener("keydown", handleWordInputKeydown);
  } else console.error("Word input missing!");
  document.addEventListener("keydown", handleGlobalKeydown);

  // Attach Supabase-dependent listeners (called later after init)
  console.log("Setup complete for static listeners.");
}

function attachSupabaseEventListeners() {
  console.log("Attaching Supabase-dependent listeners...");
  addClickListener(PLAY_BTN_ID, checkAuthAndPlay);
  addClickListener(LEADERBOARD_BTN_ID, () => showScreen(LEADERBOARD_SCREEN_ID)); // Use const ID
  addClickListener(GUEST_BTN_ID, playAsGuest);
  addClickListener(LOGIN_BTN_ID, signInWithGoogle);
  addClickListener(PROFILE_BTN_ID, () => showScreen(PROFILE_SCREEN_ID)); // Use const ID
  addClickListener(LOGOUT_BTN_ID, logout);
  addClickListener(SUBMIT_NAME_BTN_ID, submitGamingName);
  addClickListener(CHANGE_NAME_BTN_ID, () => showGamingNameModal(true));
  addClickListener(RESTART_BTN_ID, restartGame);
  addClickListener(END_LEADERBOARD_BTN_ID, () =>
    showScreen(LEADERBOARD_SCREEN_ID)
  ); // Use const ID
  console.log("Supabase listeners attached.");
}

// Helper to add click listeners safely
function addClickListener(elementId, handler) {
  const element = document.getElementById(elementId);
  if (element) {
    element.addEventListener("click", handler);
  } else {
    console.warn(`Element not found for click listener: ${elementId}`);
  }
}

// --- Input Handling Functions ---
function handleWordInput(e) {
  if (pauseActive) {
    e.target.value = "";
    return;
  }
  const inputText = e.target.value.toUpperCase().trim();
  if (!inputText) return;

  let lowestMatchIndex = -1,
    lowestMatchY = -Infinity;
  for (let i = fallingObjects.length - 1; i >= 0; i--) {
    const obj = fallingObjects[i];
    if (obj?.word === inputText && obj.y > lowestMatchY) {
      lowestMatchY = obj.y;
      lowestMatchIndex = i;
    }
  }

  if (lowestMatchIndex !== -1) {
    const matchedObj = fallingObjects[lowestMatchIndex];
    const points = matchedObj.word.length || 1;
    score += points;
    wordsTyped++;
    updateScore();
    showScorePopup(matchedObj.element, points);
    removeObject(lowestMatchIndex);
    if (score > 0 && score % SCORE_THRESHOLD_LIFE_GAIN < points) gainLife();
    e.target.value = "";
  }
}

function handleWordInputKeydown(e) {
  // if (e.key === "Enter" && e.target.value) e.target.value = ""; // Clear on Enter?
}

// --- Global Key Handling ---
function handleGlobalKeydown(e) {
  if (e.key === "Escape") {
    const modal = document.getElementById(GAMING_NAME_MODAL_ID);
    const activeScreen = document.querySelector(`${SCREEN_SELECTOR}.active`);
    if (modal?.classList.contains("active")) closeGamingNameModal();
    else if (activeScreen?.id === GAME_SCREEN_ID) showScreen(HOME_SCREEN_ID);
    else if (activeScreen && activeScreen.id !== HOME_SCREEN_ID)
      showScreen(HOME_SCREEN_ID);
  }
}

// --- Initial Load ---
document.addEventListener("DOMContentLoaded", () => {
  console.log(">>> DOMContentLoaded: Fired.");
  setupEventListeners(); // Setup listeners that don't need Supabase immediately

  console.log(">>> DOMContentLoaded: Calling initializeSupabase...");
  initializeSupabase()
    .then(() => {
      console.log(">>> Init promise RESOLVED.");
      attachSupabaseEventListeners(); // Attach remaining listeners now
      console.log(">>> Post-init checkAuth...");
      return checkAuth(); // Return promise for chaining if needed
    })
    .then(() => {
      console.log(">>> Post-init checkAuth complete.");
      if (!document.querySelector(`${SCREEN_SELECTOR}.active`)) {
        console.log(">>> No active screen, showing home.");
        showScreen(HOME_SCREEN_ID);
      }
    })
    .catch((error) => {
      // Error during initialization or subsequent checkAuth
      console.error(">>> Init/Post-Init failure:", error);
      // Error message should already be displayed by handleInitializationError
    });

  console.log(">>> DOMContentLoaded: End sync setup.");
  // Optional check after delay removed for brevity, add back if needed
});

console.log("Script execution finished.");