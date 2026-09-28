try { document.documentElement.dataset.theme = localStorage.getItem("adn-theme") === "poster" ? "poster" : "archive"; }
catch { document.documentElement.dataset.theme = "archive"; }
