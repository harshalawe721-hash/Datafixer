export const THEME_STORAGE_KEY = "datafixer-theme";

/**
 * Runs before first paint (inlined in <head>) so the correct theme is applied
 * without a flash. Uses the saved choice, otherwise the OS preference.
 * Wrapped in try/catch because storage can be blocked (private mode, policies).
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
