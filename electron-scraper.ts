const electronPkg = require("electron");
import {
  fetchHtmlTitleOrFileSegment,
  fetchRedditTitle,
  getUrlFinalSegment,
  isUsableTitle,
  normalizeUrl,
} from "title-utils";

// async wrapper to load a url and settle on load finish or fail
async function load(window: any, url: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    window.webContents.on("did-finish-load", (event: any) => resolve(event));
    window.webContents.on("did-fail-load", (event: any) => reject(event));
    window.loadURL(url);
  });
}

async function electronGetPageTitle(url: string): Promise<string> {
  const { remote } = electronPkg;
  const { BrowserWindow } = remote;

  try {
    const window = new BrowserWindow({
      width: 1000,
      height: 600,
      webPreferences: {
        webSecurity: false,
        nodeIntegration: true,
        images: false,
      },
      show: false,
    });
    window.webContents.setAudioMuted(true);

    window.webContents.on("will-navigate", (event: any, newUrl: any) => {
      event.preventDefault();
      window.loadURL(newUrl);
    });

    await load(window, url);

    try {
      const title = window.webContents.getTitle();
      window.destroy();

      if (isUsableTitle(title)) {
        return title;
      } else {
        return (await fetchRedditTitle(url)) || url;
      }
    } catch (ex) {
      window.destroy();
      return (await fetchRedditTitle(url)) || url;
    }
  } catch (ex) {
    console.error(ex);
    return (await fetchRedditTitle(url)) || "";
  }
}

async function nonElectronGetPageTitle(url: string): Promise<string> {
  try {
    const title = await fetchHtmlTitleOrFileSegment(url);
    if (title !== "") return title;

    return (await fetchRedditTitle(url)) || url;
  } catch (ex) {
    console.error(ex);

    return (await fetchRedditTitle(url)) || "";
  }
}

async function tryGetFileType(url: string) {
  try {
    const response = await fetch(url, { method: "HEAD" });

    // Ensure site returns an ok status code before scraping
    if (!response.ok) {
      return "Site Unreachable";
    }

    // Ensure site is an actual HTML page and not a pdf or 3 gigabyte video file.
    let contentType = response.headers.get("content-type") || "";
    if (
      contentType !== "" &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml")
    ) {
      return getUrlFinalSegment(url);
    }
    return null;
  } catch (err) {
    return null;
  }
}

export default async function getPageTitle(url: string): Promise<string> {
  // If we're on Desktop use the Electron scraper
  url = normalizeUrl(url);

  const redditTitle = await fetchRedditTitle(url);
  if (redditTitle !== "") return redditTitle;

  // Try to do a HEAD request to see if the site is reachable and if it's an HTML page
  // If we error out due to CORS, we'll just try to scrape the page anyway.
  let fileType = await tryGetFileType(url);
  if (fileType) {
    return fileType;
  }

  if (electronPkg != null) {
    return electronGetPageTitle(url);
  } else {
    return nonElectronGetPageTitle(url);
  }
}
