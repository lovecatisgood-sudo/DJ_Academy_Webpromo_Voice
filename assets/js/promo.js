// Legacy static-entry compatibility shim.
// The maintained Thai-first implementation lives under public/, which is also
// the version served by the Next.js application.
(function loadMaintainedPromo() {
  const script = document.createElement("script");
  script.src = new URL("../../public/assets/js/promo.js", document.currentScript.src).href;
  script.defer = true;
  document.head.appendChild(script);
})();
