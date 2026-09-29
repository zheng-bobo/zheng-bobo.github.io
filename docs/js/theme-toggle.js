(function () {
  "use strict";

  var storageKey = "bobo-color-theme";
  var root = document.documentElement;
  var media = window.matchMedia("(prefers-color-scheme: dark)");

  function isChinese() {
    return (root.lang || "").toLowerCase().indexOf("zh") === 0;
  }

  function savedTheme() {
    try {
      return localStorage.getItem(storageKey);
    } catch (error) {
      return null;
    }
  }

  function updateControls(theme) {
    var dark = theme === "dark";
    var label = isChinese()
      ? (dark ? "切换到日间模式" : "切换到夜间模式")
      : (dark ? "Switch to light mode" : "Switch to dark mode");
    var shortLabel = isChinese()
      ? (dark ? "日间" : "夜间")
      : (dark ? "Light" : "Dark");

    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      button.setAttribute("aria-pressed", String(dark));
      var text = button.querySelector("[data-theme-toggle-label]");
      if (text) text.textContent = shortLabel;
    });

    var meta = document.getElementById("theme-color-meta");
    if (meta) meta.setAttribute("content", dark ? "#111820" : "#f8f5ec");
  }

  function applyTheme(theme, persist) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    updateControls(theme);
    if (persist) {
      try {
        localStorage.setItem(storageKey, theme);
      } catch (error) {
        // The visual mode still works when storage is unavailable.
      }
    }
  }

  function createFallbackControls() {
    if (document.querySelector("[data-theme-toggle]")) return;

    var desktopMenu = document.querySelector(".site-navbar .menu");
    if (desktopMenu) {
      var item = document.createElement("li");
      item.className = "menu-item theme-toggle-item";
      item.innerHTML = toggleMarkup();
      desktopMenu.appendChild(item);
    }

    var mobileMenu = document.querySelector("#mobile-menu");
    if (mobileMenu) {
      var wrapper = document.createElement("div");
      wrapper.className = "mobile-theme-toggle";
      wrapper.innerHTML = toggleMarkup();
      mobileMenu.appendChild(wrapper);
    }
  }

  function toggleMarkup() {
    return '<button class="theme-toggle" type="button" data-theme-toggle>' +
      '<svg class="theme-toggle-icon theme-toggle-moon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20.3 15.2A8.5 8.5 0 0 1 8.8 3.7 8.5 8.5 0 1 0 20.3 15.2Z"></path></svg>' +
      '<svg class="theme-toggle-icon theme-toggle-sun" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"></path></svg>' +
      '<span class="theme-toggle-label" data-theme-toggle-label></span></button>';
  }

  function onReady() {
    createFallbackControls();
    applyTheme(root.dataset.theme || (media.matches ? "dark" : "light"), false);

    document.addEventListener("click", function (event) {
      var button = event.target.closest("[data-theme-toggle]");
      if (!button) return;
      applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
    });

    root.classList.add("theme-ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }

  var followSystem = function (event) {
    if (!savedTheme()) applyTheme(event.matches ? "dark" : "light", false);
  };
  if (media.addEventListener) media.addEventListener("change", followSystem);
  else if (media.addListener) media.addListener(followSystem);
}());
