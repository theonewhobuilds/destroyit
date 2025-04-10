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
let isInitialized = false;

// Initialize Supabase Client using Edge Function
async function initializeSupabase() {
  console.log(">>> initializeSupabase START");
  try {
    console.log(">>> Checking window.supabase...");
    if (!window.supabase?.createClient) {
      throw new Error("Supabase library not loaded from CDN.");
    }
    console.log(">>> Fetching config...");
    const response = await fetch(
      "https://ikbnuqabgdgikorhipnm.functions.supabase.co/auth-config",
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    console.log(">>> Config fetch status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(">>> Failed config fetch response text:", errorText);
      throw new Error(
        `Failed to fetch Supabase configuration - Status: ${response.status}`
      );
    }

    const config = await response.json();
    console.log(">>> Config received.");

    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      console.error(">>> Received config:", config);
      throw new Error("Fetched configuration is missing URL or Key.");
    }

    console.log(">>> Creating client...");
    const { createClient } = window.supabase;
    supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
    console.log(">>> Supabase client CREATED SUCCESSFULLY.");

    console.log(">>> Adding onAuthStateChange listener...");
    supabase.auth.onAuthStateChange((event, session) => {
      const userEmail = session?.user?.email || "No user";
      console.log(`>>> Auth state changed: ${event}, User: ${userEmail}`);
      checkAuth();
    });
    console.log(">>> onAuthStateChange listener added.");

    console.log(">>> Running initial checkAuth...");
    await checkAuth();
    console.log(">>> Initial checkAuth finished.");

    isInitialized = true;
    console.log(">>> initializeSupabase COMPLETE (isInitialized = true).");
  } catch (error) {
    console.error(">>> FATAL ERROR in initializeSupabase:", error);
    const errorDiv = document.createElement("div");
    errorDiv.style.cssText =
      "color: red; padding: 20px; font-size: 1.5em; text-align: center; position: fixed; top: 0; left: 0; width: 100%; background: white; z-index: 1000;";
    errorDiv.textContent = `Error initializing Supabase: ${error.message}. Check console & configuration.`;
    document.body.prepend(errorDiv);
    throw new Error("Stopping script execution due to Supabase init failure.");
  }
}

// Ensure functions don't run before initialization
function ensureInitialized() {
  if (!isInitialized) {
    console.error(
      "Check: Supabase not initialized yet. Function call blocked."
    );
    return false;
  }
  return true;
}

// Modified checkAuthAndPlay to handle async properly
async function checkAuthAndPlay() {
  console.log(
    "checkAuthAndPlay triggered - CurrentUser:",
    currentUser?.email || "None",
    "isGuest:",
    isGuest
  );
  if (!currentUser && !isGuest) {
    console.log("No user/guest found, prompting...");
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (
      confirm(
        "Sign in with Google to save scores?\n\n(Cancel to play as guest)"
      )
    ) {
      await signInWithGoogle();
    } else {
      playAsGuest();
    }
  } else if (currentUser) {
    const name = await checkGamingName();
    if (!name) {
      console.log("User logged in, but no gaming name. Showing modal.");
      showGamingNameModal(false);
    } else {
      console.log("User logged in with gaming name. Starting game screen.");
      showScreen("game-screen");
    }
  } else if (isGuest) {
    if (!currentGamingName) {
      console.log("Guest mode, but no name yet. Showing modal.");
      showGamingNameModal(false);
    } else {
      console.log("Guest mode with name. Starting game screen.");
      showScreen("game-screen");
    }
  }
}

// Modified showScreen to handle async
async function showScreen(screenId) {
  if (!isInitialized && screenId !== "home-screen") {
    console.warn(`showScreen(${screenId}) blocked: Supabase not initialized.`);
    return;
  }

  console.log("Showing screen:", screenId);
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove("active");
  });

  if (gameInterval && screenId !== "game-screen") {
    console.log("Navigating away from game, stopping game.");
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

  const targetScreen = document.getElementById(screenId);
  if (targetScreen) {
    targetScreen.classList.add("active");
    console.log(`Screen ${screenId} activated.`);
  } else {
    console.error("Screen element not found:", screenId, "Fallback to home.");
    const homeScreen = document.getElementById("home-screen");
    if (homeScreen) homeScreen.classList.add("active");
    else console.error("FATAL: Home screen element not found either!");
    return;
  }

  console.log(`Running actions for screen: ${screenId}`);
  try {
    const backButton = document.getElementById("leaderboard-back-btn");

    switch (screenId) {
      case "profile-screen":
        if (currentUser) {
          console.log("Loading profile stats and checking name...");
          await Promise.all([loadProfileStats(), checkGamingName()]);
          console.log("Profile data loading finished.");
        } else {
          console.warn(
            "Profile screen requested but no user logged in. Redirecting home."
          );
          showScreen("home-screen");
        }
        break;
      case "leaderboard-screen":
        console.log("Fetching leaderboard...");
        await fetchLeaderboard();
        if (backButton)
          backButton.style.setProperty("display", "block", "important");
        console.log("Leaderboard fetched.");
        break;
      case "game-screen":
        console.log("Checking conditions to start game...");
        if (
          (isGuest && currentGamingName) ||
          (currentUser && currentGamingName)
        ) {
          console.log("Conditions met, starting game...");
          startGame();
        } else {
          console.log("Cannot start game: Name not set.");
          if (!isGuest && currentUser) {
            console.log("Showing gaming name modal for logged-in user.");
            showGamingNameModal(false);
          } else if (isGuest && !currentGamingName) {
            console.log("Showing gaming name modal for guest.");
            showGamingNameModal(false);
          } else {
            console.log("Redirecting to home screen as game cannot start.");
            showScreen("home-screen");
          }
        }
        break;
      case "home-screen":
        console.log("Refreshing auth state for home screen...");
        await checkAuth();
        if (backButton)
          backButton.style.setProperty("display", "none", "important");
        break;
      case "end-screen":
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

// --- Authentication & User Flow ---
function playAsGuest() {
  console.log("Playing as guest");
  isGuest = true;
  currentUser = null;
  currentGamingName = null;
  updateUIName(null);
  const modal = document.getElementById("gaming-name-modal");
  if (!modal) return console.error("Gaming name modal not found!");
  modal.dataset.isProfileUpdate = "false";
  modal.classList.add("active");
  const input = document.getElementById("gaming-name-input");
  if (input) {
    input.value = "";
    setTimeout(() => input.focus(), 100);
  } else {
    console.error("Gaming name input field not found!");
  }
}

// --- MODIFIED signInWithGoogle ---
function signInWithGoogle() {
  if (!ensureInitialized()) return;
  console.log("Attempting Google Sign-In (forcing account selection)..."); // Updated log
  supabase.auth
    .signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.href,
        // --- ADD THIS ---
        queryParams: {
          prompt: "select_account", // Tells Google to always show the account chooser
        },
        // --- END ADD ---
      },
    })
    .then(({ data, error }) => {
      if (error) {
        console.error("Error initiating Google Sign-In:", error.message);
        alert(`Google Sign-In failed: ${error.message}`);
      } else {
        console.log("Google Sign-In process initiated, redirect should occur.");
      }
    });
}

function logout() {
  if (!ensureInitialized()) return;
  console.log("Logging out...");
  supabase.auth
    .signOut()
    .then(({ error }) => {
      if (error) {
        console.error("Error during sign out:", error);
      } else {
        console.log("Sign out successful.");
        currentUser = null;
        currentGamingName = null;
        isGuest = false;
        updateUIName(null);
      }
    })
    .catch((err) => {
      console.error("Sign out promise catch error:", err);
    });
}

async function checkAuth() {
  if (!supabase) {
    console.log("checkAuth called before Supabase client exists.");
    document
      .getElementById("login-btn")
      ?.style.setProperty("display", "block", "important");
    document
      .getElementById("profile-btn")
      ?.style.setProperty("display", "none", "important");
    document
      .getElementById("logout-btn")
      ?.style.setProperty("display", "none", "important");
    document
      .getElementById("guest-btn")
      ?.style.setProperty("display", "block", "important");
    return false;
  }

  console.log("checkAuth: Checking session...");
  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("checkAuth: Error getting session:", sessionError.message);
    }

    const loginBtn = document.getElementById("login-btn");
    const profileBtn = document.getElementById("profile-btn");
    const logoutBtn = document.getElementById("logout-btn");
    const guestBtn = document.getElementById("guest-btn");

    if (session?.user) {
      console.log("checkAuth: User session active:", session.user.email);
      if (currentUser?.id !== session.user.id) {
        console.log("checkAuth: Current user state updated.");
      }
      currentUser = session.user;
      isGuest = false;

      if (loginBtn) loginBtn.style.setProperty("display", "none", "important");
      if (profileBtn)
        profileBtn.style.setProperty("display", "block", "important");
      if (logoutBtn)
        logoutBtn.style.setProperty("display", "block", "important");
      if (guestBtn) guestBtn.style.setProperty("display", "none", "important");

      console.log("checkAuth: Checking gaming name for logged-in user...");
      await checkGamingName();
      console.log("checkAuth: Finished gaming name check.");
      return true;
    } else {
      if (currentUser) {
        console.log(
          "checkAuth: No active user session found / User logged out."
        );
      }
      currentUser = null;
      currentGamingName = null;

      if (loginBtn) loginBtn.style.setProperty("display", "block", "important");
      if (profileBtn)
        profileBtn.style.setProperty("display", "none", "important");
      if (logoutBtn)
        logoutBtn.style.setProperty("display", "none", "important");
      if (guestBtn) guestBtn.style.setProperty("display", "block", "important");

      updateUIName(null);
      console.log("checkAuth: User is logged out.");
      return false;
    }
  } catch (error) {
    console.error("checkAuth: FATAL Error in checkAuth function:", error);
    currentUser = null;
    isGuest = false;
    currentGamingName = null;
    document
      .getElementById("login-btn")
      ?.style.setProperty("display", "block", "important");
    document
      .getElementById("profile-btn")
      ?.style.setProperty("display", "none", "important");
    document
      .getElementById("logout-btn")
      ?.style.setProperty("display", "none", "important");
    document
      .getElementById("guest-btn")
      ?.style.setProperty("display", "block", "important");
    updateUIName(null);
    return false;
  }
}

// --- Gaming Name Handling ---
function validateGamingName(name) {
  if (!name || name.trim() === "")
    return {
      valid: false,
      message: "Please enter a gaming name",
      sanitized: "",
    };
  let sanitized = name.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (sanitized.length < 3)
    return {
      valid: false,
      message: "Min 3 chars required (a-z, 0-9, _ only)",
      sanitized: "",
    };
  if (sanitized.length > 15) {
    console.log(
      `Name truncated: '${sanitized}' -> '${sanitized.substring(0, 15)}'`
    );
    sanitized = sanitized.substring(0, 15);
  }
  if (
    sanitized !==
    name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .substring(0, 15)
  ) {
    console.warn(
      `Name sanitized due to invalid characters or length: '${name}' -> '${sanitized}'`
    );
  }
  return { valid: true, message: "", sanitized: sanitized };
}

function canChangeGamingName() {
  if (!currentUser) return true;
  const today = new Date().toISOString().split("T")[0];
  const key = `nameChanges_${currentUser.id}_${today}`;
  const changesMade = parseInt(localStorage.getItem(key) || "0");
  console.log(`Checking name change limit: ${changesMade} changes made today.`);
  return changesMade < 3;
}

function incrementNameChangeCounter() {
  if (!currentUser) return;
  const today = new Date().toISOString().split("T")[0];
  const key = `nameChanges_${currentUser.id}_${today}`;
  const count = parseInt(localStorage.getItem(key) || "0");
  const newCount = count + 1;
  localStorage.setItem(key, newCount.toString());
  console.log(`Name changes used today incremented to: ${newCount}`);
  const remaining = Math.max(0, 3 - newCount);
  console.log(`User has ${remaining} name changes remaining today.`);
}

function showGamingNameModal(isUpdate = false) {
  const modal = document.getElementById("gaming-name-modal");
  if (!modal) return console.error("Gaming name modal element not found!");

  if (isUpdate && !currentUser) {
    console.warn(
      "Attempted to show update name modal, but user not logged in."
    );
    alert("Log in to change your gaming name.");
    return;
  }
  if (isUpdate && currentGamingName && !canChangeGamingName()) {
    console.warn("Attempted to show update name modal, but limit reached.");
    alert("You have reached your daily limit for changing your gaming name.");
    return;
  }

  console.log("Showing gaming name modal, isUpdate:", isUpdate);
  modal.classList.add("active");
  modal.dataset.isProfileUpdate = isUpdate ? "true" : "false";

  const inputField = document.getElementById("gaming-name-input");
  if (inputField) {
    inputField.value = isUpdate && currentGamingName ? currentGamingName : "";
    setTimeout(() => {
      inputField.focus();
      inputField.select();
    }, 150);
  } else {
    console.error("Gaming name input field not found in modal!");
  }
}

function closeGamingNameModal() {
  const modal = document.getElementById("gaming-name-modal");
  if (!modal) return console.error("Gaming name modal element not found!");
  modal.classList.remove("active");
  console.log("Gaming name modal closed.");

  if (
    isGuest &&
    !currentGamingName &&
    modal.dataset.isProfileUpdate === "false"
  ) {
    console.log("Guest cancelled initial name setup, reverting guest status.");
    isGuest = false;
    updateUIName(null);
    showScreen("home-screen");
  } else if (
    !isGuest &&
    currentUser &&
    !currentGamingName &&
    modal.dataset.isProfileUpdate === "false"
  ) {
    console.log("Logged-in user cancelled initial name setup, going home.");
    showScreen("home-screen");
  }
}

async function checkGamingName() {
  if (!currentUser?.id) {
    console.log("checkGamingName: No user ID, clearing name.");
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

    if (error && status !== 406) {
      console.error(
        `checkGamingName: Error fetching profile (${status}):`,
        error.message
      );
      currentGamingName = null;
      updateUIName("Error");
      return null;
    }

    if (data) {
      currentGamingName = data.gaming_name;
      console.log(`checkGamingName: Found name: ${currentGamingName}`);
    } else {
      console.log(
        `checkGamingName: No profile/name found for user ${currentUser.id}.`
      );
      currentGamingName = null;
    }
    updateUIName(currentGamingName);
    return currentGamingName;
  } catch (fetchError) {
    console.error("checkGamingName: Unexpected error:", fetchError);
    currentGamingName = null;
    updateUIName("Error");
    return null;
  }
}

function updateUIName(name) {
  console.log(
    `updateUIName: Setting display name based on: ${name}, isGuest: ${isGuest}, currentUser: ${currentUser?.email}`
  );
  const profileNameEl = document.getElementById("current-gaming-name");
  const gameNameEl = document.getElementById("player-name");

  let displayName;
  if (name) {
    displayName = name;
  } else if (isGuest) {
    displayName = "Guest";
  } else if (currentUser) {
    displayName = "Not Set";
  } else {
    displayName = "Player";
  }
  console.log(`updateUIName: Determined displayName: ${displayName}`);

  if (profileNameEl) {
    profileNameEl.textContent = name || "Not Set";
    console.log(`Updated profile name element.`);
  }
  if (gameNameEl) {
    gameNameEl.textContent = displayName;
    console.log(`Updated game name element.`);
  }
}

async function submitGamingName() {
  if (!ensureInitialized()) return;
  console.log("submitGamingName triggered.");

  const modal = document.getElementById("gaming-name-modal");
  const input = document.getElementById("gaming-name-input");
  const errorMsgEl = document.getElementById("gaming-name-error");

  if (errorMsgEl) errorMsgEl.textContent = "";

  if (!modal || !input) {
    console.error("submitGamingName: Modal or input element not found.");
    return;
  }

  const validation = validateGamingName(input.value);
  if (!validation.valid) {
    console.warn("submitGamingName: Validation failed:", validation.message);
    if (errorMsgEl) errorMsgEl.textContent = validation.message;
    else alert(validation.message);
    input.focus();
    return;
  }

  const gamingName = validation.sanitized;
  const isUpdate = modal.dataset.isProfileUpdate === "true";
  console.log(
    `submitGamingName: Validated name: ${gamingName}, isUpdate: ${isUpdate}`
  );

  if (currentUser) {
    console.log("Submitting as logged-in user.");
    if (isUpdate && gamingName === currentGamingName) {
      console.log("Name hasn't changed.");
      if (errorMsgEl) errorMsgEl.textContent = "Name has not changed.";
      else alert("Name has not changed.");
      return;
    }
    if (isUpdate && !canChangeGamingName()) {
      console.warn("Update blocked: Daily limit reached.");
      if (errorMsgEl)
        errorMsgEl.textContent = "Daily name change limit reached.";
      else alert("Daily name change limit reached.");
      return;
    }

    console.log("Checking if name is taken...");
    try {
      const { data: existing, error: checkErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("gaming_name", gamingName)
        .neq("id", currentUser.id)
        .limit(1);

      if (checkErr) {
        console.error("Error checking for existing name:", checkErr);
        throw new Error(`Database error checking name: ${checkErr.message}`);
      }
      if (existing?.length > 0) {
        console.warn("Name already taken.");
        if (errorMsgEl) errorMsgEl.textContent = "Gaming name already taken.";
        else alert("Gaming name already taken.");
        input.focus();
        return;
      }

      console.log(
        `Upserting profile for ${currentUser.id} with name ${gamingName}`
      );
      const { data: upsertData, error: upsertErr } = await supabase
        .from("profiles")
        .upsert(
          {
            id: currentUser.id,
            gaming_name: gamingName,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "id",
          }
        )
        .select("gaming_name")
        .single();

      if (upsertErr) {
        console.error("Error upserting profile:", upsertErr);
        throw new Error(`Failed to save name: ${upsertErr.message}`);
      }

      console.log("Profile upsert successful:", upsertData);
      const previousName = currentGamingName;
      currentGamingName = upsertData.gaming_name;
      updateUIName(currentGamingName);

      if (isUpdate && currentGamingName !== previousName) {
        incrementNameChangeCounter();
      } else if (isUpdate) {
        alert("Gaming name saved successfully.");
      }

      modal.classList.remove("active");
      input.value = "";

      if (!isUpdate) {
        console.log("Initial name set, proceeding to game screen.");
        showScreen("game-screen");
      } else {
        console.log("Name updated, reloading profile stats.");
        loadProfileStats();
      }
    } catch (error) {
      console.error("submitGamingName (logged-in) error:", error);
      if (errorMsgEl)
        errorMsgEl.textContent = error.message || "Failed to save name.";
      else alert(error.message || "Failed to save name. Check console.");
    }
  } else if (isGuest) {
    console.log("Submitting as guest.");
    currentGamingName = gamingName;
    updateUIName(currentGamingName);
    console.log("Guest name set locally:", currentGamingName);
    modal.classList.remove("active");
    input.value = "";
    console.log("Guest name set, proceeding to game screen.");
    showScreen("game-screen");
  } else {
    console.error(
      "submitGamingName called unexpectedly without user or guest state."
    );
    alert("Cannot submit name. Please log in or choose 'Play as Guest'.");
  }
}

// --- Profile & Leaderboard Data ---
async function loadProfileStats() {
  if (!ensureInitialized()) return;
  if (!currentUser?.id) {
    console.log("loadProfileStats: Cannot load stats - No user ID.");
    document.getElementById("current-gaming-name").textContent = "N/A";
    document.getElementById("highest-score").textContent = "-";
    document.getElementById("best-wpm").textContent = "-";
    document.getElementById("games-played").textContent = "-";
    document.getElementById("leaderboard-rank").textContent = "-";
    return;
  }

  console.log(`loadProfileStats: Loading for user ${currentUser.id}`);
  document.getElementById("current-gaming-name").textContent =
    currentGamingName || "Loading...";
  document.getElementById("highest-score").textContent = "Loading...";
  document.getElementById("best-wpm").textContent = "Loading...";
  document.getElementById("games-played").textContent = "Loading...";
  document.getElementById("leaderboard-rank").textContent = "Loading...";

  try {
    const { data: userScores, error: scoreError } = await supabase
      .from("scores")
      .select("score, wpm")
      .eq("profile_id", currentUser.id);

    if (scoreError) throw scoreError;

    const highestScore =
      userScores.length > 0
        ? Math.max(...userScores.map((s) => s.score || 0))
        : 0;
    const bestWPM =
      userScores.length > 0
        ? Math.max(...userScores.map((s) => s.wpm || 0))
        : 0;
    const gamesPlayed = userScores.length;

    document.getElementById("highest-score").textContent = highestScore;
    document.getElementById("best-wpm").textContent = bestWPM;
    document.getElementById("games-played").textContent = gamesPlayed;
    console.log(
      `loadProfileStats: Basic stats loaded - Score: ${highestScore}, WPM: ${bestWPM}, Played: ${gamesPlayed}`
    );

    console.log("loadProfileStats: Fetching rank...");
    const { data: rankedScores, error: rankError } = await supabase
      .from("scores")
      .select("profile_id, score")
      .order("score", { ascending: false })
      .order("wpm", { ascending: false, nullsFirst: false });

    if (rankError) throw rankError;

    const userRankIndex = rankedScores.findIndex(
      (score) => score.profile_id === currentUser.id
    );
    const rank = userRankIndex !== -1 ? userRankIndex + 1 : 0;

    document.getElementById("leaderboard-rank").textContent =
      rank > 0 ? `#${rank}` : "Unranked";
    console.log(
      `loadProfileStats: Rank calculated: ${rank > 0 ? "#" + rank : "Unranked"}`
    );
  } catch (error) {
    console.error("loadProfileStats: Error loading profile stats:", error);
    document.getElementById("highest-score").textContent = "Error";
    document.getElementById("best-wpm").textContent = "Error";
    document.getElementById("games-played").textContent = "Error";
    document.getElementById("leaderboard-rank").textContent = "Error";
  } finally {
    document.getElementById("current-gaming-name").textContent =
      currentGamingName || "Not Set";
    console.log("loadProfileStats: Finished loading attempt.");
  }
}

// --- REPLACEMENT fetchLeaderboard Function (Using SELECT, NO RPC) ---
function fetchLeaderboard() {
  if (!ensureInitialized()) {
    console.error("fetchLeaderboard: Aborted - Supabase not initialized.");
    const container = document.getElementById("leaderboard-container-dynamic");
    if (container)
      container.innerHTML = `<div style="text-align:center; color: #ff00ff;">Error: Initialization failed.</div>`;
    return;
  }
  console.log("Fetching leaderboard (using SELECT method)...");
  const container = document.getElementById("leaderboard-container-dynamic");
  if (!container) {
    console.error("Leaderboard dynamic content container not found!");
    return;
  }
  container.innerHTML = `<div style="text-align:center; padding: 20px; color: #00f7ff;">Loading...</div>`;

  supabase
    .from("scores")
    .select(
      `
          score,
          wpm,
          profiles ( gaming_name )
      `
    )
    .order("score", { ascending: false })
    .order("wpm", { ascending: false })
    .limit(10)
    .then(({ data: scores, error }) => {
      if (error) {
        console.error("Error fetching leaderboard (SELECT):", error);
        container.innerHTML = `<div style="text-align:center; padding: 20px; color: #ff00ff;">Error: ${error.message}</div>`;
        return;
      }

      container.innerHTML = "";

      if (!scores || scores.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 20px; color: #00f7ff;">No scores submitted yet.</div>`;
        console.log("Leaderboard empty.");
        return;
      }

      console.log("Leaderboard data received (SELECT):", scores);
      scores.forEach((scoreData, index) => {
        let displayName = scoreData.profiles?.gaming_name || "Player";
        const item = document.createElement("div");
        item.className = "leaderboard-item";
        item.innerHTML = `
                  <div class="rank">#${index + 1}</div>
                  <div class="username">${displayName}</div>
                  <div class="score">${scoreData.score || 0}</div>
                  <div class="wpm">${scoreData.wpm || 0}</div>`;
        container.appendChild(item);
      });
      console.log("Leaderboard display updated (SELECT).");
    })
    .catch((fetchError) => {
      console.error("Fetch Leaderboard Promise Catch (SELECT):", fetchError);
      container.innerHTML = `<div style="text-align:center; padding: 20px; color: #ff00ff;">Failed to load leaderboard.</div>`;
    });
}
// --- END OF REPLACEMENT fetchLeaderboard ---

// --- Game Mechanics ---
function initGame() {
  console.log("Initializing game state...");
  clearGameElements();
  score = 0;
  lives = 3;
  wordsTyped = 0;
  fallingObjects = [];
  activePowerups = [];
  gameStartTime = Date.now();
  lastScoreBracket = -1;
  powerupSpawned = {};

  if (slowdownTimeout) clearTimeout(slowdownTimeout);
  slowdownTimeout = null;
  slowdownActive = false;
  if (pauseTimeout) clearTimeout(pauseTimeout);
  pauseTimeout = null;
  pauseActive = false;
  if (gameInterval) clearInterval(gameInterval);
  gameInterval = null;

  updateScore();
  updateLives();
  updateUIName(currentGamingName);

  document
    .getElementById("lives")
    ?.style.setProperty("display", "flex", "important");
  document
    .getElementById("game-status")
    ?.style.setProperty("display", "none", "important");

  document.getElementById("word-input")?.focus();

  console.log(
    "Game state initialized for:",
    currentGamingName || (isGuest ? "Guest" : "Player")
  );
}

function clearGameElements() {
  console.log("Clearing game elements...");
  const gameArea = document.querySelector(".game-area");
  if (!gameArea) {
    console.error("clearGameElements: Game area not found!");
    return;
  }
  gameArea
    .querySelectorAll(
      ".falling-object, .powerup, .score-popup, .powerup-effect"
    )
    .forEach((el) => el.remove());

  fallingObjects = [];
  activePowerups = [];

  const wordInput = document.getElementById("word-input");
  if (wordInput) {
    wordInput.value = "";
  }
  console.log("Game elements cleared.");
}

function updateScore() {
  const scoreElement = document.getElementById("score");
  if (scoreElement) {
    scoreElement.textContent = score;
  }

  let currentWpm = 0;
  if (gameStartTime && wordsTyped > 0) {
    const elapsedSeconds = (Date.now() - gameStartTime) / 1000;
    if (elapsedSeconds >= 3) {
      const gameDurationMinutes = elapsedSeconds / 60;
      currentWpm = Math.round(wordsTyped / gameDurationMinutes);
    }
  }
  const wpmElement = document.getElementById("wpm");
  if (wpmElement) {
    wpmElement.textContent = currentWpm;
  }
}

function updateLives() {
  const livesDisplay = document.getElementById("lives");
  if (!livesDisplay) {
    console.error("Lives display element not found!");
    return;
  }
  livesDisplay.innerHTML = "";
  console.log(`Updating lives display: ${lives} lives remaining.`);
  for (let i = 0; i < lives; i++) {
    const lifeElement = document.createElement("span");
    lifeElement.className = "life";
    lifeElement.textContent = "❤️";
    livesDisplay.appendChild(lifeElement);
  }
}

function gainLife() {
  if (lives < 3) {
    lives++;
    updateLives();
    console.log("Gained life, lives =", lives);
  } else {
    console.log("Max lives reached, cannot gain more.");
  }
}

function loseLife() {
  if (lives > 0) {
    lives--;
    updateLives();
    console.log("Lost life, lives =", lives);
  } else {
    console.log("Already at 0 lives.");
  }

  if (lives <= 0 && gameInterval) {
    console.log("Lives reached 0, triggering game over.");
    gameOver();
  }
}

function spawnObject() {
  const gameArea = document.querySelector(".game-area");
  if (!gameArea || pauseActive) return;

  const words = [
    "ACCESS",
    "ADMIN",
    "AUTH",
    "BINARY",
    "BUFFER",
    "CACHE",
    "CIPHER",
    "CLIENT",
    "CLOUD",
    "CODE",
    "COMPILER",
    "CONNECT",
    "CONSOLE",
    "COOKIE",
    "CORE",
    "CRACK",
    "CYBER",
    "DATA",
    "DEBUG",
    "DECODE",
    "DENIAL",
    "DEVICE",
    "DNS",
    "DOMAIN",
    "ENCRYPT",
    "ERROR",
    "EXPLOIT",
    "FIREWALL",
    "FRAMEWORK",
    "GLITCH",
    "GRID",
    "HACK",
    "HASH",
    "HOST",
    "INPUT",
    "INSTALL",
    "INTEL",
    "KERNEL",
    "KEY",
    "LEAK",
    "LINK",
    "LOG",
    "LOOP",
    "MALWARE",
    "MATRIX",
    "MEMORY",
    "MODEM",
    "NET",
    "NEURAL",
    "NODE",
    "NULL",
    "PACKET",
    "PATCH",
    "PING",
    "PIXEL",
    "PORT",
    "PROXY",
    "QUERY",
    "RAM",
    "RENDER",
    "ROOT",
    "ROUTER",
    "SCRIPT",
    "SDK",
    "SEGMENT",
    "SERVER",
    "SHELL",
    "SOCKET",
    "SOURCE",
    "SPAM",
    "STACK",
    "STREAM",
    "SYNTAX",
    "SYSTEM",
    "TABLE",
    "TOKEN",
    "TRACE",
    "UPLOAD",
    "URL",
    "USER",
    "VIRUS",
    "VOID",
    "WAREZ",
    "WIRE",
    "ZONE",
  ];
  if (!words || words.length === 0) {
    console.error("Word list is empty or not loaded!");
    return;
  }
  const word = words[Math.floor(Math.random() * words.length)];

  const areaWidth = gameArea.offsetWidth;
  const objectWidth = Math.max(80, word.length * 10 + 20);
  const maxLeft = Math.max(0, areaWidth - objectWidth);
  const x = Math.random() * maxLeft;

  const element = document.createElement("div");
  element.className = "falling-object";
  element.innerHTML = `<div class="shape">⬡</div><div class="word">${word}</div>`;
  element.style.position = "absolute";
  element.style.left = `${x}px`;
  element.style.top = "-100px";
  element.style.width = `${objectWidth}px`;
  element.style.textAlign = "center";

  gameArea.appendChild(element);

  const baseMinSpeed = 1.5,
    baseMaxSpeed = 3.0,
    speedFactor = 0.009,
    maxSpeed = 8.0;
  const scoreBasedIncrease = score * speedFactor;
  const minSpeed = Math.min(
    baseMinSpeed + scoreBasedIncrease,
    maxSpeed - (baseMaxSpeed - baseMinSpeed)
  );
  const maxSpeedNow = Math.min(baseMaxSpeed + scoreBasedIncrease, maxSpeed);
  let currentSpeed = minSpeed + Math.random() * (maxSpeedNow - minSpeed);

  const obj = {
    word: word,
    element: element,
    y: -100,
    speed: currentSpeed,
    originalSpeed: currentSpeed,
  };

  if (slowdownActive) {
    obj.speed = obj.originalSpeed * 0.5;
    console.log(
      `Applying slowdown to new word ${word}, speed: ${obj.speed.toFixed(2)}`
    );
  }

  fallingObjects.push(obj);
}

function removeObject(index) {
  if (index >= 0 && index < fallingObjects.length) {
    const obj = fallingObjects[index];
    if (obj?.element) {
      obj.element.remove();
    }
    fallingObjects.splice(index, 1);
  }
}

function checkAndSpawnObjects() {
  if (pauseActive) return;

  const baseMax = 2;
  const increasePer50Score = 1;
  const absoluteMax = 8;
  const maxObjects = Math.min(
    absoluteMax,
    baseMax + Math.floor(score / 50) * increasePer50Score
  );

  let spawnProb = 0;
  if (fallingObjects.length < maxObjects) {
    spawnProb = (1 - fallingObjects.length / maxObjects) * 0.1;
  }

  if (Math.random() < spawnProb) {
    spawnObject();
  }
}

function spawnPowerup() {
  if (score < 50 || pauseActive || activePowerups.length > 2) return;

  const scoreBracket = Math.floor(score / 100);
  if (powerupSpawned[scoreBracket]) return;

  const spawnChance = 0.02;
  if (Math.random() > spawnChance) return;

  powerupSpawned[scoreBracket] = true;

  const gameArea = document.querySelector(".game-area");
  if (!gameArea) return console.error("spawnPowerup: Game area not found!");

  const types = ["extra-life", "slowdown", "pause", "destroy-all"];
  const type = types[Math.floor(Math.random() * types.length)];

  const powerupSize = 50;
  const areaWidth = gameArea.offsetWidth;
  const x = Math.random() * Math.max(0, areaWidth - powerupSize);

  const powerupElement = document.createElement("div");
  powerupElement.className = `powerup ${type}`;
  powerupElement.textContent = {
    "extra-life": "❤️",
    slowdown: "⏱️",
    pause: "⏸️",
    "destroy-all": "💥",
  }[type];
  powerupElement.style.left = `${x}px`;
  powerupElement.style.top = "-60px";
  powerupElement.dataset.type = type;

  powerupElement.addEventListener("click", function handlePowerupClick() {
    console.log(`Powerup clicked: ${this.dataset.type}`);
    activatePowerup(this.dataset.type);
    const index = activePowerups.findIndex((p) => p.element === this);
    if (index !== -1) activePowerups.splice(index, 1);
    this.remove();
  });

  gameArea.appendChild(powerupElement);

  activePowerups.push({
    element: powerupElement,
    type: type,
    y: -60,
  });

  console.log(`Spawned powerup: ${type} at bracket ${scoreBracket}`);
}

function activatePowerup(type) {
  console.log(`Activating powerup: ${type}`);
  const gameArea = document.querySelector(".game-area");
  if (!gameArea) return console.error("activatePowerup: Game area not found!");

  const effect = document.createElement("div");
  effect.className = "powerup-effect";
  effect.textContent = {
    "extra-life": "LIFE +1!",
    slowdown: "SLOWDOWN!",
    pause: "PAUSED!",
    "destroy-all": "CLEARED!",
  }[type];
  effect.style.color = {
    "extra-life": "#ff4d4d",
    slowdown: "#00e6e6",
    pause: "#ffff66",
    "destroy-all": "#ff66ff",
  }[type];
  effect.style.position = "absolute";
  effect.style.top = "10px";
  effect.style.left = "50%";
  effect.style.transform = "translateX(-50%)";
  effect.style.fontSize = "2em";
  effect.style.fontWeight = "bold";
  effect.style.zIndex = "100";

  gameArea.appendChild(effect);
  setTimeout(() => effect.remove(), 1500);

  switch (type) {
    case "extra-life":
      gainLife();
      break;

    case "slowdown":
      if (slowdownActive) {
        console.log("Slowdown already active, resetting timer.");
        if (slowdownTimeout) clearTimeout(slowdownTimeout);
      } else {
        console.log("Applying slowdown effect.");
        slowdownActive = true;
        fallingObjects.forEach((obj) => {
          if (obj.originalSpeed === undefined) obj.originalSpeed = obj.speed;
          obj.speed = obj.originalSpeed * 0.5;
        });
      }
      slowdownTimeout = setTimeout(() => {
        console.log("Slowdown ended.");
        slowdownActive = false;
        fallingObjects.forEach((obj) => {
          if (obj.originalSpeed !== undefined) {
            obj.speed = obj.originalSpeed;
            delete obj.originalSpeed;
          }
        });
        slowdownTimeout = null;
      }, 10000);
      break;

    case "pause":
      if (!pauseActive && gameInterval) {
        console.log("Pausing game.");
        clearInterval(gameInterval);
        gameInterval = null;
        pauseActive = true;
        if (pauseTimeout) clearTimeout(pauseTimeout);
        pauseTimeout = setTimeout(() => {
          if (pauseActive) {
            console.log("Auto-resuming game after pause.");
            gameInterval = setInterval(gameLoop, 50);
            pauseActive = false;
            pauseTimeout = null;
          }
        }, 5000);
      } else {
        console.log(
          "Cannot activate pause: Already paused or game not running."
        );
        effect.remove();
      }
      break;

    case "destroy-all":
      console.log("Destroying all falling objects.");
      let pointsGained = 0;
      let objectsDestroyed = 0;
      for (let i = fallingObjects.length - 1; i >= 0; i--) {
        const obj = fallingObjects[i];
        const points = obj.word.length || 1;
        pointsGained += points;
        objectsDestroyed++;
        showScorePopup(obj.element, points);
        removeObject(i);
      }
      if (objectsDestroyed > 0) {
        score += pointsGained;
        wordsTyped += objectsDestroyed;
        updateScore();
        console.log(
          `Destroy All: +${pointsGained} points from ${objectsDestroyed} objects.`
        );
      } else {
        console.log("Destroy All: No objects to destroy.");
      }
      break;
    default:
      console.warn(`Unknown powerup type activated: ${type}`);
  }
}

function showScorePopup(targetElement, points) {
  if (!targetElement) return;
  const gameArea = document.querySelector(".game-area");
  if (!gameArea) return console.error("showScorePopup: Game area not found!");

  const popup = document.createElement("div");
  popup.className = "score-popup";
  popup.textContent = `+${points}`;

  const targetRect = targetElement.getBoundingClientRect();
  const gameAreaRect = gameArea.getBoundingClientRect();

  popup.style.position = "absolute";
  popup.style.left = `${
    targetRect.left - gameAreaRect.left + targetRect.width / 2
  }px`;
  popup.style.top = `${targetRect.top - gameAreaRect.top - 10}px`;
  popup.style.transform = "translateX(-50%)";

  gameArea.appendChild(popup);

  let opacity = 1;
  let posY = parseFloat(popup.style.top);
  const interval = setInterval(() => {
    opacity -= 0.05;
    posY -= 1;
    popup.style.opacity = opacity;
    popup.style.top = `${posY}px`;
    if (opacity <= 0) {
      clearInterval(interval);
      popup.remove();
    }
  }, 50);
}

// --- Core Game Loop & Control ---
function startGame() {
  console.log("startGame: Initializing and starting game loop...");
  initGame();

  spawnObject();
  setTimeout(spawnObject, 1000 + Math.random() * 1000);

  if (gameInterval) clearInterval(gameInterval);
  gameInterval = setInterval(gameLoop, 50);

  console.log(
    `startGame: Game loop started with interval ID: ${gameInterval}.`
  );

  document.getElementById("word-input")?.focus();

  document
    .getElementById("game-status")
    ?.style.setProperty("display", "none", "important");
}

function gameLoop() {
  if (pauseActive) {
    return;
  }

  updateGame();

  checkAndSpawnObjects();
  spawnPowerup();
}

function updateGame() {
  const gameArea = document.querySelector(".game-area");
  if (!gameArea) return console.error("updateGame: Game area not found!");

  const gameAreaHeight = gameArea.offsetHeight;
  const missBoundary = gameAreaHeight - 30;

  for (let i = fallingObjects.length - 1; i >= 0; i--) {
    const obj = fallingObjects[i];

    if (
      !obj ||
      !obj.element ||
      typeof obj.y !== "number" ||
      typeof obj.speed !== "number"
    ) {
      console.warn(
        `updateGame: Invalid object found at index ${i}, removing.`,
        obj
      );
      removeObject(i);
      continue;
    }

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

    if (!p || !p.element || typeof p.y !== "number") {
      console.warn(
        `updateGame: Invalid powerup found at index ${i}, removing.`,
        p
      );
      if (p?.element) p.element.remove();
      activePowerups.splice(i, 1);
      continue;
    }

    p.y += 1.5;
    p.element.style.top = `${p.y}px`;

    if (p.y > gameAreaHeight) {
      p.element.remove();
      activePowerups.splice(i, 1);
    }
  }
}

async function gameOver() {
  console.log("gameOver: Game Over sequence started.");

  if (gameInterval) {
    console.log(`Clearing game loop interval: ${gameInterval}`);
    clearInterval(gameInterval);
    gameInterval = null;
  } else {
    console.warn("gameOver: Game interval was already null?");
  }
  if (slowdownTimeout) {
    clearTimeout(slowdownTimeout);
    slowdownTimeout = null;
    slowdownActive = false;
    console.log("Cleared slowdown timeout.");
  }
  if (pauseTimeout) {
    clearTimeout(pauseTimeout);
    pauseTimeout = null;
    pauseActive = false;
    console.log("Cleared pause timeout.");
  }
  pauseActive = false;

  let finalWpm = 0;
  if (gameStartTime && wordsTyped > 0) {
    const gameDurationMinutes = (Date.now() - gameStartTime) / 60000;
    if (gameDurationMinutes > 0.05) {
      finalWpm = Math.round(wordsTyped / gameDurationMinutes);
    }
  }
  console.log(`gameOver: Final Score: ${score}, Final WPM: ${finalWpm}`);

  const finalScoreEl = document.getElementById("final-score");
  const typingSpeedEl = document.getElementById("typing-speed");
  if (finalScoreEl) finalScoreEl.textContent = score;
  else console.error("Final score element not found!");
  if (typingSpeedEl) typingSpeedEl.textContent = finalWpm;
  else console.error("Typing speed element not found!");

  const gameStatusEl = document.getElementById("game-status");
  if (gameStatusEl) {
    gameStatusEl.textContent = "GAME OVER";
    gameStatusEl.style.setProperty("display", "block", "important");
    console.log("Displayed GAME OVER status.");
  } else {
    console.error("Game status element not found!");
  }

  clearGameElements();
  console.log("gameOver: Cleared remaining game elements.");

  console.log("gameOver: Attempting to save score...");
  await saveScore(score, finalWpm);
  console.log("gameOver: Score saving attempt finished.");

  console.log("gameOver: Showing end screen.");
  showScreen("end-screen");

  console.log("gameOver: Sequence complete.");
}

function restartGame() {
  console.log("Restarting game...");
  showScreen("game-screen");
}

// =======================================================
// ===== saveScore Function (Using Edge Function) =====
// =======================================================
async function saveScore(finalScore, finalWpm) {
  console.log(
    `saveScore: Attempting to save score=${finalScore}, wpm=${finalWpm}`
  );
  try {
    if (isGuest) {
      console.log(`saveScore: Guest score. Not saving to database.`);
      return;
    }

    if (!ensureInitialized()) {
      console.error("saveScore: Aborted - Supabase not initialized.");
      alert("Cannot save score: Connection issue. Please try refreshing.");
      return;
    }
    if (!currentUser?.id) {
      console.error("saveScore: Aborted - Not logged in.");
      alert("Log in to save your score!");
      return;
    }
    if (!currentGamingName) {
      console.error("saveScore: Aborted - Gaming name not set.");
      alert("Set your gaming name in the profile screen to save scores!");
      return;
    }

    console.log(
      `saveScore: Invoking 'submit-score' Edge Function for ${currentUser.id}`
    );
    const { data, error } = await supabase.functions.invoke("submit-score", {
      body: JSON.stringify({ score: finalScore, wpm: finalWpm }),
    });

    if (error) {
      console.error("saveScore: Edge Function invocation error:", error);
      alert(
        `Failed to save score: ${error.message || "Server error occurred"}.`
      );
    } else {
      console.log("saveScore: Edge Function success response:", data);
      alert(data?.message || "Score saved successfully!");
    }
  } catch (invokeError) {
    console.error(
      "saveScore: Exception during function invocation or checks:",
      invokeError
    );
    alert("An unexpected error occurred while trying to save the score.");
  } finally {
    console.log("saveScore: Refreshing leaderboard...");
    fetchLeaderboard();
  }
}
// =======================================================
// ===== End of saveScore Function =====
// =======================================================

// --- Event Listeners and Initial Load ---
document.addEventListener("DOMContentLoaded", () => {
  console.log(">>> DOMContentLoaded: Event fired.");

  console.log(">>> DOMContentLoaded: Calling initializeSupabase...");
  initializeSupabase()
    .then(() => {
      console.log(">>> initializeSupabase promise RESOLVED.");
      attachSupabaseEventListeners();
      console.log(
        ">>> DOMContentLoaded: Initial checkAuth after Supabase init..."
      );
      checkAuth().then(() => {
        console.log(">>> DOMContentLoaded: Post-init checkAuth complete.");
        if (!document.querySelector(".screen.active")) {
          console.log(">>> DOMContentLoaded: No active screen, showing home.");
          showScreen("home-screen");
        } else {
          console.log(
            ">>> DOMContentLoaded: Screen already active, skipping home show."
          );
        }
      });
    })
    .catch((error) => {
      console.error(
        ">>> Failed to initialize (Caught in DOMContentLoaded):",
        error
      );
      const errorDiv = document.createElement("div");
      errorDiv.style.cssText =
        "color: red; padding: 20px; font-size: 1.5em; text-align: center; position: fixed; top: 0; left: 0; width: 100%; background: white; z-index: 1000;";
      errorDiv.textContent = `FATAL ERROR: Application could not initialize. ${error.message}. Please refresh or check console.`;
      document.body.prepend(errorDiv);
    });

  console.log(
    ">>> DOMContentLoaded: Attaching non-Supabase event listeners..."
  );
  attachStaticEventListeners();

  console.log(">>> DOMContentLoaded: End of initial sync setup code.");
  setTimeout(() => {
    console.log(">>> Timeout Check: Checking isInitialized flag...");
    if (!isInitialized) {
      console.error(
        ">>> Timeout Check: Supabase client is STILL not initialized after timeout."
      );
    } else {
      console.log(">>> Timeout Check: Supabase client IS initialized.");
    }
  }, 500);
});

// --- Helper Function to Attach Static Listeners ---
function attachStaticEventListeners() {
  console.log("Attaching static listeners (modal close, etc.)...");
  document
    .getElementById("close-modal-btn")
    ?.addEventListener("click", closeGamingNameModal);
  document
    .getElementById("profile-close-btn")
    ?.addEventListener("click", () => showScreen("home-screen"));
  document
    .getElementById("leaderboard-close-btn")
    ?.addEventListener("click", () => showScreen("home-screen"));
  document
    .getElementById("game-close-btn")
    ?.addEventListener("click", () => showScreen("home-screen"));
  document
    .getElementById("end-home-btn")
    ?.addEventListener("click", () => showScreen("home-screen"));
  document
    .getElementById("leaderboard-back-btn")
    ?.addEventListener("click", () => showScreen("home-screen"));

  const wordInputEl = document.getElementById("word-input");
  if (wordInputEl) {
    wordInputEl.addEventListener("input", handleWordInput);
    wordInputEl.addEventListener("keydown", handleWordInputKeydown);
  } else {
    console.error("Word input element not found during listener attachment.");
  }

  document.addEventListener("keydown", handleGlobalKeydown);
}

// --- Helper Function to Attach Listeners Dependent on Supabase ---
function attachSupabaseEventListeners() {
  console.log(
    "Attaching Supabase-dependent listeners (auth, gameplay actions)..."
  );

  document
    .getElementById("play-btn")
    ?.addEventListener("click", checkAuthAndPlay);
  document
    .getElementById("leaderboard-btn")
    ?.addEventListener("click", () => showScreen("leaderboard-screen"));
  document.getElementById("guest-btn")?.addEventListener("click", playAsGuest);
  document
    .getElementById("login-btn")
    ?.addEventListener("click", signInWithGoogle);
  document
    .getElementById("profile-btn")
    ?.addEventListener("click", () => showScreen("profile-screen"));
  document.getElementById("logout-btn")?.addEventListener("click", logout);
  document
    .getElementById("submit-name-btn")
    ?.addEventListener("click", submitGamingName);
  document
    .getElementById("change-name-btn")
    ?.addEventListener("click", () => showGamingNameModal(true));
  document
    .getElementById("restart-btn")
    ?.addEventListener("click", restartGame);
  document
    .getElementById("end-leaderboard-btn")
    ?.addEventListener("click", () => showScreen("leaderboard-screen"));
}

// --- Input Handling Functions ---
function handleWordInput(e) {
  if (pauseActive) {
    e.target.value = "";
    return;
  }

  const inputText = e.target.value.toUpperCase().trim();
  if (!inputText) return;

  let matchFound = false;
  let lowestMatchIndex = -1;
  let lowestMatchY = -Infinity;

  for (let i = fallingObjects.length - 1; i >= 0; i--) {
    const obj = fallingObjects[i];
    if (obj && obj.word === inputText) {
      if (obj.y > lowestMatchY) {
        lowestMatchY = obj.y;
        lowestMatchIndex = i;
        matchFound = true;
      }
    }
  }

  if (matchFound && lowestMatchIndex !== -1) {
    const matchedObj = fallingObjects[lowestMatchIndex];
    const points = matchedObj.word.length || 1;

    console.log(`Word matched: ${matchedObj.word}`);
    score += points;
    wordsTyped++;
    updateScore();

    showScorePopup(matchedObj.element, points);
    removeObject(lowestMatchIndex);

    if (score > 0 && score % 50 < points) {
      console.log(
        `Score crossed 50 threshold (${score}), attempting life gain.`
      );
      gainLife();
    }

    e.target.value = "";
  }
}

function handleWordInputKeydown(e) {
  if (e.key === "Enter" && e.target.value) {
  }
}

// --- Global Key Handling ---
function handleGlobalKeydown(e) {
  if (e.key === "Escape") {
    console.log("Escape key pressed.");
    const modal = document.getElementById("gaming-name-modal");
    const activeScreenElement = document.querySelector(".screen.active");

    if (modal?.classList.contains("active")) {
      console.log("Closing gaming name modal via Escape.");
      closeGamingNameModal();
    } else if (activeScreenElement?.id === "game-screen") {
      console.log("Exiting game screen to home via Escape.");
      showScreen("home-screen");
    } else if (
      activeScreenElement &&
      activeScreenElement.id !== "home-screen"
    ) {
      console.log(
        `Returning to home screen from ${activeScreenElement.id} via Escape.`
      );
      showScreen("home-screen");
    } else {
      console.log(
        "Escape pressed on home screen or no active screen, no action."
      );
    }
  }
}

console.log("Script execution finished.");
