// Game variables
let score = 0;
let wordsTyped = 0;
let fallingObjects = [];
let spawnCount = 0;
let lives = 3;
let gameInterval = null;
let gameStartTime = null;

// Words for the game
const words = [
  "code",
  "debug",
  "hack",
  "cyber",
  "data",
  "system",
  "network",
  "binary",
  "encrypt",
  "decrypt",
  "virus",
  "trojan",
  "malware",
  "firewall",
  "protocol",
  "server",
  "client",
  "matrix",
  "neural",
  "quantum",
  "algorithm",
];

function initGame() {
  console.log("Game initialized");
  // Reset game state
  score = 0;
  lives = 3;
  wordsTyped = 0;
  fallingObjects = [];
  spawnCount = 0;
  gameStartTime = Date.now();

  // Clear UI
  document.getElementById("score").textContent = "0";
  document.getElementById("wpm").textContent = "0";

  // Reset and prepare words container
  const wordsContainer = document.getElementById("words-container");
  wordsContainer.innerHTML = "";

  // Ensure the words container has the right positioning context
  wordsContainer.style.position = "relative";
  wordsContainer.style.width = "100%";
  wordsContainer.style.height = "calc(100% - 80px)";
  wordsContainer.style.overflow = "hidden";

  document.getElementById("word-input").value = "";
  updateLives();

  // Clear any existing game state
  clearGameInterval();

  // Start game loop
  startGameLoop();

  // Schedule first word spawn
  setTimeout(spawnObject, 1000);
}

function spawnObject() {
  // Don't spawn if game is over
  if (lives <= 0) return;

  // Choose random word
  const word = words[Math.floor(Math.random() * words.length)];

  // Create element
  const wordElement = document.createElement("div");
  wordElement.className = "falling-word";
  wordElement.textContent = word;

  // Set position
  const gameArea = document.querySelector(".game-area");
  const wordWidth = word.length * 15;
  const maxX = gameArea.offsetWidth - wordWidth - 20;
  const x = Math.random() * maxX;

  // Create the falling object with all needed properties
  const fallingObj = {
    element: wordElement,
    word: word,
    x: Math.round(x),
    y: 0,
    speed: 3 + Math.random() * 2,
  };

  // Position MUST be set to absolute for correct positioning
  wordElement.style.position = "absolute";
  wordElement.style.left = fallingObj.x + "px";
  wordElement.style.top = "0px";

  // Add to container
  document.getElementById("words-container").appendChild(wordElement);

  // Add to falling objects array
  fallingObjects.push(fallingObj);

  console.log(
    `Spawned word: ${word} at x=${x}, y=0, speed=${fallingObj.speed}`
  );

  // Schedule next spawn
  const spawnDelay = Math.max(2000 - spawnCount * 50, 800);
  spawnCount++;

  // Only schedule next spawn if game is still active
  if (lives > 0) {
    setTimeout(spawnObject, spawnDelay);
  }
}

// Animation logic with a simple approach
function startGameLoop() {
  console.log("Starting game loop");

  // Start a simple animation loop
  function gameLoop() {
    if (lives <= 0) return;

    updateGame();
    gameInterval = setTimeout(gameLoop, 16); // ~60fps
  }

  // Start the game loop using setTimeout
  gameInterval = setTimeout(gameLoop, 16);
}

function updateGame() {
  // Get game area dimensions
  const gameArea = document.querySelector(".game-area");
  const maxY = gameArea.offsetHeight - 100;

  // Loop through words in reverse order so we can safely remove while iterating
  for (let i = fallingObjects.length - 1; i >= 0; i--) {
    const obj = fallingObjects[i];

    // Update position with speed value
    obj.y += obj.speed;

    // Apply position using DOM manipulation
    if (obj.element) {
      obj.element.style.top = Math.round(obj.y) + "px";

      // Debug log position for first word
      if (i === 0) {
        console.log(
          `Word ${obj.word} at y=${obj.y}, DOM top=${obj.element.style.top}`
        );
      }

      // Check if word hit bottom
      if (obj.y > maxY) {
        if (obj.element.parentNode) {
          obj.element.parentNode.removeChild(obj.element);
        }
        fallingObjects.splice(i, 1);
        loseLife();
      }
    } else {
      // Element no longer exists
      fallingObjects.splice(i, 1);
    }
  }

  // Update WPM
  if (wordsTyped > 0) {
    const timeElapsed = (Date.now() - gameStartTime) / 1000 / 60;
    const wpm = Math.round(wordsTyped / timeElapsed);
    document.getElementById("wpm").textContent = wpm.toString();
  }
}

function clearGameInterval() {
  if (gameInterval) {
    clearTimeout(gameInterval);
    gameInterval = null;
  }
}

function gameOver() {
  // Cancel animation
  clearGameInterval();

  const finalWpm = Math.round(
    wordsTyped / ((Date.now() - gameStartTime) / 60000)
  );

  document.getElementById("final-score").textContent = score;
  document.getElementById("typing-speed").textContent = finalWpm;

  // If user is logged in, save the score
  if (window.currentUser) {
    saveScore(score, finalWpm);
  }

  // Show the end screen
  window.showScreen("end-screen");
}

function updateLives() {
  const livesContainer = document.getElementById("lives");
  livesContainer.innerHTML = "❤️".repeat(lives);
}

function loseLife() {
  lives--;
  updateLives();
  if (lives <= 0) {
    gameOver();
  }
}

function gainLife() {
  if (lives < 3) {
    lives++;
    updateLives();
  }
}

// Handle word input
function setupWordInputHandler() {
  document.getElementById("word-input").addEventListener("input", (e) => {
    const input = e.target.value.trim().toLowerCase();

    if (!input) return;

    for (let i = fallingObjects.length - 1; i >= 0; i--) {
      const obj = fallingObjects[i];
      if (input === obj.word.toLowerCase()) {
        // Remove word and update score
        if (obj.element && obj.element.parentNode) {
          obj.element.parentNode.removeChild(obj.element);
        }
        fallingObjects.splice(i, 1);
        score += obj.word.length;
        wordsTyped++;
        document.getElementById("score").textContent = score.toString();
        e.target.value = "";
        break; // Only remove one word at a time
      }
    }
  });
}

// Async function to save score to database
async function saveScore(score, wpm) {
  try {
    // Get references to the global supabase client and current user
    const supabase = window.supabase;
    const currentUser = window.currentUser;
    const currentGamingName = window.currentGamingName;

    const scoreData = {
      profile_id: currentUser?.id,
      username: currentGamingName,
      score: score,
      wpm: wpm,
    };

    const { error } = await supabase.from("scores").insert([scoreData]);

    if (error) throw error;

    // Update leaderboard after saving score
    window.fetchLeaderboard();
  } catch (error) {
    console.error("Error saving score:", error);
  }
}

// Show game screen with proper setup
function showGameScreen() {
  const currentGamingName = window.currentGamingName;
  const isGuest = window.isGuest;

  if (
    currentGamingName ||
    (isGuest && localStorage.getItem("guestGamingName"))
  ) {
    // If we already have a gaming name, start the game directly
    document.getElementById("game-setup").style.display = "none";
    document.querySelector(".game-area").style.display = "block";
    document.getElementById("word-input").style.display = "block";
    document.getElementById("player-name").textContent =
      currentGamingName || localStorage.getItem("guestGamingName");
    window.showScreen("game-screen");
    initGame();
  } else {
    // Only show name input if we don't have a gaming name
    document.getElementById("game-setup").style.display = "flex";
    document.querySelector(".game-area").style.display = "none";
    document.getElementById("word-input").style.display = "none";
    document.getElementById("gaming-name-input").value = "";
    window.showScreen("game-screen");
  }

  // Clear any existing game state
  clearGameInterval();
}

function startGameWithName() {
  const gamingNameInput = document.getElementById("gaming-name-input");
  const gamingName = gamingNameInput.value.trim();
  const isGuest = window.isGuest;

  if (!gamingName) {
    alert("Please enter a gaming name to start!");
    return;
  }

  // Update gaming name in UI and storage
  document.getElementById("player-name").textContent = gamingName;
  if (!isGuest) {
    window.updateGamingName(gamingName);
  } else {
    localStorage.setItem("guestGamingName", gamingName);
  }

  // Hide setup, show game
  document.getElementById("game-setup").style.display = "none";
  document.querySelector(".game-area").style.display = "block";
  document.getElementById("word-input").style.display = "block";
  document.getElementById("word-input").focus();

  // Start the game
  initGame();
}

function restartGame() {
  window.showScreen("game-screen");
  initGame();
}

// Initialize game handlers
function initializeGameHandlers() {
  // Setup escape key to exit game
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (gameInterval) {
        clearGameInterval();
        window.showScreen("home-screen");
      }
    }
  });

  // Setup word input handler
  setupWordInputHandler();
}

// Export the game functions that need to be accessible from index.html
window.gameModule = {
  initGame,
  showGameScreen,
  startGameWithName,
  restartGame,
  initializeGameHandlers,
};

// Initialize game handlers when the script loads
document.addEventListener("DOMContentLoaded", initializeGameHandlers);
