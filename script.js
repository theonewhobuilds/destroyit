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
// --- MODIFIED: Added Detailed Logging ---
async function initializeSupabase() {
  console.log(">>> initializeSupabase START"); // ADDED
  try {
    console.log(">>> Checking window.supabase..."); // ADDED
    if (!window.supabase?.createClient) {
      throw new Error("Supabase library not loaded from CDN.");
    }
    console.log(">>> Fetching config..."); // ADDED
    const response = await fetch(
      "https://ikbnuqabgdgikorhipnm.functions.supabase.co/auth-config",
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    console.log(">>> Config fetch status:", response.status); // ADDED

    if (!response.ok) {
      // Log the response text for more details on failure
      const errorText = await response.text();
      console.error(">>> Failed config fetch response text:", errorText); // ADDED
      throw new Error(
        `Failed to fetch Supabase configuration - Status: ${response.status}`
      );
    }

    const config = await response.json();
    console.log(">>> Config received."); // ADDED

    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      console.error(">>> Received config:", config); // ADDED for debugging
      throw new Error("Fetched configuration is missing URL or Key.");
    }

    console.log(">>> Creating client..."); // ADDED
    const { createClient } = window.supabase;
    supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
    console.log(">>> Supabase client CREATED SUCCESSFULLY."); // ADDED

    console.log(">>> Adding onAuthStateChange listener..."); // ADDED
    supabase.auth.onAuthStateChange((event, session) => {
      // Avoid logging full session object, just relevant info
      const userEmail = session?.user?.email || "No user";
      console.log(`>>> Auth state changed: ${event}, User: ${userEmail}`); // MODIFIED Log
      checkAuth();
    });
    console.log(">>> onAuthStateChange listener added."); // ADDED

    console.log(">>> Running initial checkAuth..."); // ADDED
    await checkAuth();
    console.log(">>> Initial checkAuth finished."); // ADDED

    isInitialized = true;
    console.log(">>> initializeSupabase COMPLETE (isInitialized = true)."); // ADDED

  } catch (error) {
    // Log the specific error that occurred in the try block
    console.error(">>> FATAL ERROR in initializeSupabase:", error); // MODIFIED
    // Keep the user-facing error message, but avoid clearing everything if possible
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = "color: red; padding: 20px; font-size: 1.5em; text-align: center; position: fixed; top: 0; left: 0; width: 100%; background: white; z-index: 1000;";
    errorDiv.textContent = `Error initializing Supabase: ${error.message}. Check console & configuration.`;
    document.body.prepend(errorDiv);
    // Re-throw the error so the .catch() in DOMContentLoaded also sees it
    throw new Error("Stopping script execution due to Supabase init failure.");
  }
}
// --- End of Modified initializeSupabase ---


// Ensure functions don't run before initialization
function ensureInitialized() {
  if (!isInitialized) {
    console.error("Check: Supabase not initialized yet. Function call blocked."); // MODIFIED log
    return false;
  }
  return true;
}

// Modified checkAuthAndPlay to handle async properly
async function checkAuthAndPlay() {
  // No ensureInitialized check here, let functions handle it or rely on UI state
  // if (!ensureInitialized()) return; // REMOVED redundant check

  console.log("checkAuthAndPlay triggered - CurrentUser:", currentUser?.email || "None", "isGuest:", isGuest);
  if (!currentUser && !isGuest) { // More robust check: Neither logged in nor explicitly playing as guest
     console.log("No user/guest found, prompting...");
     // Small delay to ensure UI is ready for confirm dialog
     await new Promise(resolve => setTimeout(resolve, 50));
    if (
      confirm("Sign in with Google to save scores?\n\n(Cancel to play as guest)") // Added newline for clarity
    ) {
      await signInWithGoogle();
    } else {
      playAsGuest(); // User chose guest
    }
  } else if (currentUser) { // User is logged in
      const name = await checkGamingName();
      if (!name) {
          console.log("User logged in, but no gaming name. Showing modal.");
          showGamingNameModal(false); // Show modal for initial setup
      } else {
          console.log("User logged in with gaming name. Starting game screen.");
          showScreen("game-screen");
      }
  } else if (isGuest) { // Already in guest mode
       if (!currentGamingName) {
           console.log("Guest mode, but no name yet. Showing modal.");
           showGamingNameModal(false); // Show modal for guest name input
       } else {
           console.log("Guest mode with name. Starting game screen.");
           showScreen("game-screen");
       }
  }
}


// Modified showScreen to handle async
async function showScreen(screenId) {
  // Don't block home screen even if not initialized
  if (!isInitialized && screenId !== 'home-screen') {
      console.warn(`showScreen(${screenId}) blocked: Supabase not initialized.`);
      // Potentially show an error or loading state instead of just returning
      return;
  }

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
    slowdownActive = false;
    pauseActive = false;
    slowdownTimeout = null;
    pauseTimeout = null;
    clearGameElements();
  }

  const targetScreen = document.getElementById(screenId);
  if (targetScreen) {
    targetScreen.classList.add("active");
    console.log(`Screen ${screenId} activated.`); // Confirmation log
  } else {
    console.error("Screen element not found:", screenId, "Fallback to home.");
    const homeScreen = document.getElementById("home-screen");
    if(homeScreen) homeScreen.classList.add("active");
    else console.error("FATAL: Home screen element not found either!");
    return; // Exit if target screen (and maybe home) not found
  }

  // Screen-specific actions
  console.log(`Running actions for screen: ${screenId}`);
  try {
    // Use optional chaining more safely
    const backButton = document.getElementById("leaderboard-back-btn");

    switch (screenId) {
      case "profile-screen":
        if (currentUser) {
          console.log("Loading profile stats and checking name...");
          // Run concurrently
          await Promise.all([loadProfileStats(), checkGamingName()]);
          console.log("Profile data loading finished.");
        } else {
          console.warn("Profile screen requested but no user logged in. Redirecting home.");
          showScreen("home-screen"); // Redirect if no user
        }
        break;
      case "leaderboard-screen":
        console.log("Fetching leaderboard...");
        await fetchLeaderboard();
        if(backButton) backButton.style.setProperty("display", "block", "important");
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
          if (!isGuest && currentUser) { // Only show modal if logged in but no name
            console.log("Showing gaming name modal for logged-in user.");
            showGamingNameModal(false);
          } else if (isGuest && !currentGamingName) { // Or if guest but no name yet
            console.log("Showing gaming name modal for guest.");
            showGamingNameModal(false);
          } else { // Otherwise (e.g., not logged in, not guest) go home
            console.log("Redirecting to home screen as game cannot start.");
            showScreen("home-screen");
          }
        }
        break;
      case "home-screen":
        console.log("Refreshing auth state for home screen...");
        await checkAuth(); // Refresh auth UI state
        if(backButton) backButton.style.setProperty("display", "none", "important");
        break;
      // Add cases for 'end-screen', 'gaming-name-modal' if they are treated as full screens
      case 'end-screen':
          console.log("End screen shown.");
           if(backButton) backButton.style.setProperty("display", "none", "important");
          break;
      default:
           console.log(`No specific actions for screen: ${screenId}`);
           if(backButton) backButton.style.setProperty("display", "none", "important");
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
  updateUIName(null); // Update UI immediately
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

function signInWithGoogle() {
  if (!ensureInitialized()) return; // Check here before using supabase
  console.log("Attempting Google Sign-In...");
  // Add error handling for the OAuth process itself
  supabase.auth
    .signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href }, // Ensure this URL is in Supabase Auth providers list
    })
    .then(({ data, error }) => {
        if (error) {
            console.error("Error initiating Google Sign-In:", error.message);
            alert(`Google Sign-In failed: ${error.message}`);
        } else {
            // Redirect usually happens before this logs, but good practice
            console.log("Google Sign-In process initiated, redirect should occur.");
        }
    });
}


function logout() {
  if (!ensureInitialized()) return; // Check here before using supabase
  console.log("Logging out...");
  supabase.auth
    .signOut()
    .then(({ error }) => {
        if (error) {
            console.error("Error during sign out:", error);
            // Optionally alert user
            // alert(`Logout failed: ${error.message}`);
        } else {
             console.log("Sign out successful.");
             // Clear local state immediately in case listener is slow
             currentUser = null;
             currentGamingName = null;
             isGuest = false;
             updateUIName(null);
             // Listener (checkAuth) should handle UI and redirect to home if needed
        }
    })
    .catch((err) => {
        // Catch errors in the promise itself
        console.error("Sign out promise catch error:", err);
        // alert(`An unexpected error occurred during logout.`);
    });
}


async function checkAuth() {
  // Do NOT check ensureInitialized() here, as this might run *during* initialization
  if (!supabase) {
      console.log("checkAuth called before Supabase client exists.");
      // Update UI to logged-out state if called too early
      document.getElementById("login-btn")?.style.setProperty("display", "block", "important");
      document.getElementById("profile-btn")?.style.setProperty("display", "none", "important");
      document.getElementById("logout-btn")?.style.setProperty("display", "none", "important");
      document.getElementById("guest-btn")?.style.setProperty("display", "block", "important");
      return false; // Indicate failure/not ready
  }

  console.log("checkAuth: Checking session..."); // Add log
  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
        // Log session errors but don't necessarily stop
        console.error("checkAuth: Error getting session:", sessionError.message);
    }

    // Get elements safely
    const loginBtn = document.getElementById("login-btn");
    const profileBtn = document.getElementById("profile-btn");
    const logoutBtn = document.getElementById("logout-btn");
    const guestBtn = document.getElementById("guest-btn");

    if (session?.user) {
      // User is logged in
      console.log("checkAuth: User session active:", session.user.email);
      if (currentUser?.id !== session.user.id) { // Log only if user changes or first time
          console.log("checkAuth: Current user state updated.");
      }
      currentUser = session.user;
      isGuest = false; // Ensure guest mode is off if logged in

      // Update UI
      if(loginBtn) loginBtn.style.setProperty("display", "none", "important");
      if(profileBtn) profileBtn.style.setProperty("display", "block", "important");
      if(logoutBtn) logoutBtn.style.setProperty("display", "block", "important");
      if(guestBtn) guestBtn.style.setProperty("display", "none", "important");

      console.log("checkAuth: Checking gaming name for logged-in user...");
      await checkGamingName(); // Load/update name after confirming user
      console.log("checkAuth: Finished gaming name check.");
      return true; // Indicate user is logged in
    } else {
      // User is logged out or no session
      if (currentUser) { // Log only if state changes from logged in to logged out
         console.log("checkAuth: No active user session found / User logged out.");
      }
      currentUser = null;
      // Don't automatically turn off guest mode here, only login turns it off
      // isGuest = false;
      currentGamingName = null; // Clear name if logged out

      // Update UI
      if(loginBtn) loginBtn.style.setProperty("display", "block", "important");
      if(profileBtn) profileBtn.style.setProperty("display", "none", "important");
      if(logoutBtn) logoutBtn.style.setProperty("display", "none", "important");
      if(guestBtn) guestBtn.style.setProperty("display", "block", "important");

      updateUIName(null); // Explicitly clear name display
      console.log("checkAuth: User is logged out.");
      return false; // Indicate user is logged out
    }
  } catch (error) {
    console.error("checkAuth: FATAL Error in checkAuth function:", error);
    // Force logged-out state UI on unexpected error
    currentUser = null; isGuest = false; currentGamingName = null;
    document.getElementById("login-btn")?.style.setProperty("display", "block", "important");
    document.getElementById("profile-btn")?.style.setProperty("display", "none", "important");
    document.getElementById("logout-btn")?.style.setProperty("display", "none", "important");
    document.getElementById("guest-btn")?.style.setProperty("display", "block", "important");
    updateUIName(null);
    return false; // Indicate failure
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
  // Allow slightly more chars if needed, adjust regex as required
  let sanitized = name.toLowerCase().replace(/[^a-z0-9_]/g, ""); // only letters, numbers, underscore
  if (sanitized.length < 3)
    return {
      valid: false,
      message: "Min 3 chars required (a-z, 0-9, _ only)",
      sanitized: "",
    };
  if (sanitized.length > 15) {
      console.log(`Name truncated: '${sanitized}' -> '${sanitized.substring(0, 15)}'`);
      sanitized = sanitized.substring(0, 15); // Apply max length strictly
  }
  // Check if sanitization actually changed the name (ignoring case)
  if (sanitized !== name.toLowerCase().replace(/[^a-z0-9_]/g, "").substring(0,15)) {
      console.warn(`Name sanitized due to invalid characters or length: '${name}' -> '${sanitized}'`);
      // Optional: alert the user about the sanitization
      // alert(`Your name was adjusted to '${sanitized}' due to invalid characters or length.`);
  }
  return { valid: true, message: "", sanitized: sanitized };
}

function canChangeGamingName() {
  if (!currentUser) return true; // Should not happen if called correctly, but safe default
  const today = new Date().toISOString().split("T")[0];
  const key = `nameChanges_${currentUser.id}_${today}`;
  const changesMade = parseInt(localStorage.getItem(key) || "0");
  console.log(`Checking name change limit: ${changesMade} changes made today.`);
  return changesMade < 3; // Allow up to 3 changes (0, 1, 2)
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
  // Use a less intrusive confirmation, or just rely on console logs
  // alert(`Gaming name updated! You have ${remaining} changes remaining today.`);
  console.log(`User has ${remaining} name changes remaining today.`);
}

function showGamingNameModal(isUpdate = false) {
  const modal = document.getElementById("gaming-name-modal");
  if (!modal) return console.error("Gaming name modal element not found!");

  // Pre-checks
  if (isUpdate && !currentUser) {
    console.warn("Attempted to show update name modal, but user not logged in.");
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
  modal.dataset.isProfileUpdate = isUpdate ? "true" : "false"; // Store mode

  const inputField = document.getElementById("gaming-name-input");
  if (inputField) {
    inputField.value = (isUpdate && currentGamingName) ? currentGamingName : ""; // Pre-fill if updating
    // Ensure input is focused after modal transition
    setTimeout(() => {
        inputField.focus();
        inputField.select(); // Select existing text if updating
    } , 150); // Slightly longer delay
  } else {
      console.error("Gaming name input field not found in modal!");
  }
}


function closeGamingNameModal() {
  const modal = document.getElementById("gaming-name-modal");
  if (!modal) return console.error("Gaming name modal element not found!");;
  modal.classList.remove("active");
  console.log("Gaming name modal closed.");

  // Handle edge cases where closing the modal should revert state or redirect
  // Check if modal was for initial guest setup and no name was set
  if (isGuest && !currentGamingName && modal.dataset.isProfileUpdate === "false") {
      console.log("Guest cancelled initial name setup, reverting guest status.");
      isGuest = false; // Revert guest status
      updateUIName(null);
      showScreen("home-screen"); // Go back home
  }
  // Check if modal was for initial logged-in setup and no name was set
  else if (!isGuest && currentUser && !currentGamingName && modal.dataset.isProfileUpdate === "false") {
      console.log("Logged-in user cancelled initial name setup, going home.");
      // Don't log out, just return to home
      showScreen("home-screen");
  }
}

async function checkGamingName() {
  // No ensureInitialized check needed if called by checkAuth or other initialized paths
  if (!currentUser?.id) {
    console.log("checkGamingName: No user ID, clearing name.");
    updateUIName(null); // Clear UI if no user
    return null;
  }

  console.log(`checkGamingName: Checking for user ${currentUser.id}`);
  try {
    const { data, error, status } = await supabase
      .from("profiles")
      .select("gaming_name")
      .eq("id", currentUser.id)
      .single(); // Use single() if ID should be unique

    if (error && status !== 406) { // 406 means 'Not Acceptable', Supabase uses this if row not found with single()
        console.error(`checkGamingName: Error fetching profile (${status}):`, error.message);
        currentGamingName = null;
        updateUIName("Error"); // Show error in UI
        return null;
    }

    if (data) {
        currentGamingName = data.gaming_name;
        console.log(`checkGamingName: Found name: ${currentGamingName}`);
    } else {
        console.log(`checkGamingName: No profile/name found for user ${currentUser.id}.`);
        currentGamingName = null;
    }
    updateUIName(currentGamingName); // Update UI with found name or null
    return currentGamingName;

  } catch (fetchError) {
      // Catch unexpected JS errors during the fetch/process
      console.error("checkGamingName: Unexpected error:", fetchError);
      currentGamingName = null;
      updateUIName("Error");
      return null;
  }
}


function updateUIName(name) {
  console.log(`updateUIName: Setting display name based on: ${name}, isGuest: ${isGuest}, currentUser: ${currentUser?.email}`);
  const profileNameEl = document.getElementById("current-gaming-name");
  const gameNameEl = document.getElementById("player-name"); // Element in the game screen UI

  // Determine the name to display
  let displayName;
  if (name) {
      displayName = name;
  } else if (isGuest) {
      displayName = "Guest"; // Guest mode, but maybe name not set yet
  } else if (currentUser) {
      displayName = "Not Set"; // Logged in, but no gaming name
  } else {
      displayName = "Player"; // Default fallback (e.g., before init)
  }
  console.log(`updateUIName: Determined displayName: ${displayName}`);

  // Update elements if they exist
  if (profileNameEl) {
      profileNameEl.textContent = name || "Not Set"; // Profile always shows 'Not Set' or the name
      console.log(`Updated profile name element.`);
  } else {
      // console.warn("updateUIName: Profile name element not found.");
  }
  if (gameNameEl) {
      gameNameEl.textContent = displayName; // Game screen uses the calculated display name
      console.log(`Updated game name element.`);
  } else {
      // console.warn("updateUIName: Game name element not found.");
  }
}


async function submitGamingName() {
  if (!ensureInitialized()) return; // Ensure Supabase is ready if submitting to DB
  console.log("submitGamingName triggered.");

  const modal = document.getElementById("gaming-name-modal");
  const input = document.getElementById("gaming-name-input");
  const errorMsgEl = document.getElementById("gaming-name-error"); // Assuming you add an element for errors

   // Clear previous errors
   if(errorMsgEl) errorMsgEl.textContent = "";

  if (!modal || !input) {
      console.error("submitGamingName: Modal or input element not found.");
      return;
  }

  const validation = validateGamingName(input.value);
  if (!validation.valid) {
      console.warn("submitGamingName: Validation failed:", validation.message);
      if(errorMsgEl) errorMsgEl.textContent = validation.message; // Show error in UI
      else alert(validation.message); // Fallback to alert
      input.focus(); // Keep focus on input
      return;
  }

  const gamingName = validation.sanitized;
  const isUpdate = modal.dataset.isProfileUpdate === "true";
  console.log(`submitGamingName: Validated name: ${gamingName}, isUpdate: ${isUpdate}`);

  // --- Logged-in User Flow ---
  if (currentUser) {
      console.log("Submitting as logged-in user.");
      if (isUpdate && gamingName === currentGamingName) {
          console.log("Name hasn't changed.");
          if(errorMsgEl) errorMsgEl.textContent = "Name has not changed.";
          else alert("Name has not changed.");
          return; // Don't proceed if name is the same
      }
      if (isUpdate && !canChangeGamingName()) {
          console.warn("Update blocked: Daily limit reached.");
          if(errorMsgEl) errorMsgEl.textContent = "Daily name change limit reached.";
          else alert("Daily name change limit reached.");
          return;
      }

      // Add a loading indicator if possible
      console.log("Checking if name is taken...");
      try {
          // Check if name already exists (case-insensitive handled by DB potentially, or check here)
          const { data: existing, error: checkErr } = await supabase
              .from("profiles")
              .select("id")
              .eq("gaming_name", gamingName) // Ensure your DB handles case-insensitivity or convert here
              .neq("id", currentUser.id) // Exclude self
              .limit(1);

          if (checkErr) {
              console.error("Error checking for existing name:", checkErr);
              throw new Error(`Database error checking name: ${checkErr.message}`);
          }
          if (existing?.length > 0) {
              console.warn("Name already taken.");
               if(errorMsgEl) errorMsgEl.textContent = "Gaming name already taken.";
               else alert("Gaming name already taken.");
              input.focus(); // Keep focus on input
              return;
          }

          console.log(`Upserting profile for ${currentUser.id} with name ${gamingName}`);
          // Upsert the profile
          const { data: upsertData, error: upsertErr } = await supabase
              .from("profiles")
              .upsert(
                  {
                      id: currentUser.id, // Primary key
                      gaming_name: gamingName,
                      updated_at: new Date().toISOString(),
                  },
                  {
                      onConflict: "id", // Specify the conflict column
                      // defaultToNull: false // Removed, upsert usually handles defaults
                  }
              )
              .select("gaming_name") // Select the name back to confirm
              .single(); // Expect single row back

          if (upsertErr) {
               console.error("Error upserting profile:", upsertErr);
               throw new Error(`Failed to save name: ${upsertErr.message}`); // Let catch block handle alert
          }

          console.log("Profile upsert successful:", upsertData);
          const previousName = currentGamingName; // Store before update
          currentGamingName = upsertData.gaming_name;
          updateUIName(currentGamingName); // Update UI

          if (isUpdate && currentGamingName !== previousName) {
              incrementNameChangeCounter(); // Handle count and alert
          } else if (isUpdate) {
              alert("Gaming name saved successfully."); // Simple confirmation if name was just set
          }

          modal.classList.remove("active"); // Close modal on success
          input.value = ""; // Clear input

          if (!isUpdate) {
              console.log("Initial name set, proceeding to game screen.");
              showScreen("game-screen"); // Proceed to game if initial setup
          } else {
              console.log("Name updated, reloading profile stats.");
              loadProfileStats(); // Refresh profile stats after update
          }

      } catch (error) { // Catch errors from check or upsert
          console.error("submitGamingName (logged-in) error:", error);
          if(errorMsgEl) errorMsgEl.textContent = error.message || "Failed to save name.";
          else alert(error.message || "Failed to save name. Check console.");
          // Consider keeping modal open on error?
      }

  // --- Guest Flow ---
  } else if (isGuest) {
      console.log("Submitting as guest.");
      // Simple local assignment for guest
      currentGamingName = gamingName;
      updateUIName(currentGamingName);
      console.log("Guest name set locally:", currentGamingName);
      modal.classList.remove("active");
      input.value = "";
      console.log("Guest name set, proceeding to game screen.");
      showScreen("game-screen");

  // --- Error Flow ---
  } else {
      console.error("submitGamingName called unexpectedly without user or guest state.");
      alert("Cannot submit name. Please log in or choose 'Play as Guest'.");
  }
}


// --- Profile & Leaderboard Data ---
async function loadProfileStats() {
  if (!ensureInitialized()) return; // Need Supabase
  if (!currentUser?.id) {
      console.log("loadProfileStats: Cannot load stats - No user ID.");
      // Clear stats UI elements
       document.getElementById("current-gaming-name").textContent = "N/A";
       document.getElementById("highest-score").textContent = "-";
       document.getElementById("best-wpm").textContent = "-";
       document.getElementById("games-played").textContent = "-";
       document.getElementById("leaderboard-rank").textContent = "-";
      return;
  }

  console.log(`loadProfileStats: Loading for user ${currentUser.id}`);
  // Set UI to loading state
  document.getElementById("current-gaming-name").textContent = currentGamingName || "Loading...";
  document.getElementById("highest-score").textContent = "Loading...";
  document.getElementById("best-wpm").textContent = "Loading...";
  document.getElementById("games-played").textContent = "Loading...";
  document.getElementById("leaderboard-rank").textContent = "Loading...";

  try {
      // Fetch scores and calculate stats
      const { data: userScores, error: scoreError } = await supabase
          .from("scores") // Your scores table name
          .select("score, wpm")
          .eq("profile_id", currentUser.id); // Foreign key column linking to profiles table

      if (scoreError) throw scoreError; // Handle DB error

      const highestScore = userScores.length > 0 ? Math.max(...userScores.map(s => s.score || 0)) : 0;
      const bestWPM = userScores.length > 0 ? Math.max(...userScores.map(s => s.wpm || 0)) : 0;
      const gamesPlayed = userScores.length;

      // Update main stats
      document.getElementById("highest-score").textContent = highestScore;
      document.getElementById("best-wpm").textContent = bestWPM;
      document.getElementById("games-played").textContent = gamesPlayed;
      console.log(`loadProfileStats: Basic stats loaded - Score: ${highestScore}, WPM: ${bestWPM}, Played: ${gamesPlayed}`);

      // Fetch ranking - This can be slow if the table is large
      console.log("loadProfileStats: Fetching rank...");
      // More efficient way to get rank might be an RPC function or view in Supabase
      const { data: rankedScores, error: rankError } = await supabase
          .from('scores') // Use your scores table name
           // Select only necessary columns for ranking
          .select('profile_id, score')
           // Order by score descending, then maybe WPM or timestamp if needed for ties
          .order('score', { ascending: false })
          .order('wpm', { ascending: false, nullsFirst: false }); // Example tie-breaker
          // Consider adding .limit(1000) or similar if leaderboard is huge

      if (rankError) throw rankError; // Handle DB error

      // Find the user's rank - use profile_id for matching
      // Note: This simple findIndex assumes one entry per user or ranks based on highest score only.
      // If users can have multiple scores, you need a more complex ranking logic (e.g., GROUP BY user, MAX(score))
      // which is best done in the database (RPC/View).
      const userRankIndex = rankedScores.findIndex(score => score.profile_id === currentUser.id);
      const rank = userRankIndex !== -1 ? userRankIndex + 1 : 0; // Rank is index + 1

      document.getElementById("leaderboard-rank").textContent = rank > 0 ? `#${rank}` : "Unranked";
      console.log(`loadProfileStats: Rank calculated: ${rank > 0 ? '#' + rank : 'Unranked'}`);

  } catch (error) {
      console.error("loadProfileStats: Error loading profile stats:", error);
      // Update UI to show error state
      document.getElementById("highest-score").textContent = "Error";
      document.getElementById("best-wpm").textContent = "Error";
      document.getElementById("games-played").textContent = "Error";
      document.getElementById("leaderboard-rank").textContent = "Error";
  } finally {
      // Ensure gaming name is updated even if stats fail
      document.getElementById("current-gaming-name").textContent = currentGamingName || "Not Set";
       console.log("loadProfileStats: Finished loading attempt.");
  }
}

function fetchLeaderboard() {
  if (!ensureInitialized()) return; // Need Supabase
  console.log("Fetching leaderboard...");
  const container = document.getElementById("leaderboard-container-dynamic"); // Target the inner div for content replacement
  if (!container) {
      console.error("Leaderboard dynamic content container not found!");
      return;
  }
  // Clear previous content and show loading
  container.innerHTML = `<div style="text-align:center; padding: 20px; color: #00f7ff;">Loading...</div>`;

  supabase
      .rpc('get_leaderboard_with_profiles') // Call the RPC function
      // .select() is not needed after RPC unless the RPC returns complex types needing selection
      .limit(10) // Limit results if RPC doesn't handle it internally
      .then(({ data, error }) => {
          if (error) {
              console.error("Error fetching leaderboard via RPC:", error);
              container.innerHTML = `<div style="text-align:center; padding: 20px; color: #ff00ff;">Error: ${error.message}</div>`;
              return;
          }

          container.innerHTML = ""; // Clear loading message

          if (!data || data.length === 0) {
              container.innerHTML = `<div style="text-align:center; padding: 20px; color: #00f7ff;">No scores submitted yet.</div>`;
              console.log("Leaderboard empty.");
              return;
          }

          console.log("Leaderboard data received:", data);
          // Assuming RPC returns { rank, gaming_name, score, wpm } for each entry
          data.forEach(entry => {
              const item = document.createElement("div");
              item.className = "leaderboard-item";
              // Adjust based on exact column names returned by your RPC function
              item.innerHTML = `
                  <div class="rank">#${entry.rank || '-'}</div>
                  <div class="username">${entry.gaming_name || 'Player'}</div>
                  <div class="score">${entry.score || 0}</div>
                  <div class="wpm">${entry.wpm || 0}</div>`;
              container.appendChild(item);
          });
          console.log("Leaderboard display updated.");

      }).catch(fetchError => {
          console.error("Fetch Leaderboard Promise Catch (RPC):", fetchError);
          container.innerHTML = `<div style="text-align:center; padding: 20px; color: #ff00ff;">Failed to load leaderboard.</div>`;
      });
}


// --- Game Mechanics ---
function initGame() {
  console.log("Initializing game state...");
  clearGameElements();
  score = 0;
  lives = 3;
  wordsTyped = 0;
  fallingObjects = [];
  activePowerups = [];
  gameStartTime = Date.now(); // Set start time
  lastScoreBracket = -1;
  powerupSpawned = {};

  // Clear any active timers/states from previous game
  if (slowdownTimeout) clearTimeout(slowdownTimeout);
  slowdownTimeout = null;
  slowdownActive = false;
  if (pauseTimeout) clearTimeout(pauseTimeout);
  pauseTimeout = null;
  pauseActive = false;
  if (gameInterval) clearInterval(gameInterval); // Ensure previous loop is stopped
  gameInterval = null;

  // Update UI elements
  updateScore();
  updateLives();
  updateUIName(currentGamingName); // Display correct player name

  // Ensure visibility is correct
  document.getElementById("lives")?.style.setProperty("display", "flex", "important");
  document.getElementById("game-status")?.style.setProperty("display", "none", "important"); // Hide 'Game Over' etc.

  // Focus input field
  document.getElementById("word-input")?.focus();

  console.log("Game state initialized for:", currentGamingName || (isGuest ? "Guest" : "Player"));
}


function clearGameElements() {
  console.log("Clearing game elements...");
  const gameArea = document.querySelector(".game-area");
  if (!gameArea) {
      console.error("clearGameElements: Game area not found!");
      return;
  }
  // Remove all dynamic game items
  gameArea.querySelectorAll(".falling-object, .powerup, .score-popup, .powerup-effect").forEach(el => el.remove());

  // Reset game state arrays
  fallingObjects = [];
  activePowerups = [];

  // Clear the input field
  const wordInput = document.getElementById("word-input");
  if (wordInput) {
      wordInput.value = "";
  }
  console.log("Game elements cleared.");
}

function updateScore() {
  // Update score display
  const scoreElement = document.getElementById("score");
  if (scoreElement) {
      scoreElement.textContent = score;
  } else {
      // console.warn("Score element not found.");
  }

  // Calculate and update WPM display
  let currentWpm = 0; // Default to 0
  if (gameStartTime && wordsTyped > 0) { // Check if game started and words typed
      const elapsedSeconds = (Date.now() - gameStartTime) / 1000;
      // Avoid division by zero and calculate WPM only after a minimum duration (e.g., 3 seconds)
      if (elapsedSeconds >= 3) { // Roughly 0.05 minutes
          const gameDurationMinutes = elapsedSeconds / 60;
          currentWpm = Math.round(wordsTyped / gameDurationMinutes);
      }
  }
  const wpmElement = document.getElementById("wpm");
  if (wpmElement) {
      wpmElement.textContent = currentWpm;
  } else {
       // console.warn("WPM element not found.");
  }
  // console.log(`Score: ${score}, WPM: ${currentWpm}`); // Log score/wpm updates frequently if needed
}


function updateLives() {
  const livesDisplay = document.getElementById("lives");
  if (!livesDisplay) {
      console.error("Lives display element not found!");
      return;
  }
  livesDisplay.innerHTML = ""; // Clear previous hearts
  console.log(`Updating lives display: ${lives} lives remaining.`);
  // Add heart icons based on current lives
  for (let i = 0; i < lives; i++) {
    const lifeElement = document.createElement('span');
    lifeElement.className = 'life'; // Use class for styling (e.g., background image)
    lifeElement.textContent = '❤️'; // Simple text fallback or use CSS background
    livesDisplay.appendChild(lifeElement);
  }
}


function gainLife() {
  if (lives < 3) { // Check if lives are below max
    lives++;
    updateLives(); // Update UI
    console.log("Gained life, lives =", lives);
    // Optional: Add visual effect for gaining life
  } else {
    console.log("Max lives reached, cannot gain more.");
    // Optional: Give points instead if at max lives?
    // score += 10; updateScore();
  }
}

function loseLife() {
  if (lives > 0) { // Only lose life if available
    lives--;
    updateLives(); // Update UI
    console.log("Lost life, lives =", lives);
    // Optional: Add visual/sound effect for losing life
  } else {
      console.log("Already at 0 lives."); // Prevent going below zero
  }

  // Check for game over condition AFTER updating lives
  if (lives <= 0 && gameInterval) { // Only trigger if game is actually running
    console.log("Lives reached 0, triggering game over.");
    gameOver();
  }
}


function spawnObject() {
  const gameArea = document.querySelector(".game-area");
  // Exit if game area not found or game is paused
  if (!gameArea || pauseActive) return;

  const words = ["ACCESS","ADMIN","AUTH","BINARY","BUFFER","CACHE","CIPHER","CLIENT","CLOUD","CODE","COMPILER","CONNECT","CONSOLE","COOKIE","CORE","CRACK","CYBER","DATA","DEBUG","DECODE","DENIAL","DEVICE","DNS","DOMAIN","ENCRYPT","ERROR","EXPLOIT","FIREWALL","FRAMEWORK","GLITCH","GRID","HACK","HASH","HOST","INPUT","INSTALL","INTEL","KERNEL","KEY","LEAK","LINK","LOG","LOOP","MALWARE","MATRIX","MEMORY","MODEM","NET","NEURAL","NODE","NULL","PACKET","PATCH","PING","PIXEL","PORT","PROXY","QUERY","RAM","RENDER","ROOT","ROUTER","SCRIPT","SDK","SEGMENT","SERVER","SHELL","SOCKET","SOURCE","SPAM","STACK","STREAM","SYNTAX","SYSTEM","TABLE","TOKEN","TRACE","UPLOAD","URL","USER","VIRUS","VOID","WAREZ","WIRE","ZONE"]; // Ensure wordlist is loaded
  if (!words || words.length === 0) {
      console.error("Word list is empty or not loaded!");
      return;
  }
  const word = words[Math.floor(Math.random() * words.length)];

  // Calculate position safely
  const areaWidth = gameArea.offsetWidth;
  const objectWidth = Math.max(80, word.length * 10 + 20); // Ensure minimum width, adjust font factor
  const maxLeft = Math.max(0, areaWidth - objectWidth); // Ensure maxLeft is not negative
  const x = Math.random() * maxLeft;

  // Create element
  const element = document.createElement("div");
  element.className = "falling-object";
  // Use textContent for security unless HTML is intended
  element.innerHTML = `<div class="shape">⬡</div><div class="word">${word}</div>`; // Assuming safe HTML
  element.style.position = "absolute"; // Ensure position is absolute
  element.style.left = `${x}px`;
  element.style.top = "-100px"; // Start above the screen
  element.style.width = `${objectWidth}px`;
  element.style.textAlign = 'center'; // Center text within the div

  gameArea.appendChild(element);
  // console.log(`Spawned word: ${word} at x: ${x.toFixed(0)}`);

  // Calculate speed based on score
  const baseMinSpeed = 1.5, baseMaxSpeed = 3.0, speedFactor = 0.009, maxSpeed = 8.0;
  const scoreBasedIncrease = score * speedFactor;
  const minSpeed = Math.min(baseMinSpeed + scoreBasedIncrease, maxSpeed - (baseMaxSpeed - baseMinSpeed));
  const maxSpeedNow = Math.min(baseMaxSpeed + scoreBasedIncrease, maxSpeed);
  let currentSpeed = minSpeed + Math.random() * (maxSpeedNow - minSpeed);

  // Store object data
  const obj = {
      word: word,
      element: element,
      y: -100,
      speed: currentSpeed,
      originalSpeed: currentSpeed // Store original speed for slowdown effect
  };

  // Apply slowdown if active
  if (slowdownActive) {
      obj.speed = obj.originalSpeed * 0.5;
      console.log(`Applying slowdown to new word ${word}, speed: ${obj.speed.toFixed(2)}`);
  }

  fallingObjects.push(obj);
}


function removeObject(index) {
  if (index >= 0 && index < fallingObjects.length) {
    const obj = fallingObjects[index];
    if (obj?.element) { // Check if element exists before removing
        // console.log(`Removing object: ${obj.word}`);
        obj.element.remove();
    } else {
        // console.log(`Attempted to remove object at index ${index}, but element was missing.`);
    }
    fallingObjects.splice(index, 1); // Remove from array
  } else {
      // console.warn(`Attempted to remove object at invalid index: ${index}`);
  }
}

function checkAndSpawnObjects() {
    // Exit if paused
    if (pauseActive) return;

    // Determine max objects based on score, with a minimum and maximum cap
    const baseMax = 2;
    const increasePer50Score = 1;
    const absoluteMax = 8;
    const maxObjects = Math.min(absoluteMax, baseMax + Math.floor(score / 50) * increasePer50Score);

    // Calculate spawn probability - higher chance when fewer objects are present
    let spawnProb = 0;
    if (fallingObjects.length < maxObjects) {
        // Probability increases linearly as the number of objects approaches 0 from maxObjects
        spawnProb = (1 - (fallingObjects.length / maxObjects)) * 0.1; // Adjust base probability (0.1 here)
    }

    // Randomly decide whether to spawn based on probability
    if (Math.random() < spawnProb) {
        // console.log(`Spawning object. Current: ${fallingObjects.length}, Max: ${maxObjects}, Prob: ${spawnProb.toFixed(2)}`);
        spawnObject();
    }
}


function spawnPowerup() {
  // Conditions to check before spawning
  if (score < 50 || pauseActive || activePowerups.length > 2) return; // Don't spawn if score too low, paused, or too many powerups already active

  // Spawn logic based on score brackets (e.g., one attempt per 100 points)
  const scoreBracket = Math.floor(score / 100);
  if (powerupSpawned[scoreBracket]) return; // Already attempted spawn in this bracket

  // Random chance to spawn within the bracket
  const spawnChance = 0.02; // 2% chance per game loop tick within the eligible bracket
  if (Math.random() > spawnChance) return;

  // Mark this bracket as attempted (even if spawn fails below)
  powerupSpawned[scoreBracket] = true;

  const gameArea = document.querySelector(".game-area");
  if (!gameArea) return console.error("spawnPowerup: Game area not found!");

  // Choose powerup type
  const types = ["extra-life", "slowdown", "pause", "destroy-all"];
  const type = types[Math.floor(Math.random() * types.length)];

  // Calculate position
  const powerupSize = 50; // Width/height of powerup element
  const areaWidth = gameArea.offsetWidth;
  const x = Math.random() * Math.max(0, areaWidth - powerupSize);

  // Create element
  const powerupElement = document.createElement("div");
  powerupElement.className = `powerup ${type}`; // General and specific class
  powerupElement.textContent = { "extra-life": "❤️", "slowdown": "⏱️", "pause": "⏸️", "destroy-all": "💥" }[type]; // Emoji representation
  powerupElement.style.left = `${x}px`;
  powerupElement.style.top = "-60px"; // Start above screen
  powerupElement.dataset.type = type; // Store type for click handler

  // Click listener for activation
  powerupElement.addEventListener("click", function handlePowerupClick() {
      console.log(`Powerup clicked: ${this.dataset.type}`);
      activatePowerup(this.dataset.type); // Activate effect
      // Find and remove from active list
      const index = activePowerups.findIndex(p => p.element === this);
      if (index !== -1) activePowerups.splice(index, 1);
      this.remove(); // Remove element from DOM
  });

  gameArea.appendChild(powerupElement);

  // Add to active list for movement/tracking
  activePowerups.push({
      element: powerupElement,
      type: type,
      y: -60
  });

  console.log(`Spawned powerup: ${type} at bracket ${scoreBracket}`);
}


function activatePowerup(type) {
  console.log(`Activating powerup: ${type}`);
  const gameArea = document.querySelector(".game-area");
  if (!gameArea) return console.error("activatePowerup: Game area not found!");

  // --- Display Activation Effect ---
  const effect = document.createElement("div");
  effect.className = "powerup-effect"; // Style this class in CSS
  effect.textContent = {
      "extra-life": "LIFE +1!",
      "slowdown": "SLOWDOWN!",
      "pause": "PAUSED!",
      "destroy-all": "CLEARED!"
  }[type];
  // Use distinct colors
  effect.style.color = {
      "extra-life": "#ff4d4d", // Light red
      "slowdown": "#00e6e6", // Cyan
      "pause": "#ffff66", // Yellow
      "destroy-all": "#ff66ff" // Magenta
  }[type];
  // Position effect (e.g., center top) - adjust as needed
  effect.style.position = 'absolute';
  effect.style.top = '10px';
  effect.style.left = '50%';
  effect.style.transform = 'translateX(-50%)';
  effect.style.fontSize = '2em';
  effect.style.fontWeight = 'bold';
  effect.style.zIndex = '100'; // Ensure visible

  gameArea.appendChild(effect);
  // Remove effect after a short duration
  setTimeout(() => effect.remove(), 1500); // Increased duration

  // --- Apply Powerup Logic ---
  switch(type) {
      case "extra-life":
          gainLife();
          break;

      case "slowdown":
          if (slowdownActive) { // If already active, just reset the timer
              console.log("Slowdown already active, resetting timer.");
              if (slowdownTimeout) clearTimeout(slowdownTimeout);
          } else { // If not active, apply slowdown
              console.log("Applying slowdown effect.");
              slowdownActive = true;
              fallingObjects.forEach(obj => {
                  // Ensure originalSpeed is stored if not already
                  if (obj.originalSpeed === undefined) obj.originalSpeed = obj.speed;
                  obj.speed = obj.originalSpeed * 0.5; // Apply slowdown
              });
          }
          // Set (or reset) the timeout to end the slowdown
          slowdownTimeout = setTimeout(() => {
              console.log("Slowdown ended.");
              slowdownActive = false;
              fallingObjects.forEach(obj => {
                  // Restore original speed if it exists
                  if (obj.originalSpeed !== undefined) {
                      obj.speed = obj.originalSpeed;
                      delete obj.originalSpeed; // Clean up
                  }
              });
              slowdownTimeout = null; // Clear timeout reference
          }, 10000); // 10 seconds duration
          break;

      case "pause":
          if (!pauseActive && gameInterval) { // Only pause if game is running and not already paused
              console.log("Pausing game.");
              clearInterval(gameInterval); // Stop the main game loop
              gameInterval = null;
              pauseActive = true;
              // Set timeout to automatically resume
              if (pauseTimeout) clearTimeout(pauseTimeout); // Clear previous resume timer if any
              pauseTimeout = setTimeout(() => {
                  if (pauseActive) { // Ensure still paused when timer fires
                      console.log("Auto-resuming game after pause.");
                      gameInterval = setInterval(gameLoop, 50); // Restart game loop
                      pauseActive = false;
                      pauseTimeout = null;
                  }
              }, 5000); // 5 seconds duration
          } else {
              console.log("Cannot activate pause: Already paused or game not running.");
              effect.remove(); // Remove the "PAUSED!" text if it couldn't activate
          }
          break;

      case "destroy-all":
          console.log("Destroying all falling objects.");
          let pointsGained = 0;
          let objectsDestroyed = 0;
          // Iterate backwards for safe removal while iterating
          for (let i = fallingObjects.length - 1; i >= 0; i--) {
              const obj = fallingObjects[i];
              const points = obj.word.length || 1; // Score based on word length
              pointsGained += points;
              objectsDestroyed++;
              showScorePopup(obj.element, points); // Show individual score popup
              removeObject(i); // Remove object from array and DOM
          }
          if (objectsDestroyed > 0) {
              score += pointsGained;
              wordsTyped += objectsDestroyed; // Count destroyed as 'typed' for WPM? Or keep separate? Let's count them.
              updateScore(); // Update total score display
              console.log(`Destroy All: +${pointsGained} points from ${objectsDestroyed} objects.`);
          } else {
              console.log("Destroy All: No objects to destroy.");
          }
          break;
      default:
          console.warn(`Unknown powerup type activated: ${type}`);
  }
}


function showScorePopup(targetElement, points) {
  // Ensure target element and game area exist
  if (!targetElement) return; // console.warn("showScorePopup: Target element missing.");
  const gameArea = document.querySelector(".game-area");
  if (!gameArea) return console.error("showScorePopup: Game area not found!");

  // Create popup element
  const popup = document.createElement("div");
  popup.className = "score-popup"; // Style this in CSS
  popup.textContent = `+${points}`;

  // Position popup near the target element
  // Get target position *after* it might have moved slightly in the game loop
  const targetRect = targetElement.getBoundingClientRect();
  const gameAreaRect = gameArea.getBoundingClientRect();

  // Calculate position relative to the game area
  popup.style.position = 'absolute'; // Position relative to gameArea
  popup.style.left = `${targetRect.left - gameAreaRect.left + targetRect.width / 2}px`; // Center horizontally
  popup.style.top = `${targetRect.top - gameAreaRect.top - 10}px`; // Slightly above
  popup.style.transform = 'translateX(-50%)'; // Center alignment trick

  gameArea.appendChild(popup);

  // Animate and remove popup
  // Example: Fade out and move up animation (can be done with CSS transitions/animations too)
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
  }, 50); // Adjust interval timing for animation speed (50ms * 20 steps = 1000ms)

  // Fallback removal in case animation glitches
  // setTimeout(() => {
  //     if (popup && popup.parentNode) { // Check if still exists and attached
  //         popup.remove();
  //     }
  // }, 1200); // Slightly longer than animation
}


// --- Core Game Loop & Control ---
function startGame() {
  // Pre-conditions checked in showScreen, just need to initialize
  console.log("startGame: Initializing and starting game loop...");
  initGame(); // Reset game state and UI

  // Initial object spawns
  spawnObject(); // Spawn one immediately
  // Spawn a second one after a short, random delay
  setTimeout(spawnObject, 1000 + Math.random() * 1000);

  // Start the main game loop interval
  // Ensure any previous interval is cleared (should be handled by initGame)
  if (gameInterval) clearInterval(gameInterval);
  gameInterval = setInterval(gameLoop, 50); // Adjust interval for desired frame rate (50ms = 20fps)

  console.log(`startGame: Game loop started with interval ID: ${gameInterval}.`);

  // Ensure input focus
  document.getElementById("word-input")?.focus();

  // Hide any status messages like "Game Over"
  document.getElementById("game-status")?.style.setProperty("display", "none", "important");
}


function gameLoop() {
  // The main loop function, called repeatedly by setInterval
  // Exit if paused
  if (pauseActive) {
      // console.log("Game loop paused."); // Avoid excessive logging
      return;
  }

  // Perform game updates
  updateGame(); // Move existing objects, check boundaries

  // Perform spawning actions
  checkAndSpawnObjects(); // Decide if new word objects should spawn
  spawnPowerup(); // Decide if powerups should spawn

  // No need to call requestAnimationFrame here if using setInterval
}

function updateGame() {
    const gameArea = document.querySelector(".game-area");
    if (!gameArea) return console.error("updateGame: Game area not found!"); // Stop if area missing

    const gameAreaHeight = gameArea.offsetHeight;
    const missBoundary = gameAreaHeight - 30; // Y-coordinate where objects count as missed (adjust as needed)

    // --- Update Falling Word Objects ---
    // Iterate backwards for safe removal
    for (let i = fallingObjects.length - 1; i >= 0; i--) {
        const obj = fallingObjects[i];

        // Basic validation of object structure
        if (!obj || !obj.element || typeof obj.y !== 'number' || typeof obj.speed !== 'number') {
            console.warn(`updateGame: Invalid object found at index ${i}, removing.`, obj);
            removeObject(i); // Remove malformed object
            continue;
        }

        // Update position
        obj.y += obj.speed;
        obj.element.style.top = `${obj.y}px`;

        // Check if object reached the bottom (missed)
        if (obj.y > missBoundary) {
            // console.log(`Word '${obj.word}' missed at y=${obj.y.toFixed(0)}`);
            showScorePopup(obj.element, -1); // Indicate missed visually? Optional.
            removeObject(i);
            loseLife(); // Player loses a life
        }
    }

    // --- Update Active Powerups ---
    // Iterate backwards for safe removal
    for (let i = activePowerups.length - 1; i >= 0; i--) {
        const p = activePowerups[i];

        // Basic validation
        if (!p || !p.element || typeof p.y !== 'number') {
             console.warn(`updateGame: Invalid powerup found at index ${i}, removing.`, p);
             if(p?.element) p.element.remove(); // Try to remove element if possible
             activePowerups.splice(i, 1); // Remove from array
             continue;
        }

        // Update position (powerups fall slower)
        p.y += 1.5; // Adjust speed as needed
        p.element.style.top = `${p.y}px`;

        // Check if powerup fell off the bottom of the screen
        if (p.y > gameAreaHeight) {
            // console.log(`Powerup ${p.type} fell off screen.`);
            p.element.remove(); // Remove from DOM
            activePowerups.splice(i, 1); // Remove from array
        }
    }
}


async function gameOver() {
  console.log("gameOver: Game Over sequence started.");

  // --- Stop Game Activity ---
  if (gameInterval) {
      console.log(`Clearing game loop interval: ${gameInterval}`);
      clearInterval(gameInterval);
      gameInterval = null;
  } else {
      console.warn("gameOver: Game interval was already null?");
  }
  // Clear any active powerup timeouts
  if (slowdownTimeout) { clearTimeout(slowdownTimeout); slowdownTimeout = null; slowdownActive = false; console.log("Cleared slowdown timeout."); }
  if (pauseTimeout) { clearTimeout(pauseTimeout); pauseTimeout = null; pauseActive = false; console.log("Cleared pause timeout."); }
  pauseActive = false; // Ensure pause state is reset

  // --- Calculate Final Stats ---
  let finalWpm = 0;
  if (gameStartTime && wordsTyped > 0) {
      const gameDurationMinutes = (Date.now() - gameStartTime) / 60000;
      if (gameDurationMinutes > 0.05) { // Minimum duration to calculate WPM meaningfully
          finalWpm = Math.round(wordsTyped / gameDurationMinutes);
      }
  }
  console.log(`gameOver: Final Score: ${score}, Final WPM: ${finalWpm}`);

  // --- Update End Screen UI ---
  const finalScoreEl = document.getElementById("final-score");
  const typingSpeedEl = document.getElementById("typing-speed");
  if (finalScoreEl) finalScoreEl.textContent = score; else console.error("Final score element not found!");
  if (typingSpeedEl) typingSpeedEl.textContent = finalWpm; else console.error("Typing speed element not found!");

  // --- Display Game Over Message ---
  const gameStatusEl = document.getElementById("game-status");
  if (gameStatusEl) {
      gameStatusEl.textContent = "GAME OVER"; // Set text explicitly
      gameStatusEl.style.setProperty("display", "block", "important");
      console.log("Displayed GAME OVER status.");
  } else {
       console.error("Game status element not found!");
  }

  // --- Clean Up Game Area ---
    clearGameElements(); // Clear falling items visually
    console.log("gameOver: Cleared remaining game elements.");
  
    // --- Attempt Score Saving ---
    // Handles guest/auth logic inside the function
    console.log("gameOver: Attempting to save score...");
    await saveScore(score, finalWpm);
    console.log("gameOver: Score saving attempt finished.");
  
    // --- Transition to End Screen ---
    console.log("gameOver: Showing end screen.");
    showScreen("end-screen");
  
    console.log("gameOver: Sequence complete.");
  }
  
  function restartGame() {
    console.log("Restarting game...");
    // Reset necessary stats if not handled by initGame fully, although initGame should cover it.
    // score = 0; lives = 3; etc. - initGame should do this.
    showScreen('game-screen'); // This will trigger startGame via its switch case
  }
  
  // =======================================================
  // ===== saveScore Function (Using Edge Function) =====
  // =======================================================
  async function saveScore(finalScore, finalWpm) {
    console.log(`saveScore: Attempting to save score=${finalScore}, wpm=${finalWpm}`);
    try {
      // --- Guest Check ---
      if (isGuest) {
        console.log(`saveScore: Guest score. Not saving to database.`);
        // Optional: Refresh leaderboard even for guests to show latest scores?
        // fetchLeaderboard();
        return; // IMPORTANT: Exit if guest
      }
  
      // --- Logged-in User Pre-checks ---
      if (!ensureInitialized()) {
          console.error("saveScore: Aborted - Supabase not initialized.");
          alert("Cannot save score: Connection issue. Please try refreshing.");
          return;
      }
      if (!currentUser?.id) {
          console.error("saveScore: Aborted - Not logged in.");
          alert("Log in to save your score!"); // User-friendly message
          return;
      }
      if (!currentGamingName) {
          console.error("saveScore: Aborted - Gaming name not set.");
          alert("Set your gaming name in the profile screen to save scores!");
          return;
      }
  
      // --- Invoke Edge Function ---
      console.log(`saveScore: Invoking 'submit-score' Edge Function for ${currentUser.id}`);
      const { data, error } = await supabase.functions.invoke('submit-score', {
        // Ensure body matches what the Edge Function expects
        body: JSON.stringify({ score: finalScore, wpm: finalWpm })
      });
  
      if (error) {
        // Handle specific function invocation errors
        console.error('saveScore: Edge Function invocation error:', error);
        // Provide specific feedback if possible (e.g., based on error type/message)
        alert(`Failed to save score: ${error.message || 'Server error occurred'}.`);
      } else {
        // Handle success response from function
        console.log('saveScore: Edge Function success response:', data);
        // Show message from function response if available, otherwise generic success
        alert(data?.message || "Score saved successfully!");
      }
  
    } catch (invokeError) {
      // Catch unexpected JS errors during the process
      console.error("saveScore: Exception during function invocation or checks:", invokeError);
      alert("An unexpected error occurred while trying to save the score.");
    } finally {
      // --- Refresh Leaderboard ---
      // Always try to refresh leaderboard after save attempt (success or fail)
      console.log("saveScore: Refreshing leaderboard...");
      fetchLeaderboard();
    }
  }
  // =======================================================
  // ===== End of saveScore Function =====
  // =======================================================
  
  
  // --- Event Listeners and Initial Load ---
  // Use DOMContentLoaded to ensure elements exist before attaching listeners
  // --- MODIFIED: Added Detailed Logging ---
  document.addEventListener("DOMContentLoaded", () => {
    console.log(">>> DOMContentLoaded: Event fired."); // ADDED
  
    // --- Initialize Supabase ---
    console.log(">>> DOMContentLoaded: Calling initializeSupabase..."); // ADDED
    initializeSupabase().then(() => {
      console.log(">>> initializeSupabase promise RESOLVED."); // ADDED
      // Now that supabase is initialized, attach listeners that depend on it
      attachSupabaseEventListeners(); // Call function to attach listeners dependent on Supabase
      // Perform initial check after successful initialization
       console.log(">>> DOMContentLoaded: Initial checkAuth after Supabase init...");
       checkAuth().then(() => {
           console.log(">>> DOMContentLoaded: Post-init checkAuth complete.");
           // Show home screen only if no other screen is active (e.g., from deep link hash)
           if (!document.querySelector('.screen.active')) {
               console.log(">>> DOMContentLoaded: No active screen, showing home.");
               showScreen("home-screen");
           } else {
                console.log(">>> DOMContentLoaded: Screen already active, skipping home show.");
           }
       });
    }).catch(error => {
      // This catches the error re-thrown from the function's catch block
      console.error(">>> Failed to initialize (Caught in DOMContentLoaded):", error); // MODIFIED
      // Display a persistent error to the user on the page itself
       const errorDiv = document.createElement('div');
       errorDiv.style.cssText = "color: red; padding: 20px; font-size: 1.5em; text-align: center; position: fixed; top: 0; left: 0; width: 100%; background: white; z-index: 1000;";
       errorDiv.textContent = `FATAL ERROR: Application could not initialize. ${error.message}. Please refresh or check console.`;
       document.body.prepend(errorDiv);
    });
  
    // --- Attach Non-Supabase Event Listeners Immediately ---
    // Listeners that don't strictly depend on Supabase being initialized yet
    console.log(">>> DOMContentLoaded: Attaching non-Supabase event listeners...");
    attachStaticEventListeners(); // Call function for listeners safe to attach now
  
  
    // --- Check Initialization State ---
    // Check slightly after DOMContentLoaded allows async init to potentially finish
    console.log(">>> DOMContentLoaded: End of initial sync setup code."); // ADDED
    setTimeout(() => {
        console.log(">>> Timeout Check: Checking isInitialized flag..."); // ADDED
         if (!isInitialized) { // Check the flag set by initializeSupabase
             console.error(">>> Timeout Check: Supabase client is STILL not initialized after timeout."); // MODIFIED
             // This log means initializeSupabase() either failed silently or is taking too long
         } else {
              console.log(">>> Timeout Check: Supabase client IS initialized."); // ADDED
         }
     }, 500); // Increase timeout slightly (e.g., 500ms) to give async ops more time
  }); // End DOMContentLoaded
  // --- End of Modified DOMContentLoaded ---
  
  
  // --- Helper Function to Attach Static Listeners ---
  function attachStaticEventListeners() {
      console.log("Attaching static listeners (modal close, etc.)...");
      // Modal close buttons (if they don't depend on Supabase state)
      document.getElementById('close-modal-btn')?.addEventListener('click', closeGamingNameModal);
      document.getElementById('profile-close-btn')?.addEventListener('click', () => showScreen('home-screen'));
      document.getElementById('leaderboard-close-btn')?.addEventListener('click', () => showScreen('home-screen'));
      document.getElementById('game-close-btn')?.addEventListener('click', () => showScreen('home-screen')); // Assuming game close always goes home
      document.getElementById('end-home-btn')?.addEventListener('click', () => showScreen('home-screen'));
      document.getElementById('leaderboard-back-btn')?.addEventListener('click', () => showScreen('home-screen'));
  
      // Input listeners
      const wordInputEl = document.getElementById("word-input");
      if (wordInputEl) {
          wordInputEl.addEventListener("input", handleWordInput);
          wordInputEl.addEventListener("keydown", handleWordInputKeydown);
      } else { console.error("Word input element not found during listener attachment."); }
  
       // Global key listener (Escape key)
       document.addEventListener("keydown", handleGlobalKeydown);
  }
  
  // --- Helper Function to Attach Listeners Dependent on Supabase ---
  function attachSupabaseEventListeners() {
      console.log("Attaching Supabase-dependent listeners (auth, gameplay actions)...");
  
      // Buttons triggering auth or core game flows
      document.getElementById('play-btn')?.addEventListener('click', checkAuthAndPlay);
      document.getElementById('leaderboard-btn')?.addEventListener('click', () => showScreen('leaderboard-screen'));
      document.getElementById('guest-btn')?.addEventListener('click', playAsGuest);
      document.getElementById('login-btn')?.addEventListener('click', signInWithGoogle);
      document.getElementById('profile-btn')?.addEventListener('click', () => showScreen('profile-screen'));
      document.getElementById('logout-btn')?.addEventListener('click', logout);
      document.getElementById('submit-name-btn')?.addEventListener('click', submitGamingName);
      document.getElementById('change-name-btn')?.addEventListener('click', () => showGamingNameModal(true));
      document.getElementById('restart-btn')?.addEventListener('click', restartGame);
      document.getElementById('end-leaderboard-btn')?.addEventListener('click', () => showScreen('leaderboard-screen'));
  
      // Add the onAuthStateChange listener here *after* the client is created
      // (Moved inside initializeSupabase now, so this isn't needed here, but shown for pattern)
      // if (supabase) {
      //     supabase.auth.onAuthStateChange((event, session) => { ... });
      // } else {
      //     console.error("Cannot attach auth listener, Supabase client not ready.");
      // }
  }
  
  
  // --- Input Handling Functions ---
  function handleWordInput(e) {
      // Exit if game paused
      if (pauseActive) {
          e.target.value = ""; // Clear input if paused
          return;
      }
  
      const inputText = e.target.value.toUpperCase().trim(); // Trim whitespace
      // No action needed if input is empty after trimming
      if (!inputText) return;
  
      let matchFound = false;
      let lowestMatchIndex = -1;
      let lowestMatchY = -Infinity; // Start check from top of screen
  
      // Find the lowest matching word on screen
      // Iterate backwards for safe removal if needed, although we only find index here
      for (let i = fallingObjects.length - 1; i >= 0; i--) {
          const obj = fallingObjects[i];
          // Ensure object is valid before checking
          if (obj && obj.word === inputText) {
              // Track the one lowest on the screen (highest Y value)
              if (obj.y > lowestMatchY) {
                  lowestMatchY = obj.y;
                  lowestMatchIndex = i;
                  matchFound = true;
              }
          }
      }
  
      // If a match was found (specifically the lowest one)
      if (matchFound && lowestMatchIndex !== -1) {
          const matchedObj = fallingObjects[lowestMatchIndex];
          const points = matchedObj.word.length || 1; // Score based on length
  
          console.log(`Word matched: ${matchedObj.word}`);
          score += points;
          wordsTyped++;
          updateScore(); // Update score/WPM display
  
          showScorePopup(matchedObj.element, points); // Show score popup at object location
          removeObject(lowestMatchIndex); // Remove the matched object
  
          // Check for life gain threshold (e.g., every 50 points)
          if (score > 0 && score % 50 < points) { // Check if the score crossed a multiple of 50
              console.log(`Score crossed 50 threshold (${score}), attempting life gain.`);
              gainLife();
          }
  
          e.target.value = ""; // Clear input field on successful match
      }
  }
  
  function handleWordInputKeydown(e) {
      // Optional: Clear input on Enter even if incorrect?
      // Or use Enter for specific actions if needed.
      if (e.key === "Enter" && e.target.value) {
          // console.log("Enter pressed with text, clearing input.");
          // e.target.value = ""; // Uncomment to clear on Enter press
      }
  }
  
  // --- Global Key Handling ---
  function handleGlobalKeydown(e) {
       // Handle Escape key for closing modals or returning home
      if (e.key === "Escape") {
          console.log("Escape key pressed.");
          const modal = document.getElementById('gaming-name-modal');
          const activeScreenElement = document.querySelector('.screen.active');
  
          if (modal?.classList.contains('active')) {
              console.log("Closing gaming name modal via Escape.");
              closeGamingNameModal();
          } else if (activeScreenElement?.id === 'game-screen') {
               console.log("Exiting game screen to home via Escape.");
               showScreen('home-screen'); // Exit game to home
          } else if (activeScreenElement && activeScreenElement.id !== 'home-screen') {
               console.log(`Returning to home screen from ${activeScreenElement.id} via Escape.`);
               showScreen('home-screen'); // Go home from other screens (profile, leaderboard, end)
          } else {
              console.log("Escape pressed on home screen or no active screen, no action.");
          }
      }
      // Add other global key bindings here if needed (e.g., pause key 'P')
      // else if (e.key === 'p' || e.key === 'P') {
      //     // Toggle pause logic here if desired
      // }
  }
  
  
  console.log("Script execution finished."); // Final log to confirm script parsing completed