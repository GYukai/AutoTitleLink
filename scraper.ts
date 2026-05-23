import {
  fetchHtmlTitleOrFileSegment,
  fetchRedditTitle,
  normalizeUrl,
} from 'title-utils'

async function scrape(url: string): Promise<string> {
  try {
    const title = await fetchHtmlTitleOrFileSegment(url)
    if (title !== '') return title

    const redditTitle = await fetchRedditTitle(url)
    if (redditTitle !== '') return redditTitle

    return url
  } catch (ex) {
    console.error(ex)

    const redditTitle = await fetchRedditTitle(url)
    return redditTitle || ''
  }
}

export default async function getPageTitle(url: string) {
  return scrape(normalizeUrl(url))
}
