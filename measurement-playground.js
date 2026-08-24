(() => {
  const params = new URLSearchParams(window.location.search);
  const allowedSearches = new Set(["consent", "analytics", "measurement"]);

  const showResult = (id, parameter, allowed, label) => {
    const node = document.querySelector(id);
    const selection = params.get(parameter);
    if (!(node instanceof HTMLElement) || !selection || !allowed.has(selection)) {
      return;
    }

    node.textContent = `${label}: ${selection}`;
    node.hidden = false;
  };

  showResult("#measurement-search-result", "q", allowedSearches, "Search test loaded");
  const measurementForm = document.querySelector("#measurement-form");
  const measurementFrame = document.querySelector('iframe[name="measurement-form-target"]');
  const measurementResult = document.querySelector("#measurement-form-result");
  let formSubmitted = false;

  if (measurementForm instanceof HTMLFormElement
    && measurementFrame instanceof HTMLIFrameElement
    && measurementResult instanceof HTMLElement) {
    measurementForm.addEventListener("submit", () => {
      formSubmitted = true;
    });

    measurementFrame.addEventListener("load", () => {
      if (!formSubmitted) {
        return;
      }

      measurementResult.textContent = "Form test submitted: native-form";
      measurementResult.hidden = false;
    });
  }

  const spaButton = document.querySelector("#measurement-spa-button");
  const spaResult = document.querySelector("#measurement-spa-result");
  if (!(spaButton instanceof HTMLButtonElement) || !(spaResult instanceof HTMLElement)) {
    return;
  }

  spaButton.addEventListener("click", () => {
    const url = new URL(window.location.href);
    const current = url.searchParams.get("measurement_test");
    const next = current === "spa-a" ? "spa-b" : "spa-a";
    url.searchParams.set("measurement_test", next);
    window.history.pushState({ measurementTest: next }, "", `${url.pathname}${url.search}${url.hash}`);
    spaResult.textContent = `History changed to ${next}.`;
    spaResult.hidden = false;
  });
})();
