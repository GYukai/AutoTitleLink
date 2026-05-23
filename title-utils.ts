import { requestUrl } from "obsidian";

const REDDIT_USER_AGENT =
  "obsidian-auto-link-title/1.5.5 (title fetch; local Obsidian plugin)";

function blank(text: string | null | undefined): boolean {
  return text === undefined || text === null || text.trim() === "";
}

function cleanTitle(title: string | null | undefined): string {
  return (title || "").replace(/(\r\n|\n|\r)/gm, " ").replace(/\s+/g, " ").trim();
}

export function normalizeUrl(url: string): string {
  if (!(url.startsWith("http") || url.startsWith("https"))) {
    return "https://" + url;
  }

  return url;
}

export function getUrlFinalSegment(url: string): string {
  try {
    const segments = new URL(url).pathname.split("/");
    const last = segments.pop() || segments.pop();
    return last || "File";
  } catch (_) {
    return "File";
  }
}

export function isUsableTitle(title: string | null | undefined): boolean {
  const clean = cleanTitle(title);
  if (blank(clean)) return false;

  const lower = clean.toLowerCase();
  const blockedTitles = [
    "blocked",
    "forbidden",
    "403 forbidden",
    "access denied",
    "just a moment...",
    "reddit - please wait for verification",
    "please wait for verification",
  ];

  if (blockedTitles.includes(lower)) return false;

  return ![
    "you've been blocked",
    "you have been blocked",
    "blocked by network security",
    "checking your browser",
    "verify you are human",
    "verification required",
    "security check",
    "captcha",
    "cloudflare",
  ].some((marker) => lower.includes(marker));
}

function metaContent(doc: Document, selector: string): string {
  return cleanTitle(doc.querySelector(selector)?.getAttr("content"));
}

export function extractTitleFromHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title =
    metaContent(doc, 'meta[property="og:title"]') ||
    metaContent(doc, 'meta[name="og:title"]') ||
    metaContent(doc, 'meta[name="twitter:title"]') ||
    metaContent(doc, 'meta[property="twitter:title"]') ||
    metaContent(doc, 'meta[name="title"]') ||
    cleanTitle(doc.querySelector("title")?.textContent);

  return isUsableTitle(title) ? title : "";
}

function isHtmlContentType(contentType: string): boolean {
  return (
    contentType === "" ||
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml+xml")
  );
}

function getHeader(headers: Record<string, string>, name: string): string {
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || "";
}

export async function fetchHtmlTitleOrFileSegment(url: string): Promise<string> {
  const response = await requestUrl({ url, throw: false });
  const contentType = getHeader(response.headers, "content-type");

  if (!isHtmlContentType(contentType)) {
    return getUrlFinalSegment(url);
  }

  if (response.status >= 400) {
    return "";
  }

  return extractTitleFromHtml(response.text);
}

function getRedditPostId(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const redditHosts = [
      "reddit.com",
      "www.reddit.com",
      "old.reddit.com",
      "sh.reddit.com",
      "m.reddit.com",
    ];

    if (!redditHosts.includes(hostname)) return null;

    const match = parsedUrl.pathname.match(/\/r\/[^/]+\/comments\/([a-z0-9]+)(?:\/|$)/i);
    return match?.[1] || null;
  } catch (_) {
    return null;
  }
}

export async function fetchRedditTitle(url: string): Promise<string> {
  const postId = getRedditPostId(url);
  if (postId === null) return "";

  try {
    const response = await requestUrl({
      url: `https://api.reddit.com/api/info/?id=t3_${postId}`,
      headers: {
        Accept: "application/json",
        "User-Agent": REDDIT_USER_AGENT,
      },
      throw: false,
    });

    if (response.status >= 400) return "";

    const json = response.json || JSON.parse(response.text);
    const post = json?.data?.children?.[0]?.data;
    const title = cleanTitle(post?.title);
    const subreddit = cleanTitle(post?.subreddit_name_prefixed || post?.subreddit);

    if (!isUsableTitle(title)) return "";
    if (subreddit === "") return title;

    const normalizedSubreddit = subreddit.startsWith("r/") ? subreddit : `r/${subreddit}`;
    return `${title} : ${normalizedSubreddit}`;
  } catch (ex) {
    console.error(ex);
    return "";
  }
}
