const root = document.documentElement;

try {
  const theme = localStorage.getItem("mu-komik-theme");
  if (theme === "dark" || theme === "light") root.setAttribute("data-theme", theme);

  const textSize = localStorage.getItem("mu-komik-ui-text-size");
  if (textSize === "large" || textSize === "standard") {
    root.setAttribute("data-ui-text-size", textSize);
  }
} catch (error) {
  console.error("Could not restore reader preferences:", error);
}

try {
  const key = "mu-komik-splash-seen";
  if (sessionStorage.getItem(key) === "1") {
    root.setAttribute("data-splash-seen", "true");
  } else {
    sessionStorage.setItem(key, "1");
    root.setAttribute("data-splash-first-visit", "true");
  }
} catch (error) {
  console.error("Could not restore splash session:", error);
  root.setAttribute("data-splash-seen", "true");
}
