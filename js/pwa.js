/**
 * ReadyVerse - PWA & Offline Experience Manager (Prompt 8)
 * Handles:
 * - Service Worker registration (sw.js)
 * - Offline status detection and prominent Offline Mode banner
 * - Clear listing of features disabled vs enabled offline
 * - Device voice & internet limitation messaging
 * - Install App (beforeinstallprompt) integration for Android Chrome & Desktop
 * - Profile JSON backup & restore helpers
 */

(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.ReadyVersePWA = factory();
        root.READYVERSE_PWA = root.ReadyVersePWA;
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    let deferredInstallPrompt = null;
    let isOfflineMode = false;
    let serviceWorkerRegistration = null;

    const OFFLINE_LIMITATIONS = {
        disabled: [
            "Live alerts",
            "Weather",
            "Government orders",
            "Live hazard data",
            "Dispatch",
            "Tracking",
            "AI coach"
        ],
        enabled: [
            "All 4 Disaster Drills (Fire, Flood, Cyclone, Earthquake)",
            "Story Mode Interactive Emergency Missions",
            "60-Second Daily Drill & Streak Tracking",
            "All 6 Learn Hub Lessons, Flashcards & Quizzes",
            "Readiness Score, Level Progression & Badges",
            "Profile Data & JSON Progress Backup / Restore"
        ],
        limits: {
            voiceRecognition: "Voice recognition and the AI coach need internet.",
            aiCoach: "The AI coach requires an active internet connection (uses offline rule fallback when disconnected).",
            spokenAudio: "Spoken audio depends on voices installed on your phone or device."
        }
    };

    function isSupported() {
        return typeof window !== "undefined" && typeof navigator !== "undefined";
    }

    function isServiceWorkerSupported() {
        return isSupported() && "serviceWorker" in navigator;
    }

    /**
     * Register Service Worker
     */
    async function registerServiceWorker() {
        if (!isServiceWorkerSupported()) return null;
        try {
            const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
            serviceWorkerRegistration = reg;
            
            // Check for updates
            if (reg.waiting) {
                reg.waiting.postMessage({ action: "skipWaiting" });
            }

            reg.addEventListener("updatefound", () => {
                const newWorker = reg.installing;
                if (newWorker) {
                    newWorker.addEventListener("statechange", () => {
                        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                            console.log("[ReadyVerse PWA] New update available.");
                        }
                    });
                }
            });

            return reg;
        } catch (err) {
            console.warn("[ReadyVerse PWA] Service Worker registration failed:", err);
            return null;
        }
    }

    /**
     * Determine if running in installed standalone mode
     */
    function isInstalled() {
        if (!isSupported()) return false;
        const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
        const isIosStandalone = !!navigator.standalone;
        return isStandalone || isIosStandalone;
    }

    /**
     * Update Offline Banner UI based on connection state
     */
    function setOfflineState(offline) {
        isOfflineMode = !!offline;
        if (!isSupported()) return;

        const banner = document.getElementById("rvOfflineBanner");
        const body = document.body;

        if (body) {
            if (isOfflineMode) {
                body.classList.add("is-offline-mode");
            } else {
                body.classList.remove("is-offline-mode");
            }
        }

        if (banner) {
            if (isOfflineMode) {
                banner.classList.remove("hidden");
                banner.setAttribute("aria-hidden", "false");
            } else {
                banner.classList.add("hidden");
                banner.setAttribute("aria-hidden", "true");
            }
        }

        // Update status indicators if present
        const statusChips = document.querySelectorAll(".rv-connection-status");
        statusChips.forEach(chip => {
            if (isOfflineMode) {
                chip.textContent = "📡 Offline";
                chip.classList.add("status-offline");
                chip.classList.remove("status-online");
            } else {
                chip.textContent = "🟢 Online";
                chip.classList.add("status-online");
                chip.classList.remove("status-offline");
            }
        });
    }

    /**
     * Toggle expanded details on Offline Banner
     */
    function toggleOfflineBannerDetails() {
        if (!isSupported()) return;
        const details = document.getElementById("rvOfflineDetails");
        const toggleBtn = document.getElementById("rvOfflineToggle");
        if (!details) return;

        const isHidden = details.classList.contains("hidden");
        if (isHidden) {
            details.classList.remove("hidden");
            if (toggleBtn) {
                toggleBtn.textContent = "Hide ▴";
                toggleBtn.setAttribute("aria-expanded", "true");
            }
        } else {
            details.classList.add("hidden");
            if (toggleBtn) {
                toggleBtn.textContent = "Details ▾";
                toggleBtn.setAttribute("aria-expanded", "false");
            }
        }
    }

    /**
     * Update Install Buttons visibility
     */
    function updateInstallButtons() {
        if (!isSupported()) return;
        const installBtns = document.querySelectorAll(".pwa-install-trigger");
        const installCards = document.querySelectorAll(".pwa-install-card");
        const installed = isInstalled();

        if (installed) {
            installBtns.forEach(btn => {
                btn.classList.add("hidden");
                btn.setAttribute("disabled", "true");
            });
            installCards.forEach(card => {
                card.classList.add("hidden");
            });
            return;
        }

        const canPrompt = !!deferredInstallPrompt;
        installBtns.forEach(btn => {
            if (canPrompt) {
                btn.classList.remove("hidden");
                btn.removeAttribute("disabled");
            } else {
                // Keep visible on desktop/mobile for manual info if needed, or hide until promptable
                btn.classList.remove("hidden");
            }
        });
        installCards.forEach(card => {
            card.classList.remove("hidden");
        });
    }

    /**
     * Trigger PWA Install Prompt
     */
    async function triggerInstall() {
        if (deferredInstallPrompt) {
            try {
                deferredInstallPrompt.prompt();
                const choice = await deferredInstallPrompt.userChoice;
                if (choice.outcome === "accepted") {
                    console.log("[ReadyVerse PWA] User accepted the install prompt");
                    if (typeof showToast === "function") {
                        showToast("🎉 Thank you for installing ReadyVerse!");
                    }
                } else {
                    console.log("[ReadyVerse PWA] User dismissed the install prompt");
                }
                deferredInstallPrompt = null;
                updateInstallButtons();
            } catch (err) {
                console.warn("[ReadyVerse PWA] Error triggering install prompt:", err);
            }
        } else {
            // Check if iOS or non-prompt browser
            const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            if (isIos) {
                if (typeof showToast === "function") {
                    showToast("📱 To install on iOS: Tap Share (⎋) then 'Add to Home Screen'");
                } else {
                    alert("To install ReadyVerse on iOS:\n1. Tap the Share button at the bottom of Safari\n2. Select 'Add to Home Screen'");
                }
            } else if (isInstalled()) {
                if (typeof showToast === "function") {
                    showToast("✔ ReadyVerse is already installed on your device!");
                }
            } else {
                if (typeof showToast === "function") {
                    showToast("📲 To install: Open Chrome menu (⋮) and tap 'Install app'");
                } else {
                    alert("To install ReadyVerse:\nOpen your browser menu (⋮) and choose 'Install app' or 'Add to Home Screen'.");
                }
            }
        }
    }

    /**
     * Initialize listeners
     */
    function init() {
        if (!isSupported()) return;

        // 1. Initial Connection Status
        const initialOffline = !navigator.onLine;
        setOfflineState(initialOffline);

        window.addEventListener("offline", () => {
            setOfflineState(true);
            if (typeof showToast === "function") {
                showToast("📡 Offline mode active. All drills & lessons remain fully accessible.", "⚠️");
            }
        });

        window.addEventListener("online", () => {
            setOfflineState(false);
            if (typeof showToast === "function") {
                showToast("🟢 Back online! Live features reconnected.", "✔");
            }
        });

        // 2. Install Prompt Listener
        window.addEventListener("beforeinstallprompt", (e) => {
            e.preventDefault();
            deferredInstallPrompt = e;
            updateInstallButtons();
        });

        window.addEventListener("appinstalled", () => {
            deferredInstallPrompt = null;
            updateInstallButtons();
            if (typeof showToast === "function") {
                showToast("🎉 ReadyVerse installed successfully! Available on your Home Screen.", "📱");
            }
        });

        // 3. Register Service Worker
        registerServiceWorker();

        // 4. Initial Button State Check
        updateInstallButtons();
    }

    // Auto-init in browser
    if (typeof window !== "undefined" && typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", init);
        } else {
            init();
        }
    }

    return {
        init,
        registerServiceWorker,
        setOfflineState,
        toggleOfflineBannerDetails,
        triggerInstall,
        isInstalled,
        isOffline: () => isOfflineMode,
        getOfflineLimitations: () => OFFLINE_LIMITATIONS,
        updateInstallButtons,
        OFFLINE_LIMITATIONS
    };
}));
