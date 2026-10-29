// Real injected.js output for the page states the popup, side panel and badge handle.
import { loadPage } from "./page.mjs";

export const GA4 = "https://region1.google-analytics.com/g/collect";
export const GTAG = "https://www.googletagmanager.com/gtag/js?id=G-1";
export const FULL_V2 = {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
};

export const states = {
  bare: () => loadPage().finishLoading().requestState(),
  zeroRequests() {
    const page = loadPage({ scripts: [GTAG] });
    page.at(5).gtag("consent", "default", FULL_V2);
    page.at(20).push(["config", "G-1"]);
    return page.finishLoading().requestState();
  },
  broken() {
    const page = loadPage({ scripts: [GTAG], globals: { fbq() {} } });
    page.at(12).push(["config", "G-1"]);
    page.at(340).gtag("consent", "default", FULL_V2);
    page.at(410).window.fetch("https://www.facebook.com/tr?ev=PageView");
    page.at(1200).window.fetch("https://www.facebook.com/tr?ev=ViewContent");
    return page.finishLoading().requestState();
  },
  verified() {
    const page = loadPage({ scripts: [GTAG], globals: { OneTrust: {} } });
    page.at(1).gtag("consent", "default", { ...FULL_V2, wait_for_update: 500 });
    page.at(10).push(["config", "G-1"]);
    page.at(900).gtag("consent", "update", { analytics_storage: "granted" });
    page.at(950).window.fetch(`${GA4}?gcs=G110&en=page_view`);
    return page.finishLoading().requestState();
  },
  review() {
    const page = loadPage({ globals: { Cookiebot: {} } });
    page.at(1).gtag("consent", "default", FULL_V2);
    page.at(10).push(["config", "G-1"]);
    page.at(50).window.fetch(`${GA4}?gcs=G100`);
    page.at(800).gtag("consent", "update", { analytics_storage: "granted", ad_storage: "granted" });
    return page.finishLoading().requestState();
  },
};
